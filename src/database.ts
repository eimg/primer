import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import type {
  FixtureUser,
  IndexDecision,
  KnowledgeRecord,
  ProcessedSource,
  SourceRegistration,
  SyncRun,
  RetrievalCandidate,
  RetrievalTrace,
} from "./types.js";
import { nowIso } from "./utils.js";

export interface StoredRecord extends KnowledgeRecord {
  embedding: number[];
  embeddingModel: string;
}

interface SourceRow {
  registration_id: string | null;
  source_family: string;
  source_id: string;
  source_ref: string;
  source_type: string;
  source_version: string;
  project_id: string | null;
  updated_at: string;
  metadata_json: string;
  access_json: string;
  processor_version: string;
  embedding_model: string;
  indexed_at: string;
}

interface RecordRow {
  source_family: string;
  id: string;
  source_id: string;
  source_ref: string;
  source_version: string;
  parent_id: string | null;
  title: string;
  content: string;
  content_checksum: string;
  project_id: string | null;
  updated_at: string;
  authority: number;
  resolution_state: string | null;
  metadata_json: string;
  access_json: string;
  embedding_json: string;
  embedding_model: string;
}

function asRecord(row: RecordRow): StoredRecord {
  const resolutionState = row.resolution_state as StoredRecord["resolutionState"];
  return {
    id: row.id,
    source: row.source_family,
    sourceId: row.source_id,
    sourceRef: row.source_ref,
    sourceVersion: row.source_version,
    ...(row.parent_id ? { parentId: row.parent_id } : {}),
    title: row.title,
    content: row.content,
    contentChecksum: row.content_checksum,
    ...(row.project_id ? { projectId: row.project_id } : {}),
    updatedAt: row.updated_at,
    authority: row.authority,
    ...(resolutionState ? { resolutionState } : {}),
    metadata: JSON.parse(row.metadata_json) as Record<string, unknown>,
    access: JSON.parse(row.access_json) as StoredRecord["access"],
    embedding: JSON.parse(row.embedding_json) as number[],
    embeddingModel: row.embedding_model,
  };
}

export class PrimerDatabase {
  readonly db: Database.Database;

  constructor(databasePath: string) {
    mkdirSync(dirname(databasePath), { recursive: true });
    this.db = new Database(databasePath);
    this.db.pragma("foreign_keys = ON");
    this.db.pragma("journal_mode = WAL");
    this.migrate();
  }

