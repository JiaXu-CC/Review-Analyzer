import { z } from "zod";

export const SegmentationUnitSchema = z.object({
  theme: z.string().min(1),
  polarity: z.enum(["positive", "negative"]),
  unit_text: z.string().min(1),
  emotion_intensity: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
  ]),
});

export const SegmentationResultItemSchema = z.object({
  review_id: z.string(),
  units: z.array(SegmentationUnitSchema),
});

export const SegmentationResultArraySchema = z.array(
  SegmentationResultItemSchema,
);

export type SegmentationUnit = z.infer<typeof SegmentationUnitSchema>;
export type SegmentationResultItem = z.infer<typeof SegmentationResultItemSchema>;

