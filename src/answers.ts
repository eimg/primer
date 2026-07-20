import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText } from "ai";
import type { PrimerConfig } from "./config.js";
import type {
  AnswerGenerationInput,
  AnswerProvider,
  AnswerProviderResult,
  CitationValidation,
  Evidence,
} from "./types.js";

function evidencePrompt(evidence: Evidence[]): string {
  return evidence
    .map(
      (item) =>
        `[${item.evidenceId}] ${item.title}\nSource: ${item.sourceRef}\nUpdated: ${item.updatedAt}\nResolution: ${item.resolutionState ?? "unspecified"}\n${item.excerpt}`,
    )
    .join("\n\n---\n\n");
}

export class VercelOpenRouterAnswerProvider implements AnswerProvider {
  readonly modelId: string;
  private readonly openrouter: ReturnType<typeof createOpenRouter>;

  constructor(apiKey: string, modelId: string) {
    if (!apiKey) throw new Error("OPENROUTER_API_KEY is required for grounded answers.");
    if (!modelId) throw new Error("PRIMER_CHAT_MODEL is required for grounded answers.");
    this.modelId = modelId;
    this.openrouter = createOpenRouter({ apiKey, compatibility: "strict", appName: "Primer" });
  }

  async generate(input: AnswerGenerationInput): Promise<AnswerProviderResult> {
    const constraints = input.constraints.map((item) => `- ${item.text}`).join("\n") || "- None identified.";
    const conflicts = input.conflicts.map((item) => `- ${item.text}`).join("\n") || "- None identified.";
    const revision = input.revision
      ? `\n\nRevise the previous answer rather than discussing the errors. Return only the complete corrected answer.\nPrevious answer:\n${input.revision.previousAnswer}\n\nInvalid evidence IDs: ${input.revision.invalidEvidenceIds.join(", ") || "none"}\nUncited factual paragraphs:\n${input.revision.uncitedClaims.map((claim) => `- ${claim}`).join("\n") || "none"}`
      : "";
    const result = await generateText({
      model: this.openrouter(this.modelId),
      system:
        "You answer only from the supplied authorized evidence. Read all evidence before answering and cover every material condition, exception, consequence, or boundary directly relevant to the question. Cite every factual paragraph, including introductory and summary paragraphs, with one or more exact bracketed evidence IDs such as [E1] or [E1, E2]. Do not write an uncited factual heading or introduction. Never invent citations, paths, facts, or decisions. Preserve conflicts and proposal/superseded status. If evidence is insufficient, say so plainly.",
      prompt: `Question:\n${input.question}\n\nConstraints:\n${constraints}\n\nConflicts:\n${conflicts}\n\nAuthorized evidence:\n${evidencePrompt(input.evidence)}${revision}`,
      temperature: 0,
      maxOutputTokens: 1_200,
    });
    const usage = {
      ...(result.usage.inputTokens !== undefined ? { inputTokens: result.usage.inputTokens } : {}),
      ...(result.usage.outputTokens !== undefined ? { outputTokens: result.usage.outputTokens } : {}),
      ...(result.usage.totalTokens !== undefined ? { totalTokens: result.usage.totalTokens } : {}),
    };
    return {
      text: result.text.trim(),
      finishReason: result.finishReason,
      modelId: result.response.modelId,
      ...(Object.keys(usage).length > 0 ? { usage } : {}),
    };
  }
}

export class DeterministicAnswerProvider implements AnswerProvider {
  readonly modelId = "deterministic-answer-v1";

  async generate(input: AnswerGenerationInput): Promise<AnswerProviderResult> {
    const first = input.evidence[0];
    if (!first) return { text: "I do not have enough authorized evidence to answer.", finishReason: "stop" };
    const excerpt = first.excerpt.replace(/\s+/g, " ").trim();
    const summary = excerpt.length > 280 ? `${excerpt.slice(0, 277)}...` : excerpt;
    const caveat = input.constraints[0] ? ` ${input.constraints[0].text} [${input.constraints[0].evidenceIds[0]}]` : "";
    return {
      text: `${first.title}: ${summary} [${first.evidenceId}]${caveat}`,
      finishReason: "stop",
      modelId: this.modelId,
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    };
  }
}

export function createAnswerProvider(config: PrimerConfig): AnswerProvider {
  if (config.chatProvider === "deterministic") return new DeterministicAnswerProvider();
  if (!config.openRouterApiKey) throw new Error("OPENROUTER_API_KEY is required for grounded answers.");
  if (!config.chatModel) throw new Error("PRIMER_CHAT_MODEL is required for grounded answers.");
  return new VercelOpenRouterAnswerProvider(config.openRouterApiKey, config.chatModel);
}

export function isAbstentionText(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim().toLowerCase();
  return [
    /(?:available|provided|authorized|current) evidence (?:does not|doesn't) contain/,
    /(?:insufficient|not enough) (?:authorized |relevant )?evidence/,
    /(?:cannot|can't|unable to) (?:answer|determine|establish) (?:from|based on|with) (?:the )?(?:available |provided |authorized )?evidence/,
    /(?:do not|don't) have enough authorized evidence/,
    /no (?:authorized|relevant) evidence (?:is )?available/,
  ].some((pattern) => pattern.test(normalized));
}

export function validateCitations(text: string, evidence: Evidence[]): CitationValidation {
  const allowed = new Set(evidence.map((item) => item.evidenceId));
  const isAbstention = isAbstentionText(text);
  const citedEvidenceIds = [
    ...new Set(
      [...text.matchAll(/\[([^\]\n]+)\]/g)].flatMap((match) => match[1]?.match(/\bE\d+\b/g) ?? []),
    ),
  ];
  const invalidEvidenceIds = citedEvidenceIds.filter((id) => !allowed.has(id));
  const uncitedClaims = text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.split(/\s+/).length >= 8)
    .filter((paragraph) => !/^I (?:do not|don't) have enough authorized evidence/i.test(paragraph))
    .filter((paragraph) => !/\[[^\]\n]*\bE\d+\b[^\]\n]*\]/.test(paragraph));
  return {
    valid:
      invalidEvidenceIds.length === 0 &&
      uncitedClaims.length === 0 &&
      (isAbstention || evidence.length === 0 || citedEvidenceIds.length > 0),
    citedEvidenceIds,
    invalidEvidenceIds,
    uncitedClaims,
  };
}
