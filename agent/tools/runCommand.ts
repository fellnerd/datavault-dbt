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
      
      const result: RunCommandResult = {
        success: code === 0,
        exit_code: code,
        stdout: stdout.slice(-10000), // Last 10KB
        stderr: stderr.slice(-5000),  // Last 5KB
        killed_by_timeout: killed,
      };
      
      resolve(JSON.stringify(result));
    });
    
    // Handle process errors
    proc.on('error', (err) => {
      clearTimeout(timer);
      console.log(chalk.red(`\n  ❌ Error: ${err.message}`));
      
      resolve(JSON.stringify({
        success: false,
        exit_code: null,
        stdout: '',
        stderr: '',
        error: err.message,
      }));
    });
  });
}
