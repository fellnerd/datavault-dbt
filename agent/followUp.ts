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

export interface SuggestedStep {
  command: string;
  label: string;
  type: 'bash' | 'sql' | 'dbt' | 'question' | 'agent';
}

/**
 * Extract next_steps from agent response
 */
export function extractNextSteps(responseText: string): SuggestedStep[] {
  const steps: SuggestedStep[] = [];
  
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

/**
 * Detect command type for appropriate handling
 */
function detectCommandType(command: string): 'bash' | 'sql' | 'dbt' | 'question' | 'agent' {
  // Questions start with ? or contain question words
  if (command.startsWith('?') || 
      command.toLowerCase().includes('erkläre') || 
      command.toLowerCase().includes('warum') ||
      command.toLowerCase().includes('was ist') ||
      command.toLowerCase().includes('wie funktioniert')) {
    return 'question';
  }
  
  // dbt commands
  if (command.startsWith('dbt ')) return 'dbt';
  
  // SQL commands
  if (command.toUpperCase().includes('SELECT') || 
      command.toUpperCase().includes('INSERT') ||
      command.toUpperCase().includes('UPDATE') ||
      command.toUpperCase().includes('DELETE')) {
    return 'sql';
  }
  
  // Agent tasks (create, add, etc.)
  if (command.toLowerCase().startsWith('erstelle') ||
      command.toLowerCase().startsWith('create') ||
      command.toLowerCase().startsWith('füge') ||
      command.toLowerCase().startsWith('add')) {
    return 'agent';
  }
  
  return 'bash';
}

/**
 * Run agent with full tool access and streaming
 */
async function runAgentWithTools(userInput: string): Promise<string> {
  console.log('');
  console.log(ui.divider());
  console.log('');
  
  const followUpSystemPrompt = getSystemPrompt() + `

## Follow-Up Kontext
Du bearbeitest eine Folgeanfrage. Der Kontext der vorherigen Aufgabe ist bekannt.

### Intent-Erkennung und Tool-Nutzung
- "führe X aus" / "run X" → Nutze das run_command Tool
- "erstelle X" / "create X" → Nutze create_hub, create_satellite, etc.
- "zeige X" / "was ist X" → Erkläre direkt ohne Tool
- dbt/git/shell Befehle → Nutze run_command Tool

### Regeln
- Antworte auf Deutsch
- Sei präzise und zielgerichtet
- Nach Tool-Ausführung: Zeige Ergebnis und nächste Schritte

### Nächste Schritte (PFLICHT!)
Am Ende JEDER Antwort, gib einen json:next_steps Block mit 2-3 kontextbezogenen Vorschlägen.`;

  const messages = conversation.getMessages();
  messages.push({ role: 'user', content: userInput });
  
  const result = await streamAgentResponse(
    followUpSystemPrompt,
    messages,
    getFollowUpTools(),
  );
  
  // Update conversation
  conversation.addMessage('user', userInput);
  conversation.addMessage('assistant', result.fullText);
  
  // Show token usage
  console.log('');
  console.log(chalk.gray(conversation.getSessionSummary()));
  
  return result.fullText;
}

/**
 * Main follow-up menu loop
 */
export async function showFollowUpMenu(initialSteps: SuggestedStep[]): Promise<void> {
  let steps = initialSteps;
  let continueLoop = true;
  
  while (continueLoop) {
    console.log('');
    console.log(ui.divider());
    console.log(chalk.cyan.bold('\n🎯 Nächste Schritte:\n'));
    
    // Build menu choices dynamically - show command next to label
    const choices = [
      ...steps.map((step, idx) => {
        // Show command inline if it's a direct shell command
        const isDirectCommand = step.type === 'dbt' || step.type === 'bash';
        const displayCommand = step.command.length > 50 
          ? step.command.slice(0, 47) + '...' 
          : step.command;
        
        return {
          name: isDirectCommand
            ? `${getStepIcon(step.type)} ${step.label} ${chalk.gray('→')} ${chalk.cyan(displayCommand)}`
            : `${getStepIcon(step.type)} ${step.label}`,
          value: `step:${idx}`,
          description: !isDirectCommand ? chalk.gray(displayCommand) : undefined,
        };
      }),
      { name: chalk.blue('[+] Custom input...'), value: 'custom' },
    ];
    
    // Add undo option if available
    if (conversation.hasUndoActions()) {
      const undoDesc = conversation.getUndoDescription();
      const undoLabel = undoDesc 
        ? `[<] Undo: ${undoDesc}` 
        : '[<] Undo';
      choices.push({ 
        name: chalk.yellow(undoLabel), 
        value: 'undo',
      });
    }
    
    choices.push({ name: chalk.gray('[x] Exit'), value: 'exit' });
    
    try {
      const selected = await select({
        message: chalk.cyan('Wähle eine Option:'),
        choices,
        pageSize: 12,
        loop: false,
      });
      
      // Handle exit
      if (selected === 'exit') {
        conversation.saveSession();
        console.log(chalk.gray('\n💾 Session gespeichert.'));
        console.log(chalk.gray(conversation.getSessionSummary()));
        console.log('');
        break;
      }
      
      // Handle undo
      if (selected === 'undo') {
        const lastAction = conversation.peekUndo();
        if (!lastAction) {
          console.log(chalk.yellow('\n⚠️  Nichts zum Rückgängigmachen.\n'));
          continue;
        }
        
        const confirmed = await confirm({
          message: ui.confirmUndo(lastAction.path),
          default: false,
        });
        
        if (confirmed) {
          const result = await conversation.executeUndo();
          console.log(result.success 
            ? chalk.green(`\n✓ ${result.message}`) 
            : chalk.red(`\n❌ ${result.message}`));
        }
        continue;
      }
      
      // Handle custom input
      if (selected === 'custom') {
        const userInput = await input({
          message: chalk.cyan('Was möchtest du tun?'),
          validate: (v) => v.trim().length > 0 || 'Bitte Eingabe machen',
        });
        
        const response = await runAgentWithTools(userInput.trim());
        steps = extractNextSteps(response);
        continue;
      }
      
      // Handle step selection
      if (selected.startsWith('step:')) {
        const idx = parseInt(selected.replace('step:', ''), 10);
        const step = steps[idx];
        
        if (step) {
          // For SQL, just show the command
          if (step.type === 'sql') {
            console.log(chalk.yellow('\n⚠️  SQL-Befehle können nicht direkt ausgeführt werden.'));
            console.log(chalk.gray(`   Kopiere: ${step.command}\n`));
            continue;
          }
          
          // Send to agent - it will use appropriate tools
          const response = await runAgentWithTools(step.command);
          steps = extractNextSteps(response);
        }
      }
      
    } catch (error) {
      if (error instanceof Error && error.message.includes('User force closed')) {
        conversation.saveSession();
        console.log(chalk.gray('\n💾 Session gespeichert.\n'));
        break;
      }
      throw error;
    }
  }
}

/**
 * Get icon for step type
 */
function getStepIcon(type: SuggestedStep['type']): string {
  switch (type) {
    case 'dbt': return '🔧';
    case 'bash': return '▶️';
    case 'sql': return '📊';
    case 'question': return '❓';
    case 'agent': return '🤖';
    default: return '•';
  }
}

// Legacy export for backward compatibility
export function extractCommands(responseText: string): SuggestedStep[] {
  return extractNextSteps(responseText);
}
