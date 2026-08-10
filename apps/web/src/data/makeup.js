// Shades the try-on can render, and the looks built from them.
//
// Separate from `mockData.js` because these are no longer placeholders: every hex here is drawn
// onto a real photograph. The previous set had three swatches per region and one of them,
// "ชมพูกุหลาบ (Rose Pink)", was `#e86100` — a saturated orange, which is why blush rendered orange.

export const LIP_SHADES = [
  { id: 'lip-none', name_th: 'สีปากธรรมชาติ', name_en: 'Natural', hex: null, finish: 'matte' },
  { id: 'lip-peach-nude', name_th: 'นู้ดพีช', name_en: 'Peach Nude', hex: '#d98e7f', finish: 'matte' },
  { id: 'lip-rose', name_th: 'ชมพูกุหลาบ', name_en: 'Rose Pink', hex: '#c96a7a', finish: 'matte' },
  { id: 'lip-terracotta', name_th: 'ส้มอิฐ', name_en: 'Terracotta', hex: '#b5563f', finish: 'gloss' },
  { id: 'lip-cherry', name_th: 'แดงเชอร์รี่', name_en: 'Cherry Red', hex: '#a52236', finish: 'matte' },
  { id: 'lip-berry', name_th: 'เบอร์รี่', name_en: 'Berry', hex: '#8e3b5c', finish: 'gloss' },
];

export const BLUSH_SHADES = [
  { id: 'blush-none', name_th: 'ไม่ปัดแก้ม', name_en: 'None', hex: null },
  { id: 'blush-peach', name_th: 'พีชอ่อน', name_en: 'Soft Peach', hex: '#f0a58c' },
  { id: 'blush-rose', name_th: 'ชมพูกุหลาบ', name_en: 'Rose Pink', hex: '#e08a9c' },
  { id: 'blush-coral', name_th: 'คอรัล', name_en: 'Coral', hex: '#ef8b6f' },
  { id: 'blush-dusty', name_th: 'ชมพูหม่น', name_en: 'Dusty Rose', hex: '#c98189' },
];

export const IRIS_SHADES = [
  { id: 'iris-none', name_th: 'สีตาเดิม', name_en: 'Original', hex: null },
  { id: 'iris-honey', name_th: 'น้ำตาลน้ำผึ้ง', name_en: 'Honey Brown', hex: '#9a7d56' },
  { id: 'iris-grey', name_th: 'เทาหม่น', name_en: 'Hazel Grey', hex: '#717d7e' },
  { id: 'iris-olive', name_th: 'เขียวมะกอก', name_en: 'Olive Green', hex: '#6b7a55' },
  { id: 'iris-cocoa', name_th: 'น้ำตาลเข้ม', name_en: 'Deep Brown', hex: '#4a3427' },
];

/**
 * How strongly each layer paints at full intensity.
 *
 * One slider moves the whole look (see the interview decision), so the balance between layers
 * lives here instead. Blush is the lightest because real blush is a wash, not a block of colour —
 * the old code ran it at 0.42 through a hard-stopping gradient, which read as a solid patch.
 */
export const LAYER_WEIGHT = { blush: .30, lip: .70, iris: .55 };

/**
 * Curated looks.
 *
 * These name shade ids. The previous version picked array index 0/1/2 of each list, so the
 * swatches drawn on each card had nothing to do with what was applied, and adding a shade would
 * have silently changed every look.
 */
export const LOOK_PRESETS = [
  { id: 'clean-glow', name_th: 'Clean Glow', name_en: 'Clean Glow', intensity: 45, lip: 'lip-peach-nude', blush: 'blush-peach', iris: 'iris-none' },
  { id: 'peach-mood', name_th: 'Peach Mood', name_en: 'Peach Mood', intensity: 70, lip: 'lip-terracotta', blush: 'blush-coral', iris: 'iris-honey' },
  { id: 'rosy-night', name_th: 'Rosy Night', name_en: 'Rosy Night', intensity: 85, lip: 'lip-berry', blush: 'blush-dusty', iris: 'iris-grey' },
];

export const DEFAULT_INTENSITY = 70;

export const shadeById = (shades, id) => shades.find((shade) => shade.id === id) || shades[0];

/** The swatches a look actually applies, for drawing its preview dots. */
export const presetSwatches = (preset) => [
  shadeById(LIP_SHADES, preset.lip),
  shadeById(BLUSH_SHADES, preset.blush),
  shadeById(IRIS_SHADES, preset.iris),
].map((shade) => shade.hex).filter(Boolean);
