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
 * Public by design. `LoginPage` links here from the "by continuing you agree…" line, so these two
 * routes have to render for a signed-out visitor; they are in `authRouting.PUBLIC_ROUTES` for that
 * reason and for no other.
 */
import { Link } from "react-router-dom";
import Brand from "../Brand";
import { useLocale } from "../useLocale";
import { legalCopy, type LegalBlock, type LegalKind } from "../legalCopy";

const CHROME = {
  th: {
    back: "กลับหน้าแรก",
    otherLabel: { privacy: "ข้อกำหนดการใช้งาน", terms: "นโยบายความเป็นส่วนตัว" },
  },
  en: {
    back: "Back to home",
    otherLabel: { privacy: "Terms of Service", terms: "Privacy Policy" },
  },
} as const;

function Block({ block }: { block: LegalBlock }) {
  if (block.kind === "p") return <p>{block.text}</p>;
  if (block.kind === "ul") {
    return (
      <ul>
        {block.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    );
  }
  return (
    <dl className="legal-dl">
      {block.items.map(([term, description]) => (
        <div key={term}>
          <dt>{term}</dt>
          <dd>{description}</dd>
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
        <p className="legal-effective">{doc.effective}</p>
        <p className="legal-subtitle">{doc.subtitle}</p>

        {doc.sections.map((section) => (
          <section key={section.heading}>
            <h2>{section.heading}</h2>
            {section.blocks.map((block, index) => (
              // Index is a stable key here: `legalCopy` is a frozen module-level constant, so the
              // block list for a given section never reorders or changes length at runtime.
              // eslint-disable-next-line react/no-array-index-key
              <Block key={index} block={block} />
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
