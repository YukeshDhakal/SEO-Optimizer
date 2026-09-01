import "./styles.css";
import { AnalyticsProvider } from "@repo/analytics/provider";
import { DesignSystemProvider } from "@repo/design-system";
import { fonts } from "@repo/design-system/lib/fonts";
import { cn } from "@repo/design-system/lib/utils";
import { Toolbar } from "@repo/feature-flags/components/toolbar";
import { getDictionary } from "@repo/internationalization";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Footer } from "./components/footer";
import { Header } from "./components/header";

// Google Search Console ownership verification for the marketing site
// (quillrun.dev) — Next.js's Metadata API renders this as a <meta
// name="google-site-verification"> tag in <head> automatically. A matching
// HTML-file verification (public/googleccb41940e5c5152d.html, served at
// the site root) was added alongside this — Google accepts either method,
// so having both means losing one doesn't lose verified ownership.
export const metadata: Metadata = {
  verification: {
    google: "IzJXmcIC6uYSrB3N3W7lQyiyFoJbR4ULwx2aK1jZLuA",
  },
};

interface RootLayoutProperties {
  readonly children: ReactNode;
  readonly params: Promise<{
    locale: string;
  }>;
}

const RootLayout = async ({ children, params }: RootLayoutProperties) => {
  const { locale } = await params;
  const dictionary = await getDictionary(locale);

  return (
    <html
      className={cn(fonts, "scroll-smooth")}
      lang="en"
      suppressHydrationWarning
    >
      <body>
        <AnalyticsProvider>
          <DesignSystemProvider>
            <Header dictionary={dictionary} locale={locale} />
            {children}
            <Footer locale={locale} />
          </DesignSystemProvider>
          <Toolbar />
        </AnalyticsProvider>
      </body>
    </html>
  );
};

export default RootLayout;
