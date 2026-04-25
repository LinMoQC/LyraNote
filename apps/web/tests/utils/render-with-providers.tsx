import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { render, type RenderOptions } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { AbstractIntlMessages } from "next-intl";
import type { PropsWithChildren, ReactElement } from "react";

import { setI18nMessages } from "@/lib/i18n";
import { ThemeProvider, type ColorTheme } from "@/lib/theme";
import { ThemePresetProvider, type ThemePreset } from "@/lib/theme-preset";
import { createTestQueryClient } from "@test/utils/create-test-query-client";

interface ExtendedRenderOptions extends Omit<RenderOptions, "wrapper"> {
  locale?: string;
  timeZone?: string;
  defaultTheme?: ColorTheme;
  defaultThemePreset?: ThemePreset;
  messages?: AbstractIntlMessages;
  queryClient?: QueryClient;
}

function TestProviders({
  children,
  locale,
  timeZone,
  defaultTheme,
  defaultThemePreset,
  messages,
  queryClient,
}: PropsWithChildren<
  Required<Omit<ExtendedRenderOptions, keyof RenderOptions>> & { defaultThemePreset: ThemePreset }
>) {
  setI18nMessages(messages as Record<string, unknown>);

  return (
    <NextIntlClientProvider
      locale={locale}
      timeZone={timeZone}
      messages={messages}
      onError={() => {}}
      getMessageFallback={({ key }) => key}
    >
      <QueryClientProvider client={queryClient}>
        <ThemeProvider defaultTheme={defaultTheme}>
          <ThemePresetProvider defaultPreset={defaultThemePreset}>{children}</ThemePresetProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </NextIntlClientProvider>
  );
}

export function renderWithProviders(
  ui: ReactElement,
  {
    locale = "zh",
    timeZone = "Asia/Shanghai",
    defaultTheme = "dark",
    defaultThemePreset = "lyra",
    messages = {},
    queryClient = createTestQueryClient(),
    ...renderOptions
  }: ExtendedRenderOptions = {},
) {
  return render(ui, {
    wrapper: ({ children }) => (
      <TestProviders
        locale={locale}
        timeZone={timeZone}
        defaultTheme={defaultTheme}
        defaultThemePreset={defaultThemePreset}
        messages={messages}
        queryClient={queryClient}
      >
        {children}
      </TestProviders>
    ),
    ...renderOptions,
  });
}
