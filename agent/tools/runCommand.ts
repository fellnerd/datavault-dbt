/**
 * Run Command Tool
 * 
 * Executes shell commands in the project directory with safety checks,
 * timeout handling, and live output streaming.
 */

import { spawn } from 'child_process';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type Anthropic from '@anthropic-ai/sdk';
import chalk from 'chalk';

// Get directory of current file and compute PROJECT_ROOT
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// PROJECT_ROOT should be the dbt project root (3 levels up from dist/tools: dist/tools -> dist -> agent -> project)
const PROJECT_ROOT = process.env.PROJECT_ROOT || path.resolve(__dirname, '..', '..', '..');

// Path to the Python venv with dbt installed
const VENV_PATH = path.join(PROJECT_ROOT, '.venv', 'bin');

// Tool definition for Claude API
export const runCommandTool: Anthropic.Messages.Tool = {
  name: 'run_command',
  description: `Execute a shell command in the project directory. Use for:
- dbt commands (run, test, compile, docs, seed, etc.)
- git operations
- file operations (ls, cat, grep, etc.)
- npm/pnpm commands

Returns stdout, stderr, and exit code. Has a 5-minute timeout by default.`,
  input_schema: {
    type: 'object' as const,
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

// Safety checks - block dangerous commands
const BLOCKED_PATTERNS = [
  /rm\s+-rf\s+[\/~]/i,           // rm -rf on root or home
  /sudo\s+/i,                     // sudo commands
  />\s*\/dev\//i,                 // writing to /dev/
  /mkfs/i,                        // filesystem formatting
  /dd\s+if=/i,                    // disk operations
  /:(){ :|:& };:/,                // fork bomb
  /wget.*\|\s*sh/i,               // download and execute
  /curl.*\|\s*sh/i,               // download and execute
  /chmod\s+777/i,                 // overly permissive
  /\bshutdown\b/i,                // shutdown commands
  /\breboot\b/i,                  // reboot commands
];

export interface RunCommandInput {
  command: string;
  working_dir?: string;
  timeout_seconds?: number;
}

export interface RunCommandResult {
  success: boolean;
  exit_code: number | null;
  stdout: string;
  stderr: string;
  killed_by_timeout?: boolean;
  error?: string;
}

/**
 * Execute a shell command
 */
export async function handleRunCommand(input: RunCommandInput): Promise<string> {
  const { command, working_dir, timeout_seconds = 300 } = input;
  
  // Safety check
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(command)) {
      return JSON.stringify({
        success: false,
        error: `Command blocked for safety: matches dangerous pattern`,
        command,
      });
    }
  }
  
  // Determine working directory - always use PROJECT_ROOT for dbt commands
  const cwd = working_dir || PROJECT_ROOT;
  const timeout = timeout_seconds * 1000;
  
  console.log(chalk.gray(`\n  📂 Working directory: ${cwd}`));
  console.log(chalk.cyan(`  ▶ ${command}\n`));
  
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let killed = false;
    
    const proc = spawn(command, {
      shell: true,
      cwd,
      env: { 
        ...process.env,
        // Prepend venv to PATH so dbt is found
        PATH: `${VENV_PATH}:${process.env.PATH}`,
        FORCE_COLOR: '1',
        TERM: 'xterm-256color',
      },
    });
    
    // Timeout handler
    const timer = setTimeout(() => {
      killed = true;
      proc.kill('SIGTERM');
      console.log(chalk.yellow(`\n  ⏱️ Command timed out after ${timeout_seconds}s`));
    }, timeout);
    
    // Stream stdout
    proc.stdout?.on('data', (data) => {
      const text = data.toString();
      stdout += text;
      // Prefix each line with indent for readability
      text.split('\n').forEach((line: string) => {
        if (line.trim()) {
          process.stdout.write(chalk.gray('  │ ') + line + '\n');
        }
      });
    });
    
    // Stream stderr
    proc.stderr?.on('data', (data) => {
      const text = data.toString();
      stderr += text;
      text.split('\n').forEach((line: string) => {
        if (line.trim()) {
          process.stderr.write(chalk.gray('  │ ') + chalk.yellow(line) + '\n');
        }
      });
    });
    
    // Handle process completion
    proc.on('close', (code) => {
      clearTimeout(timer);
      
      console.log('');
      if (code === 0) {
        console.log(chalk.green(`  ✓ Command completed successfully`));
      } else if (killed) {
        console.log(chalk.yellow(`  ⚠️ Command killed (timeout)`));
      } else {
        console.log(chalk.yellow(`  ⚠️ Command exited with code ${code}`));
      }
      
      // Format output for MCP response
      const result = formatCommandOutput({
        command,
        success: code === 0,
        exit_code: code,
        stdout,
        stderr,
        killed_by_timeout: killed,
      });
      
      resolve(result);
    });
    
    // Handle process errors
    proc.on('error', (err) => {
      clearTimeout(timer);
      console.log(chalk.red(`\n  ❌ Error: ${err.message}`));
      
      resolve(`# ❌ Command Failed\n\n**Error:** ${err.message}\n\n**Command:** \`${command}\``);
    });
  });
}

/**
 * Format command output for readable MCP response
 */
