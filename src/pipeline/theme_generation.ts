import type { ReviewUnit, Theme } from "../schemas";
import type { LLMClient } from "../llm/client";

export async function generateThemesAndClassifyUnits(
  units: ReviewUnit[],
  llm: LLMClient,
): Promise<{ themes: Theme[]; units: ReviewUnit[] }> {
  // 正负共用一套主题：由 LLM/mock 根据 unit.theme 汇总
  const result = await llm.generateThemes(units);
  return {
    themes: result.themes,
    units: result.units,
  };
}

