export interface User {
  id: string;
  name: string;
  title: string;
  email: string;
  groupIds: string[];
}

export interface Group { id: string; name: string }
export interface Connector { connectorId: string; sourceFamily: string; processorVersion: string }
export interface Registration {
  id: string;
  connectorId: string;
  sourceFamily: string;
  path: string;
  lastSyncStatus: "never" | "completed" | "failed" | "interrupted";
  lastSyncAt?: string;
  lastError?: string;
}
export interface SourceSummary {
  source_id: string;
  registration_id: string | null;
  source_family: string;
  source_ref: string;
  project_id: string | null;
  accepted: number;
  rejected: number;
  indexed_at: string;
}
export interface SyncRun {
  id: string;
  registrationId: string;
  status: "running" | "completed" | "failed" | "interrupted";
  results: Array<{ status: "indexed" | "replaced" | "unchanged" }>;
  removedSourceIds: string[];
  timingMs: { total: number };
  startedAt: string;
  error?: string;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...options,
    headers: { ...(options.body ? { "content-type": "application/json" } : {}), ...options.headers },
  });
  const body = await response.json() as T & { error?: { message: string } };
  if (!response.ok) throw new Error(body.error?.message ?? `Request failed with ${response.status}`);
  return body;
}

export const api = {
  health: () => request<{ status: string; applicationVersion: string; storageSchemaVersion: number }>("/api/health"),
  accounts: () => request<{ users: User[]; groups: Group[] }>("/api/accounts"),
  session: () => request<{ user: User }>("/api/session"),
  signIn: (userId: string) => request<{ user: User }>("/api/session", { method: "POST", body: JSON.stringify({ userId }) }),
  signOut: () => request<{ signedOut: boolean }>("/api/session", { method: "DELETE" }),
  updateGroups: (userId: string, groupIds: string[]) => request<{ user: User }>(`/api/accounts/${encodeURIComponent(userId)}/groups`, {
    method: "PUT",
    body: JSON.stringify({ groupIds }),
  }),
  connectors: () => request<{ connectors: Connector[] }>("/api/sources/connectors"),
  registrations: () => request<{ registrations: Registration[] }>("/api/sources/registrations"),
  register: (connectorId: string, path: string) => request<{ registration: Registration }>("/api/sources/registrations", {
    method: "POST",
    body: JSON.stringify({ connectorId, path }),
  }),
  synchronize: (id: string) => request<{ runs: SyncRun[] }>(`/api/sources/registrations/${encodeURIComponent(id)}/sync`, { method: "POST" }),
  unregister: (id: string) => request(`/api/sources/registrations/${encodeURIComponent(id)}`, { method: "DELETE" }),
  sources: () => request<{ sources: SourceSummary[] }>("/api/sources"),
  syncs: () => request<{ runs: SyncRun[] }>("/api/syncs"),
};
