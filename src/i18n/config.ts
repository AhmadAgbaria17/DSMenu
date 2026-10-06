import type { Language, LocalizedName } from '@/types/domain';
import { languageSchema } from '@/lib/validators/common';

export const defaultLanguage: Language = 'ar';
export const localeCookie = 'dsmenu-language';
export function resolveLanguage(value?: string): Language {
  const parsed = languageSchema.safeParse(value);
  return parsed.success ? parsed.data : defaultLanguage;
}
export function direction(language: string) { return language === 'en' ? 'ltr' : 'rtl'; }
export function localizedName(value: LocalizedName, language: string) {
  return (language === 'he' ? value.nameHe : language === 'en' ? value.nameEn : value.nameAr) || value.nameAr;
}
