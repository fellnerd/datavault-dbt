/**
 * UI Utilities - Professional Data Vault CLI Output
 * 
 * Provides structured, consistent output formatting.
 * NO chat-like phrases - application-style interface.
 */

import chalk from 'chalk';
import ora, { type Ora } from 'ora';

// ============================================================================
// Error Codes for Data Vault Operations
// ============================================================================

export const ErrorCodes = {
  // File Operations
  FILE_EXISTS: 'File already exists',
  FILE_NOT_FOUND: 'File not found',
  DIR_NOT_FOUND: 'Directory not found',
  WRITE_FAILED: 'Failed to write file',
  DELETE_FAILED: 'Failed to delete file',
  
  // DV Validation
  DV_INVALID_NAME: 'Invalid naming convention',
  DV_MISSING_BK: 'Business key required',
  DV_MISSING_HK: 'Hash key required',
  DV_INVALID_HK: 'Hash key must start with hk_',
  DV_INVALID_HD: 'Hash diff must start with hd_',
  
  // Dependencies
  DEP_HUB_MISSING: 'Parent hub does not exist',
  DEP_SAT_MISSING: 'Satellite does not exist',
  DEP_LINK_MISSING: 'Link does not exist',
  DEP_STG_MISSING: 'Staging view does not exist',
  DEP_EXT_MISSING: 'External table not defined',
  
  // Operations
  OP_CANCELLED: 'Operation cancelled',
  OP_FAILED: 'Operation failed',
  OP_TIMEOUT: 'Operation timed out',
  OP_NOT_CONFIRMED: 'Operation not confirmed',
  CMD_BLOCKED: 'Command blocked for safety',
} as const;

export type ErrorCode = keyof typeof ErrorCodes;

// ============================================================================
// Box Drawing
// ============================================================================

const BOX = {
  tl: '┌', tr: '┐', bl: '└', br: '┘',
  h: '─', v: '│',
  ltee: '├', rtee: '┤',
};

// ============================================================================
// Structured Output Functions
// ============================================================================

/**
 * Format a result box with structured output
 */
export function resultBox(config: {
  status: 'OK' | 'ERROR' | 'WARN' | 'INFO';
  title: string;
  details?: Record<string, string>;
  message?: string;
}): string {
  const { status, title, details, message } = config;
  
  const statusColors = {
    OK: chalk.green,
    ERROR: chalk.red,
    WARN: chalk.yellow,
    INFO: chalk.blue,
  };
  const color = statusColors[status];
  const icon = { OK: '✓', ERROR: '✗', WARN: '!', INFO: 'i' }[status];
  
  const width = 60;
  const lines: string[] = [];
  
  // Header
  lines.push(color(`${BOX.tl}─ ${icon} ${status} ${'─'.repeat(width - status.length - 6)}${BOX.tr}`));
  lines.push(color(BOX.v) + ' ' + chalk.white.bold(title) + ' '.repeat(Math.max(0, width - title.length - 1)) + color(BOX.v));
  
  // Details
  if (details && Object.keys(details).length > 0) {
    lines.push(color(`${BOX.ltee}${'─'.repeat(width)}${BOX.rtee}`));
    for (const [key, value] of Object.entries(details)) {
      const line = `${chalk.gray(key + ':')} ${chalk.white(value)}`;
      const padding = width - stripAnsi(line).length - 1;
      lines.push(color(BOX.v) + ' ' + line + ' '.repeat(Math.max(0, padding)) + color(BOX.v));
    }
  }
  
  // Message
  if (message) {
    lines.push(color(`${BOX.ltee}${'─'.repeat(width)}${BOX.rtee}`));
    const msgLines = message.split('\n');
    for (const msgLine of msgLines) {
      const padding = width - stripAnsi(msgLine).length - 1;
      lines.push(color(BOX.v) + ' ' + chalk.gray(msgLine) + ' '.repeat(Math.max(0, padding)) + color(BOX.v));
    }
  }
  
  // Footer
  lines.push(color(`${BOX.bl}${'─'.repeat(width)}${BOX.br}`));
  
  return lines.join('\n');
}

/**
 * Format an error with code and suggestion
 */
export function formatError(code: ErrorCode, context?: string, suggestion?: string): string {
  const message = ErrorCodes[code];
  const lines: string[] = [];
  
  lines.push(chalk.red(`[ERROR:${code}] ${message}`));
  if (context) {
    lines.push(chalk.red(`           ${context}`));
  }
  if (suggestion) {
    lines.push(chalk.yellow(`        → ${suggestion}`));
  }
  
  return lines.join('\n');
}

/**
 * Format a success result
 */
export function formatSuccess(action: string, target: string, details?: Record<string, string>): string {
  return resultBox({
    status: 'OK',
    title: `${action}: ${target}`,
    details,
  });
}

/**
 * Format operation progress
 */
export function progress(current: number, total: number, label: string): string {
  const percentage = Math.round((current / total) * 100);
  const filled = Math.round(percentage / 5);
  const bar = '█'.repeat(filled) + '░'.repeat(20 - filled);
  return chalk.cyan(`[${current}/${total}]`) + chalk.gray(` ${bar} `) + chalk.white(label);
}

/**
 * Format step indicator
 */
export function stepIndicator(current: number, total: number, title: string): string {
  return chalk.cyan(`[${current}/${total}]`) + ' ' + chalk.white(title);
}

// ============================================================================
// Legacy Compatible Functions (Refactored)
// ============================================================================

/**
 * Strip ANSI codes for length calculation
 */
function stripAnsi(str: string): string {
  return str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
}

