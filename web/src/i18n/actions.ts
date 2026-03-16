"use server";

import { cookies } from "next/headers";

import type { Locale } from "./request";

export async function setLocale(locale: Locale) {
  const cookieStore = await cookies();
  cookieStore.set("locale", locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365 // 1 year
  });
}
