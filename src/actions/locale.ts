'use server';

import { cookies } from 'next/headers';
import { languageSchema } from '@/lib/validators/common';
import { localeCookie } from '@/i18n/config';

export async function setLanguage(value: string) {
  const language = languageSchema.parse(value);
  (await cookies()).set(localeCookie, language, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production',
    path: '/', maxAge: 60 * 60 * 24 * 365,
  });
}
