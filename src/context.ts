import {
  CONTEXT_CONTRACT_VERSION,
  type CodeLead,
  type ContextConflict,
  type ContextConstraint,
  type Evidence,
  type OrchestratorContextPack,
  type RetrievalTrace,
} from "./types.js";

function buildConstraints(evidence: Evidence[]): ContextConstraint[] {
  return evidence.flatMap((item) => {
    if (item.resolutionState === "proposed") {
      return [{ text: `${item.evidenceId} is proposed and must not be presented as a settled decision.`, evidenceIds: [item.evidenceId] }];
    }
    if (item.resolutionState === "superseded") {
      return [{ text: `${item.evidenceId} is superseded and is retained only as historical context.`, evidenceIds: [item.evidenceId] }];
    }
    if (item.authority < 0.5) {
      return [{ text: `${item.evidenceId} has low source authority and requires cautious attribution.`, evidenceIds: [item.evidenceId] }];
    }
    return [];
  });
}

function buildConflicts(evidence: Evidence[]): ContextConflict[] {
  const byTitle = new Map<string, Evidence[]>();
  for (const item of evidence) {
    const key = item.title.trim().toLowerCase();
    byTitle.set(key, [...(byTitle.get(key) ?? []), item]);
  }
  return [...byTitle.values()].flatMap((items) => {
    const states = new Set(items.map((item) => item.resolutionState ?? "unspecified"));
    if (items.length < 2 || states.size < 2) return [];
    return [{
      text: `Evidence with the same title has conflicting resolution states: ${[...states].join(", ")}.`,
      evidenceIds: items.map((item) => item.evidenceId),
    }];
  });
}

function looksLikeCodeReference(value: string): boolean {
  return (
    /^(?:src|app|apps|lib|libs|package|packages|test|tests)\/[A-Za-z0-9_./-]+$/.test(value) ||
    /^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)+$/.test(value) ||
    /^[a-z][A-Za-z0-9_$]*[A-Z][A-Za-z0-9_$]*$/.test(value) ||
    /^[A-Z][A-Za-z0-9_$]{3,}$/.test(value) ||
    /^[A-Z][A-Z0-9_]{3,}$/.test(value)
  );
}

function buildCodeLeads(evidence: Evidence[]): CodeLead[] {
  const leads = new Map<string, Set<string>>();
  for (const item of evidence) {
    const inline = [...item.excerpt.matchAll(/`([^`\n]{2,160})`/g)].map((match) => match[1]?.trim() ?? "");
    const paths = item.excerpt.match(/\b(?:src|app|apps|lib|libs|package|packages|test|tests)\/[A-Za-z0-9_./-]+/g) ?? [];
    for (const ref of [...inline, ...paths].filter(looksLikeCodeReference)) {
      const evidenceIds = leads.get(ref) ?? new Set<string>();
      evidenceIds.add(item.evidenceId);
      leads.set(ref, evidenceIds);
    }
  }
  return [...leads.entries()].slice(0, 20).map(([ref, evidenceIds]) => ({
    ref,
    reason: "Mentioned by authorized organizational evidence; verify it against the current repository.",
    evidenceIds: [...evidenceIds],
    verifiedAgainstRepository: false,
  }));
}

export function buildContextPack(trace: RetrievalTrace): OrchestratorContextPack {
  return {
    schemaVersion: CONTEXT_CONTRACT_VERSION,
    traceId: trace.traceId,
    actorId: trace.userId,
    question: trace.question,
    ...(trace.projectId ? { projectId: trace.projectId } : {}),
    evidence: trace.evidence,
    constraints: buildConstraints(trace.evidence),
    conflicts: buildConflicts(trace.evidence),
    codeLeads: buildCodeLeads(trace.evidence),
    createdAt: trace.createdAt,
  };
}
