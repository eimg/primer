import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { SlackExportConnector } from "./connectors/slack-export.js";
import { processMarkdownFile } from "./markdown.js";
import { SlackThreadProcessor } from "./slack.js";
import type { FixtureUser, Project, ValidationIssue, ValidationReport } from "./types.js";

interface FixtureManifest {
  datasetId: string;
  projects: string[];
  inventory: Record<string, number>;
}

interface Group {
  id: string;
  name: string;
}

interface EvaluationCase {
  id: string;
  question: string;
  userId: string;
  projectId?: string;
  expectedRecordIds: string[];
  expectedCodeContextRefs?: string[];
  forbiddenRecordIds?: string[];
}

interface CodeContextReference {
  refId: string;
  sourceRef: string;
  projectId: string;
  allowedGroupIds: string[];
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function walk(root: string, predicate: (path: string) => boolean): Promise<string[]> {
  if (!existsSync(root)) return [];
  const output: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) output.push(...(await walk(path, predicate)));
    else if (entry.isFile() && predicate(path)) output.push(path);
  }
  return output.sort();
}

function error(issues: ValidationIssue[], path: string, message: string): void {
  issues.push({ severity: "error", path, message });
}

function warning(issues: ValidationIssue[], path: string, message: string): void {
  issues.push({ severity: "warning", path, message });
}

export async function loadFixtureIdentities(fixtureDir: string): Promise<{ users: FixtureUser[]; groups: Group[] }> {
  const users = await readJson<FixtureUser[]>(join(fixtureDir, "organization", "users.json"));
  const groups = await readJson<Group[]>(join(fixtureDir, "organization", "groups.json"));
  return { users, groups };
}

export async function loadFixtureProjects(fixtureDir: string): Promise<Project[]> {
  return readJson<Project[]>(join(fixtureDir, "organization", "projects.json"));
}

export async function markdownFixtureFiles(fixtureDir: string): Promise<string[]> {
  return walk(join(fixtureDir, "sources", "markdown"), (path) => path.endsWith(".md"));
}

