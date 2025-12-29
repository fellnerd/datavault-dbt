# Agent Intelligence Upgrade Plan

## Goal
Make the Claude Code Agent for Data Vault 2.1 dbt development truly interactive and intelligent:
- Execute commands when user asks ("führe dbt run aus")
- Maintain conversation context (know what was just created)
- Stream output character-by-character like Claude Code
- Dynamic suggestions from LLM, not hardcoded
- Undo functionality for created files
- Session persistence

---

## Step 1: Create `runCommand.ts` Tool

**Path:** `agent/tools/runCommand.ts`

```typescript
import { spawn } from 'child_process';
import { Tool, ToolResult } from '../types.js';

export const runCommandTool: Tool = {
  name: 'run_command',
  description: 'Execute a shell command in the project directory. Use for dbt commands, git, file operations, etc.',
  input_schema: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The shell command to execute (e.g., "dbt run --select hub_company")',
      },
      working_dir: {
        type: 'string',
        description: 'Working directory (optional, defaults to project root)',
      },
      timeout_seconds: {
        type: 'number',
        description: 'Timeout in seconds (default: 300 = 5 minutes)',
      },
    },
    required: ['command'],
  },
};

// Safety checks
const BLOCKED_PATTERNS = [
  /rm\s+-rf\s+[\/~]/i,
  /sudo\s+/i,
  />\s*\/dev\//i,
  /mkfs/i,
  /dd\s+if=/i,
];

export async function handleRunCommand(input: {
  command: string;
  working_dir?: string;
  timeout_seconds?: number;
}): Promise<ToolResult> {
  const { command, working_dir, timeout_seconds = 300 } = input;
  
  // Safety check
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(command)) {
      return {
        success: false,
        error: `Command blocked for safety: matches pattern ${pattern}`,
      };
    }
  }
  
  const cwd = working_dir || process.cwd();
  const timeout = timeout_seconds * 1000;
  
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let killed = false;
    
    const proc = spawn(command, {
      shell: true,
      cwd,
      env: { ...process.env, FORCE_COLOR: '1' },
    });
    
    const timer = setTimeout(() => {
      killed = true;
      proc.kill('SIGTERM');
    }, timeout);
    
    proc.stdout?.on('data', (data) => {
      const text = data.toString();
      stdout += text;
      process.stdout.write(text); // Live output
    });
    
    proc.stderr?.on('data', (data) => {
      const text = data.toString();
      stderr += text;
      process.stderr.write(text); // Live output
    });
    
    proc.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        success: code === 0,
        exit_code: code,
        stdout: stdout.slice(-10000), // Last 10KB
        stderr: stderr.slice(-5000),
        killed_by_timeout: killed,
      });
    });
    
    proc.on('error', (err) => {
      clearTimeout(timer);
      resolve({
        success: false,
        error: err.message,
      });
    });
  });
}
```

---

## Step 2: Update `tools/index.ts`

Add the new tool and export helper for follow-up:

```typescript
import { runCommandTool, handleRunCommand } from './runCommand.js';

// Add to TOOL_DEFINITIONS array
export const TOOL_DEFINITIONS: Tool[] = [
  // ... existing tools ...
  runCommandTool,
];

// Add to TOOL_HANDLERS
export const TOOL_HANDLERS: Record<string, ToolHandler> = {
  // ... existing handlers ...
  run_command: handleRunCommand,
};

// Export all tools for follow-up context
export function getFollowUpTools(): Tool[] {
  return TOOL_DEFINITIONS;
}
```

---

## Step 3: Create `conversation.ts` Module

**Path:** `agent/conversation.ts`