function formatCommandOutput(result: {
  command: string;
  success: boolean;
  exit_code: number | null;
  stdout: string;
  stderr: string;
  killed_by_timeout?: boolean;
}): string {
  const { command, success, exit_code, stdout, stderr, killed_by_timeout } = result;
  
  // Check if this is a dbt command
  const isDbtCommand = command.startsWith('dbt ');
  
  if (isDbtCommand) {
    return formatDbtOutput(result);
  }
  
  // Generic command output
  const lines: string[] = [];
  
  if (success) {
    lines.push(`# ✅ Command Successful`);
  } else if (killed_by_timeout) {
    lines.push(`# ⏱️ Command Timed Out`);
  } else {
    lines.push(`# ❌ Command Failed (exit code: ${exit_code})`);
  }
  
  lines.push('');
  lines.push(`**Command:** \`${command}\``);
  lines.push('');
  
  if (stdout.trim()) {
    lines.push('## Output');
    lines.push('```');
    lines.push(stripAnsi(stdout).trim().slice(-8000)); // Last 8KB, stripped of ANSI
    lines.push('```');
  }
  
  if (stderr.trim() && !success) {
    lines.push('');
    lines.push('## Errors');
    lines.push('```');
    lines.push(stripAnsi(stderr).trim().slice(-4000));
    lines.push('```');
  }
  
  return lines.join('\n');
}

/**
 * Format dbt-specific output with summary
 */
function formatDbtOutput(result: {
  command: string;
  success: boolean;
  exit_code: number | null;
  stdout: string;
  stderr: string;
  killed_by_timeout?: boolean;
}): string {
  const { command, success, exit_code, stdout, stderr, killed_by_timeout } = result;
  const output = stripAnsi(stdout);
  const lines: string[] = [];
  
  // Extract dbt summary line (e.g., "Done. PASS=5 WARN=0 ERROR=0 SKIP=0 TOTAL=5")
  const summaryMatch = output.match(/Done\.\s+PASS=(\d+)\s+WARN=(\d+)\s+ERROR=(\d+)\s+SKIP=(\d+).*TOTAL=(\d+)/);
  const completedMatch = output.match(/Completed successfully/);
  
  // Extract timing info
  const timingMatch = output.match(/Finished running.*in\s+(\d+\s+hours?\s+)?(\d+\s+minutes?\s+)?and\s+([\d.]+)\s+seconds/);
  
  // Extract model results
  const modelResults: { name: string; status: string; time: string }[] = [];
  const modelPattern = /\d+\s+of\s+\d+\s+(OK|ERROR|SKIP|WARN)\s+\w+\s+model\s+(\S+)\s+.*\[(OK|ERROR|SKIP|WARN)?\s*(?:in\s+)?([\d.]+s)?\]/g;
  let match;
  while ((match = modelPattern.exec(output)) !== null) {
    modelResults.push({
      name: match[2],
      status: match[1] || match[3],
      time: match[4] || '',
    });
  }
  
  // Alternative pattern for simpler output
  if (modelResults.length === 0) {
    const simplePattern = /\d+\s+of\s+\d+\s+(START|OK|ERROR)\s+\w+\s+\w+\s+model\s+(\S+)/g;
    const okPattern = /(\S+)\s+\.\.\.\.\.*\s+\[(OK|ERROR|WARN)\s+in\s+([\d.]+s)\]/g;
    while ((match = okPattern.exec(output)) !== null) {
      modelResults.push({
        name: match[1],
        status: match[2],
        time: match[3],
      });
    }
  }
  
  // Header
  if (success && summaryMatch) {
    const [, pass, warn, error, skip, total] = summaryMatch;
    lines.push(`# ✅ dbt Run Complete`);
    lines.push('');
    lines.push(`| PASS | WARN | ERROR | SKIP | TOTAL |`);
    lines.push(`|------|------|-------|------|-------|`);
    lines.push(`| ${pass} | ${warn} | ${error} | ${skip} | ${total} |`);
  } else if (success || completedMatch) {
    lines.push(`# ✅ dbt Command Successful`);
  } else if (killed_by_timeout) {
    lines.push(`# ⏱️ dbt Command Timed Out`);
  } else {
    lines.push(`# ❌ dbt Command Failed (exit code: ${exit_code})`);
  }
  
  lines.push('');
  lines.push(`**Command:** \`${command}\``);
  
  // Timing
  if (timingMatch) {
    const duration = timingMatch[3];
    lines.push(`**Duration:** ${duration}s`);
  }
  
  // Model results table
  if (modelResults.length > 0) {
    lines.push('');
    lines.push('## Models');
    lines.push('');
    lines.push('| Model | Status | Time |');
    lines.push('|-------|--------|------|');
    for (const m of modelResults) {
      const statusIcon = m.status === 'OK' ? '✅' : m.status === 'ERROR' ? '❌' : m.status === 'WARN' ? '⚠️' : '⏭️';
      lines.push(`| ${m.name} | ${statusIcon} ${m.status} | ${m.time} |`);
    }
  }
  
  // Errors (if any)
  if (!success) {
    lines.push('');
    lines.push('## Error Details');
    lines.push('');
    
    // Extract error messages
    const errorSection = output.split('Completed with')[0];
    const relevantLines = errorSection
      .split('\n')
      .filter(l => l.includes('Error') || l.includes('ERROR') || l.includes('Compilation Error'))
      .slice(-20);
    
    if (relevantLines.length > 0) {
      lines.push('```');
      lines.push(relevantLines.join('\n'));
      lines.push('```');
    } else {
      lines.push('```');
      lines.push(output.slice(-2000));
      lines.push('```');
    }
  }
  
  // Warnings (extract from output)
  const warnings = output.match(/\[WARNING\].*$/gm);
  if (warnings && warnings.length > 0 && warnings.length <= 5) {
    lines.push('');
    lines.push('## Warnings');
    lines.push('');
    for (const w of warnings.slice(0, 5)) {
      lines.push(`- ${w.replace('[WARNING]', '⚠️')}`);
    }
    if (warnings.length > 5) {
      lines.push(`- ... and ${warnings.length - 5} more warnings`);
    }
  }
  
  return lines.join('\n');
}

/**
 * Strip ANSI color codes from string
 */
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
}
