import { z } from "zod";
import { ReviewSchema } from "./review";
import { ReviewUnitSchema } from "./unit";
import { ThemeSchema } from "./theme";

export const SessionConfigSchema = z.object({
  product_name: z.string(),
  enable_time_analysis: z.boolean(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  time_granularity: z.enum(["month", "quarter"]).optional(),
});

export type SessionConfig = z.infer<typeof SessionConfigSchema>;

export const AnalysisSessionSchema = z.object({
  session_id: z.string(),
  config: SessionConfigSchema,
  segmentation_status: z.enum(["pending", "approved", "needs_revision"]),
  theme_status: z.enum(["pending", "approved", "needs_revision"]),
  report_status: z.enum(["locked", "ready"]),
  reviews: z.array(ReviewSchema),
  units: z.array(ReviewUnitSchema),
  themes: z.array(ThemeSchema),
});

export type AnalysisSession = z.infer<typeof AnalysisSessionSchema>;

