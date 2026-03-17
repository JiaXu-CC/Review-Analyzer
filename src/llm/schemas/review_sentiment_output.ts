import { z } from "zod";

export const ReviewSentimentItemSchema = z.object({
  review_id: z.string(),
  overall_sentiment_score: z.number().min(-5).max(5),
  overall_sentiment_class: z.enum(["positive", "negative", "mixed", "other"]),
});

export const ReviewSentimentArraySchema = z.array(ReviewSentimentItemSchema);

export type ReviewSentimentItem = z.infer<typeof ReviewSentimentItemSchema>;

