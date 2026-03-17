import type { Review, ReviewUnit } from "../schemas";
import type { LLMClient } from "../llm/client";

export async function applySentimentAnalysis(
  reviews: Review[],
  units: ReviewUnit[],
  llm: LLMClient,
): Promise<Review[]> {
  const sentimentResults = await llm.analyzeSentiment(reviews, units);
  const byId = new Map(sentimentResults.map((r) => [r.review_id, r]));

  return reviews.map((review) => {
    const result = byId.get(review.review_id);
    if (!result) return review;
    return {
      ...review,
      overall_sentiment_score: result.overall_sentiment_score,
      overall_sentiment_class: result.overall_sentiment_class,
    };
  });
}

