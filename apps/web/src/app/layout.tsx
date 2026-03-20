import type { Metadata } from "next";
import { getLocale, getMessages, getTimeZone } from "next-intl/server";

import { Providers } from "@/app/providers";
import "@/app/globals.css";

export const metadata: Metadata = {
  title: "LyraNote — A Note-Taking App That Evolves With You 🚀",
  description: "LyraNote is an AI-powered note-taking app that evolves with you.",
  icons: {
    icon: [
      { url: "/lyra.png", sizes: "1024x1024", type: "image/png" },
      { url: "/lyra.png", sizes: "192x192", type: "image/png" },
      { url: "/lyra.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/lyra.png",
  },
};

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();
  const timeZone = await getTimeZone();

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <Providers messages={messages} locale={locale} timeZone={timeZone}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
