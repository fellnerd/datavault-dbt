/**
 * Conversation State Management
 * 
 * Manages conversation history, undo stack, created files tracking,
 * token usage, and session persistence.
 * 
 * Supports transactions for multi-file operations.
 */

import type Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';

const SESSION_FILE = '.agent-session.json';

export interface UndoAction {
  type: 'file_created' | 'file_modified' | 'transaction';
  path: string;
  timestamp: number;
  previousContent?: string; // For modifications
  transactionFiles?: string[]; // For transaction (multi-file undo)
  transactionName?: string; // Description of the transaction
}

export interface ConversationState {
  messages: Anthropic.MessageParam[];
  undoStack: UndoAction[];
  createdFiles: string[];
  lastTaskContext: string;
  sessionStart: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  currentTransaction: string[] | null; // Files in current transaction
  currentTransactionName: string | null;
}

// Global state
let state: ConversationState = createEmptyState();

function createEmptyState(): ConversationState {
  return {
    messages: [],
    undoStack: [],
    createdFiles: [],
    lastTaskContext: '',
    sessionStart: Date.now(),
    totalInputTokens: 0,
    totalOutputTokens: 0,
    currentTransaction: null,
    currentTransactionName: null,
  };
}

/**
 * Initialize conversation from a completed task
 */
export function initializeFromTask(taskDescription: string, assistantResponse: string): void {
  state.messages = [
    { role: 'user', content: taskDescription },
    { role: 'assistant', content: assistantResponse },
  ];
  state.lastTaskContext = taskDescription;
}

/**
 * Add a message to the conversation history
 */
export function addMessage(role: 'user' | 'assistant', content: string): void {
  state.messages.push({ role, content });
}

/**
 * Get all messages in conversation
 */
export function getMessages(): Anthropic.MessageParam[] {
  return [...state.messages];
}

/**
 * Get the last task context
 */
export function getLastTaskContext(): string {
  return state.lastTaskContext;
}

/**
 * Push an undo action onto the stack
 */
export function pushUndo(action: UndoAction): void {
  state.undoStack.push(action);
}

/**
 * Track a created file (for undo)
 * Uses transaction system if a transaction is active
 */
export function trackCreatedFile(filePath: string): void {
  addToTransaction(filePath);
}

/**
 * Get the last created file
 */
export function getLastCreatedFile(): string | undefined {
  return state.createdFiles[state.createdFiles.length - 1];
}

/**
 * Get all created files
 */
export function getCreatedFiles(): string[] {
  return [...state.createdFiles];
}

// ============================================================================
// Transaction Support (Multi-File Undo)
// ============================================================================

/**
 * Start a new transaction (groups multiple files for single undo)
 */
export function startTransaction(name: string): void {
  if (state.currentTransaction) {
    // Auto-commit existing transaction
    commitTransaction();
  }
  state.currentTransaction = [];
  state.currentTransactionName = name;
}

/**
 * Add a file to the current transaction
 * If no transaction is active, creates a single-file undo action
 */
export function addToTransaction(filePath: string): void {
  const absolutePath = path.isAbsolute(filePath) 
    ? filePath 
    : path.join(process.env.PROJECT_ROOT || process.cwd(), filePath);
  
  state.createdFiles.push(absolutePath);
  
  if (state.currentTransaction) {
    state.currentTransaction.push(absolutePath);
  } else {
    // Single file mode - create individual undo action
    pushUndo({ 
      type: 'file_created', 
      path: absolutePath, 
      timestamp: Date.now() 
    });
  }
}

/**
 * Commit the current transaction (creates single undo action for all files)
 */
export function commitTransaction(): void {
  if (state.currentTransaction && state.currentTransaction.length > 0) {
    pushUndo({
      type: 'transaction',
      path: state.currentTransactionName || 'Transaction',
      timestamp: Date.now(),
      transactionFiles: [...state.currentTransaction],
      transactionName: state.currentTransactionName || undefined,
    });
  }
  state.currentTransaction = null;
  state.currentTransactionName = null;
}

/**
 * Cancel the current transaction (files are kept but no undo action created)
 */
export function cancelTransaction(): void {
  state.currentTransaction = null;
  state.currentTransactionName = null;
}

/**
 * Check if a transaction is active
 */
export function isTransactionActive(): boolean {
  return state.currentTransaction !== null;
}

/**
 * Get files in current transaction
 */
export function getTransactionFiles(): string[] {
  return state.currentTransaction ? [...state.currentTransaction] : [];
}

// ============================================================================
// Undo Actions
// ============================================================================

/**
 * Check if there are undo actions available
 */
export function hasUndoActions(): boolean {
  return state.undoStack.length > 0;
}

/**
 * Get the last undo action (peek)
 */
export function peekUndo(): UndoAction | undefined {
  return state.undoStack[state.undoStack.length - 1];
}

/**
 * Execute the last undo action
 */
