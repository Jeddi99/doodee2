/**
 * The Terms of Service and the Privacy Policy, at /terms and /privacy.
 *
 * ⚠️ Both documents are DRAFTS. They were written by reading this codebase and describing what it
 * actually does; they are not legal advice and have not been reviewed by a lawyer. A Thai lawyer
 * should read them before they are relied on — this product processes face photographs, which the
 * PDPA treats as sensitive biometric data. `legalCopy.ts` carries the full note, the list of
 * `[PLACEHOLDERS]` that must be filled in before launch, and the code references behind every
 * factual claim. Read that file's header before editing either document.
 *
 * TWO OF THOSE PLACEHOLDERS ARE STILL OPEN, and this page is what a customer sees. It used to
 * print them as written — "[DATA CONTROLLER FULL NAME]" appeared in the identity table of the
 * live Privacy Policy — which reads either as a bug or, worse, as a filled-in value. Now
 * `legalPlaceholders` finds them: each one renders as a visible "not yet provided" marker in the
 * reader's language, and the document opens with an alert naming exactly which fields are
 * missing. The prose still renders, because a policy that refuses to display is worse than an
 * incomplete one. The alert disappears by itself the moment `legalCopy.ts` has no brackets left.
 *
 * Public by design. `LoginPage` links here from the "by continuing you agree…" line, so these two
 * routes have to render for a signed-out visitor; they are in `authRouting.PUBLIC_ROUTES` for that
 * reason and for no other.
 */
import { Link } from "react-router-dom";
import Brand from "../Brand";
import { useLocale } from "../useLocale";
import { legalCopy, type LegalBlock, type LegalKind } from "../legalCopy";
import { auditDocument, fillPlaceholders } from "../lib/legalPlaceholders";

const CHROME = {
  th: {
    back: "กลับหน้าแรก",
    otherLabel: { privacy: "ข้อกำหนดการใช้งาน", terms: "นโยบายความเป็นส่วนตัว" },
    // Addressed to the reader first — they are the one being asked to rely on the document — and
    // to the operator second, by naming the fields so the gap is actionable rather than vague.
    incompleteTitle: "เอกสารฉบับนี้ยังไม่สมบูรณ์",
    incompleteBody:
      "ยังไม่ได้ระบุข้อมูลผู้ควบคุมข้อมูลส่วนบุคคลด้านล่างนี้ จึงยังใช้อ้างอิงตามกฎหมายไม่ได้ ติดต่อเราได้ที่ hello@doodee.app",
    incompleteFields: "ช่องที่ยังว่าง:",
  },
  en: {
    back: "Back to home",
    otherLabel: { privacy: "Terms of Service", terms: "Privacy Policy" },
    incompleteTitle: "This document is incomplete",
    incompleteBody:
      "The data-controller details below have not been filled in, so this document cannot yet be relied on. Reach us at hello@doodee.app in the meantime.",
    incompleteFields: "Still empty:",
  },
} as const;

/**
 * One block, with any unfilled placeholder shown as a gap rather than as its bracketed token.
 *
 * `fill` runs on the rendered strings and not on the keys: a React key is not read by anybody, and
 * rewriting it would only risk two rows colliding on the same replacement text.
 */
function Block({ block, lang }: { block: LegalBlock; lang: "th" | "en" }) {
  const fill = (text: string) => fillPlaceholders(text, lang);
  if (block.kind === "p") return <p>{fill(block.text)}</p>;
  if (block.kind === "ul") {
    return (
      <ul>
        {block.items.map((item) => (
          <li key={item}>{fill(item)}</li>
        ))}
      </ul>
    );
  }
  return (
    <dl className="legal-dl">
      {block.items.map(([term, description]) => (
        <div key={term}>
          <dt>{fill(term)}</dt>
          <dd>{fill(description)}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function LegalPage({ kind }: { kind: LegalKind }) {
  const { locale, chooseLocale } = useLocale();
  const lang = locale === "en" ? "en" : "th";
  const chrome = CHROME[lang];
  const doc = legalCopy[lang][kind];
  const other: LegalKind = kind === "terms" ? "privacy" : "terms";
  // Computed from the document being rendered rather than from a flag somebody has to remember to
  // clear: filling the two values in `legalCopy.ts` is the whole of the fix, and this notice
  // removes itself when they are.
  const audit = auditDocument(doc);

  return (
    <main className="legal-page">
      <header className="legal-header">
        <Brand href="/" />
        <div className="legal-header__actions">
          <div className="locale-switch">
            <button
              type="button"
              className={locale === "th" ? "is-active" : ""}
              onClick={() => chooseLocale("th")}
              aria-pressed={locale === "th"}
            >
              TH
            </button>
            <span>/</span>
            <button
              type="button"
              className={locale === "en" ? "is-active" : ""}
              onClick={() => chooseLocale("en")}
              aria-pressed={locale === "en"}
            >
              EN
            </button>
          </div>
          <Link className="legal-back" to="/">
            {chrome.back}
          </Link>
        </div>
      </header>

      <article className="legal-body">
        <h1>{doc.title}</h1>

        {!audit.complete && (
          <aside className="legal-incomplete" role="alert">
            <strong>{chrome.incompleteTitle}</strong>
            <p>{chrome.incompleteBody}</p>
            <p className="legal-incomplete__fields">
              {chrome.incompleteFields}{" "}
              {audit.missing.map((token) => (
                <code key={token}>{token}</code>
              ))}
            </p>
          </aside>
        )}

        <p className="legal-effective">{doc.effective}</p>
        <p className="legal-subtitle">{doc.subtitle}</p>

        {doc.sections.map((section) => (
          <section key={section.heading}>
            <h2>{section.heading}</h2>
            {section.blocks.map((block, index) => (
              // Index is a stable key here: `legalCopy` is a frozen module-level constant, so the
              // block list for a given section never reorders or changes length at runtime.
              // eslint-disable-next-line react/no-array-index-key
              <Block key={index} block={block} lang={lang} />
            ))}
          </section>
        ))}

        <p className="legal-crosslink">
          <Link to={other === "terms" ? "/terms" : "/privacy"}>{chrome.otherLabel[kind]}</Link>
        </p>
      </article>
    </main>
  );
}