```typescript
import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';

const SESSION_FILE = '.agent-session.json';

export interface UndoAction {
  type: 'file_created';
  path: string;
  timestamp: number;
}

export interface ConversationState {
  messages: Anthropic.MessageParam[];
  undoStack: UndoAction[];
  createdFiles: string[];
  lastTaskContext: string;
  sessionStart: number;
  totalInputTokens: number;
  totalOutputTokens: number;
}

let state: ConversationState = {
  messages: [],
  undoStack: [],
  createdFiles: [],
  lastTaskContext: '',
  sessionStart: Date.now(),
  totalInputTokens: 0,
  totalOutputTokens: 0,
};

export function initializeFromTask(taskDescription: string, assistantResponse: string): void {
  state.messages = [
    { role: 'user', content: taskDescription },
    { role: 'assistant', content: assistantResponse },
  ];
  state.lastTaskContext = taskDescription;
}

export function addMessage(role: 'user' | 'assistant', content: string): void {
  state.messages.push({ role, content });
}

export function getMessages(): Anthropic.MessageParam[] {
  return state.messages;
}

export function pushUndo(action: UndoAction): void {
  state.undoStack.push(action);
}

export function trackCreatedFile(filePath: string): void {
  state.createdFiles.push(filePath);
  pushUndo({ type: 'file_created', path: filePath, timestamp: Date.now() });
}

export function getLastCreatedFile(): string | undefined {
  return state.createdFiles[state.createdFiles.length - 1];
}

export async function executeUndo(): Promise<{ success: boolean; message: string }> {
  const action = state.undoStack.pop();
  if (!action) {
    return { success: false, message: 'Nichts zum Rückgängigmachen' };
  }
  
  if (action.type === 'file_created') {
    try {
      await fs.promises.unlink(action.path);
      state.createdFiles = state.createdFiles.filter(f => f !== action.path);
      return { success: true, message: `Gelöscht: ${action.path}` };
    } catch (err) {
      return { success: false, message: `Fehler beim Löschen: ${err}` };
    }
  }
  
  return { success: false, message: 'Unbekannte Aktion' };
}

export function updateTokenUsage(input: number, output: number): void {
  state.totalInputTokens += input;
  state.totalOutputTokens += output;
}

export function getTokenUsage(): { input: number; output: number } {
  return { input: state.totalInputTokens, output: state.totalOutputTokens };
}

export function saveSession(): void {
  const sessionPath = path.join(process.cwd(), SESSION_FILE);
  fs.writeFileSync(sessionPath, JSON.stringify(state, null, 2));
}

export function loadSession(): boolean {
  const sessionPath = path.join(process.cwd(), SESSION_FILE);
  try {
    if (fs.existsSync(sessionPath)) {
      const data = JSON.parse(fs.readFileSync(sessionPath, 'utf-8'));
      state = { ...state, ...data };
      return true;
    }
  } catch (e) {
    // Ignore parse errors
  }
  return false;
}

export function clearSession(): void {
  state = {
    messages: [],
    undoStack: [],
    createdFiles: [],
    lastTaskContext: '',
    sessionStart: Date.now(),
    totalInputTokens: 0,
    totalOutputTokens: 0,
  };
}

export function getState(): ConversationState {
  return state;
}
```

---

## Step 4: Create `streaming.ts` Module

**Path:** `agent/streaming.ts`

