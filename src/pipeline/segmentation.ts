import type { Review, ReviewUnit } from "../schemas";
import type { LLMClient } from "../llm/client";

function isLowInformationOrAbusive(text: string): boolean {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  if (!trimmed) return true;

  const abusiveShortList = ["垃圾", "无语", "服了"];
  const abusivePhrases = ["赶紧给老子倒闭"];

  const hasAbusiveShort = abusiveShortList.some(
    (k) => trimmed === k || trimmed.endsWith(k),
  );
  const hasAbusivePhrase = abusivePhrases.some((k) => trimmed.includes(k));

  if (hasAbusiveShort || hasAbusivePhrase) {
    return true;
  }

  const productKeywords = [
    "价格",
    "太贵",
    "便宜",
    "质量",
    "做工",
    "配置",
    "性能",
    "体验",
    "画面",
    "音效",
    "服务",
    "客服",
    "售后",
    "物流",
    "配送",
    "稳定性",
  ];

  const hasProductAspect = productKeywords.some(
    (k) => trimmed.includes(k) || lower.includes(k),
  );

  if (trimmed.length <= 4 && !hasProductAspect) {
    return true;
  }

  return false;
}

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
    const validUnits = result.units.filter((u) => {
      if (
        typeof u.unit_text !== "string" ||
        u.unit_text.trim().length === 0 ||
        typeof u.theme !== "string" ||
        u.theme.trim().length === 0
      ) {
        return false;
      }
      if (isLowInformationOrAbusive(u.unit_text)) {
        return false;
      }
      return true;
    });
    const merged = mergeUnitsForSameReviewAndTheme(validUnits);
    allUnits.push(...merged);
  }

  return allUnits;
}


