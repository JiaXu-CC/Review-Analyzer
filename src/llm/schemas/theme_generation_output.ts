import { z } from "zod";

export const ThemeGenerationThemeSchema = z.object({
  theme_name: z.string().min(1),
});

export const ThemeGenerationUnitSchema = z.object({
  review_id: z.string(),
  unit_text: z.string().min(1),
  polarity: z.enum(["positive", "negative"]),
  emotion_intensity: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
  ]),
  date: z.string().optional(),
  theme: z.string().min(1),
});

export const ThemeGenerationOutputSchema = z.object({
  themes: z.array(ThemeGenerationThemeSchema),
  units: z.array(ThemeGenerationUnitSchema),
});

export type ThemeGenerationOutput = z.infer<typeof ThemeGenerationOutputSchema>;

