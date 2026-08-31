"use client";

import { getAccessToken } from "@/lib/supabase/auth-client";

export type CameraAdoptionEvent =
  | "scan_camera_opened"
  | "scan_camera_closed"
  | "scan_camera_denied"
  | "scan_camera_captured"
  | "scan_album_fallback_opened"
  | "scan_album_captured"
  | "surgery_camera_opened"
  | "surgery_camera_closed"
  | "surgery_camera_denied"
  | "surgery_camera_captured"
  | "surgery_album_fallback_opened"
  | "surgery_album_captured";

type CameraAdoptionMetadata = {
  reason?: "auto" | "manual" | "after_attempt" | "permission_denied";
};

type QueuedCameraAdoptionEvent = {
  event: CameraAdoptionEvent;
  metadata: CameraAdoptionMetadata;
};

const QUEUE_KEY = "doodee:camera-adoption-pending:v1";
const MAX_QUEUE = 30;

function readQueue(): QueuedCameraAdoptionEvent[] {
  try {
    const raw = window.localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isQueuedCameraAdoptionEvent).slice(-MAX_QUEUE);
  } catch {
    return [];
  }
}

function writeQueue(queue: QueuedCameraAdoptionEvent[]): void {
  try {
    if (queue.length === 0) {
      window.localStorage.removeItem(QUEUE_KEY);
      return;
    }
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-MAX_QUEUE)));
  } catch {}
}

function isCameraAdoptionEvent(value: unknown): value is CameraAdoptionEvent {
  return (
    value === "scan_camera_opened" ||
    value === "scan_camera_closed" ||
    value === "scan_camera_denied" ||
    value === "scan_camera_captured" ||
    value === "scan_album_fallback_opened" ||
    value === "scan_album_captured" ||
    value === "surgery_camera_opened" ||
    value === "surgery_camera_closed" ||
    value === "surgery_camera_denied" ||
    value === "surgery_camera_captured" ||
    value === "surgery_album_fallback_opened" ||
    value === "surgery_album_captured"
  );
}

function isCameraReason(value: unknown): value is CameraAdoptionMetadata["reason"] {
  return (
    value === undefined ||
    value === "auto" ||
    value === "manual" ||
    value === "after_attempt" ||
    value === "permission_denied"
  );
}

function isQueuedCameraAdoptionEvent(
  value: unknown
): value is QueuedCameraAdoptionEvent {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (!isCameraAdoptionEvent(record.event)) return false;
  const metadata = record.metadata;
  if (metadata === undefined) return true;
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) {
    return false;
  }
  return isCameraReason((metadata as Record<string, unknown>).reason);
}

function enqueue(event: CameraAdoptionEvent, metadata: CameraAdoptionMetadata): void {
  writeQueue([...readQueue(), { event, metadata }]);
}

async function postEvent(
  token: string,
  item: QueuedCameraAdoptionEvent
): Promise<boolean> {
  try {
    const res = await fetch("/api/product-events", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(item),
      cache: "no-store",
      keepalive: true,
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function currentAccessToken(): Promise<string | null> {
  try {
    return await getAccessToken();
  } catch {
    return null;
  }
}

export async function flushCameraAdoptionQueue(): Promise<void> {
  if (typeof window === "undefined") return;
  const token = await currentAccessToken();
  if (!token) return;
  const queue = readQueue();
  if (queue.length === 0) return;
  const remaining: QueuedCameraAdoptionEvent[] = [];
  for (let i = 0; i < queue.length; i++) {
    const item = queue[i];
    if (!item) continue;
    const ok = await postEvent(token, item);
    if (!ok) {
      remaining.push(...queue.slice(i));
      break;
    }
  }
  writeQueue(remaining);
}

export async function trackCameraAdoption(
  event: CameraAdoptionEvent,
  metadata: CameraAdoptionMetadata = {}
): Promise<void> {
  if (typeof window === "undefined") return;
  const token = await currentAccessToken();
  if (!token) {
    enqueue(event, metadata);
    return;
  }
  await flushCameraAdoptionQueue();
  const ok = await postEvent(token, { event, metadata });
  if (!ok) enqueue(event, metadata);
}
