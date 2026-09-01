// Encodes the "SEO + GEO Content Guidelines v1.0" spec the user supplied
// (evidence base: Aggarwal et al. KDD'24 arXiv:2311.09735, Ahrefs AI
// Overviews study, SE Ranking ChatGPT citation study, Yu et al. GEO-SFE
// 2026, Google Search Central's 7 May 2026 FAQ-rich-result deprecation
// notice). Shared by outline.ts and draft.ts so the ruleset lives in one
// place rather than being duplicated/drifting across prompts. Qualitative,
// judgment-dependent rules (self-containment, evidence density, banned
// constructions, the FAQ 3-part pattern) go here as prompt text — that's
// the part only a model executing the instruction can satisfy. The small
// subset of unambiguous, literal-match rules (banned phrases, metaTitle
// length) are enforced separately and deterministically in validation.ts /
// geo-seo-optimize.ts, per this pipeline's established pattern: prompt
// instructions alone have repeatedly proven insufficient under retry
// pressure (the JSON-LD Article/FAQPage nodes, em-dash stripping, and the
// site-reference link all needed a code-level backstop, not just a
// stronger sentence in the prompt).

export type ContentType = "blog" | "faq";

// The passage-length rule (§1.1) — the single highest-leverage number in
// the source spec: generative engines cite ~130-160 word passages, not
// pages, so this governs section length regardless of content type.
export const PASSAGE_GUIDANCE = `Write each H2 section as one self-contained 130-160 word passage (never under 100, never over 200) - this is the chunk size generative engines actually cite. Open the section with a 25-40 word sentence that fully answers the heading's question on its own, before any supporting detail.`;

// §2.2 self-containment rule, with the source spec's own "don't/write
// instead" table folded directly into the instruction.
export const SELF_CONTAINMENT_GUIDANCE = `Every section must be correct and complete read in total isolation, because that is how it will be retrieved and cited:
- Restate the subject by name at the start of the section - never open with "This," "These," "It," or "That approach."
- Define technical terms inline on first use within the section, even if already defined earlier on the page.
- Close the loop - never write "as we'll see below" or "see our full guide for details"; state the detail itself.
- Never write "many experts agree that..." - name the specific study or source instead.
- Never write "it can vary significantly" - give the actual range (e.g. "it ranges from 1% to 5%").`;

// §2.3-2.4: the three strategies the cited study measured as actually
// moving AI-visibility (citations, quotations, statistics - each +30-40%),
// plus the exact formatting standard a statistic needs to survive being
// lifted out as a short cited chunk.
export const EVIDENCE_DENSITY_GUIDANCE = `Evidence density is the core lever, not tone or keyword density (keyword stuffing measures at ~0% lift and authoritative-sounding tone alone measures at ~0% lift - do not spend effort on either):
- At least one specific, sourced statistic per H2 section. Format every statistic as [SPECIFIC FIGURE] + [SUBJECT] + [SOURCE] + [DATE/SCOPE] - e.g. "Wind and hail account for 38-48% of all homeowners insurance claims annually, according to the Insurance Information Institute's 2025 data," never "studies show most claims involve wind damage."
- A statistic with no source is worse than no statistic - cut anything you cannot attribute to one of the known facts or sources provided to you. Never fabricate a figure.
- Where a known fact includes a named person, institution, or direct quotation, work it in as an attributed quote rather than paraphrasing it away.
- Bold the single key claim in each section (using markdown **bold**) - this measurably changes what gets extracted.`;

