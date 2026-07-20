import { join, resolve } from "node:path";

export interface PrimerConfig {
  dataDir: string;
  databasePath: string;
  fixtureDir: string;
  embeddingProvider: "openrouter" | "deterministic";
  embeddingModel?: string;
  chatProvider: "openrouter" | "deterministic";
  chatModel?: string;
  openRouterApiKey?: string;
}

export function loadConfig(overrides: Partial<PrimerConfig> = {}): PrimerConfig {
  const dataDir = resolve(overrides.dataDir ?? process.env.PRIMER_DATA_DIR ?? join(process.cwd(), ".primer"));
  const fixtureDir = resolve(
    overrides.fixtureDir ?? process.env.PRIMER_FIXTURE_DIR ?? join(process.cwd(), "sample-data", "acme"),
  );
  const provider =
    overrides.embeddingProvider ??
    (process.env.PRIMER_EMBEDDING_PROVIDER === "deterministic" ? "deterministic" : "openrouter");
  const embeddingModel = overrides.embeddingModel ?? process.env.PRIMER_EMBEDDING_MODEL;
  const chatProvider =
    overrides.chatProvider ??
    (process.env.PRIMER_CHAT_PROVIDER === "deterministic" ? "deterministic" : "openrouter");
  const chatModel = overrides.chatModel ?? process.env.PRIMER_CHAT_MODEL;
  const openRouterApiKey = overrides.openRouterApiKey ?? process.env.OPENROUTER_API_KEY;

  return {
    dataDir,
    databasePath: resolve(overrides.databasePath ?? join(dataDir, "primer.db")),
    fixtureDir,
    embeddingProvider: provider,
    chatProvider,
    ...(embeddingModel ? { embeddingModel } : {}),
    ...(chatModel ? { chatModel } : {}),
    ...(openRouterApiKey ? { openRouterApiKey } : {}),
  };
}
