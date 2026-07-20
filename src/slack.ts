import type { ConnectorItem, SourceProcessor } from "./connectors/contracts.js";
import {
  POLICY_VERSION,
  SLACK_PROCESSOR_VERSION,
  type AccessDescriptor,
  type KnowledgeRecord,
  type ProcessedSource,
} from "./types.js";
import { checksum } from "./utils.js";

interface SlackMessage {
  type: string;
  client_msg_id?: string;
  user: string;
  ts: string;
  thread_ts?: string;
  text: string;
}

interface SlackUser {
  id: string;
  real_name?: string;
  name?: string;
  is_bot?: boolean;
}

interface ConversationMetadata {
  id: string;
  name: string;
}

interface ThreadOverride {
  projectId?: string;
  resolutionState?: KnowledgeRecord["resolutionState"];
  authority?: number;
}

interface SlackPolicy {
  projectId: string;
  authority?: number;
  access: {
    visibility: AccessDescriptor["visibility"];
    allowedGroupIds?: string[];
    allowedUserIds?: string[];
  };
  threadOverrides?: Record<string, ThreadOverride>;
}

function requiredObject(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${name} must be an object.`);
  return value as Record<string, unknown>;
}

function parseMetadata(item: ConnectorItem): {
  conversation: ConversationMetadata;
  users: SlackUser[];
  policy: SlackPolicy;
} {
  const conversation = requiredObject(item.metadata.conversation, "Slack conversation metadata");
  const policy = requiredObject(item.metadata.policy, "Slack Primer policy") as unknown as SlackPolicy;
  const users = item.metadata.users;
  if (typeof conversation.id !== "string" || typeof conversation.name !== "string") {
    throw new Error("Slack conversation metadata requires id and name.");
  }
  if (!Array.isArray(users)) throw new Error("Slack users metadata must be an array.");
  if (typeof policy.projectId !== "string" || !policy.access) throw new Error("Slack Primer policy is incomplete.");
  if (!(["public", "group", "restricted"] as unknown[]).includes(policy.access.visibility)) {
    throw new Error(`Slack Primer policy has unsupported visibility: ${String(policy.access.visibility)}`);
  }
  for (const identifiers of [policy.access.allowedGroupIds ?? [], policy.access.allowedUserIds ?? []]) {
    if (!Array.isArray(identifiers) || identifiers.some((identifier) => typeof identifier !== "string")) {
      throw new Error("Slack Primer policy access identifiers must be string arrays.");
    }
  }
  return { conversation: conversation as unknown as ConversationMetadata, users: users as SlackUser[], policy };
}

function parseMessages(rawContent: string): SlackMessage[] {
  const parsed = JSON.parse(rawContent) as unknown;
  if (!Array.isArray(parsed)) throw new Error("Slack export message file must contain an array.");
  return parsed.map((value, index) => {
    const message = requiredObject(value, `Slack message ${index}`);
    if (
      message.type !== "message" ||
      typeof message.user !== "string" ||
      typeof message.ts !== "string" ||
      typeof message.text !== "string"
    ) {
      throw new Error(`Slack message ${index} is missing type, user, ts, or text.`);
    }
    return message as unknown as SlackMessage;
  });
}

function isoFromSlackTimestamp(timestamp: string): string {
  const seconds = Number(timestamp.split(".")[0]);
  if (!Number.isFinite(seconds)) throw new Error(`Invalid Slack timestamp: ${timestamp}`);
  return new Date(seconds * 1000).toISOString();
}

function inferredResolution(messages: SlackMessage[]): KnowledgeRecord["resolutionState"] {
  const text = messages.map((message) => message.text).join("\n").toLowerCase();
  if (/\b(proposed|proposal|not a roadmap commitment|not approved)\b/.test(text)) return "proposed";
  if (/\b(decision:|marking resolved|root cause|ruled out|fix is merged)\b/.test(text)) return "resolved";
  return undefined;
}

function shortTitle(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized;
}

export class SlackThreadProcessor implements SourceProcessor {
  readonly sourceFamily = "slack";
  readonly version = SLACK_PROCESSOR_VERSION;

  async process(item: ConnectorItem): Promise<ProcessedSource[]> {
    const { conversation, users, policy } = parseMetadata(item);
    const userMap = new Map(users.map((user) => [user.id, user]));
    const messages = parseMessages(item.rawContent).sort((left, right) => left.ts.localeCompare(right.ts));
    const roots = messages.filter((message) => !message.thread_ts);
    const rootTimestamps = new Set(roots.map((message) => message.ts));
    if (rootTimestamps.size !== roots.length) throw new Error(`Slack export ${item.sourceRef} contains duplicate root timestamps.`);
    const replies = new Map<string, SlackMessage[]>();
    for (const message of messages.filter((entry) => entry.thread_ts)) {
      const threadTs = message.thread_ts!;
      replies.set(threadTs, [...(replies.get(threadTs) ?? []), message]);
    }
    const orphanThread = [...replies.keys()].find((threadTs) => !rootTimestamps.has(threadTs));
    if (orphanThread) throw new Error(`Slack export ${item.sourceRef} contains replies without root ${orphanThread}.`);

    return roots.map((root) => {
      const thread = [root, ...(replies.get(root.ts) ?? [])].sort((left, right) => left.ts.localeCompare(right.ts));
      const sourceId = `slack:${conversation.id}:${root.ts}`;
      const override = policy.threadOverrides?.[root.ts];
      if (override?.authority !== undefined && (!Number.isFinite(override.authority) || override.authority < 0 || override.authority > 1)) {
        throw new Error(`Slack thread ${root.ts} authority must be between 0 and 1.`);
      }
      const access: AccessDescriptor = {
        visibility: policy.access.visibility,
        allowedGroupIds: [...(policy.access.allowedGroupIds ?? [])],
        allowedUserIds: [...(policy.access.allowedUserIds ?? [])],
      };
      const projectId = override?.projectId ?? policy.projectId;
      const rawThread = JSON.stringify(thread, null, 2);
      const sourceVersion = checksum(rawThread);
      const createdAt = isoFromSlackTimestamp(root.ts);
      const updatedAt = isoFromSlackTimestamp(thread.at(-1)?.ts ?? root.ts);
      const authors = [...new Set(thread.map((message) => userMap.get(message.user)?.real_name ?? message.user))];
      const source = {
        source: this.sourceFamily,
        sourceId,
        sourceRef: item.sourceRef,
        sourceType: "thread",
        rawContent: rawThread,
        createdAt,
        updatedAt,
        authors,
        projectId,
        metadata: {
          connectorId: item.connectorId,
          channelId: conversation.id,
          channelName: conversation.name,
          threadTs: root.ts,
          messageCount: thread.length,
          processorVersion: this.version,
        },
        access,
      };
      const isBotRoot = userMap.get(root.user)?.is_bot === true || root.user === "UBOT";
      const accepted = !isBotRoot && thread.length >= 2;
      const resolutionState = override?.resolutionState ?? inferredResolution(thread);
      const content = thread
        .map((message) => {
          const author = userMap.get(message.user)?.real_name ?? message.user;
          return `${author} (${isoFromSlackTimestamp(message.ts)}): ${message.text}`;
        })
        .join("\n\n");
      const records: KnowledgeRecord[] = accepted
        ? [
            {
              id: sourceId,
              source: this.sourceFamily,
              sourceId,
              sourceRef: item.sourceRef,
              sourceVersion,
              title: shortTitle(root.text),
              content,
              contentChecksum: checksum(content),
              projectId,
              updatedAt,
              authority: override?.authority ?? policy.authority ?? 0.65,
              ...(resolutionState ? { resolutionState } : {}),
              metadata: {
                channelId: conversation.id,
                channelName: conversation.name,
                threadTs: root.ts,
                messageIds: thread.map((message) => message.client_msg_id ?? message.ts),
                authorIds: [...new Set(thread.map((message) => message.user))],
                processorVersion: this.version,
              },
              access,
            },
          ]
        : [];
      return {
        source,
        sourceVersion,
        records,
        decisions: [
          {
            sourceId,
            recordId: sourceId,
            decision: accepted ? "accepted" : "rejected",
            reason: accepted
              ? "thread-level Slack conversation passed index policy"
              : isBotRoot
                ? "standalone bot notification is not durable knowledge"
                : "standalone Slack message lacks enough conversational context",
            policyVersion: POLICY_VERSION,
          },
        ],
      };
    });
  }
}
