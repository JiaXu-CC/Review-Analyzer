import { z } from "zod";

export const ThemeSchema = z.object({
  theme_id: z.string(),
  theme_name: z.string(),
  representative_examples: z.array(z.string()),
  // 可选：主题下的关键要点（用于更丰富的 summary 展示）
  key_points: z.array(z.string()).optional(),
});

export type Theme = z.infer<typeof ThemeSchema>;

