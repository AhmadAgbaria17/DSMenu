import 'server-only';
import NextAuth, { AuthError } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { authEnv } from './env';
import { authClaimsSchema } from './validators/staff';
import { authenticateStaff, revokeStaffSessions, validateStaffClaims } from './services/staff-auth';

// Lazy configuration keeps public menus and build independent of staff secrets.
export const { auth, handlers } = NextAuth(() => {
  const env = authEnv();
  return {
    secret: env.secret,
    trustHost: true, // AUTH_URL pins the canonical origin; never derive redirects from client input.
    useSecureCookies: process.env.NODE_ENV === 'production',
    session: { strategy: 'jwt', maxAge: 8 * 60 * 60 },
    pages: { signIn: '/login', error: '/login' },
    providers: [Credentials({ credentials: { email: { type: 'email' }, password: { type: 'password' } }, authorize: authenticateStaff })],
    callbacks: {
      async jwt({ token, user }) {
        if (user) { token.sub = user.id; token.restaurantId = user.restaurantId; token.role = user.role; token.authVersion = user.authVersion; }
        // Ignore session-update payloads: mutable client claims never select a tenant.
        const current = await validateStaffClaims(token);
        if (!current) return null;
        return { ...token, sub: current.id, restaurantId: current.restaurantId, role: current.role, authVersion: current.authVersion, name: current.name, email: current.email };
      },
      session({ session, token }) {
        const claims = authClaimsSchema.parse(token);
        return { expires: session.expires, user: { id: claims.sub, restaurantId: claims.restaurantId, role: claims.role, name: token.name, email: token.email } };
      },
      redirect({ url }) {
        const destination = new URL(url, env.origin);
        return `${env.origin}${destination.origin === env.origin && destination.pathname === '/login' ? '/login' : '/dashboard'}`;
      },
    },
    events: { async signOut(message) { if ('token' in message) await revokeStaffSessions(message.token); } },
    logger: { error(error) { if (!(error instanceof AuthError) || error.type !== 'CredentialsSignin') console.error('Staff authentication failed', { type: error instanceof AuthError ? error.type : 'Unknown' }); } },
  };
});
