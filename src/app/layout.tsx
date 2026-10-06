import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale } from 'next-intl/server';
import { direction } from '@/i18n/config';
import './globals.css';

export const metadata: Metadata = { title: { default: 'DSMenu', template: '%s · DSMenu' }, description: 'Your restaurant menu, in your language.' };
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  return <html lang={locale} dir={direction(locale)}><body><NextIntlClientProvider>{children}</NextIntlClientProvider></body></html>;
}
