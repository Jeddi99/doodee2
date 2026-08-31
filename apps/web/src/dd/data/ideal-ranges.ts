import type { MetricKey, MetricOptions } from "@/types";

type RangeTable = Record<MetricKey, Record<string, [number, number]>>;

const RANGES: RangeTable = {
  "canthal-tilt": {
    // Bashour 2007 "preferred" range — peak of attractiveness curve.
    // Phase 18c: widened male lower bound 4 → 2 — many strong-jawed
    // male models have a flatter eye line (~2-3° tilt) that scored too
    // harshly under the old "preferred peak" range. Asians also wider.
    //
    // Phase 107: empirical top-rated p[10,90] on SCUT n=2200 by demo:
    // male.uni [2.5, 7.3], female.uni [4.3, 9.4],
    // male.asi [5.3, 9.6], female.asi [7.5, 12.3]. The female and
    // asian upper bounds were too low — top-rated females reach 12°+,
    // far above old max 8-10. r(raw) is +0.28 positive but the score
    // r was negative because the ideal cap clipped too much.
    "male.universal": [2.5, 7.5],
    "female.universal": [4, 10],
    "male.asian": [5, 10],
    "female.asian": [7, 12],
  },
  fwhr: {
    // Phase 100: SCUT mean 1.40-1.48. Widened lower to accommodate
    // mature faces (slight head pitch shortens upper-face height ratio).
    "male.universal": [1.15, 1.55],
    "female.universal": [1.2, 1.55],
    "male.asian": [1.2, 1.6],
    "female.asian": [1.2, 1.55],
  },
  "gonial-angle": {
    // Phase 99 calibration vs SCUT-FBP5500 (n=500):
    //   - Beauty bucket 1.x (least attractive): mean raw 140°
    //   - Beauty bucket 4.x (most attractive):  mean raw 147°
    //   - 25th-75th percentile of top bucket:   [145°, 148°]
    // The cephalometric BONY ideal is [120-130]° but our 2D skin
    // measurement (tragion 132 → gonion 172 → menton 152) sits ~20°
    // ABOVE the bony angle, not ~10° as previously assumed. Earlier
    // Phase 18c range [128, 138] correlated NEGATIVELY (r = -0.38)
    // with human beauty ratings — i.e. faces scoring 10/10 on this
    // metric were rated UGLY by humans, and vice versa. Re-anchored
    // to the empirical optimum [142, 152] (slightly wider than the
    // 25-75% band to keep adjacent buckets ≥ 5/10).
    "male.universal": [142, 152],
    "female.universal": [144, 154],
    "male.asian": [144, 154],
    "female.asian": [146, 156],
  },
  "golden-ratio": {
    // Phase 99/100: trichion-to-gnathion / bizygomatic (Farkas norm).
    // Empirical SCUT beauty-4 mean = 1.30 (M) / 1.29 (F). Widened upper
    // to 1.8 to accommodate long-faced mature reference faces
    // on a slightly-pitched-down photo).
    "male.universal": [1.25, 1.8],
    "female.universal": [1.2, 1.55],
    "male.asian": [1.2, 1.55],
    "female.asian": [1.2, 1.45],
  },
  "facial-thirds": {
    // Da Vinci canon ~1/3. Phase 18c: widened further because
    // MediaPipe foreheadApex(10) drift at the hairline (vs trichion)
    // is the documented worst case for this metric — and we now also
    // flag readings below 0.22 as detection errors in sanity bounds.
    "male.universal": [0.27, 0.39],
    "female.universal": [0.27, 0.39],
    "male.asian": [0.27, 0.39],
    "female.asian": [0.27, 0.39],
  },
  "eye-spacing-ratio": {
    // Phase 18c: widened from ±5% to ±15% — classical canon is an
    // average, but natural eye spacing in normal humans spans 0.85
    // (close-set) to 1.20 (wide-set) before either reads as a defect.
    // Wider-set eyes are actually common in male models. Plus
    // MediaPipe outer-canthus placement drifts ±5%.
    // Phase 99: widened further to [0.85, 1.35] after observing real
    // photos read 1.3-1.4 when MediaPipe's outer-canthus drifts inward
    // (e.g., on pitched portrait references). Better to accept some wide-set false
    // positives than to floor a normal face.
    "male.universal": [0.85, 1.35],
    "female.universal": [0.85, 1.3],
    "male.asian": [0.85, 1.35],
    "female.asian": [0.85, 1.3],
  },
  "nose-mouth-ratio": {
    "male.universal": [1.4, 1.6],
    "female.universal": [1.45, 1.65],
    "male.asian": [1.4, 1.6],
    "female.asian": [1.45, 1.65],
  },
  "upper-lower-lip-ratio": {
    // Phase 99 calibration vs SCUT-FBP5500:
    //   Beauty 1.x mean = 0.685 (close to old ideal)
    //   Beauty 4.x mean = 0.540 (well below)
    //   Metric was scoring LESS attractive faces highest. Re-anchored
    //   to the high-beauty empirical mean ±0.10.
    "male.universal": [0.45, 0.6],
    "female.universal": [0.45, 0.65],
    "male.asian": [0.45, 0.6],
    "female.asian": [0.45, 0.65],
  },
  "philtrum-chin-ratio": {
    "male.universal": [0.45, 0.55],
    "female.universal": [0.45, 0.55],
    "male.asian": [0.45, 0.55],
    "female.asian": [0.45, 0.55],
  },
  "lower-third-ratio": {
    "male.universal": [0.3, 0.36],
    "female.universal": [0.3, 0.36],
    "male.asian": [0.3, 0.36],
    "female.asian": [0.3, 0.36],
  },
  "inter-pupillary-ratio": {
    // Marquardt canon 0.46 ± 0.025 — original tight window. Earlier
    // widening to [0.42, 0.50] scored too many faces at 10.
    //
    // Phase 103: empirical top-rated p[10,90] on SCUT n=2200 by demo
    // (wider band to forgive outliers via cos²-decay normalization):
    // male.uni [0.417, 0.466], female.uni [0.430, 0.471],
    // male.asi [0.423, 0.457], female.asi [0.431, 0.489].
    "male.universal": [0.42, 0.47],
    "female.universal": [0.43, 0.47],
    "male.asian": [0.42, 0.46],
    "female.asian": [0.43, 0.49],
  },
  "lip-fullness": {
    // Old universal range [0.04, 0.06] was calibrated to the legacy
    // cupid→lowerLipBottom formula (which included the inter-lip gap).
    // With the vermillion-only formula, Caucasian typical falls around
    // 0.07–0.09, fuller lips up to 0.11. Widened to match.
    "male.universal": [0.06, 0.1],
    "female.universal": [0.07, 0.11],
    // Asian: Jayaratne YS et al. — Hong Kong Chinese vermillion heights.
    // F upper 9.09mm + lower 9.79mm = 18.88mm; M 10.20 + 10.98 = 21.18mm.
    // Normalized to MediaPipe forehead→chin face height ~200mm:
    // F ≈ 0.094, M ≈ 0.106. Asian lips are anthropometrically thicker
    // than Caucasian — was the biggest gap in the old data.
    "male.asian": [0.09, 0.12],
    "female.asian": [0.08, 0.11],
  },
  "nasolabial-angle": {
    "male.universal": [90, 100],
    "female.universal": [100, 110],
    "male.asian": [88, 100],
    "female.asian": [105, 118],
  },
  "facial-convexity": {
    "male.universal": [165, 178],
    "female.universal": [165, 178],
    "male.asian": [168, 180],
    "female.asian": [170, 180],
  },
  "lip-e-line": {
    "male.universal": [-0.04, -0.005],
    "female.universal": [-0.035, 0],
    // Asian: Hwang HS et al. 2002, Angle Orthod 72(1):72-80 — Korean
    // adults (n=60). Upper lip mean -2.08mm; ~-0.011 of face height.
    "male.asian": [-0.015, -0.005],
    "female.asian": [-0.012, -0.002],
  },
  "palpebral-fissure-aspect": {
    // Tighter lower bound catches age-related eyelid hooding (narrowed
    // fissure aspect) without rewarding naturally smaller fissures as
    // peak-attractive.
    //
    // Phase 105+106 trials reverted: tightening to empirical p[10,90]
    // (with or without halfRange floor) collapsed score distribution
    // and dropped SCUT r. Original ranges preserved.
    "male.universal": [0.33, 0.4],
    "female.universal": [0.35, 0.42],
    // Asian: Jayaratne YS et al. 2013, BioMed Res Int 2013:821428 —
    // Hong Kong Chinese (n=103). M aspect 0.418, F aspect 0.459.
    "male.asian": [0.4, 0.46],
    "female.asian": [0.44, 0.5],
  },
  "eyebrow-eye-distance": {
    // Farkas/Gao 2025 "lifted brow attractive". Phase 18c: top bound
    // raised so users with naturally high brow positions (lifted /
    // youthful look = good) don't get penalized for being above the
    // narrow ideal peak.
    //
    // Phase 105: empirical top-rated p[10,90] on SCUT n=2200 by demo:
    // male.uni [0.069, 0.099], female.uni [0.089, 0.126],
    // male.asi [0.096, 0.120], female.asi [0.104, 0.133]. Old ranges
    // were 0.03-0.05 too low — same brow→lid-margin measurement issue
    // as upper-lid-show (which got the same treatment in Phase 103).
    "male.universal": [0.07, 0.10],
    "female.universal": [0.09, 0.13],
    "male.asian": [0.10, 0.12],
    "female.asian": [0.10, 0.13],
  },
  "brow-tilt": {
    // Phase 100 SCUT calibration:
    //   Beauty 4.x male: mean -3.5°  (NEGATIVE, drooping)
    //   Beauty 4.x female: mean -2.9°
    //   Empirical range widened to accommodate mature subjects whose
    //   outer-brow droop reads more pronounced (-10° to -15°).
    //
    // Phase 107: r(raw)=+0.484 STRONG positive (less negative = more
    // attractive), but score r was -0.063 because the wide range
    // [-12, 2] caught BOTH top-rated (-8 to 1) AND low-rated (-12 to -5)
    // inside ideal, so cos² couldn't discriminate. Tightened to top
    // empirical p[10,90] so low-rated drop outside.
    "male.universal": [-8, 2],
    "female.universal": [-7, 3],
    "male.asian": [-8, -1],
    "female.asian": [-8, 0],
  },
  "eye-width-to-face": {
    // Classical canon 0.20. Tight window because variation is small and
    // discriminating.
    //
    // Phase 103: empirical top-rated p[10,90] on SCUT n=2200 by demo:
    // male.uni [0.187, 0.212], female.uni [0.188, 0.223],
    // male.asi [0.183, 0.204], female.asi [0.185, 0.217].
    "male.universal": [0.19, 0.21],
    "female.universal": [0.19, 0.22],
    "male.asian": [0.18, 0.20],
    "female.asian": [0.19, 0.22],
  },
  "eye-symmetry": {
    // Phase 18c: loosened to [0.94, 1] — MediaPipe outer-canthus jitter
    // plus slight off-axis selfie pose reads 0.90-0.93 even on highly
    // symmetric faces. Old strict [0.97, 1] scored real models 0 in
    // the eye-area bucket (weight 0.32) — biggest single drag.
    // Floor 0.94 is the tightest that keeps the asymmetry-positive
    // test fixture (raw 0.933) below 10.
    //
    // Phase 107: r(raw, beauty) = -0.207 — STRONG NEGATIVE. Top-rated
    // SCUT mean ~0.96 (perfectly symmetric is uncommon and slightly
    // creepy); low-rated mean 0.98 (boring). Excluded 1.0 from ideal so
    // the score correlates positively with beauty. Empirical p90 for
    // top-rated females reaches 0.99 — widened to [0.93, 0.99] for them.
    "male.universal": [0.93, 0.99],
    "female.universal": [0.93, 0.99],
    "male.asian": [0.94, 0.99],
    "female.asian": [0.94, 0.99],
  },
  "jaw-width-to-cheek-ratio": {
    // Phase 107: empirical top-rated p[10,90] on SCUT n=2200 by demo:
    // male.uni [0.77, 0.82], female.uni [0.76, 0.81],
    // male.asi [0.75, 0.80], female.asi [0.74, 0.79]. r(raw)=-0.394 —
    // tapered jaw (LOWER ratio) is consistently more attractive. Old
    // ideal max was 0.88-0.92, way above empirical p90. Lowered.
    "male.universal": [0.76, 0.82],
    "female.universal": [0.74, 0.81],
    "male.asian": [0.74, 0.80],
    "female.asian": [0.72, 0.79],
  },
  "midface-ratio": {
    "male.universal": [1, 1.3],
    "female.universal": [1.1, 1.4],
    "male.asian": [1, 1.3],
    "female.asian": [1.1, 1.4],
  },
  "chin-height-ratio": {
    // Phase 100 SCUT calibration: beauty 4.x male mean=0.189, female=0.166.
    // Old [0.13, 0.18] M was below the empirical optimum — strong-chin
    // men scored 0/10. Re-anchored.
    "male.universal": [0.17, 0.22],
    "female.universal": [0.15, 0.19],
    "male.asian": [0.17, 0.22],
    "female.asian": [0.14, 0.18],
  },
  "mouth-corner-tilt": {
    // Phase 99: widened from [0, 0.012] M / [0.004, 0.018] F. SCUT
    // beauty-4 mean = 0.017 (above old upper bound) and beauty-3
    // mean = 0.020. Slight upturn (~0.015-0.025) reads as most
    // attractive empirically.
    "male.universal": [0.005, 0.025],
    "female.universal": [0.008, 0.028],
    "male.asian": [0.005, 0.025],
    "female.asian": [0.004, 0.018],
  },
  "mouth-width-to-face": {
    // Dimorphism literature; female ideal trends slightly larger.
    "male.universal": [0.36, 0.42],
    "female.universal": [0.38, 0.44],
    "male.asian": [0.36, 0.42],
    "female.asian": [0.38, 0.44],
  },
  "mouth-symmetry": {
    // Wang 2017 strict threshold 3 mm (0.979). Loosened to accept
    // ~5 mm photo-capture tolerance.
    //
    // Phase 108: r(raw)=-0.120. Top-rated SCUT mean 0.981, low-rated 0.987.
    // Perfectly symmetric mouths read as "fake/uncanny"; slight asymmetry
    // = more attractive. Excluded the perfect end.
    "male.universal": [0.95, 0.99],
    "female.universal": [0.95, 0.99],
    "male.asian": [0.95, 0.99],
    "female.asian": [0.95, 0.99],
  },
  "nose-symmetry": {
    // Wang 2017 strict threshold 4 mm (0.971). Loosened to ~6 mm.
    //
    // Phase 108: r(raw)=-0.242 STRONG NEGATIVE. Top-rated mean 0.987,
    // low-rated 0.991. Same uncanny-valley pattern. Excluded perfect end.
    "male.universal": [0.95, 0.99],
    "female.universal": [0.95, 0.99],
    "male.asian": [0.95, 0.99],
    "female.asian": [0.95, 0.99],
  },
  "brow-symmetry": {
    // Wang 2017 strict 3.5 mm (0.975). Loosened to ~6 mm.
    //
    // Phase 108: r(raw)=-0.188. Top mean 0.982, low mean 0.985. Excluded
    // perfect end.
    "male.universal": [0.95, 0.99],
    "female.universal": [0.95, 0.99],
    "male.asian": [0.95, 0.99],
    "female.asian": [0.95, 0.99],
  },
  "jaw-symmetry": {
    // Wang 2017 strict 6 mm (0.957). Loosened to ~10 mm previously, but
    // gonion is a SOFT-TISSUE landmark that MediaPipe places on an
    // implicitly-detected jawline corner — naturally noisy. Phase 99:
    // loosened further to ~15 mm tolerance after observing real-photo
    // scans reading 0.81 raw from photo-capture noise
    // alone, scoring Bottom 0.1% in spite of visibly symmetric jaws.
    //
    // Phase 108: r(raw)=-0.220 STRONG NEGATIVE. Top-rated SCUT mean
    // 0.924, low-rated 0.957. Real attractive jaws have moderate
    // asymmetry (0.86-0.95); only photo-perfect ones hit 0.96+. Shifted
    // ideal lower and tightened upper to favor natural over uncanny.
    "male.universal": [0.86, 0.95],
    "female.universal": [0.86, 0.95],
    "male.asian": [0.86, 0.95],
    "female.asian": [0.86, 0.95],
  },
  "mentolabial-angle": {
    "male.universal": [120, 140],
    "female.universal": [120, 140],
    "male.asian": [120, 140],
    "female.asian": [120, 140],
  },
  "forehead-inclination": {
    "male.universal": [5, 20],
    "female.universal": [5, 20],
    "male.asian": [5, 20],
    "female.asian": [5, 20],
  },
  "nasal-dorsum-angle": {
    "male.universal": [25, 45],
    "female.universal": [25, 45],
    "male.asian": [22, 40],
    "female.asian": [22, 40],
  },
  "chin-projection": {
    "male.universal": [-0.005, 0.025],
    "female.universal": [-0.01, 0.02],
    "male.asian": [-0.01, 0.02],
    "female.asian": [-0.015, 0.015],
  },
  "upper-lip-protrusion-side": {
    "male.universal": [-0.005, 0.02],
    "female.universal": [0, 0.025],
    "male.asian": [0, 0.025],
    "female.asian": [0.005, 0.03],
  },
  "right-canthal-tilt": {
    // Mirror of canthal-tilt — same widening (Phase 18c).
    // Phase 107: empirical top-rated p[10,90] matches canthal-tilt closely:
    // male.uni [2.9, 7.9], female.uni [4.9, 10.3],
    // male.asi [5.5, 10.5], female.asi [7.6, 12.4].
    "male.universal": [2.5, 8],
    "female.universal": [4, 10],
    "male.asian": [5, 10.5],
    "female.asian": [7, 12],
  },
  "interbrow-distance": {
    // Phase 99: SCUT empirical (n=500). Beauty buckets:
    //   1.x mean 0.225; 2.x mean 0.216; 3.x mean 0.222; 4.x mean 0.228
    //   Slight non-monotonic — both extremes (close-set + wide-set)
    //   are mildly less attractive. Re-anchored to the empirical mode.
    "male.universal": [0.21, 0.24],
    "female.universal": [0.21, 0.24],
    "male.asian": [0.21, 0.24],
    "female.asian": [0.21, 0.24],
  },
  "eye-mouth-distance-ratio": {
    // Phase 18c: widened from ±10% to ±25% — long-face vs short-face
    // is natural human variance, not pathology. MediaPipe chin and
    // forehead-apex drift also push this metric.
    //
    // Phase 107: empirical top-rated p[10,90] on SCUT n=2200 by demo:
    // male.uni [0.40, 0.43], female.uni [0.36, 0.42],
    // male.asi [0.39, 0.43], female.asi [0.37, 0.43]. Old range [0.28, 0.4]
    // had upper bound at empirical p10 — top-rated faces are at the
    // very top of the old ideal. Shifted up.
    "male.universal": [0.39, 0.44],
    "female.universal": [0.36, 0.42],
    "male.asian": [0.39, 0.44],
    "female.asian": [0.37, 0.43],
  },
  "lower-face-height-ratio": {
    // Phase 18c: widened from ±5% to ~±20%. Lower-face-height is highly
    // variable in normal subjects and MediaPipe foreheadApex drift
    // amplifies the variance further.
    "male.universal": [0.3, 0.4],
    "female.universal": [0.28, 0.38],
    "male.asian": [0.3, 0.4],
    "female.asian": [0.28, 0.38],
  },
  "lower-lip-protrusion-side": {
    "male.universal": [-0.005, 0.02],
    "female.universal": [0, 0.025],
    "male.asian": [0, 0.025],
    "female.asian": [0.005, 0.03],
  },
  "alar-base-width": {
    // Caucasian canon ~0.22-0.30 (alar base ≈ inter-canthal width).
    // Asian populations trend wider (0.27-0.35) anatomically — Farkas
    // ethnic-comparison literature.
    "male.universal": [0.22, 0.3],
    "female.universal": [0.22, 0.3],
    "male.asian": [0.27, 0.35],
    "female.asian": [0.27, 0.35],
  },
  "nose-tip-angle": {
    // Front-view angle at the nasal tip between alars. Sharper (~70-85°)
    // reads more refined; wider (>95°) reads bulbous. Asian populations
    // trend slightly wider due to broader alar base.
    "male.universal": [72, 88],
    "female.universal": [68, 84],
    "male.asian": [78, 95],
    "female.asian": [74, 92],
  },
  "cupids-bow-height": {
    // Positive face-height fraction = bow peak above mouth-corner line.
    // Phase 18c: widened (old narrow window [0.005, 0.014] scored 0
    // for real defined cupid's bows around 0.03-0.04 on this face-frame
    // measurement). Top bound includes drift from MediaPipe upper-lip
    // landmark placement variance.
    "male.universal": [0.008, 0.032],
    "female.universal": [0.012, 0.036],
    "male.asian": [0.008, 0.032],
    "female.asian": [0.012, 0.036],
  },
  "forehead-width-ratio": {
    // outer-brow span / bizygomatic. Classical 0.85-0.95. Female ideal
    // trends slightly narrower (tapered upper face).
    //
    // Phase 103: empirical top-rated p[10,90] on SCUT n=2200 by demo:
    // male.uni [0.809, 0.871], female.uni [0.827, 0.874],
    // male.asi [0.819, 0.860], female.asi [0.821, 0.881]. The "classical"
    // 0.85-0.95 band is anchored at the HIGH tail of actual data — only
    // 40% of top-rated SCUT faces fall in there. Re-centered + widened.
    "male.universal": [0.81, 0.87],
    "female.universal": [0.82, 0.88],
    "male.asian": [0.81, 0.86],
    "female.asian": [0.82, 0.88],
  },
  "eye-tilt-symmetry": {
    // |left-tilt − right-tilt|, degrees. 0 = perfect; >3° is visible.
    "male.universal": [0, 2.5],
    "female.universal": [0, 2.5],
    "male.asian": [0, 2.5],
    "female.asian": [0, 2.5],
  },
  "nose-length-ratio": {
    // Sellion → subnasale / face height. Da Vinci canon ~1/3.
    "male.universal": [0.3, 0.36],
    "female.universal": [0.28, 0.34],
    "male.asian": [0.3, 0.36],
    "female.asian": [0.28, 0.34],
  },
  "mouth-chin-distance-ratio": {
    // Lower-lip-bottom → chin span / face height. Phase 18c: widened
    // [0.11, 0.16] → [0.10, 0.18] — masculine long-chin proportions hit
    // 0.17-0.19 and shouldn't be penalized; very short (< 0.10) still
    // reads as weak chin.
    //
    // Phase 103: empirical top-rated p[10,90] on SCUT n=2200 by demo:
    // male.uni [0.172, 0.231], female.uni [0.154, 0.195],
    // male.asi [0.163, 0.208], female.asi [0.138, 0.185]. The male
    // universal band was 0.04 BELOW where top-rated males actually
    // sit — males genuinely have longer mouth-chin span. Shifted up.
    "male.universal": [0.17, 0.23],
    "female.universal": [0.15, 0.20],
    "male.asian": [0.16, 0.21],
    "female.asian": [0.14, 0.19],
  },
  "brow-arch-height": {
    // Phase 100 SCUT calibration: empirical means M 0.168-0.187, F 0.174-0.180.
    // Old [0.05, 0.11] M was way below actual face data — every real
    // face was scoring 0/10 on this. Empirical re-anchor.
    "male.universal": [0.14, 0.20],
    "female.universal": [0.14, 0.20],
    "male.asian": [0.14, 0.20],
    "female.asian": [0.14, 0.20],
  },
  "upper-lid-show": {
    // Upper-lid-margin → brow apex / face height. Less than 0.04
    // suggests hooding or low brow; more than 0.08 reads exaggerated.
    //
    // Phase 103: empirical top-rated p[10,90] on SCUT n=2200 by demo:
    // male.uni [0.069, 0.099], female.uni [0.089, 0.124],
    // male.asi [0.096, 0.120], female.asi [0.104, 0.132]. The old band
    // [0.04, 0.07] missed 99% of top-rated faces — was 2× too low. The
    // metric appears to measure brow→lid distance not lid→iris show,
    // so empirical re-anchoring was the only fix.
    "male.universal": [0.07, 0.10],
    "female.universal": [0.09, 0.12],
    "male.asian": [0.10, 0.12],
    "female.asian": [0.10, 0.13],
  },
  "philtrum-length-ratio": {
    // Subnasale → upper-lip top / face height. Phase 18c (round 2):
    // pushed top further to 0.12. MediaPipe subnasale (2) often drifts
    // up toward the nasal tip, inflating philtrum length by 30-50%.
    // Conservative widening lets normal subjects score above 6 instead
    // of 0 while still flagging genuinely elongated upper lips.
    "male.universal": [0.05, 0.12],
    "female.universal": [0.045, 0.11],
    "male.asian": [0.05, 0.12],
    "female.asian": [0.045, 0.11],
  },
  "mouth-tilt": {
    // |mouth-line tilt vs inter-canthal axis|, degrees. 0 = perfect.
    "male.universal": [0, 2],
    "female.universal": [0, 2],
    "male.asian": [0, 2],
    "female.asian": [0, 2],
  },
  // Phase 44 additions
  "eye-aspect-ratio": {
    // Phase 99 calibration vs SCUT-FBP5500:
    //   Beauty 1.x mean = 0.354; Beauty 4.x mean = 0.404
    //   Old ideal [0.25, 0.35] put beauty-4 faces ABOVE the upper
    //   bound → r=-0.14 inverted. Shifted up.
    //
    // Phase 105: empirical top-rated p[10,90] on SCUT n=2200 by demo:
    // male.uni [0.355, 0.417], female.uni [0.363, 0.425],
    // male.asi [0.364, 0.432], female.asi [0.387, 0.471]. female.asian
    // was 0.04 too low (key female-r drag).
    "male.universal": [0.35, 0.42],
    "female.universal": [0.36, 0.43],
    "male.asian": [0.36, 0.43],
    "female.asian": [0.39, 0.47],
  },
  "mouth-aspect-ratio": {
    // height/width for closed mouth resting. Fuller lips trend higher;
    // female ideal allows slightly higher (fuller lips).
    "male.universal": [0.25, 0.42],
    "female.universal": [0.28, 0.46],
    "male.asian": [0.25, 0.42],
    "female.asian": [0.28, 0.46],
  },
  "bizygomatic-width-ratio": {
    // cheekbone width / temple width. Phase 100: widened upper bound to
    // accommodate pronounced-cheekbone references (1.25-1.3).
    // Heart/diamond face shapes are common among Western attractive men.
    "male.universal": [0.95, 1.3],
    "female.universal": [0.95, 1.25],
    "male.asian": [0.97, 1.25],
    "female.asian": [0.97, 1.2],
  },
  "chin-width-ratio": {
    // Phase 100 SCUT calibration: empirical M mean=0.180, F mean=0.170.
    // Previous range [0.32, 0.45] M was based on a DIFFERENT face-width
    // reference (silhouette 234/454) and is now misaligned with the
    // zygion-based width. Re-anchored.
    "male.universal": [0.16, 0.20],
    "female.universal": [0.15, 0.19],
    "male.asian": [0.16, 0.20],
    "female.asian": [0.15, 0.19],
  },
  "nasal-bridge-width": {
    // bridge width / alar width. Asian wider (less defined bridge).
    "male.universal": [0.35, 0.5],
    "female.universal": [0.33, 0.48],
    "male.asian": [0.4, 0.55],
    "female.asian": [0.38, 0.55],
  },
  // Phase 44 second batch
  "brow-thickness-symmetry": {
    // min/max ratio. 1.0 = perfect. > 0.9 still reads symmetric.
    "male.universal": [0.85, 1.0],
    "female.universal": [0.85, 1.0],
    "male.asian": [0.85, 1.0],
    "female.asian": [0.85, 1.0],
  },
  "eye-vertical-symmetry": {
    // |y delta| / IPD. Lower = better. 0 = perfectly level.
    //
    // Phase 108: r(raw)=+0.235 — POSITIVE. Higher raw (more vertical
    // mismatch) = more attractive. Top-rated mean 0.021, low-rated 0.011.
    // Counterintuitive but consistent with the SCUT-wide "perfect
    // symmetry = uncanny" pattern. Tightened ideal to a non-zero band.
    "male.universal": [0.015, 0.04],
    "female.universal": [0.015, 0.04],
    "male.asian": [0.015, 0.04],
    "female.asian": [0.015, 0.04],
  },
  "forehead-height-ratio": {
    // Phase 99 calibration vs SCUT-FBP5500:
    //   Beauty 1.x mean = 0.166; Beauty 4.x mean = 0.181.
    //   ALL SCUT faces measured way below the [0.30, 0.38] target —
    //   metric was returning score 0 for everyone, then confidence-
    //   blending pulled toward neutral 5.5. Original spec assumed
    //   measurement = "trichion to brow / total face", but MediaPipe
    //   landmark 10 is BELOW the trichion (hairline), so what's being
    //   measured is closer to "narrow forehead band / face". Re-anchored
    //   to the empirical optimum.
    "male.universal": [0.16, 0.22],
    "female.universal": [0.16, 0.22],
    "male.asian": [0.16, 0.22],
    "female.asian": [0.16, 0.22],
  },
  "eyebrow-arch-position": {
    // Westmore: lateral 2/3 ideal. Center (0.5) = flat brow.
    //
    // Phase 105+106 trials reverted: empirical p[10,90] [0.62, 0.66] is
    // too narrow for cos²-decay; halfRange floor of 0.04 over-softens
    // other metrics. Wider ranges work better with cos² normalization.
    "male.universal": [0.55, 0.72],
    "female.universal": [0.6, 0.75],
    "male.asian": [0.55, 0.72],
    "female.asian": [0.6, 0.75],
  },
  "lip-corner-tilt": {
    // Positive = corners pulled up (resting smile). Ideal slight positive.
    "male.universal": [0, 0.015],
    "female.universal": [0, 0.018],
    "male.asian": [0, 0.015],
    "female.asian": [0, 0.018],
  },
};

export function getIdealRange(
  metric: MetricKey,
  options: MetricOptions
): [number, number] {
  const key = `${options.gender}.${options.ethnicity}`;
  const range = RANGES[metric][key];
  if (!range) {
    throw new Error(`No ideal range for ${metric} (${key})`);
  }
  return range;
}
