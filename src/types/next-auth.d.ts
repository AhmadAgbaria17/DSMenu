import type { DefaultSession } from 'next-auth';
import type { AuthRole } from '@/lib/validators/staff';

declare module 'next-auth' {
  interface Session {
    user: { id: string; restaurantId?: string; role: AuthRole } & DefaultSession['user'];
  }
  interface User { restaurantId?: string; role: AuthRole; authVersion?: number }
}
declare module 'next-auth/jwt' {
  interface JWT { restaurantId?: string; role?: AuthRole; authVersion?: number }
}
