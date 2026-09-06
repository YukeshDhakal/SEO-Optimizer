import Link from "next/link";
import { localeHref } from "@/lib/locale-href";

interface AudiencesProps {
  locale: string;
}

const AUDIENCES = [
  {
    eyebrow: "Team of one",
    title: "No SEO hire, still needs to publish weekly",
    body: "Set a schedule, approve on your phone, let the gates do the reviewing you don't have time for.",
  },
  {
    eyebrow: "Agency",
    title: "Twelve clients, twelve CMSes, one dashboard",
    body: "One org per client, separate keys and limits, an audit log you can hand over in a review.",
  },
  {
    eyebrow: "Ecommerce",
    title: "900 product pages, none of them written well",
    body: "Optimize product copy in batches, ranked by which pages actually get impressions today.",
  },
];

// Replaces Testimonials - the redesign doesn't have real testimonial copy to
// show yet, so it leans on the three audience segments the design proposes
// instead of shipping fabricated quotes.
export const Audiences = ({ locale }: AudiencesProps) => (
  <div className="w-full border-b-[3px] border-foreground py-14 lg:py-20">
    <div className="container mx-auto px-4">
      <h2 className="font-display mb-7 text-3xl tracking-tight md:text-4xl">
        Pick the version of this that's yours.
      </h2>
      <div className="grid gap-4 md:grid-cols-3">
        {AUDIENCES.map((a) => (
          <div className="flex flex-col gap-2.5 border-[3px] border-foreground bg-card p-5 shadow-[6px_6px_0_#111]" key={a.eyebrow}>
            <span className="font-mono text-[11px] text-muted-foreground uppercase tracking-[0.12em]">
              {a.eyebrow}
            </span>
            <span className="font-display text-lg leading-tight">{a.title}</span>
            <p className="text-sm leading-relaxed">{a.body}</p>
            <Link className="font-bold text-secondary text-sm hover:underline" href={localeHref(locale, "/contact")}>
              Talk to us →
            </Link>
          </div>
        ))}
      </div>
    </div>
  </div>
);