export async function validateFixture(fixtureDir: string): Promise<ValidationReport> {
  const issues: ValidationIssue[] = [];
  const counts: Record<string, number> = {};
  const rel = (path: string) => relative(fixtureDir, path) || ".";
  const required = [
    "manifest.json",
    "organization/users.json",
    "organization/groups.json",
    "organization/projects.json",
    "evaluation/cases.json",
    "evaluation/record-index.json",
    "evaluation/code-context-index.json",
    "ground-truth/claims.json",
    "ground-truth/events.json",
  ];
  for (const requiredPath of required) {
    if (!existsSync(join(fixtureDir, requiredPath))) error(issues, requiredPath, "required fixture file is missing");
  }
  if (issues.length > 0) return { valid: false, counts, issues };

  let manifest: FixtureManifest;
  let users: FixtureUser[];
  let groups: Group[];
  let projects: Project[];
  let cases: EvaluationCase[];
  let recordIndex: Array<{ recordId: string }>;
  let codeContextIndex: CodeContextReference[];
  try {
    manifest = await readJson<FixtureManifest>(join(fixtureDir, "manifest.json"));
    ({ users, groups } = await loadFixtureIdentities(fixtureDir));
    projects = await readJson<Project[]>(join(fixtureDir, "organization", "projects.json"));
    cases = await readJson<EvaluationCase[]>(join(fixtureDir, "evaluation", "cases.json"));
    recordIndex = await readJson<Array<{ recordId: string }>>(join(fixtureDir, "evaluation", "record-index.json"));
    codeContextIndex = await readJson<CodeContextReference[]>(
      join(fixtureDir, "evaluation", "code-context-index.json"),
    );
  } catch (cause) {
    error(issues, ".", `fixture JSON could not be parsed: ${cause instanceof Error ? cause.message : String(cause)}`);
    return { valid: false, counts, issues };
  }

  counts.users = users.length;
  counts.groups = groups.length;
  counts.projects = projects.length;
  counts.retrievalCases = cases.length;
  const groupIds = new Set(groups.map((group) => group.id));
  const userIds = new Set(users.map((user) => user.id));
  const projectIds = new Set(projects.map((project) => project.id));
  const recordIds = new Set(recordIndex.map((record) => record.recordId));
  const codeContextRefIds = new Set(codeContextIndex.map((reference) => reference.refId));
  if (recordIds.size !== recordIndex.length) error(issues, "evaluation/record-index.json", "record IDs must be unique");
  if (codeContextRefIds.size !== codeContextIndex.length) {
    error(issues, "evaluation/code-context-index.json", "code-context reference IDs must be unique");
  }
  for (const reference of codeContextIndex) {
    if (!reference.refId.startsWith("git:")) {
      error(issues, "evaluation/code-context-index.json", `${reference.refId} must use the git: reference prefix`);
    }
    if (!projectIds.has(reference.projectId)) {
      error(issues, "evaluation/code-context-index.json", `${reference.refId} references unknown project ${reference.projectId}`);
    }
    for (const groupId of reference.allowedGroupIds) {
      if (!groupIds.has(groupId)) {
        error(issues, "evaluation/code-context-index.json", `${reference.refId} references unknown group ${groupId}`);
      }
    }
    if (!existsSync(join(fixtureDir, reference.sourceRef))) {
      error(issues, "evaluation/code-context-index.json", `${reference.refId} references missing path ${reference.sourceRef}`);
    }
  }

  for (const user of users) {
    for (const groupId of user.groupIds) {
      if (!groupIds.has(groupId)) error(issues, "organization/users.json", `${user.id} references unknown group ${groupId}`);
    }
  }
  for (const project of projects) {
    if (!groupIds.has(project.defaultGroupId)) {
      error(issues, "organization/projects.json", `${project.id} references unknown group ${project.defaultGroupId}`);
    }
  }
  for (const projectId of manifest.projects) {
    if (!projectIds.has(projectId)) error(issues, "manifest.json", `manifest references unknown project ${projectId}`);
  }

  const markdownFiles = await markdownFixtureFiles(fixtureDir);
  counts.markdownDocuments = markdownFiles.length;
  const derivedMarkdownIds = new Set<string>();
  for (const file of markdownFiles) {
    try {
      const processed = await processMarkdownFile(file, fixtureDir);
      if (processed.source.projectId && !projectIds.has(processed.source.projectId)) {
        error(issues, rel(file), `references unknown project ${processed.source.projectId}`);
      }
      for (const groupId of processed.source.access.allowedGroupIds) {
        if (!groupIds.has(groupId)) error(issues, rel(file), `references unknown group ${groupId}`);
      }
      for (const userId of processed.source.access.allowedUserIds) {
        if (!userIds.has(userId)) error(issues, rel(file), `references unknown user ${userId}`);
      }
      for (const decision of processed.decisions) derivedMarkdownIds.add(decision.recordId);
    } catch (cause) {
      error(issues, rel(file), cause instanceof Error ? cause.message : String(cause));
    }
  }

  const derivedSlackIds = new Set<string>();
  try {
    const connector = new SlackExportConnector(fixtureDir);
    const processor = new SlackThreadProcessor();
    for (const item of await connector.read()) {
      for (const processed of await processor.process(item)) {
        if (processed.source.projectId && !projectIds.has(processed.source.projectId)) {
          error(issues, processed.source.sourceRef, `references unknown project ${processed.source.projectId}`);
        }
        for (const groupId of processed.source.access.allowedGroupIds) {
          if (!groupIds.has(groupId)) error(issues, processed.source.sourceRef, `references unknown group ${groupId}`);
        }
        for (const userId of processed.source.access.allowedUserIds) {
          if (!userIds.has(userId)) error(issues, processed.source.sourceRef, `references unknown user ${userId}`);
        }
        for (const decision of processed.decisions) derivedSlackIds.add(decision.recordId);
      }
    }
  } catch (cause) {
    error(issues, "sources/slack", cause instanceof Error ? cause.message : String(cause));
  }

  for (const evaluation of cases) {
    if (!userIds.has(evaluation.userId)) {
      error(issues, "evaluation/cases.json", `${evaluation.id} references unknown user ${evaluation.userId}`);
    }
    if (evaluation.projectId && !projectIds.has(evaluation.projectId)) {
      error(issues, "evaluation/cases.json", `${evaluation.id} references unknown project ${evaluation.projectId}`);
    }
    for (const recordId of [...evaluation.expectedRecordIds, ...(evaluation.forbiddenRecordIds ?? [])]) {
      if (recordId.startsWith("git:")) {
        error(
          issues,
          "evaluation/cases.json",
          `${evaluation.id} must place Git references in expectedCodeContextRefs, not Primer record IDs`,
        );
      }
      if (!recordIds.has(recordId)) {
        error(issues, "evaluation/cases.json", `${evaluation.id} references missing record-index ID ${recordId}`);
      }
      if (recordId.startsWith("md:") && !derivedMarkdownIds.has(recordId)) {
        error(issues, "evaluation/cases.json", `${evaluation.id} references Markdown ID not produced by the processor: ${recordId}`);
      }
      if (recordId.startsWith("slack:") && !derivedSlackIds.has(recordId)) {
        error(issues, "evaluation/cases.json", `${evaluation.id} references Slack ID not produced by the processor: ${recordId}`);
      }
    }
    for (const refId of evaluation.expectedCodeContextRefs ?? []) {
      if (!codeContextRefIds.has(refId)) {
        error(issues, "evaluation/cases.json", `${evaluation.id} references missing code-context ID ${refId}`);
      }
    }
  }

  const claims = await readJson<unknown[]>(join(fixtureDir, "ground-truth", "claims.json"));
  const events = await readJson<unknown[]>(join(fixtureDir, "ground-truth", "events.json"));
  const emails = await walk(join(fixtureDir, "sources", "email"), (path) => path.endsWith(".eml"));
  const slackFiles = await walk(join(fixtureDir, "sources", "slack"), (path) => path.endsWith(".json"));
  let slackMessages = 0;
  for (const file of slackFiles) {
    const parsed = await readJson<unknown>(file);
    if (Array.isArray(parsed) && parsed.every((entry) => entry && typeof entry === "object" && "type" in entry)) {
      slackMessages += parsed.length;
    }
  }
  counts.canonicalClaims = claims.length;
  counts.canonicalEvents = events.length;
  counts.emailMessages = emails.length;
  counts.slackMessages = slackMessages;
  counts.gitRepositories = ["clientcore", "talentflow"].filter((name) =>
    existsSync(join(fixtureDir, "sources", "git", name, ".primer", "history.bundle")),
  ).length;
  const countFixtureRepositoryFiles = async (repository: string): Promise<number> => {
    const root = join(fixtureDir, "sources", "git", repository);
    const files = await walk(root, (path) => {
      const normalized = path.split("\\").join("/");
      return !normalized.includes("/.git/") && !normalized.endsWith("/.primer/history.bundle");
    });
    return files.length;
  };
  counts.clientCoreTrackedFiles = await countFixtureRepositoryFiles("clientcore");
  counts.talentFlowTrackedFiles = await countFixtureRepositoryFiles("talentflow");

  for (const [name, expected] of Object.entries(manifest.inventory)) {
    const actual = counts[name];
    if (actual !== undefined && actual !== expected) {
      error(issues, "manifest.json", `inventory ${name} is ${expected}, but fixture contains ${actual}`);
    }
  }
  for (const repository of ["clientcore", "talentflow"]) {
    const root = join(fixtureDir, "sources", "git", repository);
    if (!existsSync(join(root, ".primer", "history.bundle"))) {
      error(issues, rel(root), "Git history bundle is missing");
    } else if (!existsSync(join(root, ".git"))) {
      warning(
        issues,
        rel(root),
        "nested Git repository is not restored; restore it before a Pi code-context simulation or harness evaluation",
      );
    } else if (!(await stat(join(root, ".git"))).isDirectory()) {
      warning(issues, rel(root), "nested .git path is not a directory");
    }
  }

  return {
    fixtureId: manifest.datasetId,
    valid: !issues.some((issue) => issue.severity === "error"),
    counts,
    issues,
  };
}
