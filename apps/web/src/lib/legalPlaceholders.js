// The two unfilled `[BRACKETED PLACEHOLDER]`s in `legalCopy.ts`, caught before a customer reads
// them as if they were the answer.
//
// `legalCopy.ts` states its own rule in its header: where the honest answer is a business fact
// nobody in this repository knows — the data controller's legal name, and a postal address a PDPA
// request can be sent to — it carries a bracketed placeholder rather than a guess. Two are still
// open, and `LegalPage` rendered them verbatim: a visitor to /privacy today reads
//
//     Full name    [DATA CONTROLLER FULL NAME]
//
// which looks like a rendering bug at best and like a filled-in field at worst. Neither is what a
// privacy policy is for, and the operator has no way of finding out it is happening.
//
// So the page detects them instead of printing them. Every occurrence is replaced with a visible
// "not yet provided" marker in the reader's language, and the page opens with an alert naming
// exactly which fields are missing. The document still renders — a privacy policy that refuses to
// display is worse than an incomplete one, and PDPA s.23 wants the information available — but
// nobody can mistake a gap for a value.
//
// Pure and import-free, so `node --test` can hold it to the shape the page depends on.

/** A placeholder is a bracketed run with no nested brackets, exactly as `legalCopy.ts` writes them. */
const PLACEHOLDER = /\[[^[\]]+\]/g;

/** What replaces a placeholder inline, in the reader's own language. */
export const MISSING_TEXT = {
  th: '— ยังไม่ได้ระบุ —',
  en: '— not yet provided —',
};

/** Every distinct placeholder in a string, in the order it appears. */
export function findPlaceholders(text) {
  if (typeof text !== 'string') return [];
  const found = [];
  for (const match of text.matchAll(PLACEHOLDER)) {
    if (!found.includes(match[0])) found.push(match[0]);
  }
  return found;
}

/** The string with every placeholder replaced by the visible marker for `lang`. */
export function fillPlaceholders(text, lang) {
  if (typeof text !== 'string') return text;
  return text.replace(PLACEHOLDER, MISSING_TEXT[lang === 'en' ? 'en' : 'th']);
}

/**
 * Walk one `LegalDocument` and report what is still open.
 *
 * Reads the same three block shapes `LegalPage` renders, so a placeholder cannot hide in a shape
 * the scanner forgot about. Returns `{ complete, missing }`, `missing` being the distinct
 * bracketed tokens as they were written, which is what the operator has to go and fill in.
 */
export function auditDocument(document) {
  const missing = [];
  const note = (text) => {
    for (const token of findPlaceholders(text)) if (!missing.includes(token)) missing.push(token);
  };
  note(document?.title);
  note(document?.subtitle);
  note(document?.effective);
  for (const section of document?.sections || []) {
    note(section.heading);
    for (const block of section.blocks || []) {
      if (block.kind === 'p') note(block.text);
      else if (block.kind === 'ul') for (const item of block.items) note(item);
      else if (block.kind === 'dl') for (const [term, description] of block.items) { note(term); note(description); }
    }
  }
  return { complete: missing.length === 0, missing };
}
