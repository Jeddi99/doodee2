import type { MetricKey } from "@/types";
import { LANDMARK } from "@/data/landmarks-ref";

export interface ArcAnnotation {
  vertex: number;
  arm1: number;
  arm2: number;
}

/**
 * For angular metrics, the landmark triple whose angle the metric measures.
 * The detail-dialog visualization renders an arc at `vertex` between the
 * two arm directions, with the raw value rendered as a label near the arc.
 *
 * Metrics without an entry here are non-angular (ratios, distances, etc.)
 * and don't get an arc.
 */
export const ARC_ANNOTATIONS: Partial<Record<MetricKey, ArcAnnotation>> = {
  "canthal-tilt": {
    vertex: LANDMARK.leftInnerCanthus,
    arm1: LANDMARK.leftOuterCanthus,
    arm2: LANDMARK.rightInnerCanthus,
  },
  "right-canthal-tilt": {
    vertex: LANDMARK.rightInnerCanthus,
    arm1: LANDMARK.rightOuterCanthus,
    arm2: LANDMARK.leftInnerCanthus,
  },
  "brow-tilt": {
    vertex: LANDMARK.leftBrowInner,
    arm1: LANDMARK.leftBrowOuter,
    arm2: LANDMARK.rightInnerCanthus,
  },
  "gonial-angle": {
    vertex: LANDMARK.leftGonion,
    arm1: LANDMARK.leftTragion,
    arm2: LANDMARK.chin,
  },
  "nasolabial-angle": {
    vertex: LANDMARK.subnasale,
    arm1: LANDMARK.noseTip,
    arm2: LANDMARK.upperLipTop,
  },
  "facial-convexity": {
    vertex: LANDMARK.noseTip,
    arm1: LANDMARK.glabella,
    arm2: LANDMARK.chin,
  },
  "mentolabial-angle": {
    vertex: LANDMARK.lowerLipBottom,
    arm1: LANDMARK.lowerLipTop,
    arm2: LANDMARK.chin,
  },
  "forehead-inclination": {
    vertex: LANDMARK.foreheadApex,
    arm1: LANDMARK.glabella,
    arm2: LANDMARK.chin,
  },
  "nasal-dorsum-angle": {
    vertex: LANDMARK.glabella,
    arm1: LANDMARK.noseTip,
    arm2: LANDMARK.foreheadApex,
  },
};
