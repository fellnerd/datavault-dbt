/**
 * Claude Agent Logic
 * 
 * Uses the Anthropic SDK with manual tool execution loop.
 */

import Anthropic from '@anthropic-ai/sdk';
import { input } from '@inquirer/prompts';
import chalk from 'chalk';
import { type MenuAction, ACTION_DESCRIPTIONS } from './menu.js';
import { getAllTools, executeTool } from './tools/index.js';
import { getSystemPrompt } from './context/systemPrompt.js';

const client = new Anthropic();

const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514';

/**
 * Maps menu actions to task descriptions for Claude
 */
const TASK_PROMPTS: Record<MenuAction, string> = {
  add_attribute: 'Add a new attribute to an existing satellite',
  create_entity: 'Create a complete new entity with all components (External Table, Staging, Hub, Satellite)',
  create_hub: 'Create a new Hub table',
  create_satellite: 'Create a new Satellite table',
  create_link: 'Create a new Link table between two hubs',
  create_ref_table: 'Create a new Reference Table (dbt seed)',
  create_eff_sat: 'Create a new Effectivity Satellite',
  create_pit: 'Create a new PIT (Point-in-Time) table',
  create_mart: 'Create a new Mart View for reporting',
  add_tests: 'Add dbt tests to schema.yml',
  exit: '',
};

/**
 * Run an agent task based on user selection
 */
export async function runAgentTask(action: MenuAction): Promise<void> {
  // Show task description
  const description = ACTION_DESCRIPTIONS[action];
  if (description) {
    console.log(chalk.gray(description));
  }

  // Get user input for the task
  const userInput = await input({
    message: chalk.cyan('Beschreibe deine Anforderung:'),
    validate: (value) => value.trim().length > 0 || 'Bitte gib eine Beschreibung ein',
  });

  console.log(chalk.yellow('\n🤖 Agent arbeitet...\n'));

  try {
    const tools = getAllTools();
    
    // Build initial messages
    const messages: Anthropic.MessageParam[] = [
      {
        role: 'user',
        content: `## Task: ${TASK_PROMPTS[action]}

## User Request:
${userInput}

## Instructions:
1. Analyze the request and determine what needs to be created
2. Use the available tools to create the necessary files
3. Follow the project conventions exactly
4. Provide a summary of what was created and next steps

Please proceed with the task.`,
      },
    ];

    // Agentic loop - continue until no more tool calls
    let iterations = 0;
    const maxIterations = 10;

    while (iterations < maxIterations) {
      iterations++;

      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 8192,
        system: getSystemPrompt(),
        messages,
        tools,
      });

      // Process response content
      const toolUseBlocks: Anthropic.ToolUseBlock[] = [];
      
      for (const block of response.content) {
        if (block.type === 'text') {
          console.log(chalk.white(block.text));
        } else if (block.type === 'tool_use') {
          toolUseBlocks.push(block);
          console.log(chalk.gray(`\n  ⚙️  Tool: ${block.name}`));
          if (block.input && typeof block.input === 'object') {
            const inputStr = JSON.stringify(block.input, null, 2)
              .split('\n')
              .map(line => chalk.gray(`     ${line}`))
              .join('\n');
            console.log(inputStr);
          }
        }
      }

      // If no tool use, we're done
      if (response.stop_reason === 'end_turn' || toolUseBlocks.length === 0) {
        break;
      }

      // Execute tools and collect results
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      
      for (const toolUse of toolUseBlocks) {
        console.log(chalk.blue(`\n  ▶ Executing ${toolUse.name}...`));
        const result = await executeTool(toolUse.name, toolUse.input);
        console.log(chalk.cyan(`  ${result.split('\n')[0]}`)); // Show first line of result
        
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: result,
        });
      }

      // Add assistant message and tool results to conversation
      messages.push({
        role: 'assistant',
        content: response.content,
      });
      
      messages.push({
        role: 'user',
        content: toolResults,
      });
    }

    console.log(chalk.green('\n✅ Aufgabe abgeschlossen!\n'));

  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      console.error(chalk.red(`\n❌ API Fehler: ${error.message}`));
      if (error.status === 401) {
        console.log(chalk.yellow('   Bitte prüfe deinen ANTHROPIC_API_KEY'));
      } else if (error.status === 429) {
        console.log(chalk.yellow('   Rate Limit erreicht. Bitte warte einen Moment.'));
      }
    } else {
      throw error;
    }
  }
}
