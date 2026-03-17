import type { Review, ReviewUnit } from "../schemas";
import type { LLMClient } from "../llm/client";

function mergeUnitsForSameReviewAndTheme(
  units: ReviewUnit[],
): ReviewUnit[] {
  const byKey = new Map<string, ReviewUnit>();

  for (const unit of units) {
    // 只保留 positive / negative，两类已在 LLM 层约束
    const key = `${unit.review_id}::${unit.theme}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, unit);
    } else {
      const mergedText = `${existing.unit_text} ${unit.unit_text}`.trim();
      const maxIntensity =
        (Math.max(
          existing.emotion_intensity,
          unit.emotion_intensity,
        ) as 1 | 2 | 3 | 4 | 5) || existing.emotion_intensity;

      // 如果出现同主题下正负 polarity 混合：
      // - 仍然只保留一个 unit（保证“同评论同主题一个片段”）
      // - polarity 采用情绪强度更高的那一侧
      const chosenPolarity =
        existing.emotion_intensity >= unit.emotion_intensity
          ? existing.polarity
          : unit.polarity;

      byKey.set(key, {
        ...existing,
        unit_text: mergedText,
        emotion_intensity: maxIntensity,
        polarity: chosenPolarity,
      });
    }
  }

  return Array.from(byKey.values());
}

export async function segmentReviews(
  reviews: Review[],
  llm: LLMClient,
): Promise<ReviewUnit[]> {
  const segmentationResults = await llm.segmentReviews(reviews);
  const allUnits: ReviewUnit[] = [];

  for (const result of segmentationResults) {
    const validUnits = result.units.filter(
      (u) =>
        typeof u.unit_text === "string" &&
        u.unit_text.trim().length > 0 &&
        typeof u.theme === "string" &&
        u.theme.trim().length > 0,
    );
    const merged = mergeUnitsForSameReviewAndTheme(validUnits);
    allUnits.push(...merged);
  }

  return allUnits;
}


