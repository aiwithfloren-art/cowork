import { cookies } from "next/headers";
import { dictionaries, type Locale, type Dict } from "./dictionaries";

const LOCALE_COOKIE = "cowork-locale";

export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  const value = store.get(LOCALE_COOKIE)?.value;
  if (value === "id" || value === "en") return value;
  return "en";
}

export async function getDict(): Promise<Dict> {
  const locale = await getLocale();
  return dictionaries[locale] as unknown as Dict;
}

export async function setLocaleCookie(locale: Locale) {
  const store = await cookies();
  store.set(LOCALE_COOKIE, locale, {
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });
}
