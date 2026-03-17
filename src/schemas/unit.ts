import { z } from "zod";

export const ReviewUnitSchema = z.object({
  unit_id: z.string(),
  review_id: z.string(),
  theme: z.string(),
  polarity: z.enum(["positive", "negative"]),
  unit_text: z.string().min(1),
  emotion_intensity: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
  ]),
  date: z.string().optional(),
});

export type ReviewUnit = z.infer<typeof ReviewUnitSchema>;

