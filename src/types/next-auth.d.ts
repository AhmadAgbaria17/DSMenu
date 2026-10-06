import type { DefaultSession } from 'next-auth';
import type { StaffRole } from '@/lib/validators/staff';

declare module 'next-auth' {
  interface Session {
    user: { id: string; restaurantId: string; role: StaffRole } & DefaultSession['user'];
  }
  interface User { restaurantId: string; role: StaffRole; authVersion?: number }
}
declare module 'next-auth/jwt' {
  interface JWT { restaurantId?: string; role?: StaffRole; authVersion?: number }
}