```typescript
import Anthropic from '@anthropic-ai/sdk';
import chalk from 'chalk';
import { Tool } from './types.js';
import { TOOL_HANDLERS } from './tools/index.js';
import * as conversation from './conversation.js';

const client = new Anthropic();
const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514';

export interface StreamingResult {
  fullText: string;
  toolResults: any[];
  usage: { input_tokens: number; output_tokens: number };
}

/**
 * Stream agent response with tool execution support
 */
export async function streamAgentResponse(
  system: string,
  messages: Anthropic.MessageParam[],
  tools: Tool[],
  onText?: (text: string) => void,
): Promise<StreamingResult> {
  let fullText = '';
  const toolResults: any[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  
  // Allow multiple tool loops
  let currentMessages = [...messages];
  let continueLoop = true;
  
  while (continueLoop) {
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 8192,
      system,
      messages: currentMessages,
      tools: tools as any,
    });
    
    // Collect content blocks for potential tool use
    const contentBlocks: Anthropic.ContentBlock[] = [];
    
    stream.on('text', (text) => {
      fullText += text;
      if (onText) {
        onText(text);
      } else {
        process.stdout.write(text);
      }
    });
    
    stream.on('contentBlock', (block) => {
      contentBlocks.push(block);
    });
    
    const finalMessage = await stream.finalMessage();
    
    totalInputTokens += finalMessage.usage.input_tokens;
    totalOutputTokens += finalMessage.usage.output_tokens;
    
    // Check for tool use
    const toolUseBlocks = contentBlocks.filter(b => b.type === 'tool_use');
    
    if (toolUseBlocks.length === 0 || finalMessage.stop_reason !== 'tool_use') {
      continueLoop = false;
    } else {
      // Execute tools
      const toolResultContents: Anthropic.ToolResultBlockParam[] = [];
      
      for (const block of toolUseBlocks) {
        if (block.type === 'tool_use') {
          const handler = TOOL_HANDLERS[block.name];
          if (handler) {
            console.log(chalk.gray(`\n🔧 Executing: ${block.name}...`));
            const result = await handler(block.input as any);
            toolResults.push({ tool: block.name, result });
            toolResultContents.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: JSON.stringify(result),
            });
          }
        }
      }
      
      // Add assistant message and tool results
      currentMessages = [
        ...currentMessages,
        { role: 'assistant', content: contentBlocks as any },
        { role: 'user', content: toolResultContents },
      ];
    }
  }
  
  // Update conversation state
  conversation.updateTokenUsage(totalInputTokens, totalOutputTokens);
  
  return {
    fullText,
    toolResults,
    usage: { input_tokens: totalInputTokens, output_tokens: totalOutputTokens },
  };
}

/**
 * Simple streaming without tools (for quick responses)
 */
export async function streamSimpleResponse(
  system: string,
  messages: Anthropic.MessageParam[],
): Promise<StreamingResult> {
  let fullText = '';
  
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 4096,
    system,
    messages,
  });
  
  stream.on('text', (text) => {
    fullText += text;
    process.stdout.write(text);
  });
  
  const finalMessage = await stream.finalMessage();
  
  conversation.updateTokenUsage(
    finalMessage.usage.input_tokens,
    finalMessage.usage.output_tokens
  );
  
  return {
    fullText,
    toolResults: [],
    usage: finalMessage.usage,
  };
}
```

---

## Step 5: Rewrite `followUp.ts`

Complete rewrite with:
- Full tool access in follow-up
- Streaming responses
- Intent detection
- Recursive next_steps extraction
- Undo option

```typescript
/**
 * Follow-up Actions Module - Intelligent Version
 * 
 * Provides interactive follow-up with full tool access,
 * streaming output, and conversation context.
 */

import { select, input, confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import * as ui from './ui.js';
import { getSystemPrompt } from './context/systemPrompt.js';
import { getFollowUpTools } from './tools/index.js';
import { streamAgentResponse } from './streaming.js';
import * as conversation from './conversation.js';

interface SuggestedCommand {
  command: string;
  label: string;
  type: 'bash' | 'sql' | 'dbt' | 'question';
}

/**
 * Extract next_steps from response
 */
export function extractNextSteps(responseText: string): SuggestedCommand[] {
  const steps: SuggestedCommand[] = [];
  
  const regex = /```json:next_steps\s*([\s\S]*?)```/gi;
  const match = regex.exec(responseText);
  
  if (match) {
    try {
      const parsed = JSON.parse(match[1].trim()) as Array<{ label: string; command: string }>;
      for (const step of parsed) {
        if (step.command && step.label) {
          steps.push({
            command: step.command,
            label: step.label,
            type: detectCommandType(step.command),
          });
        }
      }
    } catch (e) {
      // Ignore parse errors
    }
  }
  
  return steps;
}

function detectCommandType(command: string): 'bash' | 'sql' | 'dbt' | 'question' {
  if (command.startsWith('?') || command.includes('erkläre') || command.includes('warum')) {
    return 'question';
  }
  if (command.startsWith('dbt ')) return 'dbt';
  if (command.toUpperCase().includes('SELECT') || command.toUpperCase().includes('INSERT')) return 'sql';
  return 'bash';
}

/**
 * Run agent with full tool access and streaming
 */
async function runAgentWithTools(userInput: string): Promise<string> {
  console.log('');
  console.log(ui.divider());
  console.log('');
  
  const system = getSystemPrompt() + `

