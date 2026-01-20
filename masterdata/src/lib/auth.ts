import NextAuth from 'next-auth';
import MicrosoftEntraID from 'next-auth/providers/microsoft-entra-id';
import Credentials from 'next-auth/providers/credentials';
import type { NextAuthConfig, Session } from 'next-auth';
import type { JWT } from 'next-auth/jwt';

// User role type
export type UserRole = 'viewer' | 'editor' | 'approver' | 'admin';

// Extended session user type
interface ExtendedUser {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  roles: UserRole[];
}

interface ExtendedSession extends Session {
  user: ExtendedUser;
  accessToken?: string;
}

interface ExtendedJWT extends JWT {
  accessToken?: string;
  roles?: UserRole[];
}

// Get user roles - uses pattern matching for now
// DB integration will be done via API call in production
async function getUserRoles(email: string): Promise<UserRole[]> {
  // TODO: Call API endpoint to get roles from database
  // For now, use pattern matching as fallback
  if (email?.includes('admin')) {
    return ['admin'];
  }
  if (email?.includes('approver')) {
    return ['approver'];
  }
  if (email?.includes('editor')) {
    return ['editor'];
  }
  return ['viewer'];
}

// Check if dev mode is enabled (via env var, not just NODE_ENV)
const isDevModeEnabled = process.env.NEXT_PUBLIC_DEV_MODE === 'true' || process.env.NODE_ENV === 'development';

// Dev credentials provider for local testing
const devCredentialsProvider = Credentials({
  name: 'Development',
  credentials: {
    email: { label: 'Email', type: 'email', placeholder: 'admin@example.com' },
    password: { label: 'Password', type: 'password' },
  },
  async authorize(credentials) {
    // Only allow if dev mode is explicitly enabled
    if (!isDevModeEnabled) {
      return null;
    }
    
    // Accept any email/password in dev mode
    if (credentials?.email) {
      const email = credentials.email as string;
      return {
        id: '1',
        name: email.includes('admin') ? 'System Admin' : 'Dev User',
        email: email,
      };
    }
    return null;
  },
});

// Build providers based on environment
const providers = [
  // Development credentials (when NEXT_PUBLIC_DEV_MODE=true)
  ...(isDevModeEnabled ? [devCredentialsProvider] : []),
  // Microsoft Entra ID (production)
  ...(process.env.AUTH_MICROSOFT_ENTRA_ID_ID
    ? [
        MicrosoftEntraID({
          clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID!,
          clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET!,
          issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
          authorization: {
            params: {
              scope: 'openid profile email User.Read',
            },
          },
        }),
      ]
    : []),
];

export const authConfig: NextAuthConfig = {
  providers,
  
  callbacks: {
    async jwt({ token, account }): Promise<ExtendedJWT> {
      const extendedToken = token as ExtendedJWT;
      
      // Initial sign in
      if (account) {
        extendedToken.accessToken = account.access_token;
      }
      
      // Load roles if not already set
      if (!extendedToken.roles && extendedToken.email) {
        extendedToken.roles = await getUserRoles(extendedToken.email);
      }
      
      return extendedToken;
    },
    
    async session({ session, token }): Promise<ExtendedSession> {
      const extendedToken = token as ExtendedJWT;
      
      // Pass roles and access token to session
      const extendedSession: ExtendedSession = {
        ...session,
        user: {
          ...session.user,
          id: extendedToken.sub ?? '',
          roles: extendedToken.roles ?? ['viewer'],
        },
        accessToken: extendedToken.accessToken,
      };
      
      return extendedSession;
    },
    
    async authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const { pathname } = request.nextUrl;
      
      // Public routes
      const publicRoutes = ['/login', '/api/auth', '/api/models', '/api/entities', '/api/attributes', '/api/records', '/api/commits', '/api/health'];
      if (publicRoutes.some(route => pathname.startsWith(route))) {
        return true;
      }
      
      // Protected routes require authentication
      if (!isLoggedIn) {
        return false;
      }
      
      // Admin-only routes
      const adminRoutes = ['/settings/users'];
      if (adminRoutes.some(route => pathname.startsWith(route))) {
        const roles = (auth?.user as ExtendedUser | undefined)?.roles ?? [];
        if (!roles.includes('admin')) {
          return false;
        }
      }
      
      return true;
    },
    
    // Fix redirect URLs - replace internal 0.0.0.0 with actual request host
    async redirect({ url, baseUrl }) {
      // If URL contains 0.0.0.0, it's the internal container hostname - fix it
      if (url.includes('0.0.0.0')) {
        // Just redirect to root path on same origin
        return '/';
      }
      
      // Handle relative URLs
      if (url.startsWith('/')) {
        return url;
      }
      
      // Allow redirects to same origin
      if (url.startsWith(baseUrl)) {
        return url;
      }
      
      // Default to home
      return '/';
    },
  },
  
  pages: {
    signIn: '/login',
    error: '/login',
  },
  
  session: {
    strategy: 'jwt',
    maxAge: 24 * 60 * 60, // 24 hours
  },
  
  trustHost: true,
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
