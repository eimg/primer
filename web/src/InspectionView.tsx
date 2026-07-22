import { useEffect, useState } from "react";
import { api, type EvaluationRun, type EvaluationSummary, type RetrievalTrace, type TraceSummary } from "./api";

function percent(value: number): string { return `${Math.round(value * 100)}%`; }
function formatMetric(key: string, value: number): string {
  if (key.toLowerCase().includes("recall") || key.toLowerCase().includes("coverage")) return percent(value);
  if (key.toLowerCase().includes("duration")) return `${value.toFixed(1)} ms`;
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}
function stageTiming(trace: RetrievalTrace, stage: "lexical" | "semantic" | "fused" | "evidence"): number {
  if (stage === "fused") return trace.timingMs.fusion;
  return trace.timingMs[stage];
}
function candidateReason(candidate: RetrievalTrace["lexical"][number]): string {
  return candidate.retrievalReasons?.join(" · ") ?? candidate.reason ?? "Ranked candidate";
}

export function InspectionView() {
  const [section, setSection] = useState<"traces" | "evaluations">("traces");
  const [traces, setTraces] = useState<TraceSummary[]>([]);
  const [evaluations, setEvaluations] = useState<EvaluationSummary[]>([]);
  const [trace, setTrace] = useState<RetrievalTrace>();
  const [evaluation, setEvaluation] = useState<EvaluationRun>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function refresh() {
    const [traceData, evaluationData] = await Promise.all([api.traces(), api.evaluations()]);
    setTraces(traceData.traces); setEvaluations(evaluationData.runs);
  }
  useEffect(() => { void refresh().catch((cause: Error) => setError(cause.message)); }, []);

  async function openTrace(id: string) { setError(undefined); try { setTrace((await api.trace(id)).trace); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } }
  async function openEvaluation(id: string) { setError(undefined); try { setEvaluation((await api.evaluation(id)).run); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } }
  async function runEvaluation(kind: "retrieval" | "answers") {
    setBusy(true); setError(undefined);
    try { const result = await api.runEvaluation(kind); setEvaluation(result.run); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }

  return <main className="workspace inspect-workspace">
    <div className="page-heading"><div><p className="eyebrow">System inspection</p><h1>See every consequential step.</h1><p className="muted">Review retrieval stages and persisted evaluation evidence without exposing another account&apos;s traces.</p></div></div>
    <div className="segment-control"><button className={section === "traces" ? "active" : ""} onClick={() => setSection("traces")}>Retrieval traces <span>{traces.length}</span></button><button className={section === "evaluations" ? "active" : ""} onClick={() => setSection("evaluations")}>Evaluations <span>{evaluations.length}</span></button></div>
    {error && <div className="alert error">{error}</div>}
    {section === "traces" ? <div className="inspection-layout">
      <section className="inspection-list"><div className="list-heading"><div><p className="eyebrow">Active account</p><h3>Saved traces</h3></div></div>{traces.map((item) => <button className={trace?.traceId === item.id ? "selected" : ""} key={item.id} onClick={() => void openTrace(item.id)}><strong>{item.question}</strong><span>{item.projectId ?? "All projects"} · {new Date(item.createdAt).toLocaleString()}</span><code>{item.id}</code></button>)}{traces.length === 0 && <div className="empty"><strong>No traces for this account.</strong><span>Ask a chat question to create one.</span></div>}</section>
      <section className="panel trace-panel">{trace ? <><div className="trace-title"><div><p className="eyebrow">{trace.projectId ?? "All projects"}</p><h3>{trace.question}</h3></div><span>{trace.timingMs.total.toFixed(1)} ms</span></div><div className="stage-grid"><article><span>planned queries</span><strong>{trace.queryPlan?.queries.length ?? 1}</strong><small>{(trace.timingMs.planning ?? 0).toFixed(1)} ms</small></article>{(["lexical", "semantic", "fused", "evidence"] as const).map((stage) => <article key={stage}><span>{stage}</span><strong>{trace[stage].length}</strong><small>{stageTiming(trace, stage)} ms</small></article>)}</div>{trace.queryPlan && <div className="query-plan"><div><h4>Query plan</h4><span>{trace.queryPlan.model}{trace.queryPlan.fallback ? ` · fallback: ${trace.queryPlan.fallbackReason ?? "original query"}` : ""}</span></div><ol>{trace.queryPlan.queries.map((query) => <li key={query}>{query}</li>)}</ol></div>}<div className="candidate-columns"><div><h4>Lexical candidates</h4>{trace.lexical.map((candidate) => <div key={candidate.recordId}><strong>#{candidate.rank} {candidate.recordId}</strong><span>{candidateReason(candidate)}</span></div>)}</div><div><h4>Semantic candidates</h4>{trace.semantic.map((candidate) => <div key={candidate.recordId}><strong>#{candidate.rank} {candidate.recordId}</strong><span>{candidateReason(candidate)}</span></div>)}</div></div><h4>Final authorized evidence</h4><div className="trace-evidence">{trace.evidence.map((item) => <article key={item.evidenceId}><span>{item.evidenceId}</span><div><strong>{item.title}</strong><p>{item.excerpt}</p><code>{item.sourceRef}</code></div></article>)}</div></> : <div className="empty"><strong>Select a retrieval trace.</strong><span>Its candidates, timing, policy, and final evidence appear here.</span></div>}</section>
    </div> : <div className="inspection-layout">
      <section className="inspection-list"><div className="evaluation-actions"><button className="secondary" disabled={busy} onClick={() => void runEvaluation("retrieval")}>Run retrieval suite</button><button className="secondary" disabled={busy} onClick={() => void runEvaluation("answers")}>Run answer suite (model calls)</button></div>{evaluations.map((item) => <button className={evaluation?.runId === item.id ? "selected" : ""} key={item.id} onClick={() => void openEvaluation(item.id)}><strong>{item.schemaVersion.includes("answer") ? "Answer evaluation" : "Retrieval evaluation"}</strong><span>{item.fixtureId} · {new Date(item.createdAt).toLocaleString()}</span><code>{item.id}</code></button>)}{evaluations.length === 0 && <div className="empty"><strong>No evaluation runs yet.</strong><span>Run a suite here or through the CLI.</span></div>}</section>
      <section className="panel trace-panel">{evaluation ? <><div className="trace-title"><div><p className="eyebrow">{evaluation.schemaVersion}</p><h3>{evaluation.fixtureId} evaluation</h3></div><span>{evaluation.providerMode ?? "retrieval"}</span></div><div className="aggregate-grid">{Object.entries(evaluation.aggregate).map(([key, value]) => <article key={key}><span>{key.replace(/([A-Z])/g, " $1")}</span><strong>{formatMetric(key, value)}</strong></article>)}</div><div className="evaluation-cases"><h4>Case results</h4>{evaluation.cases.map((item, index) => <details key={String(item.id ?? index)}><summary><strong>{String(item.id ?? `Case ${index + 1}`)}</strong><span>{String(item.question ?? "")}</span></summary><pre>{JSON.stringify(item, null, 2)}</pre></details>)}</div></> : <div className="empty"><strong>Select an evaluation run.</strong><span>Aggregate trust metrics and individual case outcomes appear here.</span></div>}</section>
    </div>}
  </main>;
}
