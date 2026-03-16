"use client";

/**
 * @file 全局 Provider 树
 * @description 组合所有顶层 Provider，包括：
 *              - AuthProvider：认证状态管理
 *              - NextIntlClientProvider：国际化
 *              - QueryClientProvider：TanStack Query 数据请求缓存
 *              - LazyMotion：framer-motion 按需加载（减小首屏包体积）
 *              - ThemeProvider：深色/浅色主题切换
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LazyMotion, domAnimation } from "framer-motion";
import { AbstractIntlMessages, NextIntlClientProvider } from "next-intl";
import { ThemeProvider } from "next-themes";
import { useState } from "react";

import { Toaster } from "sileo";
import { AuthProvider } from "@/features/auth/auth-provider";
import { setI18nMessages } from "@/lib/i18n";

interface ProvidersProps {
  children: React.ReactNode;
  messages: AbstractIntlMessages;
  locale: string;
  timeZone: string;
}

/**
 * 全局 Provider 组合组件
 * @param children - 应用页面内容
 * @param messages - 国际化消息对象（从服务端注入）
 * @param locale - 当前语言环境（"zh" | "en"）
 */
export function Providers({ children, messages, locale, timeZone }: ProvidersProps) {
  setI18nMessages(messages as Record<string, unknown>);

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <AuthProvider>
        <NextIntlClientProvider messages={messages} locale={locale} timeZone={timeZone}>
        <QueryClientProvider client={queryClient}>
          <LazyMotion features={domAnimation} strict>
            <ThemeProvider
              attribute="class"
              defaultTheme="dark"
              disableTransitionOnChange
              enableSystem={false}
            >
              {children}
              <Toaster position="top-right" />
            </ThemeProvider>
          </LazyMotion>
        </QueryClientProvider>
      </NextIntlClientProvider>
    </AuthProvider>
  );
}
