import { getTranslations } from "next-intl/server";

import { HomeContent } from "@/components/home/home-content";

export default async function AppHomePage() {
  const t = await getTranslations("home");

  const hour = new Date().getHours();
  const greetingKey =
    hour < 12 ? "greeting_morning" : hour < 18 ? "greeting_afternoon" : "greeting_evening";

  return (
    <div className="flex min-h-full flex-col items-center justify-center px-4 md:px-8 dark:border border-border/40">

      {/* Desktop layout */}
      <div className="hidden w-full max-w-2xl space-y-8 md:block">

        {/* Greeting */}
        <div className="space-y-1">
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground/70">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="flex-shrink-0" aria-hidden>
              <path
                d="M7 0.5C7 0.5 7.6 4.5 9.5 6.5C11.4 8.5 13.5 7 13.5 7C13.5 7 11.4 5.5 9.5 7.5C7.6 9.5 7 13.5 7 13.5C7 13.5 6.4 9.5 4.5 7.5C2.6 5.5 0.5 7 0.5 7C0.5 7 2.6 8.5 4.5 6.5C6.4 4.5 7 0.5 7 0.5Z"
                fill="url(#star-grad)"
              />
              <defs>
                <linearGradient id="star-grad" x1="0.5" y1="0.5" x2="13.5" y2="13.5" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#818cf8" />
                  <stop offset="100%" stopColor="#a78bfa" />
                </linearGradient>
              </defs>
            </svg>
            {t(greetingKey)}
          </p>
          <h1 className="text-4xl font-bold tracking-tight text-foreground">
            {t("tagline")}
          </h1>
        </div>

        <HomeContent />

      </div>

      {/* Mobile layout */}
      <div className="flex w-full flex-1 flex-col items-center justify-center space-y-6 pb-[88px] pt-8 text-center md:hidden">
        <div className="space-y-2">
          <p className="flex items-start justify-start gap-1.5 text-base text-muted-foreground/70">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="flex-shrink-0" aria-hidden>
              <path
                d="M7 0.5C7 0.5 7.6 4.5 9.5 6.5C11.4 8.5 13.5 7 13.5 7C13.5 7 11.4 5.5 9.5 7.5C7.6 9.5 7 13.5 7 13.5C7 13.5 6.4 9.5 4.5 7.5C2.6 5.5 0.5 7 0.5 7C0.5 7 2.6 8.5 4.5 6.5C6.4 4.5 7 0.5 7 0.5Z"
                fill="url(#star-grad-m)"
              />
              <defs>
                <linearGradient id="star-grad-m" x1="0.5" y1="0.5" x2="13.5" y2="13.5" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#818cf8" />
                  <stop offset="100%" stopColor="#a78bfa" />
                </linearGradient>
              </defs>
            </svg>
            {t(greetingKey)}
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            {t("tagline")}
          </h1>
        </div>
      </div>

      {/* Mobile fixed bottom input */}
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-border/40 bg-background px-4 py-3 md:hidden">
        <HomeContent />
      </div>

    </div>
  );
}
