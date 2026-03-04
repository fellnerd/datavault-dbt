/**
 * Streaming Module
 * 
 * Provides streaming responses using the Anthropic SDK.
 * Supports tool execution in a loop with real-time text output.
 */

import Anthropic from '@anthropic-ai/sdk';
import chalk from 'chalk';
import type { Tool } from '@anthropic-ai/sdk/resources/messages.js';
import { TOOL_HANDLERS } from './tools/index.js';
import * as conversation from './conversation.js';
import { DEFAULT_CONCEPT } from './utils/fileOperations.js';

const client = new Anthropic();
const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514';

export interface StreamingResult {
  fullText: string;
  toolResults: Array<{ tool: string; result: unknown }>;
  usage: { input_tokens: number; output_tokens: number };
}

/**
 * Stream agent response with tool execution support
 * 
 * This function handles the agentic loop:
 * 1. Stream response from Claude
 * 2. If tool_use, execute tools and continue
 * 3. Repeat until end_turn
 */
export async function streamAgentResponse(
  system: string,
  messages: Anthropic.MessageParam[],
  tools: Tool[],
  onText?: (text: string) => void,
): Promise<StreamingResult> {
  let fullText = '';
  const toolResults: Array<{ tool: string; result: unknown }> = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  
  // Allow multiple tool loops
  let currentMessages = [...messages];
  let continueLoop = true;
  let iterations = 0;
  const maxIterations = 10;
  
  while (continueLoop && iterations < maxIterations) {
    iterations++;
    
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 8192,
      system,
      messages: currentMessages,
      tools,
    });
    
    // Collect content blocks for potential tool use
    const contentBlocks: Anthropic.ContentBlock[] = [];
    let currentToolUseId: string | null = null;
    let currentToolName: string | null = null;
    let toolInputJson = '';
    
    // Handle text streaming
    stream.on('text', (text) => {
      fullText += text;
      if (onText) {
        onText(text);
      } else {
        process.stdout.write(text);
      }
    });
    
    // Handle content blocks
    stream.on('contentBlock', (block) => {
      contentBlocks.push(block);
    });
    
    // Wait for stream to complete
    const finalMessage = await stream.finalMessage();
    
    totalInputTokens += finalMessage.usage.input_tokens;
    totalOutputTokens += finalMessage.usage.output_tokens;
    
    // Check for tool use
    const toolUseBlocks = contentBlocks.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
    );
    
    if (toolUseBlocks.length === 0 || finalMessage.stop_reason !== 'tool_use') {
      continueLoop = false;
    } else {
      // Execute tools
      const toolResultContents: Anthropic.ToolResultBlockParam[] = [];
      
      for (const block of toolUseBlocks) {
        const handler = TOOL_HANDLERS[block.name];
        if (handler) {
          console.log(chalk.gray(`\n🔧 Executing: ${chalk.white(block.name)}...`));
          
          try {
            const result = await handler(block.input as any);
            toolResults.push({ tool: block.name, result });
            
            // Track created files for undo
            if (block.name === 'create_hub' || 
                block.name === 'create_satellite' || 
                block.name === 'create_link' ||
                block.name === 'create_staging' ||
                block.name === 'create_ref_table' ||
                block.name === 'create_eff_sat' ||
                block.name === 'create_pit' ||
                block.name === 'create_mart') {
              // Extract file path from input
              const input = block.input as { name?: string; entity?: string; concept?: string };
              const name = input.name || input.entity;
              const concept = input.concept || DEFAULT_CONCEPT;
              if (name) {
                // Construct likely path based on tool
                let filePath = '';
                switch (block.name) {
                  case 'create_hub':
                    filePath = `models/raw_vault/${concept}/hubs/hub_${name}.sql`;
                    break;
                  case 'create_satellite':
                    filePath = `models/raw_vault/${concept}/satellites/sat_${name}.sql`;
                    break;
                  case 'create_link':
                    filePath = `models/raw_vault/${concept}/links/link_${name}.sql`;
                    break;
                  case 'create_staging':
                    filePath = `models/staging/stg_${name}.sql`;
                    break;
                  case 'create_pit':
                    filePath = `models/business_vault/pit_${name}.sql`;
                    break;
                  case 'create_mart':
                    filePath = `models/mart/${name}.sql`;
                    break;
                }
                if (filePath) {
                  conversation.trackCreatedFile(filePath);
                }
              }
            }
            
            toolResultContents.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: typeof result === 'string' ? result : JSON.stringify(result),
            });
          } catch (err) {
            const error = err instanceof Error ? err.message : String(err);
            console.log(chalk.red(`  ❌ Error: ${error}`));
            toolResultContents.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: `Error: ${error}`,
              is_error: true,
            });
          }
        } else {
          console.log(chalk.yellow(`  ⚠️ Unknown tool: ${block.name}`));
          toolResultContents.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: `Unknown tool: ${block.name}`,
            is_error: true,
          });
        }
      }
      
      // Add assistant message and tool results to continue conversation
      currentMessages = [
        ...currentMessages,
        { role: 'assistant' as const, content: contentBlocks },
        { role: 'user' as const, content: toolResultContents },
      ];
      
      console.log(''); // Newline after tool execution
    }
  }
  
  // Update conversation state with token usage
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
  onText?: (text: string) => void,
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
    if (onText) {
      onText(text);
    } else {
      process.stdout.write(text);
    }
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

/**
 * Format text output with styling (used for onText callback)
 */
export function createStyledTextHandler(): (text: string) => void {
  let buffer = '';
  
  return (text: string) => {
    buffer += text;
    
    // Process complete lines
    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // Keep incomplete line in buffer
    
    for (const line of lines) {
      // Apply basic styling
      let styled = line;
      
      // Headers
      if (line.startsWith('# ')) {
        styled = chalk.cyan.bold(line.slice(2));
      } else if (line.startsWith('## ')) {
        styled = chalk.cyan(line.slice(3));
      } else if (line.startsWith('### ')) {
        styled = chalk.blue(line.slice(4));
      }
      // Code blocks are handled differently in streaming
      
      process.stdout.write(styled + '\n');
    }
    
    // If buffer contains partial content, write it
    if (buffer && !buffer.includes('\n')) {
      process.stdout.write(text);
      buffer = '';
    }
  };
}
