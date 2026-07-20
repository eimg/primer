import type { StoredRecord } from "./database.js";
import type { FusedCandidate, PolicyReason } from "./types.js";

function rounded(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function authorityReason(record: StoredRecord): PolicyReason {
  const adjustment = (record.authority - 0.5) * 0.05;
  return {
    kind: "authority",
    adjustment: rounded(adjustment),
    reason: `authority ${record.authority.toFixed(2)} contributes ${adjustment >= 0 ? "+" : ""}${rounded(adjustment).toFixed(4)}`,
  };
}

function freshnessReason(record: StoredRecord, newestTimestamp: number): PolicyReason {
  const timestamp = Date.parse(record.updatedAt);
  const ageDays = Number.isFinite(timestamp) ? Math.max(0, (newestTimestamp - timestamp) / 86_400_000) : 0;
  const adjustment = ageDays <= 30 ? 0.01 : ageDays <= 180 ? 0.005 : ageDays > 730 ? -0.02 : ageDays > 365 ? -0.01 : 0;
  return {
    kind: "freshness",
    adjustment,
    reason: `updated ${Math.round(ageDays)} days behind the newest authorized candidate contributes ${adjustment >= 0 ? "+" : ""}${adjustment.toFixed(4)}`,
  };
}

function resolutionReason(record: StoredRecord): PolicyReason {
  const adjustment =
    record.resolutionState === "resolved"
      ? 0.02
      : record.resolutionState === "proposed"
        ? -0.01
        : record.resolutionState === "superseded"
          ? -0.05
          : 0;
  return {
    kind: "resolution",
    adjustment,
    reason: `${record.resolutionState ?? "unspecified"} resolution state contributes ${adjustment >= 0 ? "+" : ""}${adjustment.toFixed(4)}`,
  };
}

export function applyRankingPolicy(candidates: FusedCandidate[], records: StoredRecord[]): FusedCandidate[] {
  const recordsById = new Map(records.map((record) => [record.id, record]));
  const timestamps = records.map((record) => Date.parse(record.updatedAt)).filter(Number.isFinite);
  const newestTimestamp = timestamps.length > 0 ? Math.max(...timestamps) : 0;

  return candidates
    .map((candidate) => {
      const record = recordsById.get(candidate.recordId);
      if (!record) return candidate;
      const policyReasons = [
        authorityReason(record),
        freshnessReason(record, newestTimestamp),
        resolutionReason(record),
      ];
      const policyAdjustment = rounded(policyReasons.reduce((sum, item) => sum + item.adjustment, 0));
      return {
        ...candidate,
        policyAdjustment,
        policyReasons,
        fusedScore: candidate.baseFusedScore * (1 + policyAdjustment),
      };
    })
    .sort((left, right) => right.fusedScore - left.fusedScore || left.recordId.localeCompare(right.recordId))
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }));
}
