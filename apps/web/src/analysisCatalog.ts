export type MetricGroup =
  | "Face & Proportions"
  | "Eyes"
  | "Eyebrows"
  | "Nose"
  | "Lips & Mouth"
  | "Jaw & Chin"
  | "Cheek & Midface"
  | "Side Profile";

export type MetricMethod = "landmark" | "scale" | "profile";

export type AnalysisMetric = {
  id: string;
  name: string;
  group: MetricGroup;
  method: MetricMethod;
  view: string;
  description: string;
  limitation: string;
};

type Seed = [string, MetricMethod, string, string?];

const methodLimits: Record<MetricMethod, string> = {
  landmark: "Requires a neutral expression, corrected pose and a quality-approved image.",
  scale: "A ratio can be estimated from an image, but millimetres require a calibrated scale reference.",
  profile: "Uses a quality-approved 90° side or oblique capture for projected ratios and angles, not skeletal depth.",
};

const groupDescriptions: Record<MetricGroup, string> = {
  "Face & Proportions": "Maps full-face balance, vertical thirds, width and height relationships.",
  Eyes: "Measures eye position, aperture, spacing, tilt and left-right balance.",
  Eyebrows: "Maps brow position and its relationship with the eye area.",
  Nose: "Measures frontal proportions and profile angles when the required view is available.",
  "Lips & Mouth": "Measures visible lip, mouth and philtrum proportions.",
  "Jaw & Chin": "Maps lower-face width, angles, contour and projection.",
  "Cheek & Midface": "Measures cheekbone width, midface proportions and visible volume balance.",
  "Side Profile": "Uses lateral views for projection, convexity and aesthetic-line relationships.",
};

