import path from "node:path";
import fs from "node:fs/promises";
import { config as loadEnv } from "dotenv";
import { buildReportCopyFromPayload, writeReportCopyToSessionDir } from "../src/report";

loadEnv();

function usage(): never {
  // eslint-disable-next-line no-console
  console.error("Usage: tsx scripts/build_report_copy.ts <session_id_or_dir>");
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

  const payloadJson = JSON.parse(
    await fs.readFile(path.join(sessionDir, "report_payload.json"), "utf8"),
  );

  const copy = buildReportCopyFromPayload(payloadJson);
  await writeReportCopyToSessionDir(sessionDir, copy);

  // eslint-disable-next-line no-console
  console.log(`report_copy.json written at ${path.join(sessionDir, "report_copy.json")}`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exitCode = 1;
});

