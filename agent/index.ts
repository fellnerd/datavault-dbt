#!/usr/bin/env node
/**
 * Data Vault dbt Agent - Entry Point
 * 
 * Interactive CLI assistant for Data Vault 2.1 development tasks.
 * Uses Claude AI with tool execution for automated model generation.
 */

import 'dotenv/config';
import { select, confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import { runAgentTask } from './agent.js';
import { MENU_CHOICES, type MenuAction } from './menu.js';

const BANNER = `
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   ${chalk.blue.bold('🏗️  Data Vault 2.1 dbt Agent')}                              ║
║                                                               ║
║   Powered by Claude AI                                        ║
║   Project: datavault-dbt                                      ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
`;

async function checkApiKey(): Promise<boolean> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log(chalk.red.bold('\n❌ Error: ANTHROPIC_API_KEY not found!\n'));
    console.log(chalk.yellow('Please set your API key:'));
    console.log(chalk.gray('  1. Copy agent/.env.example to agent/.env'));
    console.log(chalk.gray('  2. Add your key: ANTHROPIC_API_KEY=sk-ant-api03-xxxxx'));
    console.log(chalk.gray('  3. Get a key at: https://console.anthropic.com/\n'));
    return false;
  }
  return true;
}

async function main(): Promise<void> {
  console.clear();
  console.log(BANNER);

  if (!await checkApiKey()) {
    process.exit(1);
  }

  console.log(chalk.green('✓ API Key configured\n'));

  // Main loop
  while (true) {
    try {
      const action = await select<MenuAction>({
        message: chalk.cyan('Was möchtest du tun?'),
        choices: MENU_CHOICES,
        pageSize: 12,
      });

      if (action === 'exit') {
        console.log(chalk.green('\n👋 Auf Wiedersehen!\n'));
        break;
      }

      // Run the selected task
      await runAgentTask(action);

      // Ask if user wants to continue
      console.log(''); // Empty line
      const continueSession = await confirm({
        message: 'Weitere Aufgabe ausführen?',
        default: true,
      });

      if (!continueSession) {
        console.log(chalk.green('\n👋 Auf Wiedersehen!\n'));
        break;
      }

      console.log(''); // Empty line before next menu

    } catch (error) {
      if (error instanceof Error && error.message.includes('User force closed')) {
        console.log(chalk.yellow('\n\n⚠️  Abgebrochen.\n'));
        break;
      }
      throw error;
    }
  }
}

// Handle uncaught errors gracefully
process.on('unhandledRejection', (error) => {
  console.error(chalk.red('\n❌ Unerwarteter Fehler:'), error);
  process.exit(1);
});

// Run
main().catch((error) => {
  console.error(chalk.red('\n❌ Fehler:'), error.message);
  process.exit(1);
});
