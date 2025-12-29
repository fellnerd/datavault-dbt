/**
 * MCP Server for Data Vault dbt Agent
 * 
 * Provides MCP-compatible interface with Streamable HTTP transport
 * for remote access from Claude Code clients.
 */

import express, { Request, Response, NextFunction } from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
  TextContent,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Import auth middleware
import { authMiddleware, initializeTokens, AuthenticatedUser } from './auth/tokens.js';

// Import database
import { getDatabase, AgentDatabase } from './memory/database.js';

// Import existing tool handlers
import { TOOL_DEFINITIONS, executeTool } from './tools/index.js';

// Import RAG (will be created)
// import { getContextForPrompt } from './memory/rag.js';

// ============== Configuration ==============

const PORT = parseInt(process.env.MCP_PORT || '3001', 10);
const HOST = process.env.MCP_HOST || '0.0.0.0';

// ============== Types ==============

interface MCPRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: unknown;
}

interface MCPResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

// Session storage
interface UserSession {
  id: string;
  user: AuthenticatedUser;
  createdAt: Date;
  lastActivity: Date;
  db: AgentDatabase;
}

const sessions = new Map<string, UserSession>();

// ============== MCP Tool Conversion ==============

/**
 * Convert Anthropic tool format to MCP tool format
 */
function convertToMCPTools(): Tool[] {
  return TOOL_DEFINITIONS.map(tool => ({
    name: tool.name,
    description: tool.description || '',
    inputSchema: tool.input_schema as Tool['inputSchema'],
  }));
}

// ============== Session Management ==============

function getOrCreateSession(user: AuthenticatedUser, sessionId?: string): UserSession {
  // Try to find existing session
  if (sessionId && sessions.has(sessionId)) {
    const session = sessions.get(sessionId)!;
    session.lastActivity = new Date();
    return session;
  }

  // Create new session
  const id = sessionId || uuidv4();
  const db = getDatabase();
  
  // Ensure user exists in database
  db.getOrCreateUser(user.id, user.name);
  
  // Create session in database
  const dbSession = db.createSession(user.id, 'mcp-http');
  
  const session: UserSession = {
    id: dbSession.id,
    user,
    createdAt: new Date(),
    lastActivity: new Date(),
    db,
  };
  
  sessions.set(session.id, session);
  return session;
}

function cleanupOldSessions(maxAgeMs = 3600000): void {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.lastActivity.getTime() > maxAgeMs) {
      sessions.delete(id);
    }
  }
}

// Cleanup old sessions every 10 minutes
setInterval(() => cleanupOldSessions(), 600000);

// ============== Express Server ==============

const app = express();
app.use(express.json({ limit: '10mb' }));

// Health check endpoint (no auth required)
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    version: '1.0.0',
    uptime: process.uptime(),
    sessions: sessions.size,
  });
});

// MCP info endpoint
app.get('/mcp/info', (_req, res) => {
  res.json({
    name: 'datavault-dbt-agent',
    version: '1.0.0',
    description: 'Data Vault 2.1 dbt Agent MCP Server',
    tools: convertToMCPTools().map(t => t.name),
  });
});

// Main MCP endpoint with authentication
app.post('/mcp/v1/messages', authMiddleware, async (req: Request, res: Response) => {
  const user = req.user!;
  const sessionId = req.headers['x-mcp-session-id'] as string | undefined;
  
  try {
    const request = req.body as MCPRequest;
    
    // Validate JSON-RPC structure
    if (request.jsonrpc !== '2.0' || !request.method) {
      return res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32600, message: 'Invalid Request' },
        id: request.id || null,
      });
    }

    // Get or create session
    const session = getOrCreateSession(user, sessionId);
    
    // Set session ID header in response
    res.setHeader('X-MCP-Session-ID', session.id);

    // Route to appropriate handler
    let response: MCPResponse;
    
    switch (request.method) {
      case 'initialize':
        response = handleInitialize(request, session);
        break;
      
      case 'tools/list':
        response = handleListTools(request);
        break;
      
      case 'tools/call':
        response = await handleToolCall(request, session);
        break;
      
      case 'ping':
        response = {
          jsonrpc: '2.0',
          id: request.id,
          result: { pong: true },
        };
        break;
      
      default:
        response = {
          jsonrpc: '2.0',
          id: request.id,
          error: { code: -32601, message: `Method not found: ${request.method}` },
        };
    }

    res.json(response);
  } catch (error) {
    console.error('MCP request error:', error);
    res.status(500).json({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: error instanceof Error ? error.message : 'Internal error',
      },
      id: (req.body as MCPRequest)?.id || null,
    });
  }
});