export async function executeUndo(): Promise<{ success: boolean; message: string; files?: string[] }> {
  const action = state.undoStack.pop();
  if (!action) {
    return { success: false, message: 'Nothing to undo' };
  }
  
  // Handle single file deletion
  if (action.type === 'file_created') {
    try {
      if (!fs.existsSync(action.path)) {
        return { success: false, message: `File not found: ${action.path}` };
      }
      
      await fs.promises.unlink(action.path);
      state.createdFiles = state.createdFiles.filter(f => f !== action.path);
      
      return { success: true, message: `Deleted: ${path.basename(action.path)}`, files: [action.path] };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, message: `Delete failed: ${error}` };
    }
  }
  
  // Handle transaction (multiple files)
  if (action.type === 'transaction' && action.transactionFiles) {
    const deleted: string[] = [];
    const errors: string[] = [];
    
    for (const filePath of action.transactionFiles) {
      try {
        if (fs.existsSync(filePath)) {
          await fs.promises.unlink(filePath);
          deleted.push(path.basename(filePath));
          state.createdFiles = state.createdFiles.filter(f => f !== filePath);
        }
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        errors.push(`${path.basename(filePath)}: ${error}`);
      }
    }
    
    if (errors.length > 0) {
      return { 
        success: false, 
        message: `Partial undo: ${deleted.length}/${action.transactionFiles.length} files\nErrors: ${errors.join(', ')}`,
        files: deleted 
      };
    }
    
    const txName = action.transactionName || 'Transaction';
    return { 
      success: true, 
      message: `Undone ${txName}: ${deleted.length} files deleted`,
      files: deleted 
    };
  }
  
  // Handle file modification restore
  if (action.type === 'file_modified' && action.previousContent !== undefined) {
    try {
      await fs.promises.writeFile(action.path, action.previousContent, 'utf-8');
      return { success: true, message: `Restored: ${path.basename(action.path)}`, files: [action.path] };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, message: `Restore failed: ${error}` };
    }
  }
  
  return { success: false, message: 'Unknown action type' };
}

/**
 * Get undo description for UI
 */
export function getUndoDescription(): string | null {
  const action = peekUndo();
  if (!action) return null;
  
  if (action.type === 'transaction' && action.transactionFiles) {
    return `${action.transactionName || 'Transaction'} (${action.transactionFiles.length} files)`;
  }
  
  return path.basename(action.path);
}

/**
 * Update token usage counters
 */
export function updateTokenUsage(input: number, output: number): void {
  state.totalInputTokens += input;
  state.totalOutputTokens += output;
}

/**
 * Get current token usage
 */
export function getTokenUsage(): { input: number; output: number } {
  return { 
    input: state.totalInputTokens, 
    output: state.totalOutputTokens 
  };
}

/**
 * Calculate estimated cost based on Claude pricing
 * Claude Sonnet 4: $3/M input, $15/M output
 */
export function getEstimatedCost(): number {
  const inputCost = (state.totalInputTokens / 1_000_000) * 3;
  const outputCost = (state.totalOutputTokens / 1_000_000) * 15;
  return inputCost + outputCost;
}

/**
 * Save session to disk
 */
export function saveSession(): void {
  const sessionPath = path.join(process.env.PROJECT_ROOT || process.cwd(), SESSION_FILE);
  try {
    fs.writeFileSync(sessionPath, JSON.stringify(state, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save session:', err);
  }
}

/**
 * Load session from disk
 */
export function loadSession(): boolean {
  const sessionPath = path.join(process.env.PROJECT_ROOT || process.cwd(), SESSION_FILE);
  try {
    if (fs.existsSync(sessionPath)) {
      const data = JSON.parse(fs.readFileSync(sessionPath, 'utf-8'));
      
      // Validate basic structure
      if (data.messages && Array.isArray(data.messages)) {
        state = { ...createEmptyState(), ...data };
        return true;
      }
    }
  } catch (e) {
    // Ignore parse errors, start fresh
  }
  return false;
}

/**
 * Clear the current session
 */
export function clearSession(): void {
  state = createEmptyState();
  
  // Also delete session file if exists
  const sessionPath = path.join(process.env.PROJECT_ROOT || process.cwd(), SESSION_FILE);
  try {
    if (fs.existsSync(sessionPath)) {
      fs.unlinkSync(sessionPath);
    }
  } catch (e) {
    // Ignore
  }
}

/**
 * Get full state (for debugging)
 */
export function getState(): ConversationState {
  return { ...state };
}

/**
 * Get session summary
 */
export function getSessionSummary(): string {
  const duration = Math.round((Date.now() - state.sessionStart) / 1000 / 60);
  const usage = getTokenUsage();
  const cost = getEstimatedCost().toFixed(4);
  
  return `📊 Session: ${duration}min | ${usage.input.toLocaleString()} in / ${usage.output.toLocaleString()} out | ~$${cost}`;
}
