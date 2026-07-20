import { createHash, randomUUID } from "node:crypto";

export function checksum(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function newTraceId(): string {
  return `trace_${randomUUID()}`;
}

export function newSyncId(): string {
  return `sync_${randomUUID()}`;
}

export function newSessionId(): string {
  return `session_${randomUUID()}`;
}

export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "-");
}

export function elapsedMs(start: bigint): number {
  return Number(process.hrtime.bigint() - start) / 1_000_000;
}
