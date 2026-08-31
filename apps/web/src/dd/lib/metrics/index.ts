import type { Landmarks, MetricKey, MetricOptions, MetricResult } from "@/types";

import { calculateAlarBaseWidth } from "./alar-base-width";
import { calculateBizygomaticWidthRatio } from "./bizygomatic-width-ratio";
import { calculateBrowArchHeight } from "./brow-arch-height";
import { calculateBrowSymmetry } from "./brow-symmetry";
import { calculateBrowThicknessSymmetry } from "./brow-thickness-symmetry";
import { calculateBrowTilt } from "./brow-tilt";
import { calculateCanthalTilt } from "./canthal-tilt";
import { calculateChinHeightRatio } from "./chin-height-ratio";
import { calculateChinProjection } from "./chin-projection";
import { calculateChinWidthRatio } from "./chin-width-ratio";
import { calculateCupidsBowHeight } from "./cupids-bow-height";
import { calculateEyeAspectRatio } from "./eye-aspect-ratio";
import { calculateEyeMouthDistanceRatio } from "./eye-mouth-distance-ratio";
import { calculateEyeVerticalSymmetry } from "./eye-vertical-symmetry";
import { calculateEyeSpacingRatio } from "./eye-spacing-ratio";
import { calculateEyeSymmetry } from "./eye-symmetry";
import { calculateEyeTiltSymmetry } from "./eye-tilt-symmetry";
import { calculateEyeWidthToFace } from "./eye-width-to-face";
import { calculateEyebrowArchPosition } from "./eyebrow-arch-position";
import { calculateEyebrowEyeDistance } from "./eyebrow-eye-distance";
import { calculateFacialConvexity } from "./facial-convexity";
import { calculateFacialThirds } from "./facial-thirds";
import { calculateForeheadHeightRatio } from "./forehead-height-ratio";
import { calculateForeheadInclination } from "./forehead-inclination";
import { calculateForeheadWidthRatio } from "./forehead-width-ratio";
import { calculateFwhr } from "./fwhr";
import { calculateGoldenRatio } from "./golden-ratio";
import { calculateGonialAngle } from "./gonial-angle";
import { calculateInterPupillaryRatio } from "./inter-pupillary-ratio";
import { calculateInterbrowDistance } from "./interbrow-distance";
import { calculateJawSymmetry } from "./jaw-symmetry";
import { calculateJawWidthToCheekRatio } from "./jaw-width-to-cheek-ratio";
import { calculateLipCornerTilt } from "./lip-corner-tilt";
import { calculateLipELine } from "./lip-e-line";
import { calculateLipFullness } from "./lip-fullness";
import { calculateLowerFaceHeightRatio } from "./lower-face-height-ratio";
import { calculateLowerLipProtrusionSide } from "./lower-lip-protrusion-side";
import { calculateLowerThirdRatio } from "./lower-third-ratio";
import { calculateMentolabialAngle } from "./mentolabial-angle";
import { calculateMidfaceRatio } from "./midface-ratio";
import { calculateMouthAspectRatio } from "./mouth-aspect-ratio";
import { calculateMouthChinDistanceRatio } from "./mouth-chin-distance-ratio";
import { calculateMouthCornerTilt } from "./mouth-corner-tilt";
import { calculateMouthSymmetry } from "./mouth-symmetry";
import { calculateMouthTilt } from "./mouth-tilt";
import { calculateMouthWidthToFace } from "./mouth-width-to-face";
import { calculateNasalBridgeWidth } from "./nasal-bridge-width";
import { calculateNasalDorsumAngle } from "./nasal-dorsum-angle";
import { calculateNasolabialAngle } from "./nasolabial-angle";
import { calculateNoseLengthRatio } from "./nose-length-ratio";
import { calculateNoseMouthRatio } from "./nose-mouth-ratio";
import { calculateNoseSymmetry } from "./nose-symmetry";
import { calculateNoseTipAngle } from "./nose-tip-angle";
import { calculatePalpebralFissureAspect } from "./palpebral-fissure-aspect";
import { calculatePhiltrumChinRatio } from "./philtrum-chin-ratio";
import { calculatePhiltrumLengthRatio } from "./philtrum-length-ratio";
import { calculateRightCanthalTilt } from "./right-canthal-tilt";
import { calculateUpperLidShow } from "./upper-lid-show";
import { calculateUpperLipProtrusionSide } from "./upper-lip-protrusion-side";
import { calculateUpperLowerLipRatio } from "./upper-lower-lip-ratio";

