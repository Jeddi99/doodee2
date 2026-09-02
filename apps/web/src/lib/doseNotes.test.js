import assert from 'node:assert/strict';
import test from 'node:test';

import { describeDoseNotes, doseNotesHeading, formatDose, readDoseNotes } from './doseNotes.js';

const preview = (...notes) => ({ dose_notes: notes });

test('a payload with no dose_notes is a payload with nothing to report', () => {
  /**
   * The field is new. A server that has not shipped it yet simply omits it, and this client has to
   * treat that as "no notes" rather than crash on the screen that shows somebody their own face.
   * Every shape a missing field can arrive as is checked here because each one has to be survived,
   * not because any of them is expected.
   */
  for (const payload of [undefined, null, {}, { dose_notes: null }, { dose_notes: 'clamped' }, { dose_notes: {} }]) {
    assert.deepEqual(readDoseNotes(payload), [], `${JSON.stringify(payload)} must read as no notes`);
    assert.deepEqual(describeDoseNotes(payload, true), []);
    assert.equal(doseNotesHeading(describeDoseNotes(payload, false), false), '');
  }
});

test('a clamped dose says how much was asked for and how much was used', () => {
  const [note] = describeDoseNotes(preview({ control: 'nose_bridge_width', requested: 0.42, applied: 0.25, reason: 'clamped' }), false);
  assert.equal(note.tone, 'caution');
  assert.match(note.title, /nose bridge width/);
  assert.match(note.text, /0\.42/);
  assert.match(note.text, /0\.25/);
  assert.match(note.text, /ceiling/);
  const [thai] = describeDoseNotes(preview({ control: 'nose_bridge_width', requested: 0.42, applied: 0.25, reason: 'clamped' }), true);
  assert.match(thai.text, /เพดาน/);
});

test('a cancelled dose says outright that a chosen procedure is not in the image', () => {
  // The one that must not read as a caveat: the user can see the procedure in their own list, and
  // the picture does not contain it.
  const [note] = describeDoseNotes(preview({ control: 'chin_projection', requested: 0.3, applied: 0, reason: 'cancelled' }), false);
  assert.equal(note.tone, 'serious', 'a cancellation must not be painted as an ordinary caveat');
  assert.match(note.text, /does nothing at all/);
  const [thai] = describeDoseNotes(preview({ control: 'chin_projection', requested: 0.3, applied: 0, reason: 'cancelled' }), true);
  assert.match(thai.text, /ไม่ปรากฏในภาพนี้/);
});

test('a dose past the evidence says the image is an extrapolation', () => {
  const [note] = describeDoseNotes(preview({ control: 'lip_volume', requested: 2, applied: 2, reason: 'outside_evidence' }), false);
  assert.match(note.text, /extrapolation/);
  assert.match(note.text, /\(2\)/);
});

test('a reason this build has never heard of still reaches the screen', () => {
  // The server knowing something this client does not is not a reason to hide it: this note is the
  // only copy of that fact the user will ever see.
  const [note] = describeDoseNotes(preview({ control: 'jaw_width', requested: 1, applied: 0.5, reason: 'rounded_to_grid' }), false);
  assert.match(note.text, /rounded_to_grid/);
  assert.match(note.text, /from 1 to 0\.5/);
});

test('a note with numbers missing prints a sentence rather than "undefined"', () => {
  const [note] = describeDoseNotes(preview({ control: 'jaw_width', reason: 'clamped' }), false);
  assert.doesNotMatch(note.text, /undefined|null|NaN/);
  assert.match(note.text, /ceiling/);
  const [applied] = describeDoseNotes(preview({ control: 'jaw_width', applied: 'a lot', reason: 'outside_evidence' }), false);
  assert.doesNotMatch(applied.text, /a lot|undefined/);
});

test('an entry with no control at all is dropped rather than rendered blank', () => {
  // An empty warning box is worse than no warning: it looks like something failed to load.
  const notes = readDoseNotes(preview(null, 'clamped', { reason: 'clamped' }, { control: '', reason: 'clamped' }, { control: 'ok', reason: 'clamped' }));
  assert.deepEqual(notes.map((note) => note.control), ['ok']);
});

test('the heading counts the cancellations, because those are the ones that change what you are looking at', () => {
  const notes = describeDoseNotes(preview(
    { control: 'a', reason: 'clamped', requested: 1, applied: 0.5 },
    { control: 'b', reason: 'cancelled', requested: 1, applied: 0 },
    { control: 'c', reason: 'cancelled', requested: 1, applied: 0 },
  ), false);
  assert.match(doseNotesHeading(notes, false), /2 cancelled/);
  assert.match(doseNotesHeading(notes, true), /2 จุด/);

  const clampedOnly = describeDoseNotes(preview({ control: 'a', reason: 'clamped', requested: 1, applied: 0.5 }), false);
  assert.match(doseNotesHeading(clampedOnly, false), /changed some doses/);
});

test('doses print at the precision they arrive with', () => {
  assert.equal(formatDose(0.5), '0.5', 'not 0.50 — the unit may be millilitres or degrees');
  assert.equal(formatDose(2), '2');
  assert.equal(formatDose(0.12345), '0.123');
  assert.equal(formatDose(undefined), null);
  assert.equal(formatDose(Number.NaN), null);
  assert.equal(formatDose('0.5'), null, 'a string dose is not a number and must not be printed as one');
});

test('every note carries a key that survives two notes about the same control', () => {
  const notes = describeDoseNotes(preview(
    { control: 'a', reason: 'clamped' },
    { control: 'a', reason: 'outside_evidence' },
  ), false);
  assert.equal(new Set(notes.map((note) => note.key)).size, 2);
});
