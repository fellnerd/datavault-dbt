/**
 * Token-based Authentication Middleware for MCP Server
 * Validates Bearer tokens from MCP_USER_TOKENS environment variable
 */

import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';

// User context attached to request
export interface AuthenticatedUser {
  id: string;
  name: string;
}

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

// Token map: token -> { id, name }
const tokenMap = new Map<string, AuthenticatedUser>();

/**
 * Initialize token map from environment variable
 * Format: MCP_USER_TOKENS=alice:token-abc123,bob:token-xyz789
 */
export function initializeTokens(): void {
  tokenMap.clear();
  
  const tokensEnv = process.env.MCP_USER_TOKENS;
  if (!tokensEnv) {
    console.warn('⚠️  MCP_USER_TOKENS not set - authentication disabled');
    return;
  }

  const pairs = tokensEnv.split(',').filter(p => p.trim());
  
  for (const pair of pairs) {
    const [name, token] = pair.split(':').map(s => s.trim());
    if (name && token) {
      // Use name as id (lowercase, sanitized)
      const id = name.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
      tokenMap.set(token, { id, name });
      console.log(`✓ Token registered for user: ${name}`);
    }
  }

  if (tokenMap.size === 0) {
    console.warn('⚠️  No valid tokens found in MCP_USER_TOKENS');
  } else {
    console.log(`✓ ${tokenMap.size} user token(s) loaded`);
  }
}

/**
 * Get user from token
 */
export function getUserFromToken(token: string): AuthenticatedUser | undefined {
  return tokenMap.get(token);
}

/**
 * Check if authentication is enabled
 */
export function isAuthEnabled(): boolean {
  return tokenMap.size > 0;
}

/**
 * Generate a secure random token
 */
export function generateToken(length = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Express middleware for Bearer token authentication
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Skip auth if no tokens configured
  if (!isAuthEnabled()) {
    req.user = { id: 'anonymous', name: 'Anonymous' };
    return next();
  }

  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    res.status(401).json({
      jsonrpc: '2.0',
      error: {
        code: -32001,
        message: 'Authentication required: Missing Authorization header'
      },
      id: null
    });
    return;
  }

  // Extract Bearer token
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    res.status(401).json({
      jsonrpc: '2.0',
      error: {
        code: -32001,
        message: 'Invalid Authorization header format. Expected: Bearer <token>'
      },
      id: null
    });
    return;
  }

  const token = match[1];
  const user = getUserFromToken(token);

  if (!user) {
    res.status(401).json({
      jsonrpc: '2.0',
      error: {
        code: -32001,
        message: 'Invalid or expired token'
      },
      id: null
    });
    return;
  }

  // Attach user to request
  req.user = user;
  next();
}

/**
 * Optional middleware that allows unauthenticated requests but still parses tokens
 */
export function optionalAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  
  if (authHeader) {
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (match) {
      const user = getUserFromToken(match[1]);
      if (user) {
        req.user = user;
      }
    }
  }

  // Default to anonymous if no valid auth
  if (!req.user) {
    req.user = { id: 'anonymous', name: 'Anonymous' };
  }

  next();
}

/**
 * List all registered users (for admin purposes)
 */
export function listRegisteredUsers(): string[] {
  return Array.from(tokenMap.values()).map(u => u.name);
}

/**
 * Add a new user token at runtime
 */
export function addUserToken(name: string, token: string): void {
  const id = name.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  tokenMap.set(token, { id, name });
}

/**
 * Remove a user token at runtime
 */
export function removeUserToken(token: string): boolean {
  return tokenMap.delete(token);
}

// Initialize on module load
initializeTokens();
