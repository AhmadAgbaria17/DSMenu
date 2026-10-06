import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { localeCookie, resolveLanguage } from './config';
import ar from './messages/ar.json';
import he from './messages/he.json';
import en from './messages/en.json';

const messages = { ar, he, en };
export default getRequestConfig(async () => {
  const locale = resolveLanguage((await cookies()).get(localeCookie)?.value);
  return { locale, messages: messages[locale], timeZone: 'Asia/Jerusalem' };
});
