import path from "node:path";
import { config as loadEnv } from "dotenv";
import { runPipeline } from "../src/pipeline";
import { createLLMClientFromEnv } from "../src/llm";

loadEnv();

async function main() {
  const csvPathArg = process.argv[2] ?? "data/raw/sample_reviews.csv";

  const absoluteCsvPath = path.isAbsolute(csvPathArg)
    ? csvPathArg
    : path.join(process.cwd(), csvPathArg);

  const sessionBaseDir = path.join(process.cwd(), "data/sessions");

  const config = {
    product_name: process.env.PRODUCT_NAME ?? "Sample Product",
    enable_time_analysis: false,
  } as const;

  const llm = createLLMClientFromEnv();

  const session = await runPipeline({
    csvPath: absoluteCsvPath,
    config,
    llm,
    sessionBaseDir,
  });

  // eslint-disable-next-line no-console
  console.log(
    `Pipeline finished. session_id=${session.session_id}, outputs at data/sessions/${session.session_id}`,
  );
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exitCode = 1;
});

