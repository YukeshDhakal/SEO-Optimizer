import languine from "@repo/internationalization/languine.json" with { type: "json" };

const DEFAULT_LOCALE = languine.locale.source;

// packages/internationalization/proxy.ts runs next-international with
// urlMappingStrategy: "rewriteDefault" - the default locale ("en") is
// served at bare paths (/pricing) with no visible prefix, every other
// locale needs one (/es/pricing). LanguageSwitcher already re-derives this
// correctly when switching locales; this is the same rule applied to every
// other same-app link (header/footer/hero/cta/faq/pricing), which were all
// hardcoding bare paths and silently dropping non-English visitors back to
// English on every click.
export const localeHref = (locale: string, path: string): string => {
  if (locale === DEFAULT_LOCALE) {
    return path;
  }
  return `/${locale}${path}`;
};
