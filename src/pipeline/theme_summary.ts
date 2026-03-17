import type { ReviewUnit, Theme } from "../schemas";
import type { LLMClient } from "../llm/client";

export async function summarizeThemes(
  themes: Theme[],
  units: ReviewUnit[],
  llm: LLMClient,
): Promise<Theme[]> {
  const result = await llm.summarizeThemes(themes, units);
  return result.themes;
}