export const METRIC_CALCULATORS: Record<
  MetricKey,
  (landmarks: Landmarks, options: MetricOptions) => MetricResult
> = {
  "canthal-tilt": calculateCanthalTilt,
  fwhr: calculateFwhr,
  "gonial-angle": calculateGonialAngle,
  "golden-ratio": calculateGoldenRatio,
  "facial-thirds": calculateFacialThirds,
  "eye-spacing-ratio": calculateEyeSpacingRatio,
  "nose-mouth-ratio": calculateNoseMouthRatio,
  "upper-lower-lip-ratio": calculateUpperLowerLipRatio,
  "philtrum-chin-ratio": calculatePhiltrumChinRatio,
  "lower-third-ratio": calculateLowerThirdRatio,
  "inter-pupillary-ratio": calculateInterPupillaryRatio,
  "lip-fullness": calculateLipFullness,
  "nasolabial-angle": calculateNasolabialAngle,
  "facial-convexity": calculateFacialConvexity,
  "lip-e-line": calculateLipELine,
  "palpebral-fissure-aspect": calculatePalpebralFissureAspect,
  "eyebrow-eye-distance": calculateEyebrowEyeDistance,
  "brow-tilt": calculateBrowTilt,
  "eye-width-to-face": calculateEyeWidthToFace,
  "eye-symmetry": calculateEyeSymmetry,
  "jaw-width-to-cheek-ratio": calculateJawWidthToCheekRatio,
  "midface-ratio": calculateMidfaceRatio,
  "chin-height-ratio": calculateChinHeightRatio,
  "mouth-corner-tilt": calculateMouthCornerTilt,
  "mouth-width-to-face": calculateMouthWidthToFace,
  "mouth-symmetry": calculateMouthSymmetry,
  "nose-symmetry": calculateNoseSymmetry,
  "brow-symmetry": calculateBrowSymmetry,
  "jaw-symmetry": calculateJawSymmetry,
  "mentolabial-angle": calculateMentolabialAngle,
  "forehead-inclination": calculateForeheadInclination,
  "nasal-dorsum-angle": calculateNasalDorsumAngle,
  "chin-projection": calculateChinProjection,
  "upper-lip-protrusion-side": calculateUpperLipProtrusionSide,
  "right-canthal-tilt": calculateRightCanthalTilt,
  "interbrow-distance": calculateInterbrowDistance,
  "eye-mouth-distance-ratio": calculateEyeMouthDistanceRatio,
  "lower-face-height-ratio": calculateLowerFaceHeightRatio,
  "lower-lip-protrusion-side": calculateLowerLipProtrusionSide,
  "alar-base-width": calculateAlarBaseWidth,
  "nose-tip-angle": calculateNoseTipAngle,
  "cupids-bow-height": calculateCupidsBowHeight,
  "forehead-width-ratio": calculateForeheadWidthRatio,
  "eye-tilt-symmetry": calculateEyeTiltSymmetry,
  "nose-length-ratio": calculateNoseLengthRatio,
  "mouth-chin-distance-ratio": calculateMouthChinDistanceRatio,
  "brow-arch-height": calculateBrowArchHeight,
  "upper-lid-show": calculateUpperLidShow,
  "philtrum-length-ratio": calculatePhiltrumLengthRatio,
  "mouth-tilt": calculateMouthTilt,
  // Phase 44 additions
  "eye-aspect-ratio": calculateEyeAspectRatio,
  "mouth-aspect-ratio": calculateMouthAspectRatio,
  "bizygomatic-width-ratio": calculateBizygomaticWidthRatio,
  "chin-width-ratio": calculateChinWidthRatio,
  "nasal-bridge-width": calculateNasalBridgeWidth,
  // Phase 44 second batch
  "brow-thickness-symmetry": calculateBrowThicknessSymmetry,
  "eye-vertical-symmetry": calculateEyeVerticalSymmetry,
  "forehead-height-ratio": calculateForeheadHeightRatio,
  "eyebrow-arch-position": calculateEyebrowArchPosition,
  "lip-corner-tilt": calculateLipCornerTilt,
};
