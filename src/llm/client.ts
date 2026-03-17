import type { Review, ReviewUnit, Theme } from "../schemas";

export interface SentimentResult {
  review_id: string;
  overall_sentiment_score: number;
  overall_sentiment_class: "positive" | "negative" | "mixed" | "other";
}

export interface SegmentationResult {
  review_id: string;
  units: ReviewUnit[];
}

export interface ThemeGenerationResult {
  themes: Theme[];
  units: ReviewUnit[];
}

export interface ThemeSummaryResult {
  themes: Theme[];
}

export interface LLMClient {
  analyzeSentiment(
    reviews: Review[],
    units: ReviewUnit[],
  ): Promise<SentimentResult[]>;
  segmentReviews(reviews: Review[]): Promise<SegmentationResult[]>;
  generateThemes(units: ReviewUnit[]): Promise<ThemeGenerationResult>;
  summarizeThemes(
    themes: Theme[],
    units: ReviewUnit[],
  ): Promise<ThemeSummaryResult>;
  /**
   * 局部主题重分类，用于 merge / delete 等操作后的局部 rerun。
   * 只允许在给定 themes 范围内（或显式选择 "other"）重新归类。
   */
  reclassifyUnits(
    units: ReviewUnit[],
    themes: Theme[],
  ): Promise<ReviewUnit[]>;
}

