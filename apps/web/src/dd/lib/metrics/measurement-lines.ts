import type { MetricKey } from "@/types";
import { LANDMARK } from "@/data/landmarks-ref";

export type MeasurementSegment = readonly [number, number];

export const MEASUREMENT_LINES: Record<MetricKey, readonly MeasurementSegment[]> = {
  "canthal-tilt": [
    [LANDMARK.leftOuterCanthus, LANDMARK.leftInnerCanthus],
    [LANDMARK.leftInnerCanthus, LANDMARK.rightInnerCanthus],
  ],
  fwhr: [
    // Phase 99: zygion (bone) width — same landmarks as the metric uses.
    [LANDMARK.leftZygion, LANDMARK.rightZygion],
    [LANDMARK.leftBrowInner, LANDMARK.rightBrowInner],
    [LANDMARK.midBrow, LANDMARK.upperLipTop],
  ],
  "gonial-angle": [
    [LANDMARK.leftTragion, LANDMARK.leftGonion],
    [LANDMARK.leftGonion, LANDMARK.chin],
  ],
  "golden-ratio": [
    [LANDMARK.foreheadApex, LANDMARK.chin],
    // Phase 99: zygion (bone) width — same landmarks as the metric uses.
    [LANDMARK.leftZygion, LANDMARK.rightZygion],
  ],
  "facial-thirds": [
    [LANDMARK.foreheadApex, LANDMARK.chin],
    [LANDMARK.leftBrowInner, LANDMARK.rightBrowInner],
    [LANDMARK.leftAlar, LANDMARK.rightAlar],
  ],
  "eye-spacing-ratio": [
    [LANDMARK.leftInnerCanthus, LANDMARK.rightInnerCanthus],
    [LANDMARK.leftOuterCanthus, LANDMARK.leftInnerCanthus],
  ],
  "nose-mouth-ratio": [
    [LANDMARK.leftMouthCorner, LANDMARK.rightMouthCorner],
    [LANDMARK.leftAlar, LANDMARK.rightAlar],
  ],
  "upper-lower-lip-ratio": [
    [LANDMARK.cupidsBow, LANDMARK.upperLipTop],
    [LANDMARK.lowerLipTop, LANDMARK.lowerLipBottom],
  ],
  "philtrum-chin-ratio": [
    [LANDMARK.subnasale, LANDMARK.upperLipTop],
    [LANDMARK.lowerLipTop, LANDMARK.chin],
  ],
  "lower-third-ratio": [
    [LANDMARK.subnasale, LANDMARK.upperLipTop],
    [LANDMARK.subnasale, LANDMARK.chin],
  ],
  "inter-pupillary-ratio": [
    [LANDMARK.leftOuterCanthus, LANDMARK.leftInnerCanthus],
    [LANDMARK.rightInnerCanthus, LANDMARK.rightOuterCanthus],
    [LANDMARK.leftCheek, LANDMARK.rightCheek],
  ],
  "lip-fullness": [
    [LANDMARK.cupidsBow, LANDMARK.upperLipTop],
    [LANDMARK.lowerLipTop, LANDMARK.lowerLipBottom],
  ],
  "nasolabial-angle": [
    [LANDMARK.subnasale, LANDMARK.noseTip],
    [LANDMARK.subnasale, LANDMARK.upperLipTop],
  ],
  "facial-convexity": [
    [LANDMARK.noseTip, LANDMARK.glabella],
    [LANDMARK.noseTip, LANDMARK.chin],
  ],
  "lip-e-line": [
    [LANDMARK.noseTip, LANDMARK.chin],
    [LANDMARK.upperLipTop, LANDMARK.lowerLipTop],
  ],
  "palpebral-fissure-aspect": [
    [LANDMARK.leftUpperLid, LANDMARK.leftLowerLid],
    [LANDMARK.leftOuterCanthus, LANDMARK.leftInnerCanthus],
  ],
  "eyebrow-eye-distance": [
    [LANDMARK.leftBrowApex, LANDMARK.leftUpperLid],
  ],
  "brow-tilt": [
    [LANDMARK.leftBrowInner, LANDMARK.leftBrowOuter],
    [LANDMARK.leftInnerCanthus, LANDMARK.rightInnerCanthus],
  ],
  "eye-width-to-face": [
    [LANDMARK.leftOuterCanthus, LANDMARK.leftInnerCanthus],
    [LANDMARK.leftCheek, LANDMARK.rightCheek],
  ],
  "eye-symmetry": [
    [LANDMARK.leftOuterCanthus, LANDMARK.noseTip],
    [LANDMARK.noseTip, LANDMARK.rightOuterCanthus],
  ],
  "jaw-width-to-cheek-ratio": [
    [LANDMARK.leftGonion, LANDMARK.rightGonion],
    [LANDMARK.leftCheek, LANDMARK.rightCheek],
  ],
  "midface-ratio": [
    [LANDMARK.foreheadApex, LANDMARK.leftInnerCanthus],
    [LANDMARK.leftInnerCanthus, LANDMARK.upperLipTop],
  ],
  "chin-height-ratio": [[LANDMARK.lowerLipBottom, LANDMARK.chin]],
  "mouth-corner-tilt": [
    [LANDMARK.leftMouthCorner, LANDMARK.upperLipTop],
    [LANDMARK.upperLipTop, LANDMARK.rightMouthCorner],
  ],
  "mouth-width-to-face": [
    [LANDMARK.leftMouthCorner, LANDMARK.rightMouthCorner],
    [LANDMARK.leftCheek, LANDMARK.rightCheek],
  ],
  "mouth-symmetry": [
    [LANDMARK.leftMouthCorner, LANDMARK.noseTip],
    [LANDMARK.noseTip, LANDMARK.rightMouthCorner],
  ],
  "nose-symmetry": [
    [LANDMARK.leftAlar, LANDMARK.noseTip],
    [LANDMARK.noseTip, LANDMARK.rightAlar],
  ],
  "brow-symmetry": [
    [LANDMARK.leftBrowApex, LANDMARK.noseTip],
    [LANDMARK.noseTip, LANDMARK.rightBrowApex],
  ],
  "jaw-symmetry": [
    [LANDMARK.leftGonion, LANDMARK.chin],
    [LANDMARK.chin, LANDMARK.rightGonion],
  ],
  "mentolabial-angle": [
    [LANDMARK.lowerLipTop, LANDMARK.lowerLipBottom],
    [LANDMARK.lowerLipBottom, LANDMARK.chin],
  ],
  "forehead-inclination": [[LANDMARK.foreheadApex, LANDMARK.glabella]],
  "nasal-dorsum-angle": [[LANDMARK.glabella, LANDMARK.noseTip]],
  "chin-projection": [
    [LANDMARK.subnasale, LANDMARK.chin],
    [LANDMARK.noseTip, LANDMARK.chin],
  ],
  "upper-lip-protrusion-side": [
    [LANDMARK.subnasale, LANDMARK.upperLipTop],
  ],
  "right-canthal-tilt": [
    [LANDMARK.rightInnerCanthus, LANDMARK.rightOuterCanthus],
    [LANDMARK.leftInnerCanthus, LANDMARK.rightInnerCanthus],
  ],
  "interbrow-distance": [[LANDMARK.leftBrowInner, LANDMARK.rightBrowInner]],
  "eye-mouth-distance-ratio": [
    [LANDMARK.leftInnerCanthus, LANDMARK.upperLipTop],
    [LANDMARK.rightInnerCanthus, LANDMARK.upperLipTop],
  ],
  "lower-face-height-ratio": [[LANDMARK.subnasale, LANDMARK.chin]],
  "lower-lip-protrusion-side": [
    [LANDMARK.subnasale, LANDMARK.lowerLipBottom],
  ],
  "alar-base-width": [
    [LANDMARK.leftAlar, LANDMARK.rightAlar],
    [LANDMARK.leftCheek, LANDMARK.rightCheek],
  ],
  "nose-tip-angle": [
    [LANDMARK.leftAlar, LANDMARK.noseTip],
    [LANDMARK.noseTip, LANDMARK.rightAlar],
  ],
  "cupids-bow-height": [
    [LANDMARK.leftMouthCorner, LANDMARK.rightMouthCorner],
    [LANDMARK.cupidsBow, LANDMARK.upperLipTop],
  ],
  "forehead-width-ratio": [
    [LANDMARK.leftBrowOuter, LANDMARK.rightBrowOuter],
    [LANDMARK.leftCheek, LANDMARK.rightCheek],
  ],
  "eye-tilt-symmetry": [
    [LANDMARK.leftOuterCanthus, LANDMARK.leftInnerCanthus],
    [LANDMARK.rightInnerCanthus, LANDMARK.rightOuterCanthus],
  ],
  "nose-length-ratio": [
    [LANDMARK.sellion, LANDMARK.subnasale],
    [LANDMARK.foreheadApex, LANDMARK.chin],
  ],
  "mouth-chin-distance-ratio": [
    [LANDMARK.lowerLipBottom, LANDMARK.chin],
    [LANDMARK.foreheadApex, LANDMARK.chin],
  ],
  "brow-arch-height": [
    [LANDMARK.leftBrowInner, LANDMARK.leftBrowOuter],
    [LANDMARK.leftBrowInner, LANDMARK.leftBrowApex],
  ],
  "upper-lid-show": [
    [LANDMARK.leftUpperLid, LANDMARK.leftBrowApex],
  ],
  "philtrum-length-ratio": [
    [LANDMARK.subnasale, LANDMARK.upperLipTop],
  ],
  "mouth-tilt": [
    [LANDMARK.leftMouthCorner, LANDMARK.rightMouthCorner],
    [LANDMARK.leftOuterCanthus, LANDMARK.rightOuterCanthus],
  ],
  // Phase 44 additions — single-line geometries
  "eye-aspect-ratio": [
    [LANDMARK.leftOuterCanthus, LANDMARK.leftInnerCanthus],
    [LANDMARK.leftUpperLid, LANDMARK.leftLowerLid],
  ],
  "mouth-aspect-ratio": [
    [LANDMARK.leftMouthCorner, LANDMARK.rightMouthCorner],
    [LANDMARK.upperLipTop, LANDMARK.lowerLipBottom],
  ],
  "bizygomatic-width-ratio": [
    [116, 345], // cheekbones
    [103, 332], // temples
  ],
  "chin-width-ratio": [
    [148, 377], // chin base corners
    [LANDMARK.leftCheek, LANDMARK.rightCheek],
  ],
  "nasal-bridge-width": [
    [193, 417], // nasal bridge narrowest
    [LANDMARK.leftAlar, LANDMARK.rightAlar],
  ],
  // Phase 44 second batch
  "brow-thickness-symmetry": [
    [LANDMARK.leftBrowInner, LANDMARK.leftBrowOuter],
    [LANDMARK.rightBrowInner, LANDMARK.rightBrowOuter],
  ],
  "eye-vertical-symmetry": [
    [LANDMARK.leftOuterCanthus, LANDMARK.rightOuterCanthus],
    [LANDMARK.leftInnerCanthus, LANDMARK.rightInnerCanthus],
  ],
  "forehead-height-ratio": [
    [LANDMARK.foreheadApex, LANDMARK.leftBrowApex],
    [LANDMARK.foreheadApex, LANDMARK.chin],
  ],
  "eyebrow-arch-position": [
    [LANDMARK.leftBrowInner, LANDMARK.leftBrowOuter],
    [LANDMARK.rightBrowInner, LANDMARK.rightBrowOuter],
  ],
  "lip-corner-tilt": [
    [LANDMARK.leftMouthCorner, LANDMARK.rightMouthCorner],
    [LANDMARK.cupidsBow, LANDMARK.lowerLipBottom],
  ],
};
