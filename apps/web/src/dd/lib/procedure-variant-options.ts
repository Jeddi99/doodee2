import type { ProcedureKey } from "./ai-procedure-catalog";

export type ProcedureVariantId = "A" | "B" | "C" | "D";

export interface ProcedureVariantOption {
  id: ProcedureVariantId;
  level: 1 | 2 | 3 | 4;
  label_th: string;
  label_en: string;
  prompt: string;
}

const ORDERED_STRENGTH_VARIANTS = [
  {
    id: "A",
    level: 1,
    label_th: "ระดับ 1 · ชัด",
    label_en: "Level 1 · Visible",
    prompt:
      "Level 1: normal clearly visible strength of the exact same selected shape and direction.",
  },
  {
    id: "B",
    level: 2,
    label_th: "ระดับ 2 · ชัดขึ้น",
    label_en: "Level 2 · Stronger",
    prompt:
      "Level 2: stronger than Level 1 in the exact same selected shape and direction.",
  },
  {
    id: "C",
    level: 3,
    label_th: "ระดับ 3 · ชัดมาก",
    label_en: "Level 3 · High",
    prompt:
      "Level 3: stronger than Level 2 in the exact same selected shape and direction.",
  },
  {
    id: "D",
    level: 4,
    label_th: "ระดับ 4 · แรงสุด",
    label_en: "Level 4 · Maximum",
    prompt:
      "Level 4: maximum strength of the exact same selected shape and direction; visibility takes priority over polish.",
  },
] as const satisfies readonly ProcedureVariantOption[];

export function procedureVariantOptions(
  key: ProcedureKey
): readonly ProcedureVariantOption[] {
  void key;
  return ORDERED_STRENGTH_VARIANTS;
}