const groups: Record<MetricGroup, Seed[]> = {
  "Face & Proportions": [
    ["Facial thirds", "landmark", "Front"],
    ["Facial width-to-height ratio (FWHR)", "landmark", "Front"],
    ["Face width", "scale", "Front"],
    ["Face height", "scale", "Front"],
    ["Midface ratio", "landmark", "Front"],
    ["Midface length", "scale", "Front"],
    ["Lower-third proportion", "landmark", "Front"],
    ["Upper-third proportion", "landmark", "Front", "The full hairline must be visible; otherwise this result is withheld."],
    ["Facial symmetry", "landmark", "Front"],
    ["Facial harmony / overall proportions", "landmark", "Front + side", "A composite reference, not an objective measure of beauty or human value."],
    ["Forehead width", "scale", "Front"],
    ["Forehead height", "scale", "Front", "Requires an unobstructed, clearly visible hairline."],
    ["Lower-face height", "scale", "Front"],
    ["Facial index", "landmark", "Front"],
    ["Facial centroid alignment", "landmark", "Front"],
  ],
  Eyes: [
    ["Eye shape", "landmark", "Front close-up"],
    ["Eye size", "scale", "Front close-up"],
    ["Eye width", "scale", "Front close-up"],
    ["Eye spacing", "landmark", "Front"],
    ["Intercanthal distance", "scale", "Front"],
    ["Canthal tilt", "landmark", "Front"],
    ["Eye aspect ratio", "landmark", "Front close-up"],
    ["Eye symmetry", "landmark", "Front"],
    ["Upper-eyelid exposure", "landmark", "Front close-up"],
    ["Under-eye / lower-eyelid area", "landmark", "Front close-up"],
    ["Eye-to-face proportion", "landmark", "Front"],
    ["Eye separation ratio", "landmark", "Front"],
    ["Palpebral fissure length", "scale", "Front close-up"],
    ["Palpebral fissure height", "scale", "Front close-up"],
    ["Scleral show", "landmark", "Front close-up"],
    ["Pupil-to-brow distance", "scale", "Front close-up"],
    ["Orbital aperture balance", "landmark", "Front close-up"],
  ],
  Eyebrows: [
    ["Eyebrow position", "landmark", "Front"],
    ["Eyebrow height", "scale", "Front"],
    ["Eyebrow shape", "landmark", "Front"],
    ["Eyebrow tilt", "landmark", "Front"],
    ["Brow-to-eye distance", "landmark", "Front"],
    ["Eyebrow symmetry", "landmark", "Front"],
    ["Brow arch position", "landmark", "Front"],
  ],
  Nose: [
    ["Nose width", "scale", "Front"],
    ["Nose length", "scale", "Front"],
    ["Nose-to-face width ratio", "landmark", "Front"],
    ["Nose proportion", "landmark", "Front + side"],
    ["Alar width", "scale", "Front"],
    ["Nose symmetry", "landmark", "Front"],
    ["Nasal tip projection", "profile", "Side 90°"],
    ["Nasofrontal angle", "landmark", "Side"],
    ["Nasolabial angle", "landmark", "Side"],
    ["Nasal base width", "scale", "Front / basal"],
    ["Nasal tip rotation", "landmark", "Side"],
    ["Columella show", "landmark", "Side / basal"],
    ["Alar-columellar relationship", "landmark", "Side / basal"],
    ["Nasomental angle", "landmark", "Side"],
    ["Nasofacial angle", "landmark", "Side"],
  ],
  "Lips & Mouth": [
    ["Mouth width", "scale", "Front"],
    ["Lip width", "scale", "Front"],
    ["Upper-lip height", "scale", "Front"],
    ["Lower-lip height", "scale", "Front"],
    ["Upper/lower lip ratio", "landmark", "Front"],
    ["Lip fullness", "profile", "Front + side 90°"],
    ["Lip symmetry", "landmark", "Front"],
    ["Mouth-to-nose proportion", "landmark", "Front"],
    ["Philtrum length", "scale", "Front"],
    ["Philtrum proportion", "landmark", "Front"],
    ["Vermilion height", "scale", "Front close-up"],
    ["Cupid's bow symmetry", "landmark", "Front close-up"],
    ["Oral commissure tilt", "landmark", "Front"],
    ["Oral aperture", "landmark", "Front close-up", "Expression and lip tension must be neutral for comparison."],
  ],
  "Jaw & Chin": [
    ["Jaw width", "scale", "Front"],
    ["Jaw-to-face width ratio", "landmark", "Front"],
    ["Jaw shape", "landmark", "Front"],
    ["Gonial angle", "landmark", "Side / 3D", "Hair, neck position and soft tissue can obscure the true mandibular angle."],
    ["Chin width", "scale", "Front"],
    ["Chin height", "scale", "Front"],
    ["Chin projection", "profile", "Side 90°"],
    ["Chin-to-philtrum ratio", "landmark", "Front"],
    ["Mandibular projection", "profile", "Side 90°"],
    ["Jawline definition", "landmark", "Front + side"],
    ["Bigonial width", "scale", "Front"],
    ["Ramus height", "profile", "Side 90°"],
    ["Mandibular plane angle", "landmark", "Side"],
    ["Cervicomental angle", "landmark", "Side"],
  ],
  "Cheek & Midface": [
    ["Cheekbone width", "scale", "Front"],
    ["Bizygomatic width", "scale", "Front"],
    ["Cheekbone prominence", "profile", "Oblique"],
    ["Midface projection", "profile", "Side 90°"],
    ["Midface width", "scale", "Front"],
    ["Facial convexity", "profile", "Side 90°"],
    ["Temple width", "scale", "Front"],
    ["Cheek volume asymmetry", "profile", "Front + oblique"],
  ],
  "Side Profile": [
    ["Facial profile angle", "landmark", "Side"],
    ["Facial convexity angle", "landmark", "Side"],
    ["Profile nasofrontal angle", "landmark", "Side"],
    ["Profile nasolabial angle", "landmark", "Side"],
    ["Mentolabial angle", "landmark", "Side"],
    ["Profile chin projection", "profile", "Side 90°"],
    ["Nose projection", "profile", "Side 90°"],
    ["Lip projection", "profile", "Side 90°"],
    ["E-line / Ricketts aesthetic line", "landmark", "Side", "A descriptive orthodontic reference, not a universal aesthetic ideal."],
    ["Jaw/chin relationship", "profile", "Side 90°"],
    ["Orbital vector", "profile", "Side 90°"],
    ["Throat length / neck-chin relationship", "landmark", "Side"],
  ],
};

export const analysisCatalog: AnalysisMetric[] = Object.entries(groups).flatMap(
  ([group, metrics]) =>
    metrics.map(([name, method, view, limitation], index) => ({
      id: `${group.toLowerCase().replace(/[^a-z]+/g, "-")}-${index}`,
      name,
      group: group as MetricGroup,
      method,
      view,
      description: groupDescriptions[group as MetricGroup],
      limitation: limitation ?? methodLimits[method],
    })),
);

export const metricGroups = Object.keys(groups) as MetricGroup[];

export const methodLabels: Record<MetricMethod, string> = {
  landmark: "2D landmark",
  scale: "Needs scale",
  profile: "Side profile",
};
