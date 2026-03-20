import { Plus } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { HomeQA } from "@/components/home/home-qa";
import { NotebookList } from "@/components/home/notebook-list";
import { getNotebooks } from "@/services/notebook-service";

export default async function AppHomePage() {
  const [notebooks, t] = await Promise.all([
    getNotebooks(),
    getTranslations("home")
  ]);

  const hour = new Date().getHours();
  const greetingKey =
    hour < 12 ? "greeting_morning" : hour < 18 ? "greeting_afternoon" : "greeting_evening";

  const displayName: string | null = null; // resolved client-side via useAuth()

  return (
    <div className="flex min-h-full flex-col items-center justify-center px-4 md:px-8 dark:border border-border/40">

      {/* 桌面端居中内容区 */}
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
            {displayName ? `${displayName}，` : ""}{t(greetingKey)}
          </p>
          <h1 className="text-4xl font-bold tracking-tight text-foreground">
            {t("tagline")}
          </h1>
        </div>

        <HomeQA />

        <div>
          <div className="mb-1 flex items-center justify-between px-1">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground/40">
              {t("recentNotebooks")}
            </p>
            <div className="flex items-center gap-3">
              <Link
                className="flex items-center gap-1 text-xs text-muted-foreground/50 transition-colors hover:text-foreground"
                href="/app/notebooks"
              >
                <Plus size={11} />
                {t("newNotebook")}
              </Link>
              <Link
                className="text-xs text-muted-foreground/50 transition-colors hover:text-foreground"
                href="/app/notebooks"
              >
                {t("viewAll")}
              </Link>
            </div>
          </div>
          <NotebookList notebooks={notebooks} />
        </div>

      </div>

      {/* 移动端内容区：垂直居中，底部留出输入框空间 */}
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
            {displayName ? `${displayName}，` : ""}{t(greetingKey)}
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            {t("tagline")}
          </h1>
        </div>
      </div>

      {/* 移动端底部固定输入框 */}
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-border/40 bg-background px-4 py-3 md:hidden">
        <HomeQA />
      </div>

    </div>
  );
}