// ============== MCP Method Handlers ==============

function handleInitialize(request: MCPRequest, session: UserSession): MCPResponse {
  return {
    jsonrpc: '2.0',
    id: request.id,
    result: {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: {},
      },
      serverInfo: {
        name: 'datavault-dbt-agent',
        version: '1.0.0',
      },
      sessionId: session.id,
    },
  };
}

function handleListTools(request: MCPRequest): MCPResponse {
  return {
    jsonrpc: '2.0',
    id: request.id,
    result: {
      tools: convertToMCPTools(),
    },
  };
}

async function handleToolCall(request: MCPRequest, session: UserSession): Promise<MCPResponse> {
  const params = request.params as { name: string; arguments?: Record<string, unknown> } | undefined;
  
  if (!params?.name) {
    return {
      jsonrpc: '2.0',
      id: request.id,
      error: { code: -32602, message: 'Missing tool name' },
    };
  }

  const toolName = params.name;
  const toolInput = params.arguments || {};

  // Log tool call to database
  const messageId = session.db.addMessage({
    session_id: session.id,
    user_id: session.user.id,
    role: 'tool',
    content: `Tool call: ${toolName}`,
    tool_name: toolName,
    tool_input: JSON.stringify(toolInput),
  });

  try {
    // Execute the tool
    const result = await executeTool(toolName, toolInput);
    
    // Update message with result
    // Note: This is simplified - in production you'd update the specific message
    session.db.addMessage({
      session_id: session.id,
      user_id: session.user.id,
      role: 'tool',
      content: result,
      tool_name: toolName,
      tool_output: result,
    });

    // Push to undo stack if it's a create/edit operation
    if (toolName.startsWith('create_') || toolName === 'edit_model' || toolName === 'add_attribute') {
      session.db.pushUndo({
        user_id: session.user.id,
        session_id: session.id,
        action_type: toolName.startsWith('create_') ? 'create' : 'edit',
        object_name: (toolInput as any).name || (toolInput as any).satellite_name || 'unknown',
        file_path: extractFilePath(result) || '',
        new_content: result,
      });
    }

    return {
      jsonrpc: '2.0',
      id: request.id,
      result: {
        content: [
          {
            type: 'text',
            text: result,
          } as TextContent,
        ],
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return {
      jsonrpc: '2.0',
      id: request.id,
      error: {
        code: -32000,
        message: `Tool execution failed: ${errorMessage}`,
      },
    };
  }
}

/**
 * Extract file path from tool result (if present)
 */
function extractFilePath(result: string): string | null {
  const match = result.match(/(?:erstellt|created|gespeichert|saved).*?([\/\w\-_.]+\.sql)/i);
  return match ? match[1] : null;
}

// ============== Error Handler ==============

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Express error:', err);
  res.status(500).json({
    jsonrpc: '2.0',
    error: {
      code: -32603,
      message: 'Internal server error',
    },
    id: null,
  });
});

// ============== Server Startup ==============

export function startMCPServer(): void {
  // Re-initialize tokens (in case env changed)
  initializeTokens();
  
  app.listen(PORT, HOST, () => {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  Data Vault dbt Agent - MCP Server');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`  🚀 Server running at http://${HOST}:${PORT}`);
    console.log(`  📡 MCP endpoint: http://${HOST}:${PORT}/mcp/v1/messages`);
    console.log(`  ❤️  Health check: http://${HOST}:${PORT}/health`);
    console.log(`  🔧 Tools available: ${TOOL_DEFINITIONS.length}`);
    console.log('═══════════════════════════════════════════════════════════');
  });
}

// ============== CLI Entry Point ==============

// Check if running directly (not imported)
const isMainModule = import.meta.url === `file://${process.argv[1]}`;

if (isMainModule) {
  startMCPServer();
}

export { app, convertToMCPTools };