// §3: FAQ-specific rules - question sourcing/selection, phrasing, and the
// 3-part answer construction pattern with its worked example.
export const FAQ_GUIDANCE = `FAQ rich results were retired by Google (7 May 2026) - FAQPage schema is still valid and still used by Google and AI engines to understand the page, but write these as standalone answer units for AI extraction, not to trigger a SERP dropdown that no longer exists.

Question selection: only include a question a real person would actually type or ask - never invent a question just to fill space. Each answer must be specific to this topic, not generic, and must contain at least one concrete fact, number, or named entity. No two questions may be answerable with the same passage.

Phrasing: write questions the way a user speaks ("How long do I have to file a claim after storm damage?" not "Claim Filing Timeframes"), lead with the natural interrogative (How/What/When/Why/Can/Does/Should/Is), 6-12 words, name the subject in the question itself since FAQ entries get retrieved without surrounding page context.

Answer construction - exactly three sentences, 40-75 words total, never over 100:
1. Direct answer: Yes/No/[the number] + restated subject (15-30 words).
2. The qualifying condition, exception, or mechanism (15-25 words).
3. The specific figure, source, or actionable next step (15-25 words).
Never open an answer with "It depends" or "That's a great question." Never require the reader to have read the article body first. Never reference another FAQ answer ("as noted above"). One claim per sentence.

Worked example of the pattern:
Q: "How long do I have to file a home insurance claim after storm damage?"
A: "Most insurers require notice of storm damage within 30 to 60 days of the event. State statutes and individual policy language can extend this window to one or two years for latent damage that was not immediately visible. Check the 'Duties After Loss' clause on your declarations page for your carrier's exact deadline."`;

// §2.7 formatting rules for extraction, beyond what's already covered
// above (bolding, tables, self-containment).
export const FORMATTING_GUIDANCE = `Use a markdown table for any comparison of 3 or more items across 2 or more attributes, rather than prose. Use numbered lists for sequential processes and bulleted lists for non-sequential sets. Phrase section headings as real user queries or keyword-bearing statements, not clever wordplay.`;

// §2.5 E-E-A-T. Author/reviewer identity is a product feature this
// pipeline doesn't have yet (no author-attribution system exists), so this
// stays scoped to what draft.ts can actually influence: cite primary
// sources, never secondary aggregators.
export const SOURCING_GUIDANCE = `When citing a source, cite the primary source (the original study, government data, or named institution) - never a secondary blog or aggregator restating someone else's number.`;

// §2.2/§3.5/§6: literal phrases the source spec calls out as unambiguous
// failures regardless of context - checked deterministically in
// validation.ts's validateContentGuidelines rather than trusted to the
// prompt alone, matching this pipeline's established pattern. Kept here
// (not duplicated in validation.ts) so the prompt instruction and the
// check that enforces it can never drift apart.
export const BANNED_PHRASES: readonly string[] = [
  "as mentioned above",
  "as discussed above",
  "as noted above",
  "as we'll see below",
  "as we will see below",
  "see our full guide for details",
  "many experts agree",
  "it depends",
  "that's a great question",
  "that is a great question",
];

const CONTENT_TYPE_STRUCTURE: Record<ContentType, string> = {
  blog: `Structure (standard informational article): an opening answer block of 40-60 words that directly answers the title's question before any preamble, then 6-9 H2 sections each covering one distinct subtopic question, then the FAQ section. Total length is a consequence of how many real subtopic questions exist, never a target to hit - stop adding sections once you run out of genuinely distinct questions; padding length without a new question actively hurts (citation rates decline past 7,500 words).`,
  faq: `Structure (FAQ-first page): an opening answer block of 40-60 words that directly answers the title's question, then exactly 2 short context sections (each under 160 words) covering only the essential background a reader needs before the FAQ, then a substantial FAQ section - aim for the full 8 questions, since the FAQ section carries the primary content weight on this page rather than the body sections.`,
};

// Builds the full guideline block for a given content type - used by both
// outline.ts (structure/question selection) and draft.ts (prose/evidence
// rules), so each file only needs to interpolate this once rather than
// re-deriving the ruleset.
export const buildGuidelineBlock = (contentType: ContentType): string =>
  `${CONTENT_TYPE_STRUCTURE[contentType]}

${PASSAGE_GUIDANCE}

${SELF_CONTAINMENT_GUIDANCE}

${EVIDENCE_DENSITY_GUIDANCE}

${SOURCING_GUIDANCE}

${FORMATTING_GUIDANCE}

${FAQ_GUIDANCE}`;
