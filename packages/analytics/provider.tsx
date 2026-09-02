import { GoogleAnalytics } from "@next/third-parties/google";
import { Analytics as VercelAnalytics } from "@vercel/analytics/react";
import Script from "next/script";
import type { ReactNode } from "react";
import { keys } from "./keys";

interface AnalyticsProviderProps {
  readonly children: ReactNode;
}

const { NEXT_PUBLIC_GA_MEASUREMENT_ID, NEXT_PUBLIC_GOOGLE_ADS_ID } = keys();

export const AnalyticsProvider = ({ children }: AnalyticsProviderProps) => (
  <>
    {children}
    <VercelAnalytics />
    {NEXT_PUBLIC_GA_MEASUREMENT_ID && (
      <GoogleAnalytics gaId={NEXT_PUBLIC_GA_MEASUREMENT_ID} />
    )}
    {/* Google Ads conversion tag - separate gtag.js config from GA4 above,
        only set on apps/web (where ad-click landing happens). Kept as its
        own <Script> rather than folding into <GoogleAnalytics>, which only
        accepts one gaId. */}
    {NEXT_PUBLIC_GOOGLE_ADS_ID && (
      <>
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${NEXT_PUBLIC_GOOGLE_ADS_ID}`}
          strategy="afterInteractive"
        />
        <Script id="google-ads-gtag" strategy="afterInteractive">
          {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${NEXT_PUBLIC_GOOGLE_ADS_ID}');`}
        </Script>
      </>
    )}
  </>
);
