import path from "node:path";
import fs from "node:fs/promises";
import { config as loadEnv } from "dotenv";
import { buildReportPayloadFromSession, writeReportPayloadToSessionDir } from "../src/report";
import { AnalysisSessionSchema } from "../src/schemas";

loadEnv();

function usage(): never {
  // eslint-disable-next-line no-console
  console.error("Usage: tsx scripts/build_report_payload.ts <session_id_or_dir>");
  process.exitCode = 1;
  throw new Error("usage");
}

async function main() {
  const sessionIdOrDir = process.argv[2];
  if (!sessionIdOrDir) usage();

  const baseSessionsDir = path.join(process.cwd(), "data/sessions");
  const sessionDir = path.isAbsolute(sessionIdOrDir)
    ? sessionIdOrDir
    : path.join(baseSessionsDir, sessionIdOrDir);

  const sessionJson = JSON.parse(
    await fs.readFile(path.join(sessionDir, "session.json"), "utf8"),
  );

  // 为了更清晰的错误：先校验 schema
  const parsed = AnalysisSessionSchema.parse(sessionJson);

  const payload = buildReportPayloadFromSession(parsed);
  await writeReportPayloadToSessionDir(sessionDir, payload);

  // eslint-disable-next-line no-console
  console.log(`report_payload.json written at ${path.join(sessionDir, "report_payload.json")}`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exitCode = 1;
});

