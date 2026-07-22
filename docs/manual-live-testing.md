# Primer manual live-testing runbook

**Status:** Phase 7 handoff procedure. Development is paused after this gate so the current local product can be exercised with configured OpenRouter models before Phase 8 is considered.

## Purpose

This runbook verifies the system as a user and operator, not only as an automated test suite. It uses the fictional Acme fixture and independently configured OpenRouter embedding and chat models. It does not connect Primer to real email, CRM, HRM, Slack, Teams, Acme Issues, or Helix data.

Record the Git commit, model IDs, readiness run IDs, notable traces, screenshots, and human-review notes. Compare later runs only when the fixture and model configuration are compatible.

## 1. Freeze and protect the test state

Confirm the checkout and automated gate:

```bash
git status --short --branch
git log -1 --oneline
npm install
npm run verify
npm run readiness:offline
```

The tree should be clean before manual results are attributed to a commit. `readiness:offline` is isolated under `.primer/readiness-offline` and must pass deterministically. Warnings for semantic review are expected; failed checks are not.

If an existing live-readiness database matters, back it up before another session. Choose a new destination each time because Primer refuses to overwrite a backup:

```bash
npm run dev:readiness:live -- data backup .primer/backups/readiness-live-before-test.db
```

Stop any Primer process before manually replacing or restoring a database file. Prefer retaining the old directory and choosing a new `PRIMER_DATA_DIR` over deleting state.

## 2. Verify live configuration

The `.env` file must provide `OPENROUTER_API_KEY`, `PRIMER_EMBEDDING_MODEL`, and `PRIMER_CHAT_MODEL`. Primer diagnostics report configuration presence and model IDs but never the key:

```bash
npm run dev:readiness:live -- config show
npm run dev:readiness:live -- diagnostics
```

Do not paste `.env`, the API key, cookies, or raw SQLite files into test notes.

## 3. Run the live readiness gates

Retrieval-only readiness performs live embeddings but no answer generation:

```bash
npm run readiness:live:retrieval
```

The full gate is an explicit paid/network run. It synchronizes both managed local sources and evaluates retrieval plus all eligible grounded-answer cases:

```bash
npm run readiness:live
```

Required automated outcomes:

- SQLite integrity is `ok`, with zero foreign-key violations;
- both registrations completed with no failed or interrupted status;
- mean union recall is at least 95%;
- mean evidence recall is at least 90%;
- every permission case is safe;
- every answer has valid citation identity and is permission-safe;
- the full-abstention case is correct;
- every deterministic behavior rule passes; and
- mean answer-point screening coverage is at least 60%.

Semantic-review warnings are a queue for the human review below, not proof of failure or correctness.

## 4. Run the integrated product

For the built application on one local origin:

```bash
npm run build
npm run dev:api
```

Open [http://127.0.0.1:4318](http://127.0.0.1:4318). During UI development only, `npm run dev:full` may be used instead.

Verify desktop and narrow responsive layouts with the browser console open. There should be no uncaught errors, credential exposure, or broken requests.

## 5. Manual journeys

### Grounded answer and evidence

Sign in as Maya, scope to ClientCore, and ask:

> What does CC_IMPORT_017 mean, and when does it occur?

Confirm that the blinking working indicator advances through planning, each numbered search pass, fusion, generation, and citation validation. Confirm that the answer is a live chat-model response, citations open the exact evidence, source references and timestamps are visible, and the saved retrieval trace records the bounded query plan, per-query lexical/semantic candidates, fused ranking, and evidence. A normal live answer now uses one planning model call plus the grounded-answer call and may use one additional repair call.

### Access differential

As Maya, scope to TalentFlow and ask:

> What is planned for TalentFlow compensation analytics?

The system should abstain without revealing the restricted leadership proposal. Switch to Priya and ask the identical question. Priya should receive the authorized proposal with citations. Returning to Maya must not expose Priya's answer, evidence, or trace.

### Conflict and uncertainty

Ask a case that has maintained and superseded or informal evidence. Confirm that status, authority, freshness, and conflicts remain visible and that a polished answer does not conceal contradictory evidence.

### Insufficient evidence

Ask:

> What is Acme's approved quantum-computing migration date?

Confirm an explicit insufficient-evidence response with no invented facts or citations.

### Content lifecycle

Do not edit the packaged fixture for this journey. Copy one Markdown source into a disposable directory, register that directory, synchronize it, edit a statement, synchronize again, then remove the copied file and synchronize once more. Confirm indexed, replaced, unchanged, and removed outcomes and verify that removed content disappears from retrieval.

### Account and session boundary

Change Maya's effective groups, verify the expected evidence difference, then restore the original groups. Sign out and confirm operational API routes require a new session. Browser requests must not carry an actor ID that overrides the active server session.

### Inspection and evaluation

Open saved retrieval traces and both persisted evaluation types. Confirm that the web values match their CLI/API run, model, timing, and evidence details rather than being recalculated in the browser.

## 6. API smoke test

Use a local cookie jar rather than copying the cookie into notes:

```bash
curl -sS http://127.0.0.1:4318/api/health
curl -sS http://127.0.0.1:4318/api/config
curl -sS -c /tmp/primer-cookie.txt \
  -H 'content-type: application/json' \
  -d '{"userId":"u-maya"}' \
  http://127.0.0.1:4318/api/session
curl -sS -b /tmp/primer-cookie.txt http://127.0.0.1:4318/api/sources
```

Confirm that an operational route without the cookie returns a categorized authorization error, invalid JSON returns a categorized request error, and `/api/config` contains no API key.

## 7. Record the outcome

Capture:

- commit and fixture version;
- embedding and chat model IDs;
- readiness pass/fail checks and evaluation run IDs;
- token use and timing from the live answer run;
- cases requiring semantic review and the reviewer decision;
- account-differential and abstention results;
- content-lifecycle result;
- browser sizes, screenshots, and console/network errors; and
- any issue with exact reproduction steps and relevant trace or sync ID.

Do not silently tune prompts, thresholds, fixture expectations, or permissions during this pause. Record an issue first so a later development phase can distinguish product defects from changed evaluation assumptions.

## Pause exit rule

Phase 8 does not begin merely because the automated gate passes. Resume development only after manual live testing is accepted and a concrete next scope is chosen. Real connectors remain independently developed external components; Primer continues to use local data during this pause.
