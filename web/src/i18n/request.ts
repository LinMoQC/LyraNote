import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";

export type Locale = "zh" | "en";
export const defaultLocale: Locale = "zh";
export const locales: Locale[] = ["zh", "en"];

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const locale = (cookieStore.get("locale")?.value as Locale) ?? defaultLocale;

  return {
    locale,
    timeZone: "Asia/Shanghai",
    messages: (await import(`../../messages/${locale}.json`)).default
  };
});
