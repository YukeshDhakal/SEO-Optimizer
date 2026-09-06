import { showBetaFeature } from "@repo/feature-flags";
import { createMetadata } from "@repo/seo/metadata";
import type { Metadata } from "next";
import { Audiences } from "./components/audiences";
import { Cases } from "./components/cases";
import { CTA } from "./components/cta";
import { FAQ } from "./components/faq";
import { Features } from "./components/features";
import { Guardrails } from "./components/guardrails";
import { Hero } from "./components/hero";
import { Loop } from "./components/loop";
import { McpSection } from "./components/mcp-section";
import { Stats } from "./components/stats";

interface HomeProps {
  params: Promise<{
    locale: string;
  }>;
}

// Metadata hardcoded to match the new hardcoded Home copy - dictionary.web
// .home.meta reflected the old dictionary-driven positioning, which this
// page no longer uses.
export const generateMetadata = async (): Promise<Metadata> =>
  createMetadata({
    title: "Autonomous SEO content agent that publishes to your CMS",
    description:
      "Quillrun researches from real sources, drafts against the facts it found, runs quality gates, holds for your approval, then publishes to WordPress, Shopify or Webflow.",
  });

const Home = async ({ params }: HomeProps) => {
  const { locale } = await params;
  const betaFeature = await showBetaFeature();

  return (
    <>
      {betaFeature && (
        <div className="w-full bg-black py-2 text-center text-white">
          Beta feature now available
        </div>
      )}
      <Hero locale={locale} />
      <Cases />
      <Loop />
      <Features />
      <McpSection locale={locale} />
      <Guardrails />
      <Audiences locale={locale} />
      <Stats />
      <FAQ />
      <CTA locale={locale} />
    </>
  );
};

export default Home;
