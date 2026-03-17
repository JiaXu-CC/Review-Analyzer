import path from "node:path";
import fs from "node:fs/promises";
import { config as loadEnv } from "dotenv";
import { createLLMClientFromEnv } from "../src/llm";
import { FeedbackBundleSchema } from "../src/schemas";
import {
  applyFeedbackAndRerun,
  loadSessionFromDir,
  saveSessionToDir,
} from "../src/pipeline/rerun";

loadEnv();

async function main() {
  const sessionIdOrDir = process.argv[2];
  const feedbackPathArg = process.argv[3] ?? "data/feedback/sample_feedback.json";

  if (!sessionIdOrDir) {
    // eslint-disable-next-line no-console
    console.error(
      "Usage: tsx scripts/apply_feedback.ts <session_id_or_dir> [feedback_path]",
    );
    process.exitCode = 1;
    return;
  }

  const baseSessionsDir = path.join(process.cwd(), "data/sessions");
  const assumedDir = path.join(baseSessionsDir, sessionIdOrDir);

  const sessionDir = assumedDir;

  const session = await loadSessionFromDir(sessionDir);

  const feedbackPath = path.isAbsolute(feedbackPathArg)
    ? feedbackPathArg
    : path.join(process.cwd(), feedbackPathArg);
  const feedbackRaw = JSON.parse(await fs.readFile(feedbackPath, "utf8"));
  const feedback = FeedbackBundleSchema.parse(feedbackRaw);

  const llm = createLLMClientFromEnv();

  const updatedSession = await applyFeedbackAndRerun(
    session,
    feedback,
    llm,
  );

  await saveSessionToDir(sessionDir, updatedSession);

  // eslint-disable-next-line no-console
  console.log(
    `Feedback applied. Updated session saved at ${sessionDir}`,
  );
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exitCode = 1;
});

