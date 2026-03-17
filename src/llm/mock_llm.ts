import { generateId } from "../utils/ids";
import type { Review, ReviewUnit, Theme } from "../schemas";
import type {
  LLMClient,
  SentimentResult,
  SegmentationResult,
  ThemeGenerationResult,
  ThemeSummaryResult,
} from "./client";

function simpleSentimentScore(text: string): number {
  const lower = text.toLowerCase();
  const positiveKeywords = ["good", "great", "excellent", "love", "喜欢", "满意"];
  const negativeKeywords = ["bad", "terrible", "poor", "hate", "失望", "垃圾"];

  let score = 0;
  for (const word of positiveKeywords) {
    if (lower.includes(word)) score += 1;
  }
  for (const word of negativeKeywords) {
    if (lower.includes(word)) score -= 1;
  }
  if (score > 5) score = 5;
  if (score < -5) score = -5;
  return score;
}

function scoreToClass(score: number): "positive" | "negative" | "mixed" | "other" {
  if (score > 1) return "positive";
  if (score < -1) return "negative";
  if (score === 0) return "other";
  return "mixed";
}

function simplePolarity(score: number): "positive" | "negative" {
  return score >= 0 ? "positive" : "negative";
}

function simpleThemeFromText(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes("price") || lower.includes("expensive") || lower.includes("便宜") || lower.includes("价格")) {
    return "pricing";
  }
  if (lower.includes("quality") || lower.includes("broken") || lower.includes("做工") || lower.includes("质量")) {
    return "quality";
  }
  if (lower.includes("delivery") || lower.includes("shipping") || lower.includes("物流")) {
    return "delivery";
  }
  return "general";
}

export class MockLLMClient implements LLMClient {
  async analyzeSentiment(
    reviews: Review[],
    _units: ReviewUnit[],
  ): Promise<SentimentResult[]> {
    return reviews.map((r) => {
      const score = simpleSentimentScore(r.review_text);
      return {
        review_id: r.review_id,
        overall_sentiment_score: score,
        overall_sentiment_class: scoreToClass(score),
      };
    });
  }

  async segmentReviews(reviews: Review[]): Promise<SegmentationResult[]> {
    return reviews.map((r) => {
      const score = simpleSentimentScore(r.review_text);
      const polarity = simplePolarity(score);
      const theme = simpleThemeFromText(r.review_text);
      const unit: ReviewUnit = {
        unit_id: generateId("unit"),
        review_id: r.review_id,
        theme,
        polarity,
        unit_text: r.review_text,
        emotion_intensity: (Math.min(5, Math.max(1, Math.abs(score))) || 1) as 1 | 2 | 3 | 4 | 5,
        date: r.date,
      };
      // 保证同 review 同 theme 只有一个片段：这里 mock 直接 1 个
      return {
        review_id: r.review_id,
        units: [unit],
      };
    });
  }

  async generateThemes(units: ReviewUnit[]): Promise<ThemeGenerationResult> {
    const themesByName = new Map<string, Theme>();

    for (const unit of units) {
      const name = unit.theme;
      if (!themesByName.has(name)) {
        themesByName.set(name, {
          theme_id: generateId("theme"),
          theme_name: name,
          representative_examples: [],
        });
      }
    }

    const themes = Array.from(themesByName.values());
    return { themes, units };
  }

  async summarizeThemes(
    themes: Theme[],
    units: ReviewUnit[],
  ): Promise<ThemeSummaryResult> {
    const unitsByTheme = new Map<string, ReviewUnit[]>();
    for (const unit of units) {
      const list = unitsByTheme.get(unit.theme) ?? [];
      list.push(unit);
      unitsByTheme.set(unit.theme, list);
    }

    const updatedThemes = themes.map((theme) => {
      const relatedUnits = unitsByTheme.get(theme.theme_name) ?? [];
      const examples = relatedUnits.slice(0, 3).map((u) => u.unit_text);
      return {
        ...theme,
        representative_examples: examples,
      };
    });

    return { themes: updatedThemes };
  }

  async reclassifyUnits(
    units: ReviewUnit[],
    themes: Theme[],
  ): Promise<ReviewUnit[]> {
    if (themes.length === 0) return units;
    const themeNames = themes.map((t) => t.theme_name);

    return units.map((unit) => {
      const score = simpleSentimentScore(unit.unit_text);
      const polarity = simplePolarity(score);
      const suggestedTheme = simpleThemeFromText(unit.unit_text);

      const normalized =
        themeNames.includes(suggestedTheme) ? suggestedTheme : "other";

      const targetTheme =
        normalized === "other" && themeNames.includes("other")
          ? "other"
          : themeNames.includes(normalized)
            ? normalized
            : "other";

      const intensity = (Math.min(5, Math.max(1, Math.abs(score))) ||
        1) as 1 | 2 | 3 | 4 | 5;

      return {
        ...unit,
        theme: targetTheme,
        polarity,
        emotion_intensity: intensity,
      };
    });
  }
}

