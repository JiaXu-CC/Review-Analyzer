import path from "node:path";
import { config as loadEnv } from "dotenv";
import { readJsonFile } from "../src/utils/json";
import { buildVisualizationPreviewHtml } from "../src/visualization";

loadEnv();

function usage(): never {
  // eslint-disable-next-line no-console
  console.error("Usage: tsx scripts/build_visualization_preview.ts <session_id_or_dir>");
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

  const reportPayloadPath = path.join(sessionDir, "report_payload.json");
  const reportPayload = await readJsonFile<unknown>(reportPayloadPath);

  const html = buildVisualizationPreviewHtml(reportPayload as Record<string, unknown>);
  const outPath = path.join(sessionDir, "visualization_preview.html");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fs = await import("node:fs/promises");
  await fs.writeFile(outPath, html, "utf8");

  // eslint-disable-next-line no-console
  console.log(`visualization_preview.html written at ${outPath}`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exitCode = 1;
});

