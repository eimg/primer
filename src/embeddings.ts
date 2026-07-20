import { OpenRouter } from "@openrouter/sdk";
import type { PrimerConfig } from "./config.js";
import type { EmbeddingProvider } from "./types.js";

const DETERMINISTIC_DIMENSIONS = 256;

function normalize(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return magnitude === 0 ? vector : vector.map((value) => value / magnitude);
}

function hashToken(token: string): [number, number] {
  let hash = 2166136261;
  for (const char of token) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  const unsigned = hash >>> 0;
  return [unsigned % DETERMINISTIC_DIMENSIONS, unsigned & 1 ? -1 : 1];
}

function tokens(value: string): string[] {
  const words = value.toLowerCase().match(/[a-z0-9_]+/g) ?? [];
  const pairs = words.slice(0, -1).map((word, index) => `${word}_${words[index + 1]}`);
  return [...words, ...pairs];
}

export class DeterministicEmbeddingProvider implements EmbeddingProvider {
  readonly modelId = "deterministic/hash-256-v1";

  async embed(value: string): Promise<number[]> {
    const vector = Array.from({ length: DETERMINISTIC_DIMENSIONS }, () => 0);
    for (const token of tokens(value)) {
      const [index, sign] = hashToken(token);
      vector[index] = (vector[index] ?? 0) + sign;
    }
    return normalize(vector);
  }

  async embedMany(values: string[]): Promise<number[][]> {
    return Promise.all(values.map((value) => this.embed(value)));
  }
}

export class OpenRouterEmbeddingProvider implements EmbeddingProvider {
  readonly modelId: string;
  private readonly client: OpenRouter;

  constructor(apiKey: string, modelId: string) {
    this.modelId = modelId;
    this.client = new OpenRouter({ apiKey });
  }

  async embed(value: string): Promise<number[]> {
    const result = await this.client.embeddings.generate({
      requestBody: {
        model: this.modelId,
        input: value,
        encodingFormat: "float",
      },
    });
    if (typeof result === "string") {
      throw new Error("OpenRouter returned an unexpected text response for an embedding request.");
    }
    const embedding = result.data[0]?.embedding;
    if (!Array.isArray(embedding)) {
      throw new Error("OpenRouter returned no float embedding for the requested input.");
    }
    return embedding;
  }

  async embedMany(values: string[]): Promise<number[][]> {
    if (values.length === 0) return [];
    const result = await this.client.embeddings.generate({
      requestBody: {
        model: this.modelId,
        input: values,
        encodingFormat: "float",
      },
    });
    if (typeof result === "string") {
      throw new Error("OpenRouter returned an unexpected text response for an embedding request.");
    }
    const embeddings = [...result.data]
      .sort((left, right) => (left.index ?? 0) - (right.index ?? 0))
      .map((item) => item.embedding);
    if (embeddings.length !== values.length || embeddings.some((embedding) => !Array.isArray(embedding))) {
      throw new Error(
        `OpenRouter returned ${embeddings.length} float embeddings for ${values.length} inputs.`,
      );
    }
    return embeddings as number[][];
  }
}

export function createEmbeddingProvider(config: PrimerConfig): EmbeddingProvider {
  if (config.embeddingProvider === "deterministic") {
    return new DeterministicEmbeddingProvider();
  }
  if (!config.openRouterApiKey) {
    throw new Error(
      "OPENROUTER_API_KEY is required. For an explicit offline run, set PRIMER_EMBEDDING_PROVIDER=deterministic.",
    );
  }
  if (!config.embeddingModel) {
    throw new Error("PRIMER_EMBEDDING_MODEL is required when using OpenRouter embeddings.");
  }
  return new OpenRouterEmbeddingProvider(config.openRouterApiKey, config.embeddingModel);
}

export function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length !== right.length || left.length === 0) return -1;
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) {
    const l = left[index] ?? 0;
    const r = right[index] ?? 0;
    dot += l * r;
    leftMagnitude += l * l;
    rightMagnitude += r * r;
  }
  if (leftMagnitude === 0 || rightMagnitude === 0) return 0;
  return dot / Math.sqrt(leftMagnitude * rightMagnitude);
}
