import { readFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { parse as parseYaml } from "yaml";
import { checksum, slugify } from "./utils.js";
import { MARKDOWN_PROCESSOR_VERSION, POLICY_VERSION } from "./types.js";
import type { ConnectorItem, SourceProcessor } from "./connectors/contracts.js";
import type {
  AccessDescriptor,
  IndexDecision,
  KnowledgeRecord,
  ProcessedSource,
  SourceObject,
} from "./types.js";

interface MarkdownFrontmatter {
  source_id?: unknown;
  title?: unknown;
  project_id?: unknown;
  owner?: unknown;
  status?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
  authority?: unknown;
  access?: unknown;
  [key: string]: unknown;
}

interface Section {
  level: number;
  title: string;
  slug: string;
  parentSlug?: string;
  path: string[];
  body: string[];
}

function splitFrontmatter(raw: string): { frontmatter: MarkdownFrontmatter; body: string } {
  const normalized = raw.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    throw new Error("Markdown source must begin with YAML frontmatter");
  }
  const end = normalized.indexOf("\n---\n", 4);
  if (end < 0) throw new Error("Markdown frontmatter is not terminated");
  const parsed = parseYaml(normalized.slice(4, end)) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Markdown frontmatter must be an object");
  }
  return { frontmatter: parsed as MarkdownFrontmatter, body: normalized.slice(end + 5) };
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Markdown frontmatter field ${field} must be a non-empty string`);
  }
  return value.trim();
}

function stringArray(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error("Access identifier lists must contain strings");
  }
  return value.map(String);
}

function parseAccess(value: unknown): AccessDescriptor {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Markdown access metadata must be an object");
  }
  const input = value as Record<string, unknown>;
  const visibility = requiredString(input.visibility, "access.visibility");
  if (visibility !== "public" && visibility !== "group" && visibility !== "restricted") {
    throw new Error(`Unsupported visibility: ${visibility}`);
  }
  return {
    visibility,
    allowedGroupIds: stringArray(input.allowed_group_ids),
    allowedUserIds: stringArray(input.allowed_user_ids),
  };
}

function sourceReference(filePath: string, fixtureDir: string): string {
  const rel = relative(resolve(fixtureDir), resolve(filePath));
  if (rel && !rel.startsWith(`..${sep}`) && rel !== "..") return rel.split(sep).join("/");
  return resolve(filePath);
}

function parseSections(body: string, fallbackTitle: string): Section[] {
  const sections: Section[] = [];
  const stack: Section[] = [];
  const slugCounts = new Map<string, number>();
  let current: Section | undefined;

  const createSection = (level: number, title: string): Section => {
    while (stack.length > 0 && (stack.at(-1)?.level ?? 0) >= level) stack.pop();
    const baseSlug = slugify(title) || "section";
    const count = (slugCounts.get(baseSlug) ?? 0) + 1;
    slugCounts.set(baseSlug, count);
    const slug = count === 1 ? baseSlug : `${baseSlug}-${count}`;
    const parent = stack.at(-1);
    const section: Section = {
      level,
      title,
      slug,
      ...(parent ? { parentSlug: parent.slug } : {}),
      path: [...(parent?.path ?? []), title],
      body: [],
    };
    stack.push(section);
    sections.push(section);
    return section;
  };

  for (const line of body.split("\n")) {
    const heading = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (heading) {
      current = createSection(heading[1]?.length ?? 1, heading[2] ?? fallbackTitle);
    } else if (current) {
      current.body.push(line);
    }
  }

  if (sections.length === 0) {
    sections.push({ level: 1, title: fallbackTitle, slug: "root", path: [fallbackTitle], body: body.split("\n") });
  }
  return sections;
}

function resolutionState(status: string): KnowledgeRecord["resolutionState"] {
  if (status === "superseded") return "superseded";
  if (status === "proposed" || status === "draft") return "proposed";
  if (status === "resolved" || status === "approved") return "resolved";
  return undefined;
}

export function processMarkdownContent(rawContent: string, sourceRef: string): ProcessedSource {
  const { frontmatter, body } = splitFrontmatter(rawContent);
  const sourceId = requiredString(frontmatter.source_id, "source_id");
  const title = requiredString(frontmatter.title, "title");
  const projectId = requiredString(frontmatter.project_id, "project_id");
  const owner = requiredString(frontmatter.owner, "owner");
  const status = requiredString(frontmatter.status, "status");
  const updatedAt = requiredString(frontmatter.updated_at, "updated_at");
  const createdAt = typeof frontmatter.created_at === "string" ? frontmatter.created_at : updatedAt;
  const authority = Number(frontmatter.authority);
  if (!Number.isFinite(authority) || authority < 0 || authority > 1) {
    throw new Error("Markdown authority must be a number between 0 and 1");
  }
  const access = parseAccess(frontmatter.access);
  const sourceVersion = checksum(rawContent);
  const source: SourceObject = {
    source: "markdown",
    sourceId,
    sourceRef,
    sourceType: "document",
    rawContent,
    createdAt,
    updatedAt,
    authors: [owner],
    projectId,
    metadata: { title, owner, status, processorVersion: MARKDOWN_PROCESSOR_VERSION },
    access,
  };
  const records: KnowledgeRecord[] = [];
  const decisions: IndexDecision[] = [];
  const sections = parseSections(body, title);

  for (const section of sections) {
    const recordId = `md:${sourceId}#${section.slug}`;
    const trimmedBody = section.body.join("\n").trim();
    if (trimmedBody.replace(/[`*_#>\-|]/g, "").trim().length < 12) {
      decisions.push({
        sourceId,
        recordId,
        decision: "rejected",
        reason: "section has insufficient substantive content",
        policyVersion: POLICY_VERSION,
      });
      continue;
    }
    const content = `${section.path.join(" > ")}\n\n${trimmedBody}`;
    const state = resolutionState(status);
    records.push({
      id: recordId,
      source: "markdown",
      sourceId,
      sourceRef: section.slug === "root" ? sourceRef : `${sourceRef}#${section.slug}`,
      sourceVersion,
      ...(section.parentSlug ? { parentId: `md:${sourceId}#${section.parentSlug}` } : {}),
      title: section.title,
      content,
      contentChecksum: checksum(content),
      projectId,
      updatedAt,
      authority,
      ...(state ? { resolutionState: state } : {}),
      metadata: {
        headingLevel: section.level,
        headingPath: section.path,
        status,
        owner,
        processorVersion: MARKDOWN_PROCESSOR_VERSION,
      },
      access,
    });
    decisions.push({
      sourceId,
      recordId,
      decision: "accepted",
      reason: "heading-aware Markdown section passed index policy",
      policyVersion: POLICY_VERSION,
    });
  }

  return { source, sourceVersion, records, decisions };
}

export async function processMarkdownFile(filePath: string, fixtureDir: string): Promise<ProcessedSource> {
  const rawContent = await readFile(filePath, "utf8");
  return processMarkdownContent(rawContent, sourceReference(filePath, fixtureDir));
}

export class MarkdownProcessor implements SourceProcessor {
  readonly sourceFamily = "markdown";
  readonly version = MARKDOWN_PROCESSOR_VERSION;

  async process(item: ConnectorItem): Promise<ProcessedSource[]> {
    return [processMarkdownContent(item.rawContent, item.sourceRef)];
  }
}
