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
import { showBanner, box, divider } from './ui.js';

async function checkApiKey(): Promise<boolean> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log(box('ANTHROPIC_API_KEY nicht gefunden!', 'error'));
    console.log('');
    console.log(chalk.yellow('Bitte API Key konfigurieren:'));
    console.log(chalk.gray('  1. Erstelle agent/.env'));
    console.log(chalk.gray('  2. Füge hinzu: ANTHROPIC_API_KEY=sk-ant-api03-xxxxx'));
    console.log(chalk.gray('  3. Key erhältlich: https://console.anthropic.com/'));
    console.log('');
    return false;
  }
  return true;
}

async function main(): Promise<void> {
  console.clear();
  showBanner();

  if (!await checkApiKey()) {
    process.exit(1);
  }

  console.log(chalk.green('  ✓ API Key konfiguriert'));
  console.log(chalk.gray(`  ✓ Model: ${process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514'}`));
  console.log('');
  console.log(divider());
  console.log('');

  // Main loop
  while (true) {
    try {
      const action = await select<MenuAction>({
        message: chalk.cyan.bold('📋 Was möchtest du tun?'),
        choices: MENU_CHOICES,
        pageSize: 12,
        loop: false,
      });

      if (action === 'exit') {
        console.log('');
        console.log(chalk.green.bold('👋 Auf Wiedersehen!'));
        console.log('');
        break;
      }

      // Run the selected task
      await runAgentTask(action);

      // Ask if user wants to continue
      console.log(divider());
      const continueSession = await confirm({
        message: chalk.cyan('Weitere Aufgabe ausführen?'),
        default: true,
      });

      if (!continueSession) {
        console.log('');
        console.log(chalk.green.bold('👋 Auf Wiedersehen!'));
        console.log('');
        break;
      }

      console.clear();
      showBanner();
      console.log('');

    } catch (error) {
      if (error instanceof Error && error.message.includes('User force closed')) {
        console.log('');
        console.log(chalk.yellow('⚠️  Abgebrochen.'));
        console.log('');
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
