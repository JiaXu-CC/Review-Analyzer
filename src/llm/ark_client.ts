import type { Review, ReviewUnit, Theme } from "../schemas";
import type {
  LLMClient,
  SentimentResult,
  SegmentationResult,
  ThemeGenerationResult,
  ThemeSummaryResult,
} from "./client";
import { SEGMENTATION_SYSTEM_PROMPT } from "./prompts/segmentation";
import {
  SegmentationResultArraySchema,
  type SegmentationResultItem,
} from "./schemas/segmentation_output";
import { MockLLMClient } from "./mock_llm";
import { generateId } from "../utils/ids";
import { REVIEW_SENTIMENT_SYSTEM_PROMPT } from "./prompts/review_sentiment";
import {
  ReviewSentimentArraySchema,
  type ReviewSentimentItem,
} from "./schemas/review_sentiment_output";
import { THEME_GENERATION_SYSTEM_PROMPT } from "./prompts/theme_generation";
import {
  ThemeGenerationOutputSchema,
  type ThemeGenerationOutput,
} from "./schemas/theme_generation_output";
import { THEME_SUMMARY_SYSTEM_PROMPT } from "./prompts/theme_summary";
import {
  ThemeSummaryArraySchema,
  type ThemeSummaryItem,
} from "./schemas/theme_summary_output";
import { extractJsonString } from "./utils/extract_json";
import { isChineseText, allChineseLines } from "./utils/text_language";

function getModel() {
  const model = process.env.ARK_MODEL;
  if (!model) {
    throw new Error("ARK_MODEL is not set");
  }
  return model;
}

