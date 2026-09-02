import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { auditDocument, fillPlaceholders, findPlaceholders, MISSING_TEXT } from './legalPlaceholders.js';

const read = (name) => readFileSync(fileURLToPath(new URL(name, import.meta.url)), 'utf8');

test('a placeholder is found wherever it sits in a document', () => {
  const document = {
    title: 'T',
    subtitle: 'S',
    effective: 'E',
    sections: [
      { heading: 'H', blocks: [
        { kind: 'p', text: 'the controller is [NAME]' },
        { kind: 'ul', items: ['at [ADDRESS]'] },
        { kind: 'dl', items: [['Full name', '[NAME]']] },
      ] },
    ],
  };
  const audit = auditDocument(document);
  assert.equal(audit.complete, false);
  assert.deepEqual(audit.missing, ['[NAME]', '[ADDRESS]']);
});

test('a finished document reports complete', () => {
  const audit = auditDocument({
    title: 'T', subtitle: 'S', effective: 'E',
    sections: [{ heading: 'H', blocks: [{ kind: 'p', text: 'the controller is Jane Doe' }] }],
  });
  assert.deepEqual(audit, { complete: true, missing: [] });
});

test('an unfilled value renders as a visible gap, in the reader’s language', () => {
  assert.equal(fillPlaceholders('of [CONTACT ADDRESS]', 'en'), `of ${MISSING_TEXT.en}`);
  assert.equal(fillPlaceholders('ที่อยู่ [ที่อยู่สำหรับติดต่อ]', 'th'), `ที่อยู่ ${MISSING_TEXT.th}`);
  assert.ok(!fillPlaceholders('[X] and [Y]', 'en').includes('['), 'a bracket survived the fill');
});

test('findPlaceholders does not invent one out of ordinary brackets in prose', () => {
  assert.deepEqual(findPlaceholders('see s.26 of the Act (PDPA) — no brackets here'), []);
});

/**
 * The guard the whole module exists for. `legalCopy.ts` still carries two open placeholders, and
 * nobody in this repository can fill them — they are the operator's own legal identity. What must
 * never happen again is a customer reading "[DATA CONTROLLER FULL NAME]" as though it were a
 * filled-in field, so this asserts the page cannot print one: every placeholder in the copy is
 * shaped the way the detector matches, and the page routes its text through the fill.
 */
test('every placeholder still open in legalCopy is one the page can catch', () => {
  const copy = read('../legalCopy.ts');
  const body = copy.slice(copy.indexOf('const privacyTh'));
  const tokens = [...body.matchAll(/\[[^[\]\n]+\]/g)].map((match) => match[0]);
  for (const token of tokens) {
    assert.deepEqual(findPlaceholders(token), [token], `${token} would render verbatim to a visitor`);
  }
});

test('LegalPage renders no copy that has not been through the fill', () => {
  const page = read('../pages/LegalPage.tsx');
  assert.match(page, /auditDocument\(doc\)/, 'the page no longer audits the document it renders');
  assert.match(page, /legal-incomplete/, 'the incomplete-document alert is gone');
  // Each of the three block shapes has to be filled; a raw `{block.text}` is the regression.
  for (const raw of ['{block.text}', '{item}</li>', '<dd>{description}</dd>', '<dt>{term}</dt>']) {
    assert.ok(!page.includes(raw), `${raw} prints legal copy without filling its placeholders`);
  }
});
