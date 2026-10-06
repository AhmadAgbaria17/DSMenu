import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { auth } from './auth';

// React cache deduplicates within one server render, never across requests/users.
export const requireStaffSession = cache(async () => {
  const session = await auth();
  if (!session?.user?.id || !session.user.restaurantId) redirect('/login');
  return session.user;
});
