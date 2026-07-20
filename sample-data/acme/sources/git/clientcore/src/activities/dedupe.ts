export interface ImportedActivityIdentity {
  tenantId: string;
  sourceEventId: string;
  occurredAt: string;
}

/** ADR-014: timestamps are not identity; two valid calls may share one second. */
export function activityDedupeKey(activity: ImportedActivityIdentity): string {
  return `${activity.tenantId}:${activity.sourceEventId}`;
}

