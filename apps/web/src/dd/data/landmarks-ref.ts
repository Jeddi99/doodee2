export const LANDMARK = {
  foreheadApex: 10,
  midBrow: 9,
  glabella: 6,
  sellion: 168,
  noseTip: 1,
  subnasale: 2,
  upperLipTop: 13,
  lowerLipTop: 14,
  lowerLipBottom: 17,
  chin: 152,

  leftOuterCanthus: 33,
  leftInnerCanthus: 133,
  rightInnerCanthus: 362,
  rightOuterCanthus: 263,
  leftUpperLid: 159,
  leftLowerLid: 145,
  rightUpperLid: 386,
  rightLowerLid: 374,

  leftCheek: 234,
  rightCheek: 454,
  // Phase 99: zygion (cheek BONE) anchors. The silhouette-outline cheeks
  // (234 / 454) drift onto hair or background on some photos, inflating
  // face-width measurements. Metrics that specifically want bone-anchored
  // width (golden-ratio, fwhr) use these instead. Same as
  // bizygomatic-width-ratio.
  leftZygion: 116,
  rightZygion: 345,
  leftGonion: 172,
  rightGonion: 397,
  leftTragion: 132,
  rightTragion: 361,

  leftBrowInner: 107,
  leftBrowApex: 105,
  leftBrowOuter: 70,
  rightBrowInner: 336,
  rightBrowApex: 334,
  rightBrowOuter: 300,

  leftMouthCorner: 61,
  rightMouthCorner: 291,
  cupidsBow: 0,

  leftAlar: 98,
  rightAlar: 327,
} as const;

export type LandmarkKey = keyof typeof LANDMARK;
