import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText, jsonSchema, Output } from "ai";
import type { PrimerConfig } from "./config.js";
import type { ModelUsage, QueryPlanner, QueryPlannerInput, QueryPlannerResult } from "./types.js";

interface PlannedQueries {
  queries: string[];
}

function usageOf(usage: { inputTokens?: number | undefined; outputTokens?: number | undefined; totalTokens?: number | undefined }): ModelUsage | undefined {
  const result = {
    ...(usage.inputTokens !== undefined ? { inputTokens: usage.inputTokens } : {}),
    ...(usage.outputTokens !== undefined ? { outputTokens: usage.outputTokens } : {}),
    ...(usage.totalTokens !== undefined ? { totalTokens: usage.totalTokens } : {}),
  };
  return Object.keys(result).length > 0 ? result : undefined;
}

export class VercelOpenRouterQueryPlanner implements QueryPlanner {
  readonly modelId: string;
  private readonly openrouter: ReturnType<typeof createOpenRouter>;

  constructor(apiKey: string, modelId: string) {
    if (!apiKey) throw new Error("OPENROUTER_API_KEY is required for query planning.");
    if (!modelId) throw new Error("PRIMER_CHAT_MODEL is required for query planning.");
    this.modelId = modelId;
    this.openrouter = createOpenRouter({ apiKey, compatibility: "strict", appName: "Primer" });
  }

  async plan(input: QueryPlannerInput): Promise<QueryPlannerResult> {
    const result = await generateText({
      model: this.openrouter(this.modelId),
      output: Output.object({
        name: "primer_query_plan",
        description: "A small set of independent search queries for authorized organizational knowledge retrieval.",
        schema: jsonSchema<PlannedQueries>({
          type: "object",
          additionalProperties: false,
          properties: {
            queries: {
              type: "array",
              minItems: 1,
              maxItems: input.maxQueries,
              items: { type: "string", minLength: 1, maxLength: 240 },
            },
          },
          required: ["queries"],
        }),
      }),
      system:
        "Create search queries only. Do not answer the question. Do not invent facts, identities, permissions, projects, filters, or source names. Return distinct queries that improve exact and semantic retrieval. Preserve important identifiers and terminology.",
      prompt: `Question:\n${input.question}\n\nFixed project scope (informational only; you cannot change it):\n${input.projectId ?? "all authorized projects"}\n\nReturn at most ${input.maxQueries} concise search queries.`,
      temperature: 0,
      maxOutputTokens: 320,
    });
    const usage = usageOf(result.usage);
    return {
      queries: result.output.queries,
      modelId: result.response.modelId,
      ...(usage ? { usage } : {}),
    };
  }
}

export class DeterministicQueryPlanner implements QueryPlanner {
  readonly modelId = "deterministic-query-planner-v1";

  async plan(input: QueryPlannerInput): Promise<QueryPlannerResult> {
    return {
      queries: [input.question],
      modelId: this.modelId,
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    };
  }
}

export function createQueryPlanner(config: PrimerConfig): QueryPlanner {
  if (config.chatProvider === "deterministic") return new DeterministicQueryPlanner();
  if (!config.openRouterApiKey) throw new Error("OPENROUTER_API_KEY is required for query planning.");
  if (!config.chatModel) throw new Error("PRIMER_CHAT_MODEL is required for query planning.");
  return new VercelOpenRouterQueryPlanner(config.openRouterApiKey, config.chatModel);
}
