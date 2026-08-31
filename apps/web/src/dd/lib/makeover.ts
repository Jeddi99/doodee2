import type { Landmarks } from "@/types";
import { applyHairColor, type HairColor } from "./hair-recolor";
import { applyEyeColor, type EyeColor } from "./eye-color-recolor";
import { applyLipstick, type LipstickColor } from "./lip-recolor";
import { applyBlush, type BlushColor } from "./blush-recolor";

export type EffectKey = "hair" | "eyes" | "blush" | "lips";

export interface MakeoverLook {
  hair?: { color: HairColor; intensity: number };
  eyes?: { color: EyeColor; intensity: number };
  blush?: { color: BlushColor; intensity: number };
  lips?: { color: LipstickColor; intensity: number };
}

export interface MakeoverOptions {
  hairMask?: Uint8Array | null;
}

export function applyMakeover(
  ctx: CanvasRenderingContext2D,
  landmarks: Landmarks,
  look: MakeoverLook,
  options: MakeoverOptions = {}
): void {
  if (look.hair) {
    try {
      applyHairColor(ctx, landmarks, look.hair.color, {
        intensity: look.hair.intensity,
        ...(options.hairMask ? { hairMask: options.hairMask } : {}),
      });
    } catch {
      // keep the rest of the look rendering
    }
  }
  if (look.eyes) {
    try {
      applyEyeColor(ctx, landmarks, look.eyes.color, {
        intensity: look.eyes.intensity,
      });
    } catch {
      // keep the rest of the look rendering
    }
  }
  if (look.blush) {
    try {
      applyBlush(ctx, landmarks, look.blush.color, {
        intensity: look.blush.intensity,
      });
    } catch {
      // keep the rest of the look rendering
    }
  }
  if (look.lips) {
    try {
      applyLipstick(ctx, landmarks, look.lips.color, {
        intensity: look.lips.intensity,
      });
    } catch {
      // keep the rest of the look rendering
    }
  }
}

export function activeEffectCount(look: MakeoverLook): number {
  let n = 0;
  if (look.hair) n += 1;
  if (look.eyes) n += 1;
  if (look.blush) n += 1;
  if (look.lips) n += 1;
  return n;
}
