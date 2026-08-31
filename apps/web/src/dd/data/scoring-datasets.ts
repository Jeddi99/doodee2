export type DatasetRole =
  | "public_baseline"
  | "public_validation"
  | "internal_consent_training"
  | "internal_consent_validation";

export type DatasetAccess = "open_download" | "request_access" | "internal_only";

export type DatasetStatus = "ready" | "candidate" | "planned";

export type ScoringDataset = {
  id: string;
  name: string;
  role: DatasetRole;
  status: DatasetStatus;
  access: DatasetAccess;
  sourceUrl?: string;
  labelScale: string;
  targetUse: string;
  risks: string[];
  requiredBeforeProduction: string[];
};

export const SCORING_DATASETS: readonly ScoringDataset[] = [
  {
    id: "scut-fbp5500",
    name: "SCUT-FBP5500",
    role: "public_baseline",
    status: "ready",
    access: "open_download",
    sourceUrl: "https://github.com/HCIILAB/SCUT-FBP5500-Database-Release",
    labelScale: "1-5 human attractiveness mean",
    targetUse:
      "Train or fine-tune the browser ONNX attractiveness baseline and compare model swaps.",
    risks: [
      "Repository notes non-commercial research use, so production derivative use needs separate permission.",
      "Research dataset labels are not Thai-market ground truth.",
      "May not cover phone-camera, low-light, makeup, filter, and Thai clinic-use cases.",
    ],
    requiredBeforeProduction: [
      "Document license/usage constraints before shipping a trained derivative.",
      "Validate same-identity repeatability on DOODEE consent data.",
      "Calibrate final 0-10 mapping against Thai/Asian internal benchmarks.",
    ],
  },
  {
    id: "mebeauty",
    name: "MEBeauty",
    role: "public_validation",
    status: "candidate",
    access: "open_download",
    sourceUrl: "https://github.com/fbplab/MEBeauty-database",
    labelScale: "dataset-native human attractiveness score",
    targetUse:
      "Cross-dataset holdout validation so SCUT-trained models do not overfit controlled Chinese/Caucasian portrait distribution.",
    risks: [
      "Multi-ethnic labels are broader than Thai cosmetic-consult intent.",
      "Repository notes non-commercial research use, so it is not a production training source without separate permission.",
    ],
    requiredBeforeProduction: [
      "Keep MEBeauty as validation until license is confirmed for derivative production use.",
      "Compare per-demographic residuals against DOODEE consent data.",
      "Fail model swaps that improve SCUT but regress MEBeauty or consent repeatability.",
    ],
  },
  {
    id: "doodee-consent-thai-v1",
    name: "DOODEE consented Thai/Asian scans v1",
    role: "internal_consent_validation",
    status: "planned",
    access: "internal_only",
    labelScale: "paired scan stability + optional reviewer score",
    targetUse:
      "Measure real-user repeatability, photo-quality sensitivity, and demographic calibration.",
    risks: [
      "Requires explicit consent, deletion path, retention policy, and access controls.",
      "Raw photos must never ship to client bundles or public artifacts.",
    ],
    requiredBeforeProduction: [
      "Add consent copy before storing user images for model improvement.",
      "Store image hashes and metadata separately from account identifiers where possible.",
      "Run repeatability benchmarks before changing score weights or model versions.",
    ],
  },
  {
    id: "doodee-consent-hard-cases-v1",
    name: "DOODEE hard-case repeatability set v1",
    role: "internal_consent_validation",
    status: "planned",
    access: "internal_only",
    labelScale: "same identity, multiple quality tiers",
    targetUse:
      "Catch cases where a poor photo outranks a clean photo for the same person.",
    risks: [
      "Small hard-case sets can overfit scoring rules if used as training data.",
      "Needs versioned holdout split that is never used for prompt/model tuning.",
    ],
    requiredBeforeProduction: [
      "Collect at least three captures per consented identity: camera-good, album-normal, poor-quality.",
      "Keep this as a holdout gate for releases.",
      "Fail release when bad-quality score advantage exceeds the repeatability threshold.",
    ],
  },
];

export function scoringDatasetById(id: string): ScoringDataset | undefined {
  return SCORING_DATASETS.find((dataset) => dataset.id === id);
}