Du bearbeitest eine Folgeanfrage. Der Kontext der vorherigen Aufgabe ist bekannt.
- Wenn der User einen Befehl ausführen will, nutze das run_command Tool
- Antworte auf Deutsch
- Am Ende gib IMMER einen json:next_steps Block mit 2-3 sinnvollen nächsten Schritten`;

  const messages = conversation.getMessages();
  messages.push({ role: 'user', content: userInput });
  
  const result = await streamAgentResponse(
    system,
    messages,
    getFollowUpTools(),
  );
  
  conversation.addMessage('user', userInput);
  conversation.addMessage('assistant', result.fullText);
  
  // Show token usage
  const usage = conversation.getTokenUsage();
  console.log('');
  console.log(chalk.gray(`📊 Tokens: ${usage.input} in / ${usage.output} out`));
  
  return result.fullText;
}

/**
 * Main follow-up menu loop
 */
export async function showFollowUpMenu(initialSteps: SuggestedCommand[]): Promise<void> {
  let steps = initialSteps;
  let continueLoop = true;
  
  while (continueLoop) {
    console.log('');
    console.log(ui.divider());
    console.log(chalk.cyan.bold('\n🎯 Nächste Schritte:\n'));
    
    // Build menu choices
    const choices = [
      ...steps.map((step, idx) => ({
        name: step.label,
        value: `step:${idx}`,
        description: chalk.gray(step.command),
      })),
      { name: chalk.blue('⌨️  Eigene Eingabe...'), value: 'custom' },
      { name: chalk.yellow('↩️  Undo (letzte Aktion rückgängig)'), value: 'undo' },
      { name: chalk.gray('⏭️  Beenden'), value: 'exit' },
    ];
    
    try {
      const selected = await select({
        message: chalk.cyan('Wähle eine Option:'),
        choices,
        pageSize: 10,
        loop: false,
      });
      
      if (selected === 'exit') {
        conversation.saveSession();
        console.log(chalk.gray('\n💾 Session gespeichert.\n'));
        break;
      }
      
      if (selected === 'undo') {
        const lastFile = conversation.getLastCreatedFile();
        if (!lastFile) {
          console.log(chalk.yellow('\n⚠️  Nichts zum Rückgängigmachen.\n'));
          continue;
        }
        
        const confirmed = await confirm({
          message: chalk.yellow(`Wirklich löschen: ${lastFile}?`),
          default: false,
        });
        
        if (confirmed) {
          const result = await conversation.executeUndo();
          console.log(result.success ? chalk.green(`\n✓ ${result.message}`) : chalk.red(`\n❌ ${result.message}`));
        }
        continue;
      }
      
      if (selected === 'custom') {
        const userInput = await input({
          message: chalk.cyan('Was möchtest du tun?'),
          validate: (v) => v.trim().length > 0 || 'Bitte Eingabe machen',
        });
        
        const response = await runAgentWithTools(userInput.trim());
        steps = extractNextSteps(response);
        continue;
      }
      
      if (selected.startsWith('step:')) {
        const idx = parseInt(selected.replace('step:', ''), 10);
        const step = steps[idx];
        
        if (step) {
          // Send command/question to agent
          const response = await runAgentWithTools(step.command);
          steps = extractNextSteps(response);
        }
      }
      
    } catch (error) {
      if (error instanceof Error && error.message.includes('User force closed')) {
        conversation.saveSession();
        break;
      }
      throw error;
    }
  }
}
```

