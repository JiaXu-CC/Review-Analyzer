import { z } from "zod";

export const SegmentationFeedbackSchema = z.object({
  review_id: z.string(),
  is_correct: z.boolean(),
  error_types: z
    .array(
      z.enum([
        "missed_split",
        "too_fragmented",
        "wrong_polarity",
        "same_theme_not_merged",
      ]),
    )
    .optional(),
  note: z.string().optional(),
});

export type SegmentationFeedback = z.infer<typeof SegmentationFeedbackSchema>;

export const ThemeSetFeedbackActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("rename"),
    from: z.string(),
    to: z.string(),
  }),
  z.object({
    type: z.literal("merge"),
    from: z.array(z.string()).min(1),
    to: z.string(),
  }),
  z.object({
    type: z.literal("delete"),
    theme: z.string(),
  }),
  z.object({
    type: z.literal("regenerate_all"),
  }),
]);

export const ThemeSetFeedbackSchema = z.object({
  is_theme_set_correct: z.boolean(),
  actions: z.array(ThemeSetFeedbackActionSchema).optional(),
});

export type ThemeSetFeedback = z.infer<typeof ThemeSetFeedbackSchema>;
export type ThemeSetFeedbackAction = z.infer<
  typeof ThemeSetFeedbackActionSchema
>;

export const UnitThemeFeedbackSchema = z.object({
  unit_id: z.string(),
  current_theme: z.string(),
  is_correct: z.boolean(),
  target_theme: z.union([z.string(), z.literal("other")]).optional(),
});

export type UnitThemeFeedback = z.infer<typeof UnitThemeFeedbackSchema>;

export const FeedbackBundleSchema = z.object({
  segmentation: z.array(SegmentationFeedbackSchema).optional(),
  theme_set: ThemeSetFeedbackSchema.optional(),
  unit_themes: z.array(UnitThemeFeedbackSchema).optional(),
});

export type FeedbackBundle = z.infer<typeof FeedbackBundleSchema>;

