import { en, type Translations } from "./en";
import { de } from "./de";

const translations: Record<string, Translations> = { en, de };

export function getTranslations(locale: string): Translations {
  return translations[locale] || en;
}

export function getLocalePath(
  locale: string,
  path: string = "",
): string {
  if (locale === "en") return path || "/";
  return `/${locale}${path || "/"}`;
}

export const locales = ["en", "de"] as const;
export type Locale = (typeof locales)[number];
export type { Translations };
