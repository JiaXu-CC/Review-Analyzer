import { generateId } from "../utils/ids";
import type { AnalysisSession, SessionConfig } from "../schemas";
import { ingestCsv } from "./ingest";
import { applySentimentAnalysis } from "./sentiment";
import { segmentReviews } from "./segmentation";
import { generateThemesAndClassifyUnits } from "./theme_generation";
import { summarizeThemes } from "./theme_summary";
import { saveSession } from "./save_session";
import type { LLMClient } from "../llm/client";

export interface RunPipelineOptions {
  csvPath: string;
  config: SessionConfig;
  llm: LLMClient;
  sessionBaseDir: string;
}

export async function runPipeline(
  options: RunPipelineOptions,
): Promise<AnalysisSession> {
  const { csvPath, config, llm, sessionBaseDir } = options;

  const session_id = generateId("session");

  const ingestedReviews = await ingestCsv(csvPath);
  const units = await segmentReviews(ingestedReviews, llm);
  const reviewsWithSentiment = await applySentimentAnalysis(
    ingestedReviews,
    units,
    llm,
  );
  const { themes, units: classifiedUnits } =
    await generateThemesAndClassifyUnits(units, llm);
  const summarizedThemes = await summarizeThemes(
    themes,
    classifiedUnits,
    llm,
  );

  const session: AnalysisSession = {
    session_id,
    config,
    segmentation_status: "pending",
    theme_status: "pending",
    report_status: "locked",
    reviews: reviewsWithSentiment,
    units: classifiedUnits,
    themes: summarizedThemes,
  };

  await saveSession(sessionBaseDir, session);
  return session;
}