async function callArkChat(
  payload: unknown,
  stage: string,
): Promise<unknown> {
  const apiKey = process.env.ARK_API_KEY;
  if (!apiKey) {
    throw new Error("ARK_API_KEY is not set");
  }

  const base = process.env.ARK_BASE_URL;
  if (!base) {
    throw new Error("ARK_BASE_URL is not set");
  }

  const baseUrl = base.replace(/\/+$/, "");

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Ark API error: ${res.status} ${res.statusText} - ${text}`,
    );
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error(`Ark API returned empty content for stage=${stage}`);
  }

  const rawText = typeof content === "string" ? content : String(content);
  const extracted = extractJsonString(rawText);

  if (!extracted.json) {
    // eslint-disable-next-line no-console
    console.error(
      `[ark][${stage}] failed to extract JSON. raw (first 1000 chars):`,
      rawText.slice(0, 1000),
    );
    throw new Error(`Failed to extract JSON content for stage=${stage}`);
  }

  try {
    const parsed = JSON.parse(extracted.json) as unknown;
    // eslint-disable-next-line no-console
    console.debug?.(
      `[ark][${stage}] parsed JSON preview (first 1000 chars):`,
      JSON.stringify(parsed).slice(0, 1000),
    );
    return parsed;
  } catch (parseErr) {
    // eslint-disable-next-line no-console
    console.error(
      `[ark][${stage}] JSON.parse failed. extracted (first 1000 chars):`,
      extracted.json.slice(0, 1000),
    );
    throw new Error(
      `JSON.parse failed for stage=${stage}: ${(parseErr as Error).message}`,
    );
  }
}

function normalizePolarity(raw: unknown): "positive" | "negative" | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  if (["positive", "pos", "+", "正向", "好评"].includes(v)) return "positive";
  if (["negative", "neg", "-", "负向", "差评"].includes(v)) return "negative";
  return null;
}

function guessPolarityFromText(text: string): "positive" | "negative" | null {
  const lower = text.toLowerCase();
  const positiveKeywords = ["good", "great", "excellent", "love", "like", "满意", "喜欢"];
  const negativeKeywords = ["bad", "terrible", "poor", "hate", "disappoint", "失望", "垃圾"];

  let score = 0;
  for (const w of positiveKeywords) {
    if (lower.includes(w)) score += 1;
  }
  for (const w of negativeKeywords) {
    if (lower.includes(w)) score -= 1;
  }
  if (score > 0) return "positive";
  if (score < 0) return "negative";
  return null;
}

export class ArkLLMClient implements LLMClient {
  private readonly fallback = new MockLLMClient();

  async analyzeSentiment(
    reviews: Review[],
    units: ReviewUnit[],
  ): Promise<SentimentResult[]> {
    const model = getModel();
    try {
      const groupedUnits = new Map<
        string,
        { theme: string; polarity: string; unit_text: string; emotion_intensity: number }[]
      >();
      for (const u of units) {
        const list = groupedUnits.get(u.review_id) ?? [];
        list.push({
          theme: u.theme,
          polarity: u.polarity,
          unit_text: u.unit_text,
          emotion_intensity: u.emotion_intensity,
        });
        groupedUnits.set(u.review_id, list);
      }

      const payload = {
        model,
        messages: [
          {
            role: "system",
            content: REVIEW_SENTIMENT_SYSTEM_PROMPT,
          },
          {
            role: "user",
            content: JSON.stringify(
              reviews.map((r) => ({
                review_id: r.review_id,
                review_text: r.review_text,
                units: groupedUnits.get(r.review_id) ?? [],
              })),
            ),
          },
        ],
        temperature: 0.1,
      };

      const raw = await callArkChat(payload, "review_sentiment");
      const parsed = ReviewSentimentArraySchema.safeParse(raw);
      if (!parsed.success) {
        throw new Error(
          `Failed to parse review sentiment response: ${parsed.error.message}`,
        );
      }

      const byId = new Map<string, ReviewSentimentItem>();
      for (const item of parsed.data) {
        byId.set(item.review_id, item);
      }

      const results: SentimentResult[] = reviews.map((r) => {
        const item = byId.get(r.review_id);
        if (!item) {
          return {
            review_id: r.review_id,
            overall_sentiment_score: 0,
            overall_sentiment_class: "other",
          };
        }
        return {
          review_id: r.review_id,
          overall_sentiment_score: item.overall_sentiment_score,
          overall_sentiment_class: item.overall_sentiment_class,
        };
      });

      return results;
    } catch (err) {
      console.warn(
        `Ark review sentiment failed, falling back to mock. Reason: ${(err as Error).message}`,
      );
      return this.fallback.analyzeSentiment(reviews, units);
    }
  }

  async segmentReviews(reviews: Review[]): Promise<SegmentationResult[]> {
    const model = getModel();
    try {
      const payload = {
        model,
        messages: [
          {
            role: "system",
            content: SEGMENTATION_SYSTEM_PROMPT,
          },
          {
            role: "user",
            content: JSON.stringify(
              reviews.map((r) => ({
                review_id: r.review_id,
                review_text: r.review_text,
                date: r.date,
              })),
            ),
          },
        ],
        temperature: 0.2,
      };

      const raw = await callArkChat(payload, "segmentation");

      const normalizedItems: SegmentationResultItem[] = [];
      if (Array.isArray(raw)) {
        raw.forEach((item, itemIndex) => {
          if (!item || typeof item !== "object") return;
          const anyItem = item as { review_id?: unknown; units?: unknown };
          if (typeof anyItem.review_id !== "string") return;
          const unitsRaw = Array.isArray(anyItem.units) ? anyItem.units : [];

          const normalizedUnits = unitsRaw
            .map((u, unitIndex) => {
              if (!u || typeof u !== "object") return null;
              const anyUnit = u as {
                theme?: unknown;
                polarity?: unknown;
                unit_text?: unknown;
                emotion_intensity?: unknown;
              };
              if (
                typeof anyUnit.theme !== "string" ||
                anyUnit.theme.trim().length === 0
              ) {
                return null;
              }
              if (
                typeof anyUnit.unit_text !== "string" ||
                anyUnit.unit_text.trim().length === 0
              ) {
                return null;
              }

              let polarity = normalizePolarity(anyUnit.polarity);
              if (!polarity) {
                polarity = guessPolarityFromText(anyUnit.unit_text);
              }
              if (!polarity) {
                console.warn(
                  `[ark][segmentation] drop unit due to unresolvable polarity. review_id=${anyItem.review_id}, itemIndex=${itemIndex}, unitIndex=${unitIndex}`,
                );
                return null;
              }

              let intensity: number;
              if (
                typeof anyUnit.emotion_intensity === "number" &&
                Number.isInteger(anyUnit.emotion_intensity) &&
                anyUnit.emotion_intensity >= 1 &&
                anyUnit.emotion_intensity <= 5
              ) {
                intensity = anyUnit.emotion_intensity;
              } else {
                intensity = 3;
              }

              return {
                review_id: anyItem.review_id,
                theme: anyUnit.theme.trim(),
                polarity,
                unit_text: anyUnit.unit_text,
                emotion_intensity: intensity as 1 | 2 | 3 | 4 | 5,
              };
            })
            .filter((u): u is SegmentationResultItem["units"][number] => u !== null);

          normalizedItems.push({
            review_id: anyItem.review_id,
            units: normalizedUnits,
          });
        });
      }

      const parsed = SegmentationResultArraySchema.safeParse(normalizedItems);
      if (!parsed.success) {
        throw new Error(
          `Failed to parse segmentation response after normalization: ${parsed.error.message}`,
        );
      }

      const byId = new Map<string, SegmentationResultItem>();
      for (const item of parsed.data) {
        byId.set(item.review_id, item);
      }

      const results: SegmentationResult[] = reviews.map((review) => {
        const item = byId.get(review.review_id);
        const units: ReviewUnit[] =
          item?.units.map((u) => ({
            unit_id: generateId("unit"),
            review_id: review.review_id,
            theme: u.theme,
            polarity: u.polarity,
            unit_text: u.unit_text.trim(),
            emotion_intensity: u.emotion_intensity,
            date: review.date,
          })) ?? [];
        return {
          review_id: review.review_id,
          units,
        };
      });

      return results;
    } catch (err) {
      console.warn(
        `Ark segmentation failed, falling back to mock. Reason: ${(err as Error).message}`,
      );
      return this.fallback.segmentReviews(reviews);
    }
  }

  async generateThemes(units: ReviewUnit[]): Promise<ThemeGenerationResult> {
    const model = getModel();
    try {
      const payload = {
        model,
        messages: [
          {
            role: "system",
            content: THEME_GENERATION_SYSTEM_PROMPT,
          },
          {
            role: "user",
            content: JSON.stringify(
              units.map((u) => ({
                review_id: u.review_id,
                unit_text: u.unit_text,
                polarity: u.polarity,
                emotion_intensity: u.emotion_intensity,
                date: u.date,
              })),
            ),
          },
        ],
        temperature: 0.2,
      };

      const raw = await callArkChat(payload, "theme_generation");
      const parsed = ThemeGenerationOutputSchema.safeParse(raw);
      if (!parsed.success) {
        throw new Error(
          `Failed to parse theme generation response: ${parsed.error.message}`,
        );
      }

      const output: ThemeGenerationOutput = parsed.data;

      const allChineseThemeNames = output.themes.every((t) =>
        isChineseText(t.theme_name),
      );
      if (!allChineseThemeNames) {
        throw new Error("Theme generation produced non-Chinese theme_name");
      }
      const themes: Theme[] = output.themes.map((t, index) => ({
        theme_id: generateId(`theme_${index}`),
        theme_name: t.theme_name,
        representative_examples: [],
      }));

      const themesSet = new Set(output.themes.map((t) => t.theme_name));

      const unitsWithThemes: ReviewUnit[] = units.map((u) => {
        const mapped = output.units.find(
          (ou) =>
            ou.review_id === u.review_id &&
            ou.unit_text === u.unit_text &&
            ou.polarity === u.polarity,
        );
        const themeName =
          mapped && themesSet.has(mapped.theme) ? mapped.theme : u.theme;
        return {
          ...u,
          theme: themeName,
        };
      });

      return { themes, units: unitsWithThemes };
    } catch (err) {
      console.warn(
        `Ark theme generation failed, falling back to mock. Reason: ${(err as Error).message}`,
      );
      return this.fallback.generateThemes(units);
    }
  }

  async summarizeThemes(
    themes: Theme[],
    units: ReviewUnit[],
  ): Promise<ThemeSummaryResult> {
    const model = getModel();
    try {
      const payload = {
        model,
        messages: [
          {
            role: "system",
            content: THEME_SUMMARY_SYSTEM_PROMPT,
          },
          {
            role: "user",
            content: JSON.stringify({
              themes: themes.map((t) => ({
                theme_id: t.theme_id,
                theme_name: t.theme_name,
              })),
              units: units.map((u) => ({
                review_id: u.review_id,
                theme: u.theme,
                polarity: u.polarity,
                unit_text: u.unit_text,
                emotion_intensity: u.emotion_intensity,
              })),
            }),
          },
        ],
        temperature: 0.2,
      };

      const raw = await callArkChat(payload, "theme_summary");
      const parsed = ThemeSummaryArraySchema.safeParse(
        (raw as { themes?: unknown }).themes ?? raw,
      );
      if (!parsed.success) {
        throw new Error(
          `Failed to parse theme summary response: ${parsed.error.message}`,
        );
      }

      const allChineseKeyPoints = parsed.data.every((item) =>
        item.key_points ? allChineseLines(item.key_points) : true,
      );
      if (!allChineseKeyPoints) {
        throw new Error("Theme summary produced non-Chinese key_points");
      }

      const byId = new Map<string, ThemeSummaryItem>();
      for (const item of parsed.data) {
        byId.set(item.theme_id, item);
      }

      const updatedThemes: Theme[] = themes.map((t) => {
        const item = byId.get(t.theme_id);
        if (!item) return t;
        return {
          ...t,
          representative_examples: item.representative_examples,
          key_points: item.key_points,
        };
      });

      return { themes: updatedThemes };
    } catch (err) {
      console.warn(
        `Ark theme summary failed, falling back to mock. Reason: ${(err as Error).message}`,
      );
      return this.fallback.summarizeThemes(themes, units);
    }
  }

  async reclassifyUnits(
    units: ReviewUnit[],
    themes: Theme[],
  ): Promise<ReviewUnit[]> {
    const model = getModel();
    try {
      const payload = {
        model,
        messages: [
          {
            role: "system",
            content:
              "You are a theme reclassification engine. Given candidate themes and some review units, re-assign each unit to the most appropriate existing theme name, or 'other' if none fit. Do not invent new theme names. Output a JSON array of units with fields: review_id, theme, polarity, unit_text, emotion_intensity (1-5), date?.",
          },
          {
            role: "user",
            content: JSON.stringify({
              themes: themes.map((t) => t.theme_name),
              units: units.map((u) => ({
                review_id: u.review_id,
                theme: u.theme,
                polarity: u.polarity,
                unit_text: u.unit_text,
                emotion_intensity: u.emotion_intensity,
                date: u.date,
              })),
            }),
          },
        ],
        temperature: 0.2,
      };

      const raw = await callArkChat(payload, "reclassification");
      if (!Array.isArray(raw)) {
        throw new Error("Reclassification response is not an array");
      }

      const themeNames = new Set(themes.map((t) => t.theme_name).concat("other"));

      const normalized = raw
        .map((u) => {
          if (!u || typeof u !== "object") return null;
          const anyU = u as {
            review_id?: unknown;
            theme?: unknown;
            polarity?: unknown;
            unit_text?: unknown;
            emotion_intensity?: unknown;
            date?: unknown;
          };
          if (typeof anyU.review_id !== "string") return null;
          if (typeof anyU.unit_text !== "string") return null;
          const theme =
            typeof anyU.theme === "string" && themeNames.has(anyU.theme)
              ? anyU.theme
              : "other";
          const polarity =
            anyU.polarity === "positive" || anyU.polarity === "negative"
              ? anyU.polarity
              : "positive";
          const intensity =
            typeof anyU.emotion_intensity === "number" &&
            anyU.emotion_intensity >= 1 &&
            anyU.emotion_intensity <= 5
              ? anyU.emotion_intensity
              : 3;
          return {
            review_id: anyU.review_id,
            theme,
            polarity,
            unit_text: anyU.unit_text,
            emotion_intensity: intensity as 1 | 2 | 3 | 4 | 5,
            date:
              typeof anyU.date === "string" && anyU.date.length > 0
                ? anyU.date
                : undefined,
          };
        })
        .filter((u): u is ReviewUnit => u !== null);

      return normalized;
    } catch (err) {
      console.warn(
        `Ark reclassification failed, falling back to mock. Reason: ${(err as Error).message}`,
      );
      return this.fallback.reclassifyUnits(units, themes);
    }
  }
}

