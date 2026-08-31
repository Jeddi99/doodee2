import type { Landmarks, MetricOptions, MetricResult } from "@/types";
import { LANDMARK } from "@/data/landmarks-ref";
import { getIdealRange } from "@/data/ideal-ranges";
import { dist, lm } from "@/lib/utils/geometry";
import { normalizeScore } from "@/lib/scoring/normalize";

/**
 * Lip Position (Ricketts E-line) — signed perpendicular offset of the
 * upper lip from the line connecting nose tip to chin (the "E-line"),
 * normalized by face height.
 *
 * Source: Ricketts 1968; cephalometric norms.
 * Caucasian adult ideal: upper lip ~ 2 mm behind E-line (negative).
 * Asian adult ideal: upper lip closer to or slightly in front of the line.
 *
 * Sign convention: positive = lip in front of E-line (toward face
 * front), negative = behind. Face-front is determined intrinsically
 * from forehead → noseTip — no `tip.x > chin.x` image-frame heuristic.
 *
 * Side-view metric — requires a profile photo.
 */
export function calculateLipELine(
  landmarks: Landmarks,
  options: MetricOptions
): MetricResult {
  const tip = lm(landmarks, LANDMARK.noseTip);
  const chin = lm(landmarks, LANDMARK.chin);
  const lip = lm(landmarks, LANDMARK.upperLipTop);
  const forehead = lm(landmarks, LANDMARK.foreheadApex);

  const ex = chin.x - tip.x;
  const ey = chin.y - tip.y;
  const eLen = Math.sqrt(ex * ex + ey * ey);
  if (eLen < 1e-6) {
    const ideal = getIdealRange("lip-e-line", options);
    return { raw: 0, score: normalizeScore(0, ideal), ideal, unit: "" };
  }
  const eUx = ex / eLen;
  const eUy = ey / eLen;

  const perp1X = -eUy;
  const perp1Y = eUx;
  const perp2X = eUy;
  const perp2Y = -eUx;
  const fwdDx = tip.x - forehead.x;
  const fwdDy = tip.y - forehead.y;
  const useFirst = perp1X * fwdDx + perp1Y * fwdDy > 0;
  const perpX = useFirst ? perp1X : perp2X;
  const perpY = useFirst ? perp1Y : perp2Y;

  const lipDx = lip.x - tip.x;
  const lipDy = lip.y - tip.y;
  const signedOffset = lipDx * perpX + lipDy * perpY;

  const faceHeight = dist(forehead, chin);
  const raw = faceHeight > 0 ? signedOffset / faceHeight : 0;

  const ideal = getIdealRange("lip-e-line", options);
  return { raw, score: normalizeScore(raw, ideal), ideal, unit: "" };
}