/**
 * Create a styled box around text
 */
export function box(content: string, type: 'info' | 'success' | 'error' | 'warning' | 'default' = 'default'): string {
  const colors = {
    info: chalk.cyan,
    success: chalk.green,
    error: chalk.red,
    warning: chalk.yellow,
    default: chalk.white,
  };
  const color = colors[type];
  const lines = content.split('\n');
  const maxWidth = Math.max(...lines.map(l => stripAnsi(l).length));
  const width = Math.min(maxWidth + 4, 55);
  
  const top = `${BOX.tl}${'─'.repeat(width)}${BOX.tr}`;
  const bottom = `${BOX.bl}${'─'.repeat(width)}${BOX.br}`;
  
  const paddedLines = lines.map(line => {
    const stripped = stripAnsi(line);
    const padding = width - stripped.length - 2;
    return `${BOX.v} ${line}${' '.repeat(Math.max(0, padding))} ${BOX.v}`;
  });
  
  return color([top, ...paddedLines, bottom].join('\n'));
}

/**
 * Format a section header
 */
export function header(text: string): string {
  return chalk.cyan.bold(`\n━━━ ${text} ━━━\n`);
}

/**
 * Success message (short form)
 */
export function success(text: string): string {
  return chalk.green(`[OK] ${text}`);
}

/**
 * Error message (short form)
 */
export function error(text: string): string {
  return chalk.red(`[ERROR] ${text}`);
}

/**
 * Warning message (short form)
 */
export function warning(text: string): string {
  return chalk.yellow(`[WARN] ${text}`);
}

/**
 * Info message (short form)
 */
export function info(text: string): string {
  return chalk.blue(`[INFO] ${text}`);
}

/**
 * Format a numbered step
 */
export function step(num: number, text: string): string {
  return chalk.gray(`  ${chalk.cyan(`[${num}]`)} ${text}`);
}

/**
 * Create a spinner
 */
export function createSpinner(text: string): Ora {
  return ora({
    text,
    spinner: 'dots',
    color: 'cyan',
  });
}

/**
 * Format tool execution output
 */
export function toolOutput(name: string, input: unknown): string {
  const inputStr = typeof input === 'object' 
    ? JSON.stringify(input, null, 2).split('\n').map(l => chalk.gray(`    ${l}`)).join('\n')
    : String(input);
  
  return `\n${chalk.magenta('[TOOL]')} ${chalk.white.bold(name)}\n${inputStr}`;
}

/**
 * Format tool result
 */
export function toolResult(result: string, isSuccess: boolean = true): string {
  const status = isSuccess ? chalk.green('[OK]') : chalk.red('[FAIL]');
  const lines = result.split('\n');
  const firstLine = lines[0];
  const rest = lines.slice(1).join('\n');
  
  return `  ${status} ${chalk.white(firstLine)}${rest ? chalk.gray(`\n       ${rest.split('\n').join('\n       ')}`) : ''}`;
}

/**
 * Format response text - structured, not conversational
 */
export function formatResponse(text: string): string {
  // Strip json:next_steps blocks
  let formatted = text.replace(/```json:next_steps[\s\S]*?```/gi, '');
  
  // Remove chat-like phrases
  formatted = formatted
    .replace(/\b(Aha!|Perfekt!|Ausgezeichnet!|Interessant!|Wunderbar!)\s*/gi, '')
    .replace(/\b(Ich werde|Ich kann|Ich sehe|Lassen Sie mich|Lass mich)\s+/gi, '')
    .replace(/\b(Zuerst|Zunächst) (schaue ich|werde ich|muss ich)\s+/gi, '')
    .replace(/\bJetzt\s+(erstelle|schaue|prüfe) ich\s+/gi, '');
  
  // Format code blocks
  formatted = formatted.replace(/```(\w+)?\n([\s\S]*?)```/g, (_, lang, code) => {
    return chalk.gray(`\n┌─ ${lang || 'code'} ─────────────\n`) +
           chalk.white(code.trim().split('\n').map((l: string) => `│ ${l}`).join('\n')) +
           chalk.gray('\n└──────────────────\n');
  });
  
  // Inline code
  formatted = formatted.replace(/`([^`]+)`/g, chalk.cyan('$1'));
  
  // Headers
  formatted = formatted.replace(/^(#{1,3})\s+(.+)$/gm, (_, __, text) => chalk.cyan.bold(text));
  
  // Bullet points
  formatted = formatted.replace(/^(\s*[-*])\s+/gm, chalk.cyan('• '));
  
  // Numbered lists
  formatted = formatted.replace(/^(\s*)(\d+\.)\s+/gm, chalk.cyan('$1$2 '));
  
  return formatted.trim();
}

/**
 * Show banner
 */
export function showBanner(): void {
  console.clear();
  console.log(chalk.cyan(`
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│   ${chalk.blue.bold('Data Vault 2.1 Build System')}                               │
│   ${chalk.gray('dbt-sqlserver • Azure SQL • automate_dv')}                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
`));
}

/**
 * Show a divider line
 */
export function divider(): string {
  return chalk.gray('─'.repeat(60));
}

/**
 * Session summary (compact)
 */
export function sessionSummary(duration: number, input: number, output: number, cost: number): string {
  return chalk.gray(`[Session: ${duration}min | ${input.toLocaleString()}/${output.toLocaleString()} tokens]`);
}

/**
 * Undo confirmation
 */
export function confirmUndo(filePath: string): string {
  const fileName = filePath.split('/').pop() || filePath;
  return chalk.yellow(`[CONFIRM] Delete ${chalk.white(fileName)}?`);
}
