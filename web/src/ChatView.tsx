import { useMemo, useState } from "react";
import { api, type Evidence, type GroundedAnswer, type Project } from "./api";

interface ChatMessage {
  id: string;
  question: string;
  status: string;
  stage?: string;
  result?: GroundedAnswer;
  error?: string;
}

function AnswerText({ text, onEvidence }: { text: string; onEvidence(id: string): void }) {
  return <>{text.split(/(\[(?:E\d+(?:,\s*)?)+\])/g).map((part, index) => {
    const ids = part.match(/E\d+/g);
    if (!ids) return part;
    return <span className="citation-group" key={`${part}-${index}`}>{ids.map((id) =>
      <button key={id} onClick={() => onEvidence(id)} aria-label={`Open evidence ${id}`}>{id}</button>)}</span>;
  })}</>;
}

const suggestions = [
  { question: "What does CC_IMPORT_017 mean?", projectId: "clientcore" },
  { question: "Why did TalentFlow send duplicate interview reminders?", projectId: "talentflow" },
  { question: "What is planned for TalentFlow compensation analytics?", projectId: "talentflow" },
];

export function ChatView({ projects }: { projects: Project[] }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [projectId, setProjectId] = useState("");
  const [sending, setSending] = useState(false);
  const [selectedEvidence, setSelectedEvidence] = useState<Evidence>();

  const latestResult = useMemo(() => [...messages].reverse().find((message) => message.result)?.result, [messages]);

  function openEvidence(answer: GroundedAnswer, evidenceId: string) {
    setSelectedEvidence(answer.evidence.find((item) => item.evidenceId === evidenceId));
  }

  async function ask(nextQuestion = question, nextProjectId = projectId) {
    const trimmed = nextQuestion.trim();
    if (!trimmed || sending) return;
    const id = `message-${Date.now()}`;
    setMessages((current) => [...current, { id, question: trimmed, status: "Starting grounded search", stage: "planning" }]);
    setQuestion("");
    setSending(true);
    setSelectedEvidence(undefined);
    try {
      const result = await api.streamChat(
        { question: trimmed, ...(nextProjectId ? { projectId: nextProjectId } : {}), limit: 5 },
        {
          onStatus: (status, stage) => setMessages((current) => current.map((message) => message.id === id ? { ...message, status, stage } : message)),
        },
      );
      setMessages((current) => current.map((message) => message.id === id ? { ...message, result, status: "Grounded answer ready" } : message));
      setSelectedEvidence(result.evidence[0]);
    } catch (cause) {
      setMessages((current) => current.map((message) => message.id === id ? { ...message, error: cause instanceof Error ? cause.message : String(cause), status: "Answer failed" } : message));
    } finally {
      setSending(false);
    }
  }

  return <main className="workspace chat-workspace">
    <div className="page-heading chat-heading">
      <div><p className="eyebrow">Grounded chat</p><h1>Ask the evidence.</h1><p className="muted">Answers are constrained to evidence authorized for your active account.</p></div>
      <div className="trust-chip"><span /> Permission checked before generation</div>
    </div>

    <div className="chat-layout">
      <section className="chat-thread" aria-label="Conversation">
        {messages.length === 0 && <div className="chat-empty">
          <div className="answer-orb">P</div>
          <h3>Start with a question about Acme.</h3>
          <p>Primer retrieves exact and semantic matches, filters them for this account, and shows the evidence behind its answer.</p>
          <div className="suggestions">{suggestions.map((suggestion) => <button key={suggestion.question} onClick={() => { setProjectId(suggestion.projectId); void ask(suggestion.question, suggestion.projectId); }}>{suggestion.question}<span>→</span></button>)}</div>
        </div>}
        {messages.map((message) => <article className="exchange" key={message.id}>
          <div className="user-message"><span>You</span><p>{message.question}</p></div>
          <div className="assistant-message">
            <div className="assistant-label"><span className="mini-mark">P</span><strong>Primer</strong>{!message.result && !message.error && <em>{message.status}</em>}</div>
            {message.error ? <p className="inline-error">{message.error}</p> : <div className="answer-copy" aria-live="polite">{message.result
              ? <AnswerText text={message.result.answer} onEvidence={(id) => openEvidence(message.result!, id)} />
              : <span className="working-indicator" data-stage={message.stage}><span className="working-pulse" aria-hidden="true" /><span>{message.status}</span></span>}
            </div>}
            {message.result && <>
              <div className="answer-meta"><span className={message.result.citationValidation.valid ? "valid" : "review"}>{message.result.citationValidation.valid ? "Citations valid" : "Review citations"}</span><span>{message.result.evidence.length} evidence records</span><span>{message.result.timingMs.total.toFixed(1)} ms</span><span>{message.result.model}</span></div>
              {message.result.conflicts.length > 0 && <div className="conflict-box"><strong>Conflicting evidence</strong>{message.result.conflicts.map((conflict) => <p key={conflict.text}>{conflict.text} <span>{conflict.evidenceIds.join(", ")}</span></p>)}</div>}
              <div className="evidence-strip">{message.result.evidence.map((evidence) => <button key={evidence.evidenceId} onClick={() => setSelectedEvidence(evidence)}><span>{evidence.evidenceId}</span><strong>{evidence.title}</strong><small>{evidence.source}</small></button>)}</div>
              <details className="trace-details"><summary>Answer and model trace</summary><div className="trace-summary-grid"><div><span>Trace</span><code>{message.result.traceId}</code></div><div><span>Model input</span><strong>{message.result.modelInputEvidenceIds.join(", ") || "No model call"}</strong></div><div><span>Generation</span><strong>{message.result.generationAttempts} attempt{message.result.generationAttempts === 1 ? "" : "s"}</strong></div><div><span>Timing</span><strong>{message.result.timingMs.retrieval.toFixed(1)} ms retrieval · {message.result.timingMs.generation.toFixed(1)} ms generation</strong></div></div></details>
            </>}
          </div>
        </article>)}

        <form className="composer" onSubmit={(event) => { event.preventDefault(); void ask(); }}>
          <label className="project-scope"><span className="sr-only">Project scope</span><select aria-label="Project scope" value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">All projects</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
          <label className="question-field"><span className="sr-only">Ask Primer</span><textarea aria-label="Ask Primer" value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void ask(); } }} placeholder="Ask a question about Acme knowledge…" rows={1} /></label>
          <button className="send-button" disabled={sending || !question.trim()} aria-label="Send question">↑</button>
        </form>
      </section>

      <aside className="evidence-inspector">
        <p className="eyebrow">Evidence inspector</p>
        {selectedEvidence ? <div className="evidence-detail">
          <div className="evidence-id">{selectedEvidence.evidenceId}</div><h3>{selectedEvidence.title}</h3><p className="evidence-excerpt">{selectedEvidence.excerpt}</p>
          <dl><div><dt>Original source</dt><dd><code>{selectedEvidence.sourceRef}</code></dd></div><div><dt>Record</dt><dd><code>{selectedEvidence.recordId}</code></dd></div><div><dt>Updated</dt><dd>{new Date(selectedEvidence.updatedAt).toLocaleString()}</dd></div><div><dt>Authority</dt><dd>{selectedEvidence.authority.toFixed(2)}</dd></div>{selectedEvidence.resolutionState && <div><dt>Resolution</dt><dd>{selectedEvidence.resolutionState}</dd></div>}</dl>
          <div className="reason-list"><strong>Why it was selected</strong>{selectedEvidence.retrievalReasons.map((reason) => <span key={reason}>{reason}</span>)}{selectedEvidence.policyReasons.map((reason) => <span key={`${reason.kind}:${reason.reason}`}>{reason.reason} ({reason.adjustment >= 0 ? "+" : ""}{reason.adjustment.toFixed(3)})</span>)}</div>
        </div> : <div className="empty inspector-empty"><strong>No evidence selected.</strong><span>{latestResult ? "Choose a citation or evidence card." : "Ask a question to inspect its supporting records."}</span></div>}
      </aside>
    </div>
  </main>;
}
