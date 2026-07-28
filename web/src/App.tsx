import { useEffect, useState } from "react";
import { api, type Connector, type Group, type Principal, type Project, type Registration, type SourceSummary, type SyncRun, type User } from "./api";
import { ChatView } from "./ChatView";
import { InspectionView } from "./InspectionView";

const defaultPath = "sample-data/acme/sources/markdown";

function initials(name: string): string {
  return name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function formatDate(value?: string): string {
  if (!value) return "Not synchronized";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function App() {
  const [users, setUsers] = useState<User[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeUser, setActiveUser] = useState<User>();
  const [principal, setPrincipal] = useState<Principal>();
  const [managedUserId, setManagedUserId] = useState<string>();
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [sources, setSources] = useState<SourceSummary[]>([]);
  const [runs, setRuns] = useState<SyncRun[]>([]);
  const [connectorId, setConnectorId] = useState("markdown-local");
  const [path, setPath] = useState(defaultPath);
  const [busy, setBusy] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [error, setError] = useState<string>();
  const [apiStatus, setApiStatus] = useState("Connecting");
  const [view, setView] = useState<"chat" | "content" | "inspect">("chat");
  const [authProvider, setAuthProvider] = useState<"standalone" | "acme-identity">("standalone");
  const [canManage, setCanManage] = useState(false);
  const membershipUser = users.find((user) => user.id === managedUserId) ?? activeUser;

  async function loadAccounts() {
    const accountData = await api.accounts();
    setUsers(accountData.users);
    setGroups(accountData.groups);
    setProjects(accountData.projects);
    setCanManage(accountData.canManage);
  }

  async function loadPublic() {
    const [health, config] = await Promise.all([api.health(), api.config()]);
    setApiStatus(`API ${health.applicationVersion} · schema ${health.storageSchemaVersion}`);
    setAuthProvider(config.authProvider);
    try {
      const current = await api.session();
      setPrincipal(current.principal);
      setActiveUser(current.user);
      setSelectedGroups(current.user?.groupIds ?? []);
      setCanManage(current.canManage);
      await loadAccounts();
    } catch {
      setPrincipal(undefined);
      setActiveUser(undefined);
      if (config.authProvider === "standalone") await loadAccounts();
    }
  }

  async function loadOperations() {
    const [connectorData, registrationData, sourceData, syncData] = await Promise.all([
      api.connectors(), api.registrations(), api.sources(), api.syncs(),
    ]);
    setConnectors(connectorData.connectors);
    setRegistrations(registrationData.registrations);
    setSources(sourceData.sources);
    setRuns(syncData.runs);
  }

  useEffect(() => {
    void loadPublic().catch((cause: Error) => setError(cause.message));
  }, []);

  useEffect(() => {
    if (principal && canManage) void loadOperations().catch((cause: Error) => setError(cause.message));
  }, [principal?.id, canManage]);

  useEffect(() => {
    const target = canManage
      ? users.find((user) => user.id === managedUserId) ?? activeUser ?? users.find((user) => user.id !== "u-bot")
      : activeUser;
    setManagedUserId(target?.id);
    setSelectedGroups(target?.groupIds ?? []);
  }, [users, activeUser?.id, canManage, managedUserId]);

  useEffect(() => {
    if (principal && !activeUser && canManage) setView("content");
  }, [principal?.id, activeUser?.id, canManage]);

  async function act(key: string, action: () => Promise<void>, success: string) {
    setBusy(key);
    setError(undefined);
    setNotice(undefined);
    try {
      await action();
      setNotice(success);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(undefined);
    }
  }

  async function signIn(userId: string) {
    await act("session", async () => {
      await api.signIn({ userId });
      const result = await api.session();
      setPrincipal(result.principal);
      setActiveUser(result.user);
      setSelectedGroups(result.user?.groupIds ?? []);
      setCanManage(result.canManage);
      await loadAccounts();
    }, "Active account changed.");
  }

  async function identitySignIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await act("session", async () => {
      await api.signIn({
        username: String(form.get("username") ?? ""),
        password: String(form.get("password") ?? ""),
      });
      const result = await api.session();
      setPrincipal(result.principal);
      setActiveUser(result.user);
      setSelectedGroups(result.user?.groupIds ?? []);
      setCanManage(result.canManage);
      await loadAccounts();
    }, "Signed in.");
  }

  async function saveMembership() {
    if (!membershipUser) return;
    await act("membership", async () => {
      const result = await api.updateGroups(membershipUser.id, selectedGroups);
      if (activeUser?.id === result.user.id) setActiveUser(result.user);
      setUsers((current) => current.map((user) => user.id === result.user.id ? result.user : user));
    }, "Effective access updated.");
  }

  async function registerSource(event: React.FormEvent) {
    event.preventDefault();
    await act("register", async () => {
      await api.register(connectorId, path);
      await loadOperations();
    }, "Content source registered. Synchronize it when ready.");
  }

  async function synchronize(registration: Registration) {
    await act(`sync:${registration.id}`, async () => {
      await api.synchronize(registration.id);
      await loadOperations();
    }, `${registration.sourceFamily} content synchronized.`);
  }

  async function unregister(registration: Registration) {
    if (!window.confirm(`Remove ${registration.path} and all of its derived records?`)) return;
    await act(`remove:${registration.id}`, async () => {
      await api.unregister(registration.id);
      await loadOperations();
    }, "Registration and derived content removed; synchronization history was preserved.");
  }

  if (!principal) {
    return <main className="signin-shell">
      <section className="signin-card">
        <div className="brand-mark">P</div>
        <p className="eyebrow">Primer knowledge operations</p>
        <h1>{authProvider === "standalone" ? "Choose your working identity" : "Sign in to Primer"}</h1>
        <p className="muted">Your active account determines which evidence Primer may retrieve and display.</p>
        {authProvider === "standalone" ? <div className="people-grid">
          {users.filter((user) => user.id !== "u-bot").map((user) => <button className="person" key={user.id} onClick={() => void signIn(user.id)} disabled={busy === "session"}>
            <span className="avatar">{initials(user.name)}</span>
            <span><strong>{user.name}</strong><small>{user.title}</small></span>
            <span className="arrow">→</span>
          </button>)}
        </div> : <form className="identity-form" onSubmit={(event) => void identitySignIn(event)}>
          <label><span>Username</span><input name="username" autoComplete="username" autoFocus required /></label>
          <label><span>Password</span><input name="password" type="password" autoComplete="current-password" required /></label>
          <button className="primary full" disabled={busy === "session"}>{busy === "session" ? "Signing in…" : "Sign in"}</button>
        </form>}
        {error && <p className="alert error">{error}</p>}
        <p className="api-status"><span />{apiStatus}</p>
      </section>
    </main>;
  }

  if (!activeUser && !canManage) {
    return <main className="signin-shell"><section className="signin-card">
      <div className="brand-mark">P</div>
      <p className="eyebrow">Primer knowledge authorization</p>
      <h1>No knowledge actor mapping</h1>
      <p className="muted">{principal.displayName} is authenticated, but this account does not map to a Primer actor. No knowledge has been exposed.</p>
      <button className="primary" onClick={() => void act("signout", async () => { await api.signOut(); setPrincipal(undefined); }, "Signed out.")}>Sign out</button>
    </section></main>;
  }

  return <div className="app-shell">
    <header>
      <div className="brand"><span className="brand-mark small">P</span><div><strong>Primer</strong><small>Knowledge operations</small></div></div>
      <nav className="primary-nav" aria-label="Primary navigation">{activeUser && <button className={view === "chat" ? "active" : ""} onClick={() => setView("chat")}>Chat</button>}{canManage && <button className={view === "content" ? "active" : ""} onClick={() => setView("content")}>Content</button>}{activeUser && <button className={view === "inspect" ? "active" : ""} onClick={() => setView("inspect")}>Inspect</button>}</nav>
      <button className="account-chip" onClick={() => void act("signout", async () => { await api.signOut(); setPrincipal(undefined); setActiveUser(undefined); }, "Signed out.")}>
        <span className="avatar compact">{initials(activeUser?.name ?? principal.displayName)}</span><span><strong>{activeUser?.name ?? principal.displayName}</strong><small>{authProvider === "standalone" ? "Switch account" : "Sign out"}</small></span>
      </button>
    </header>

    <aside>
      <p className="eyebrow">Authenticated principal</p>
      <h2>{principal.displayName}</h2>
      <p className="muted compact-copy">{principal.roles.join(", ") || principal.kind}</p>
      {canManage && users.length > 0 && <label className="actor-select"><span>Manage knowledge actor</span><select value={membershipUser?.id ?? ""} onChange={(event) => setManagedUserId(event.target.value)}>{users.filter((user) => user.id !== "u-bot").map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label>}
      {!activeUser && <p className="hint management-only">No Primer knowledge actor is mapped to this account. Management is available, but chat and actor-scoped traces remain blocked.</p>}
      <div className="section-heading"><span>Effective groups</span><span>{selectedGroups.length}</span></div>
      <div className="group-list">
        {groups.map((group) => <label key={group.id} className={selectedGroups.includes(group.id) ? "checked" : ""}>
          <input type="checkbox" disabled={!canManage} checked={selectedGroups.includes(group.id)} onChange={(event) => setSelectedGroups((current) => event.target.checked ? [...current, group.id] : current.filter((id) => id !== group.id))} />
          <span>{group.name}</span>
        </label>)}
      </div>
      {canManage && membershipUser && <button className="primary full" onClick={() => void saveMembership()} disabled={busy === "membership" || JSON.stringify([...selectedGroups].sort()) === JSON.stringify([...membershipUser.groupIds].sort())}>
        {busy === "membership" ? "Saving…" : "Save access"}
      </button>}
      <p className="hint">{canManage ? "Membership changes immediately alter permission-aware retrieval for this account." : "Knowledge membership is managed separately from your suite role."}</p>
      <p className="sidebar-status"><span className="status-dot" />{apiStatus}</p>
    </aside>

    {view === "chat" && activeUser && <ChatView key={`${activeUser.id}:${activeUser.groupIds.join(",")}`} projects={projects} />}
    {view === "inspect" && activeUser && <InspectionView key={activeUser.id} />}
    {view === "content" && <main className="workspace">
      <div className="page-heading">
        <div><p className="eyebrow">Content operations</p><h1>Sources you can account for.</h1><p className="muted">Register authoritative locations, synchronize their derived records, and inspect every lifecycle outcome.</p></div>
        <div className="metric-row"><div><strong>{registrations.length}</strong><span>Registrations</span></div><div><strong>{sources.length}</strong><span>Indexed sources</span></div><div><strong>{runs.length}</strong><span>Sync runs</span></div></div>
      </div>

      {(notice || error) && <div className={`alert ${error ? "error" : "success"}`}>{error ?? notice}<button onClick={() => { setError(undefined); setNotice(undefined); }}>×</button></div>}

      <section className="panel register-panel">
        <div><p className="eyebrow">Add knowledge</p><h3>Register a source location</h3></div>
        <form onSubmit={(event) => void registerSource(event)}>
          <label><span>Connector</span><select value={connectorId} onChange={(event) => setConnectorId(event.target.value)}>{connectors.filter((connector) => connector.transport === "local").map((connector) => <option key={connector.connectorId} value={connector.connectorId}>{connector.connectorId} · {connector.sourceFamily}</option>)}</select></label>
          <label className="path-field"><span>Local path</span><input value={path} onChange={(event) => setPath(event.target.value)} placeholder="/path/to/knowledge" /></label>
          <button className="primary" disabled={busy === "register"}>{busy === "register" ? "Registering…" : "Register source"}</button>
        </form>
      </section>

      <section className="content-grid">
        <div>
          <div className="list-heading"><div><p className="eyebrow">Managed content</p><h3>Registrations</h3></div><span>{registrations.length}</span></div>
          <div className="registration-list">
            {registrations.length === 0 && <div className="empty"><strong>No registered content yet.</strong><span>Add a source location above; nothing is indexed until you synchronize it.</span></div>}
            {registrations.map((registration) => <article className="registration-card" key={registration.id}>
              <div className="source-icon">{registration.sourceFamily === "markdown" ? "MD" : "SL"}</div>
              <div className="registration-copy"><div className="title-line"><strong>{registration.path.split("/").at(-1) || registration.sourceFamily}</strong><span className={`pill ${registration.lastSyncStatus}`}>{registration.lastSyncStatus}</span></div><code>{registration.path}</code><small>{registration.connectorId} · {formatDate(registration.lastSyncAt)}</small>{registration.lastError && <span className="inline-error">{registration.lastError}</span>}</div>
              <div className="card-actions"><button className="secondary" onClick={() => void synchronize(registration)} disabled={Boolean(busy)}>{busy === `sync:${registration.id}` ? "Syncing…" : "Synchronize"}</button><button className="icon-button" aria-label={`Remove ${registration.path}`} onClick={() => void unregister(registration)} disabled={Boolean(busy)}>×</button></div>
            </article>)}
          </div>
        </div>

        <div>
          <div className="list-heading"><div><p className="eyebrow">Recent activity</p><h3>Synchronization</h3></div><span>{runs.length}</span></div>
          <div className="timeline">
            {runs.slice(0, 8).map((run) => <article key={run.id}><span className={`timeline-dot ${run.status}`} /><div><strong>{run.status === "completed" ? "Synchronization completed" : `Synchronization ${run.status}`}</strong><small>{formatDate(run.startedAt)} · {run.timingMs.total.toFixed(1)} ms</small><p>{run.results.filter((item) => item.status === "indexed").length} indexed · {run.results.filter((item) => item.status === "replaced").length} replaced · {run.results.filter((item) => item.status === "unchanged").length} unchanged · {run.removedSourceIds.length} removed</p></div></article>)}
            {runs.length === 0 && <div className="empty small-empty"><span>No synchronization activity yet.</span></div>}
          </div>
        </div>
      </section>

      <section className="panel source-table-panel">
        <div className="list-heading"><div><p className="eyebrow">Derived index</p><h3>Indexed sources</h3></div><span>{sources.length}</span></div>
        <div className="table-wrap"><table><thead><tr><th>Source</th><th>Family</th><th>Project</th><th>Records</th><th>Indexed</th></tr></thead><tbody>{sources.map((source) => <tr key={source.source_id}><td><strong>{source.source_id}</strong><small>{source.source_ref}</small></td><td><span className="family">{source.source_family}</span></td><td>{source.project_id ?? "Shared"}</td><td>{source.accepted} accepted{source.rejected ? ` · ${source.rejected} rejected` : ""}</td><td>{formatDate(source.indexed_at)}</td></tr>)}</tbody></table>{sources.length === 0 && <div className="empty table-empty"><span>Synchronize a registration to populate the derived index.</span></div>}</div>
      </section>
    </main>}
  </div>;
}