  close(): void {
    this.db.close();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      INSERT INTO schema_meta (key, value) VALUES ('schema_version', '3')
        ON CONFLICT(key) DO UPDATE SET value = excluded.value;

      CREATE TABLE IF NOT EXISTS groups (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        title TEXT NOT NULL,
        email TEXT NOT NULL,
        group_ids_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS source_registrations (
        id TEXT PRIMARY KEY,
        connector_id TEXT NOT NULL,
        source_family TEXT NOT NULL,
        path TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_sync_at TEXT,
        last_sync_status TEXT NOT NULL DEFAULT 'never',
        last_error TEXT,
        UNIQUE(connector_id, path)
      );
      CREATE TABLE IF NOT EXISTS sources (
        source_id TEXT PRIMARY KEY,
        registration_id TEXT,
        source_family TEXT NOT NULL DEFAULT 'markdown',
        source_ref TEXT NOT NULL,
        source_type TEXT NOT NULL,
        source_version TEXT NOT NULL,
        raw_content TEXT NOT NULL,
        project_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        authors_json TEXT NOT NULL,
        metadata_json TEXT NOT NULL,
        access_json TEXT NOT NULL,
        processor_version TEXT NOT NULL,
        embedding_model TEXT NOT NULL,
        indexed_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS records (
        id TEXT PRIMARY KEY,
        source_family TEXT NOT NULL DEFAULT 'markdown',
        source_id TEXT NOT NULL REFERENCES sources(source_id) ON DELETE CASCADE,
        source_ref TEXT NOT NULL,
        source_version TEXT NOT NULL,
        parent_id TEXT,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        content_checksum TEXT NOT NULL,
        project_id TEXT,
        updated_at TEXT NOT NULL,
        authority REAL NOT NULL,
        resolution_state TEXT,
        metadata_json TEXT NOT NULL,
        access_json TEXT NOT NULL,
        embedding_json TEXT NOT NULL,
        embedding_model TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_records_source ON records(source_id);
      CREATE INDEX IF NOT EXISTS idx_records_project ON records(project_id);
      CREATE VIRTUAL TABLE IF NOT EXISTS record_fts USING fts5(
        record_id UNINDEXED,
        title,
        content,
        tokenize = 'unicode61'
      );
      CREATE TABLE IF NOT EXISTS index_decisions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_id TEXT NOT NULL REFERENCES sources(source_id) ON DELETE CASCADE,
        record_id TEXT NOT NULL,
        decision TEXT NOT NULL,
        reason TEXT NOT NULL,
        policy_version TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS traces (
        id TEXT PRIMARY KEY,
        schema_version TEXT NOT NULL,
        user_id TEXT NOT NULL,
        question TEXT NOT NULL,
        project_id TEXT,
        embedding_model TEXT NOT NULL,
        trace_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS evaluation_runs (
        id TEXT PRIMARY KEY,
        schema_version TEXT NOT NULL,
        fixture_id TEXT NOT NULL,
        embedding_model TEXT NOT NULL,
        result_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sync_runs (
        id TEXT PRIMARY KEY,
        registration_id TEXT NOT NULL,
        connector_id TEXT NOT NULL,
        source_family TEXT NOT NULL,
        status TEXT NOT NULL,
        application_version TEXT NOT NULL,
        storage_schema_version INTEGER NOT NULL,
        processor_version TEXT NOT NULL,
        policy_version TEXT NOT NULL,
        embedding_model TEXT NOT NULL,
        result_json TEXT NOT NULL,
        owner_pid INTEGER,
        started_at TEXT NOT NULL,
        completed_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_sync_runs_registration ON sync_runs(registration_id, started_at DESC);
    `);
    this.addColumnIfMissing("sources", "source_family", "TEXT NOT NULL DEFAULT 'markdown'");
    this.addColumnIfMissing("sources", "registration_id", "TEXT");
    this.addColumnIfMissing("records", "source_family", "TEXT NOT NULL DEFAULT 'markdown'");
    this.addColumnIfMissing("sync_runs", "owner_pid", "INTEGER");
    this.db.exec("CREATE INDEX IF NOT EXISTS idx_sources_registration ON sources(registration_id)");
    this.db
      .prepare("INSERT INTO schema_meta (key, value) VALUES ('schema_version', '3') ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run();
    this.markInterruptedSyncRuns();
    this.db.exec(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_runs_active_registration ON sync_runs(registration_id) WHERE status = 'running'",
    );
  }

  private addColumnIfMissing(table: "sources" | "records" | "sync_runs", column: string, definition: string): void {
    const columns = this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (!columns.some((entry) => entry.name === column)) {
      this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }

  private markInterruptedSyncRuns(): void {
    const rows = this.db
      .prepare("SELECT id, registration_id, result_json, started_at, owner_pid FROM sync_runs WHERE status = 'running'")
      .all() as Array<{
      id: string;
      registration_id: string;
      result_json: string;
      started_at: string;
      owner_pid: number | null;
    }>;
    const interruptedRows = rows.filter((row) => {
      if (!row.owner_pid) return true;
      try {
        process.kill(row.owner_pid, 0);
        return false;
      } catch (cause) {
        return (cause as NodeJS.ErrnoException).code === "ESRCH";
      }
    });
    if (interruptedRows.length === 0) return;
    const completedAt = nowIso();
    const updateRun = this.db.prepare(
      "UPDATE sync_runs SET status = 'interrupted', result_json = ?, completed_at = ? WHERE id = ?",
    );
    const updateRegistration = this.db.prepare(
      "UPDATE source_registrations SET last_sync_at = ?, last_sync_status = 'interrupted', last_error = ? WHERE id = ?",
    );
    this.db.transaction(() => {
      for (const row of interruptedRows) {
        const run = JSON.parse(row.result_json) as SyncRun;
        const interrupted: SyncRun = {
          ...run,
          status: "interrupted",
          error: "Synchronization process ended before completion.",
          timingMs: {
            ...run.timingMs,
            total: Math.max(0, Date.parse(completedAt) - Date.parse(row.started_at)),
          },
          completedAt,
        };
        updateRun.run(JSON.stringify(interrupted), completedAt, row.id);
        updateRegistration.run(completedAt, interrupted.error, row.registration_id);
      }
    })();
  }

  registerSource(registration: SourceRegistration): SourceRegistration {
    this.db
      .prepare(
        `INSERT INTO source_registrations (
          id, connector_id, source_family, path, created_at, updated_at, last_sync_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          connector_id=excluded.connector_id, source_family=excluded.source_family,
          path=excluded.path, updated_at=excluded.updated_at`,
      )
      .run(
        registration.id,
        registration.connectorId,
        registration.sourceFamily,
        registration.path,
        registration.createdAt,
        registration.updatedAt,
        registration.lastSyncStatus,
      );
    return this.getSourceRegistration(registration.id)!;
  }

  listSourceRegistrations(): SourceRegistration[] {
    const rows = this.db
      .prepare(
        `SELECT id, connector_id, source_family, path, created_at, updated_at,
          last_sync_at, last_sync_status, last_error
        FROM source_registrations ORDER BY id`,
      )
      .all() as Array<{
      id: string;
      connector_id: string;
      source_family: string;
      path: string;
      created_at: string;
      updated_at: string;
      last_sync_at: string | null;
      last_sync_status: SourceRegistration["lastSyncStatus"];
      last_error: string | null;
    }>;
    return rows.map((row) => ({
      id: row.id,
      connectorId: row.connector_id,
      sourceFamily: row.source_family,
      path: row.path,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      ...(row.last_sync_at ? { lastSyncAt: row.last_sync_at } : {}),
      lastSyncStatus: row.last_sync_status,
      ...(row.last_error ? { lastError: row.last_error } : {}),
    }));
  }

  getSourceRegistration(id: string): SourceRegistration | undefined {
    return this.listSourceRegistrations().find((registration) => registration.id === id);
  }

  listSourceIdsForRegistration(registrationId: string): string[] {
    return (
      this.db.prepare("SELECT source_id FROM sources WHERE registration_id = ? ORDER BY source_id").all(registrationId) as Array<{
        source_id: string;
      }>
    ).map((row) => row.source_id);
  }

  saveSyncRun(run: SyncRun): void {
    this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO sync_runs (
            id, registration_id, connector_id, source_family, status, application_version,
            storage_schema_version, processor_version, policy_version, embedding_model,
            result_json, owner_pid, started_at, completed_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET status=excluded.status, result_json=excluded.result_json,
            completed_at=excluded.completed_at`,
        )
        .run(
          run.id,
          run.registrationId,
          run.connectorId,
          run.sourceFamily,
          run.status,
          run.applicationVersion,
          run.storageSchemaVersion,
          run.processorVersion,
          run.policyVersion,
          run.embeddingModel,
          JSON.stringify(run),
          run.ownerProcessId ?? process.pid,
          run.startedAt,
          run.completedAt ?? null,
        );
      if (run.status !== "running") {
        this.db
          .prepare(
            "UPDATE source_registrations SET last_sync_at = ?, last_sync_status = ?, last_error = ?, updated_at = ? WHERE id = ?",
          )
          .run(run.completedAt ?? nowIso(), run.status, run.error ?? null, nowIso(), run.registrationId);
      }
    })();
  }

  listSyncRuns(registrationId?: string): SyncRun[] {
    const rows = registrationId
      ? (this.db
          .prepare("SELECT result_json FROM sync_runs WHERE registration_id = ? ORDER BY started_at DESC")
          .all(registrationId) as Array<{ result_json: string }>)
      : (this.db.prepare("SELECT result_json FROM sync_runs ORDER BY started_at DESC").all() as Array<{
          result_json: string;
        }>);
    return rows.map((row) => JSON.parse(row.result_json) as SyncRun);
  }

  getSyncRun(id: string): SyncRun | undefined {
    const row = this.db.prepare("SELECT result_json FROM sync_runs WHERE id = ?").get(id) as
      | { result_json: string }
      | undefined;
    return row ? (JSON.parse(row.result_json) as SyncRun) : undefined;
  }

  private deleteSourceRows(sourceIds: string[]): number {
    if (sourceIds.length === 0) return 0;
    const placeholders = sourceIds.map(() => "?").join(",");
    const recordRows = this.db
      .prepare(`SELECT id FROM records WHERE source_id IN (${placeholders})`)
      .all(...sourceIds) as Array<{ id: string }>;
    if (recordRows.length > 0) {
      const recordPlaceholders = recordRows.map(() => "?").join(",");
      this.db
        .prepare(`DELETE FROM record_fts WHERE record_id IN (${recordPlaceholders})`)
        .run(...recordRows.map((row) => row.id));
    }
    this.db.prepare(`DELETE FROM sources WHERE source_id IN (${placeholders})`).run(...sourceIds);
    return recordRows.length;
  }

  removeSource(sourceId: string): { removed: boolean; removedRecords: number } {
    return this.db.transaction(() => {
      const exists = this.db.prepare("SELECT 1 FROM sources WHERE source_id = ?").get(sourceId);
      if (!exists) return { removed: false, removedRecords: 0 };
      return { removed: true, removedRecords: this.deleteSourceRows([sourceId]) };
    })();
  }

  removeRegistration(id: string): { removedSourceIds: string[]; removedRecords: number } | undefined {
    return this.db.transaction(() => {
      const registration = this.db.prepare("SELECT 1 FROM source_registrations WHERE id = ?").get(id);
      if (!registration) return undefined;
      const sourceIds = this.listSourceIdsForRegistration(id);
      const removedRecords = this.deleteSourceRows(sourceIds);
      this.db.prepare("DELETE FROM source_registrations WHERE id = ?").run(id);
      return { removedSourceIds: sourceIds, removedRecords };
    })();
  }

  importIdentities(users: FixtureUser[], groups: Array<{ id: string; name: string }>): void {
    const insertGroup = this.db.prepare("INSERT OR REPLACE INTO groups (id, name) VALUES (?, ?)");
    const insertUser = this.db.prepare(
      "INSERT OR REPLACE INTO users (id, name, title, email, group_ids_json) VALUES (?, ?, ?, ?, ?)",
    );
    this.db.transaction(() => {
      for (const group of groups) insertGroup.run(group.id, group.name);
      for (const user of users) insertUser.run(user.id, user.name, user.title, user.email, JSON.stringify(user.groupIds));
    })();
  }

  listUsers(): FixtureUser[] {
    const rows = this.db
      .prepare("SELECT id, name, title, email, group_ids_json FROM users ORDER BY name")
      .all() as Array<{ id: string; name: string; title: string; email: string; group_ids_json: string }>;
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      title: row.title,
      email: row.email,
      groupIds: JSON.parse(row.group_ids_json) as string[],
    }));
  }

  getUser(id: string): FixtureUser | undefined {
    return this.listUsers().find((user) => user.id === id);
  }

  getSourceVersion(sourceId: string): {
    sourceVersion: string;
    processorVersion: string;
    embeddingModel: string;
    registrationId?: string;
  } | undefined {
    const row = this.db
      .prepare("SELECT source_version, processor_version, embedding_model, registration_id FROM sources WHERE source_id = ?")
      .get(sourceId) as
      | { source_version: string; processor_version: string; embedding_model: string; registration_id: string | null }
      | undefined;
    return row
      ? {
          sourceVersion: row.source_version,
          processorVersion: row.processor_version,
          embeddingModel: row.embedding_model,
          ...(row.registration_id ? { registrationId: row.registration_id } : {}),
        }
      : undefined;
  }

  assignSourceRegistration(sourceId: string, registrationId: string): void {
    this.db.prepare("UPDATE sources SET registration_id = ? WHERE source_id = ?").run(registrationId, sourceId);
  }

  replaceSource(
    processed: ProcessedSource,
    embeddings: number[][],
    embeddingModel: string,
    processorVersion: string,
    registrationId?: string,
  ): void {
    if (processed.records.length !== embeddings.length) throw new Error("Embedding count does not match accepted records");
    const source = processed.source;
    this.db.transaction(() => {
      const existingRecordIds = this.db
        .prepare("SELECT id FROM records WHERE source_id = ?")
        .all(source.sourceId) as Array<{ id: string }>;
      if (existingRecordIds.length > 0) {
        const placeholders = existingRecordIds.map(() => "?").join(",");
        this.db.prepare(`DELETE FROM record_fts WHERE record_id IN (${placeholders})`).run(
          ...existingRecordIds.map((row) => row.id),
        );
      }
      this.db.prepare("DELETE FROM index_decisions WHERE source_id = ?").run(source.sourceId);
      this.db.prepare("DELETE FROM records WHERE source_id = ?").run(source.sourceId);
      this.db
        .prepare(
          `INSERT INTO sources (
            source_id, registration_id, source_family, source_ref, source_type, source_version, raw_content, project_id,
            created_at, updated_at, authors_json, metadata_json, access_json,
            processor_version, embedding_model, indexed_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(source_id) DO UPDATE SET
            registration_id=COALESCE(excluded.registration_id, sources.registration_id),
            source_family=excluded.source_family, source_ref=excluded.source_ref, source_type=excluded.source_type,
            source_version=excluded.source_version, raw_content=excluded.raw_content,
            project_id=excluded.project_id, created_at=excluded.created_at,
            updated_at=excluded.updated_at, authors_json=excluded.authors_json,
            metadata_json=excluded.metadata_json, access_json=excluded.access_json,
            processor_version=excluded.processor_version, embedding_model=excluded.embedding_model,
            indexed_at=excluded.indexed_at`,
        )
        .run(
          source.sourceId,
          registrationId ?? null,
          source.source,
          source.sourceRef,
          source.sourceType,
          processed.sourceVersion,
          source.rawContent,
          source.projectId ?? null,
          source.createdAt,
          source.updatedAt,
          JSON.stringify(source.authors),
          JSON.stringify(source.metadata),
          JSON.stringify(source.access),
          processorVersion,
          embeddingModel,
          nowIso(),
        );

      const insertRecord = this.db.prepare(`INSERT INTO records (
        id, source_family, source_id, source_ref, source_version, parent_id, title, content,
        content_checksum, project_id, updated_at, authority, resolution_state,
        metadata_json, access_json, embedding_json, embedding_model
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      const insertFts = this.db.prepare("INSERT INTO record_fts (record_id, title, content) VALUES (?, ?, ?)");
      processed.records.forEach((record, index) => {
        insertRecord.run(
          record.id,
          record.source,
          record.sourceId,
          record.sourceRef,
          record.sourceVersion,
          record.parentId ?? null,
          record.title,
          record.content,
          record.contentChecksum,
          record.projectId ?? null,
          record.updatedAt,
          record.authority,
          record.resolutionState ?? null,
          JSON.stringify(record.metadata),
          JSON.stringify(record.access),
          JSON.stringify(embeddings[index]),
          embeddingModel,
        );
        insertFts.run(record.id, record.title, record.content);
      });

      const insertDecision = this.db.prepare(
        "INSERT INTO index_decisions (source_id, record_id, decision, reason, policy_version, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      );
      for (const decision of processed.decisions) {
        insertDecision.run(
          decision.sourceId,
          decision.recordId,
          decision.decision,
          decision.reason,
          decision.policyVersion,
          nowIso(),
        );
      }
    })();
  }

  listSources(): Array<SourceRow & { accepted: number; rejected: number }> {
    return this.db
      .prepare(`SELECT s.registration_id, s.source_family, s.source_id, s.source_ref, s.source_type, s.source_version, s.project_id,
          s.updated_at, s.metadata_json, s.access_json, s.processor_version, s.embedding_model, s.indexed_at,
          SUM(CASE WHEN d.decision='accepted' THEN 1 ELSE 0 END) accepted,
          SUM(CASE WHEN d.decision='rejected' THEN 1 ELSE 0 END) rejected
        FROM sources s LEFT JOIN index_decisions d ON d.source_id=s.source_id
        GROUP BY s.source_id ORDER BY s.source_ref`)
      .all() as Array<SourceRow & { accepted: number; rejected: number }>;
  }

  inspectSource(sourceId: string): { source: SourceRow; records: StoredRecord[]; decisions: IndexDecision[] } | undefined {
    const source = this.db.prepare("SELECT * FROM sources WHERE source_id = ?").get(sourceId) as SourceRow | undefined;
    if (!source) return undefined;
    const records = (this.db.prepare("SELECT * FROM records WHERE source_id = ? ORDER BY id").all(sourceId) as RecordRow[]).map(
      asRecord,
    );
    const decisions = this.db
      .prepare("SELECT source_id, record_id, decision, reason, policy_version FROM index_decisions WHERE source_id = ? ORDER BY id")
      .all(sourceId) as Array<{
      source_id: string;
      record_id: string;
      decision: IndexDecision["decision"];
      reason: string;
      policy_version: string;
    }>;
    return {
      source,
      records,
      decisions: decisions.map((row) => ({
        sourceId: row.source_id,
        recordId: row.record_id,
        decision: row.decision,
        reason: row.reason,
        policyVersion: row.policy_version,
      })),
    };
  }

  listRecords(): StoredRecord[] {
    return (this.db.prepare("SELECT * FROM records ORDER BY id").all() as RecordRow[]).map(asRecord);
  }

  lexicalSearch(recordIds: string[], query: string, limit: number): RetrievalCandidate[] {
    const stopwords = new Set([
      "a", "an", "and", "are", "as", "at", "be", "by", "can", "did", "do", "does", "for", "from", "how",
      "in", "is", "it", "of", "on", "or", "the", "to", "use", "uses", "was", "what", "when", "where", "which",
      "who", "why", "with",
    ]);
    const terms = (query.toLowerCase().match(/[a-z0-9_]+/g) ?? []).filter((term) => !stopwords.has(term));
    if (recordIds.length === 0 || terms.length === 0) return [];
    const match = [...new Set(terms)].map((term) => `"${term.replaceAll('"', '""')}"`).join(" OR ");
    const placeholders = recordIds.map(() => "?").join(",");
    const rows = this.db
      .prepare(`SELECT r.id record_id, r.title, r.source_ref, r.project_id, bm25(record_fts) raw_score
        FROM record_fts JOIN records r ON r.id=record_fts.record_id
        WHERE record_fts MATCH ? AND r.id IN (${placeholders})
        ORDER BY raw_score LIMIT ?`)
      .all(match, ...recordIds, limit) as Array<{
      record_id: string;
      title: string;
      source_ref: string;
      project_id: string | null;
      raw_score: number;
    }>;
    return rows.map((row, index) => ({
      recordId: row.record_id,
      title: row.title,
      sourceRef: row.source_ref,
      ...(row.project_id ? { projectId: row.project_id } : {}),
      rank: index + 1,
      score: -row.raw_score,
      reason: `FTS match for ${terms.slice(0, 6).join(", ")}`,
    }));
  }

  saveTrace(trace: RetrievalTrace): void {
    this.db
      .prepare(
        "INSERT INTO traces (id, schema_version, user_id, question, project_id, embedding_model, trace_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        trace.traceId,
        trace.schemaVersion,
        trace.userId,
        trace.question,
        trace.projectId ?? null,
        trace.embeddingModel,
        JSON.stringify(trace),
        trace.createdAt,
      );
  }

  getTrace(id: string): RetrievalTrace | undefined {
    const row = this.db.prepare("SELECT trace_json FROM traces WHERE id = ?").get(id) as { trace_json: string } | undefined;
    return row ? (JSON.parse(row.trace_json) as RetrievalTrace) : undefined;
  }

  listTraces(): Array<{
    id: string;
    schemaVersion: string;
    userId: string;
    question: string;
    projectId?: string;
    embeddingModel: string;
    createdAt: string;
  }> {
    const rows = this.db
      .prepare(
        "SELECT id, schema_version, user_id, question, project_id, embedding_model, created_at FROM traces ORDER BY created_at DESC",
      )
      .all() as Array<{
      id: string;
      schema_version: string;
      user_id: string;
      question: string;
      project_id: string | null;
      embedding_model: string;
      created_at: string;
    }>;
    return rows.map((row) => ({
      id: row.id,
      schemaVersion: row.schema_version,
      userId: row.user_id,
      question: row.question,
      ...(row.project_id ? { projectId: row.project_id } : {}),
      embeddingModel: row.embedding_model,
      createdAt: row.created_at,
    }));
  }

  saveEvaluationRun(
    id: string,
    fixtureId: string,
    embeddingModel: string,
    schemaVersion: string,
    result: unknown,
  ): void {
    this.db
      .prepare(
        "INSERT INTO evaluation_runs (id, schema_version, fixture_id, embedding_model, result_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(id, schemaVersion, fixtureId, embeddingModel, JSON.stringify(result), nowIso());
  }

  listEvaluationRuns(): Array<{
    id: string;
    schemaVersion: string;
    fixtureId: string;
    embeddingModel: string;
    createdAt: string;
  }> {
    const rows = this.db
      .prepare("SELECT id, schema_version, fixture_id, embedding_model, created_at FROM evaluation_runs ORDER BY created_at DESC")
      .all() as Array<{
      id: string;
      schema_version: string;
      fixture_id: string;
      embedding_model: string;
      created_at: string;
    }>;
    return rows.map((row) => ({
      id: row.id,
      schemaVersion: row.schema_version,
      fixtureId: row.fixture_id,
      embeddingModel: row.embedding_model,
      createdAt: row.created_at,
    }));
  }

  getEvaluationRun(id: string): unknown | undefined {
    const row = this.db.prepare("SELECT result_json FROM evaluation_runs WHERE id = ?").get(id) as
      | { result_json: string }
      | undefined;
    return row ? (JSON.parse(row.result_json) as unknown) : undefined;
  }
}
