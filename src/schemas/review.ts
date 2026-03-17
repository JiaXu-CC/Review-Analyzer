import { z } from "zod";

export const ReviewSchema = z.object({
  review_id: z.string(),
  review_text: z.string().min(1, "review_text is required"),
  date: z.string().optional(),
  overall_sentiment_score: z.number().min(-5).max(5).optional(),
  overall_sentiment_class: z
    .enum(["positive", "negative", "mixed", "other"])
    .optional(),
});

export type Review = z.infer<typeof ReviewSchema>;

