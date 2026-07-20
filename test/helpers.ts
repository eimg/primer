import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../src/config.js";
import { PrimerDatabase } from "../src/database.js";
import { DeterministicEmbeddingProvider } from "../src/embeddings.js";
import { PrimerServices } from "../src/services.js";
import type { AnswerProvider } from "../src/types.js";

export const fixtureDir = join(process.cwd(), "sample-data", "acme");

export async function createTestServices(answerProvider?: AnswerProvider): Promise<{
  services: PrimerServices;
  database: PrimerDatabase;
  directory: string;
  cleanup: () => void;
}> {
  const directory = mkdtempSync(join(tmpdir(), "primer-test-"));
  const config = loadConfig({
    dataDir: directory,
    fixtureDir,
    embeddingProvider: "deterministic",
  });
  const database = new PrimerDatabase(config.databasePath);
  const services = new PrimerServices(config, database, new DeterministicEmbeddingProvider(), undefined, answerProvider);
  const report = await services.initialize();
  if (!report.valid) throw new Error(`Fixture is invalid: ${JSON.stringify(report.issues)}`);
  return {
    services,
    database,
    directory,
    cleanup: () => {
      database.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
