// Deterministic cleanup applied to every piece of model-generated free text
// before it's returned from a step. Prompt instructions telling the model
// "never use em-dashes" are the unreliable path (same failure mode as the
// old schemaJsonLd prompt: the model slips under retry/feedback pressure) —
// this is the bulletproof version, applied in code regardless of which
// model is in getModel(). Only targets em-dash (—, U+2014) and en-dash used
// as a clause break (–, U+2013) — ordinary hyphens in compound words
// ("SEO/GEO", "well-labeled") are untouched.
export const stripAiDashes = (text: string): string =>
  text
    // " word—word " or "word — word" clause breaks -> comma
    .replace(/\s*[—–]\s*/g, ", ")
    // collapse a run of spaces left behind, and any double comma this
    // produces when the source text already had a comma next to the dash
    .replace(/ {2,}/g, " ")
    .replace(/,\s*,/g, ",")
    .trim();
