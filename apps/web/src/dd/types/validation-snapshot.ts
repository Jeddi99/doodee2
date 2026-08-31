export const VALIDATION_SNAPSHOT_SCHEMA_VERSION = 1 as const;

export interface ValidationSnapshotMetrics {
  totalUsers: number;
  activeUsers24h: number;
  activeUsers7d: number;
  totalSuccessfulOperations: number;
  totalFaceAnalyses: number;
  totalProcedurePreviews: number;
  payingCustomers: number;
  lifetimeRevenueThb: number;
}

export interface PublicValidationSnapshot {
  schemaVersion: typeof VALIDATION_SNAPSHOT_SCHEMA_VERSION;
  capturedAt: string;
  expiresAt: string;
  metrics: ValidationSnapshotMetrics;
}

export interface AdminValidationSnapshot extends PublicValidationSnapshot {
  id: string;
  revokedAt: string | null;
}

export interface CreateValidationSnapshotResponse {
  snapshot: AdminValidationSnapshot;
  token: string;
  publicUrl: string;
  qrEndpoint: string;
}

export interface ListValidationSnapshotsResponse {
  snapshots: AdminValidationSnapshot[];
}

export interface RevokeValidationSnapshotResponse {
  snapshot: AdminValidationSnapshot;
}
