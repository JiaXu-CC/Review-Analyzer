import { z } from "zod";

export const ThemeSummaryItemSchema = z.object({
  theme_id: z.string(),
  theme_name: z.string(),
  representative_examples: z.array(z.string()),
  key_points: z.array(z.string()).optional(),
});

export const ThemeSummaryArraySchema = z.array(ThemeSummaryItemSchema);

export type ThemeSummaryItem = z.infer<typeof ThemeSummaryItemSchema>;

