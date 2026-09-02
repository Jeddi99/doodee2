// What the renderer did to the doses that were asked for.
//
// A stack is not simply applied. The engine sums every procedure's contribution per control, and
// three things can happen to a number on the way in, all of which the user would otherwise never
// learn about:
//
//   clamped          — the summed dose went past the renderer's ceiling and was cut back, so the
//                      image shows less movement than the selection asked for.
//   cancelled        — two procedures pushed a one-way control in opposite directions, the sum
//                      went negative and floored at zero. A procedure the user deliberately picked
//                      contributes nothing to the picture in front of them.
//   outside_evidence — the applied dose is past the range the published studies actually measured,
//                      so that part of the render is an extrapolation rather than a measured result.
//
// This is the mechanism that made removing the six-procedure cap safe. The cap was a blunt way of
// keeping stacks small enough that clamping and cancellation were rare; with it gone they are
// ordinary, and a stack that silently drops half of what was asked for is precisely the dishonesty
// this screen exists not to commit. So these are rendered, all of them, including the ones that are
// awkward to read.
//
// `dose_notes` may be absent: the payload predates this file, and a server that has not shipped the
// change yet simply does not send the key. Absent means "nothing to report" and must never mean an
// empty screen where a warning belongs — every function here treats a missing, null, or malformed
// payload as no notes at all, and never throws.
//
// Its own module, with no imports, so it can be tested with `node --test`.

/** The reasons the server names. An unrecognised one is still shown, it just gets plainer words. */
export const DOSE_NOTE_REASONS = ['clamped', 'cancelled', 'outside_evidence'];

const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);

/**
 * A dose as a person reads it.
 *
 * Trailing zeros are dropped because the units differ per control — millilitres, units, degrees —
 * and a fixed number of decimals prints either "0.50 ml" for something written 0.5, or "2 units"
 * as "2.00". Non-numeric values come back as null so the caller can leave the clause out entirely
 * rather than printing "undefined" beside a clinical claim.
 */
export const formatDose = (value) => (isNumber(value) ? String(Number(value.toFixed(3))) : null);

/** A control id as a heading. Same treatment the reference numbers give their keys. */
export const controlLabel = (control) => (typeof control === 'string' && control
  ? control.replaceAll('_', ' ')
  : '');

/**
 * The notes on a preview, normalised.
 *
 * Anything that is not an object with a control is dropped rather than rendered as a blank row —
 * an empty warning is worse than no warning — but nothing else is filtered: a note whose reason
 * this client has never heard of still reaches the screen.
 */
export function readDoseNotes(preview) {
  const notes = preview?.dose_notes;
  if (!Array.isArray(notes)) return [];
  return notes
    .filter((note) => note && typeof note === 'object' && typeof note.control === 'string' && note.control)
    .map((note) => ({
      control: note.control,
      requested: isNumber(note.requested) ? note.requested : null,
      applied: isNumber(note.applied) ? note.applied : null,
      reason: typeof note.reason === 'string' ? note.reason : '',
    }));
}

/**
 * One note as a sentence.
 *
 * `cancelled` is the only one marked `serious`. The other two mean the image shows less than was
 * asked for or rests on an extrapolation, which is a caveat; cancellation means a procedure the
 * user chose is simply not in the picture, which is a different kind of statement and should not
 * be the same colour as a caveat.
 */
export function describeDoseNote(note, isTh) {
  const label = controlLabel(note.control);
  const requested = formatDose(note.requested);
  const applied = formatDose(note.applied);
  const both = requested !== null && applied !== null;

  if (note.reason === 'clamped') {
    return {
      tone: 'caution',
      title: isTh ? `ลดขนาดลง · ${label}` : `Cut back · ${label}`,
      text: isTh
        ? `${both ? `ขอไว้ ${requested} แต่ภาพนี้ใช้จริง ${applied} — ` : ''}สิ่งที่เลือกไว้รวมกันแล้วเกินเพดานความปลอดภัยของการปรับภาพ ระบบจึงตัดลง ภาพนี้จึงเปลี่ยนน้อยกว่าที่เลือกไว้`
        : `${both ? `Asked for ${requested}, applied ${applied}. ` : ''}Your selections summed past the renderer's safety ceiling and were cut back, so this image moves less than what you chose.`,
    };
  }
  if (note.reason === 'cancelled') {
    return {
      tone: 'serious',
      title: isTh ? `ไม่มีผลในภาพนี้ · ${label}` : `Does nothing here · ${label}`,
      text: isTh
        ? `หัตถการที่เลือกไว้ดันส่วนนี้คนละทาง ผลรวมติดลบและถูกปัดเป็นศูนย์ — หัตถการที่คุณเลือกไว้อย่างน้อยหนึ่งรายการจึงไม่ปรากฏในภาพนี้เลย`
        : `Procedures you picked push this control in opposite directions. The sum went negative and floored at zero, so at least one procedure you chose does nothing at all in this image.`,
    };
  }
  if (note.reason === 'outside_evidence') {
    return {
      tone: 'caution',
      title: isTh ? `นอกช่วงที่มีงานวิจัยรองรับ · ${label}` : `Past the evidence · ${label}`,
      text: isTh
        ? `${applied !== null ? `ปริมาณที่ใช้ ${applied} ` : 'ปริมาณที่ใช้'}มากกว่าช่วงที่งานวิจัยวัดไว้จริง ส่วนนี้ของภาพจึงเป็นการประมาณนอกช่วงข้อมูล ไม่ใช่ผลที่มีการวัดรองรับ`
        : `${applied !== null ? `The applied dose (${applied}) is ` : 'The applied dose is '}past what the published studies measured, so this part of the image is an extrapolation rather than a measured result.`,
    };
  }
  // An unknown reason still gets printed. The server knows something about this render that this
  // build does not, and dropping it would hide the only copy of it the user will ever see.
  return {
    tone: 'caution',
    title: isTh ? `หมายเหตุ · ${label}` : `Note · ${label}`,
    text: isTh
      ? `ระบบปรับปริมาณของส่วนนี้${both ? ` จาก ${requested} เป็น ${applied}` : ''}${note.reason ? ` (${note.reason})` : ''}`
      : `The renderer adjusted this control${both ? ` from ${requested} to ${applied}` : ''}${note.reason ? ` (${note.reason})` : ''}.`,
  };
}

/** Every note on a preview, ready to render. An empty array when there is nothing to say. */
export function describeDoseNotes(preview, isTh) {
  return readDoseNotes(preview).map((note, index) => ({
    key: `${note.control}:${note.reason}:${index}`,
    ...note,
    ...describeDoseNote(note, isTh),
  }));
}

/**
 * The one-line heading above the notes.
 *
 * It counts the cancellations separately because they are the ones that mean "you are looking at
 * fewer procedures than you chose", which is the sentence somebody skimming has to catch.
 */
export function doseNotesHeading(notes, isTh) {
  if (notes.length === 0) return '';
  const cancelled = notes.filter((note) => note.reason === 'cancelled').length;
  if (cancelled > 0) {
    return isTh
      ? `ภาพนี้ไม่ได้ทำตามที่เลือกไว้ทั้งหมด — มี ${cancelled} จุดที่หักล้างกันจนไม่มีผล`
      : `This image does not do everything you chose — ${cancelled} cancelled out to nothing.`;
  }
  return isTh
    ? 'ระบบปรับปริมาณบางส่วนก่อนสร้างภาพนี้'
    : 'The renderer changed some doses before making this image.';
}