---

## Step 6: Update `agent.ts` for Streaming

Replace batch API calls with streaming:

```typescript
// In runAgent() function, replace client.messages.create with:
import { streamAgentResponse } from './streaming.js';
import * as conversation from './conversation.js';

// After successful task completion:
conversation.initializeFromTask(taskInput, responseText);

// For tool tracking:
if (toolName === 'create_file' || toolName === 'write_file') {
  conversation.trackCreatedFile(input.path);
}
```

---

## Step 7: Extend System Prompt

Add to `context/systemPrompt.ts`:

```typescript
// Add to system prompt:
`
## Intent Handling

Wenn der User fragt:
- "führe X aus" / "run X" → Nutze run_command Tool
- "zeige X" / "was ist X" → Erkläre direkt
- "erstelle X" → Nutze create_file / create_hub etc.

## Follow-Up Format

Am Ende jeder Antwort, gib IMMER einen Block:
\`\`\`json:next_steps
[
  { "label": "Hub für XY erstellen", "command": "Erstelle einen Hub für XY" },
  { "label": "dbt run ausführen", "command": "dbt run --select hub_xy" },
  { "label": "Warum dieses Design?", "command": "?Erkläre warum wir das so designen" }
]
\`\`\`

Passe die Vorschläge an den Kontext an - frage nach Entity-Namen, Attributen, etc.
`
```

---

## Step 8: UI Extensions

Add to `ui.ts`:

```typescript
export function showTokenUsage(input: number, output: number): void {
  const cost = ((input * 0.003 + output * 0.015) / 1000).toFixed(4);
  console.log(chalk.gray(`📊 Tokens: ${input.toLocaleString()} in / ${output.toLocaleString()} out (~$${cost})`));
}

export function confirmUndo(filePath: string): string {
  return chalk.yellow(`⚠️  Datei löschen: ${chalk.white(filePath)}?`);
}
```

---

## Implementation Order

1. **runCommand.ts** - Critical for "führe dbt run aus"
2. **conversation.ts** - Enables context and undo
3. **streaming.ts** - Fluid output
4. **followUp.ts rewrite** - Ties it all together
5. **agent.ts updates** - Track files, use streaming
6. **systemPrompt.ts** - Better intent instructions
7. **tools/index.ts** - Register new tool
8. **ui.ts** - Token display

---

## Testing Checklist

- [x] "Erstelle Hub für company" → Creates file, tracks in undo stack
- [x] "führe dbt run --select hub_company aus" → Executes command via tool
- [x] "Warum nutzen wir SHA2_256?" → Explains without tool
- [x] Undo → Deletes last created file with confirmation
- [x] Exit → Saves session to .agent-session.json
- [x] Restart → Loads session, has conversation history
- [x] Streaming → Text appears character-by-character
- [x] Token display → Shows usage after each response

## Implementation Status: ✅ COMPLETED

All 8 steps have been implemented:

1. ✅ `agent/tools/runCommand.ts` - Shell command execution with safety checks
2. ✅ `agent/tools/index.ts` - Updated with run_command tool and getFollowUpTools()
3. ✅ `agent/conversation.ts` - Conversation state, undo stack, session persistence
4. ✅ `agent/streaming.ts` - Streaming with client.messages.stream()
5. ✅ `agent/followUp.ts` - Complete rewrite with tool access and streaming
6. ✅ `agent/agent.ts` - Updated to track files and init conversation
7. ✅ `agent/context/systemPrompt.ts` - Extended with intent handling
8. ✅ `agent/ui.ts` - Added showTokenUsage() and confirmUndo()
