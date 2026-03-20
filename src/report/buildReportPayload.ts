import path from "node:path";
import { AnalysisSessionSchema, type AnalysisSession } from "../schemas";

type TimeGranularity = "month" | "quarter";

function isValidDateString(s: unknown): s is string {
  if (typeof s !== "string") return false;
  const d = new Date(s);
  return !Number.isNaN(d.getTime());
}

function parseDateSafe(s: string): Date | null {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function toMonthKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

function toQuarterKey(d: Date): string {
  const y = d.getUTCFullYear();
  const q = Math.floor(d.getUTCMonth() / 3) + 1;
  return `${y}-Q${q}`;
}

function addMonthsUTC(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

function listBuckets(
  start: Date,
  end: Date,
  granularity: TimeGranularity,
): string[] {
  const buckets: string[] = [];
  if (granularity === "month") {
    let cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
    const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
    while (cur.getTime() <= last.getTime()) {
      buckets.push(toMonthKey(cur));
      cur = addMonthsUTC(cur, 1);
    }
    return buckets;
  }

  // quarter
  const normalizeQuarterStart = (d: Date): Date => {
    const q = Math.floor(d.getUTCMonth() / 3);
    return new Date(Date.UTC(d.getUTCFullYear(), q * 3, 1));
  };

  let cur = normalizeQuarterStart(start);
  const last = normalizeQuarterStart(end);
  while (cur.getTime() <= last.getTime()) {
    buckets.push(toQuarterKey(cur));
    cur = addMonthsUTC(cur, 3);
  }
  return buckets;
}

function movingAverage(values: number[], window = 3): number[] {
  if (values.length === 0) return [];
  const half = Math.floor(window / 2);
  return values.map((_, i) => {
    const start = Math.max(0, i - half);
    const end = Math.min(values.length - 1, i + half);
    let sum = 0;
    let count = 0;
    for (let j = start; j <= end; j += 1) {
      sum += values[j];
      count += 1;
    }
    return count ? sum / count : 0;
  });
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function normalizeKeyPointsForCounts(point: string): string {
  // 将 key_point 中的非中文字符剔除，便于做“包含匹配”
  return point.replace(/[^\u4e00-\u9fff]/g, "");
}

function extractBigrams(s: string): string[] {
  const t = normalizeKeyPointsForCounts(s);
  if (t.length < 2) return [];
  const bigrams: string[] = [];
  for (let i = 0; i < t.length - 1; i += 1) {
    bigrams.push(t.slice(i, i + 2));
  }
  // 去重但保持稳定顺序
  return Array.from(new Set(bigrams));
}

function countUnitsByKeyPointApprox(
  units: Array<{ unit_text: string }>,
  keyPoint: string,
): number {
  const bigrams = extractBigrams(keyPoint);
  if (bigrams.length === 0) return 0;

  const unitTexts = units.map((u) => u.unit_text.replace(/[^\u4e00-\u9fff]/g, ""));
  let count = 0;
  for (const ut of unitTexts) {
    const matched = bigrams.some((bg) => ut.includes(bg));
    if (matched) count += 1;
  }
  return count;
}

function getTimeBucketKey(d: Date, granularity: TimeGranularity): string {
  return granularity === "month" ? toMonthKey(d) : toQuarterKey(d);
}

function safeAvg(nums: number[]): number {
  if (!nums.length) return 0;
  const sum = nums.reduce((a, b) => a + b, 0);
  return sum / nums.length;
}

export function buildReportPayloadFromSession(
  sessionJson: unknown,
): Record<string, unknown> {
  const session = AnalysisSessionSchema.parse(sessionJson);

  const enableTimeAnalysis = session.config.enable_time_analysis;
  const timeGranularity = session.config.time_granularity;

  const validReviewsWithDate = session.reviews
    .filter((r) => isValidDateString(r.date))
    .map((r) => ({
      review_id: r.review_id,
      date: r.date as string,
      d: parseDateSafe(r.date as string),
    }))
    .filter((x) => x.d !== null) as Array<{
    review_id: string;
    date: string;
    d: Date;
  }>;

  const validDates = validReviewsWithDate.map((x) => x.d.getTime());

  const timeCoverage =
    validDates.length > 0
      ? {
          start_date: new Date(Math.min(...validDates)).toISOString(),
          end_date: new Date(Math.max(...validDates)).toISOString(),
        }
      : undefined;

  // --- sample_overview: timeline distributions (模块3) ---
  let timelineCurve: unknown = undefined;
  let timelineBar: unknown = undefined;
  if (timeCoverage && timeGranularity) {
    const startD = validReviewsWithDate.reduce((min, r) =>
      r.d!.getTime() < min.d!.getTime() ? r : min,
    ).d;
    const endD = validReviewsWithDate.reduce((max, r) =>
      r.d!.getTime() > max.d!.getTime() ? r : max,
    ).d;

    const buckets = listBuckets(startD!, endD!, timeGranularity);
    const counts = buckets.map((b) => {
      const n = validReviewsWithDate.filter(
        (r) => getTimeBucketKey(r.d!, timeGranularity) === b,
      ).length;
      return n;
    });
    const smoothed = movingAverage(counts, 3);

    timelineCurve = {
      granularity: timeGranularity,
      points: buckets.map((b, i) => ({
        bucket: b,
        count: counts[i],
        count_smoothed: smoothed[i],
      })),
    };
    timelineBar = {
      granularity: timeGranularity,
      buckets: buckets.map((b, i) => ({
        bucket: b,
        count: counts[i],
      })),
    };
  }

  // --- overall sentiment (模块4.1) ---
  const reviewsWithScore = session.reviews.filter(
    (r) =>
      typeof r.overall_sentiment_score === "number" &&
      r.overall_sentiment_score >= -5 &&
      r.overall_sentiment_score <= 5,
  );

  const scoreDensity = new Map<number, number>();
  for (let s = -5; s <= 5; s += 1) scoreDensity.set(s, 0);
  for (const r of reviewsWithScore) {
    const s = r.overall_sentiment_score as number;
    scoreDensity.set(s, (scoreDensity.get(s) ?? 0) + 1);
  }

  const sentimentClassCounts: Record<
    "positive" | "negative" | "mixed" | "other",
    number
  > = { positive: 0, negative: 0, mixed: 0, other: 0 };

  for (const r of session.reviews) {
    const cls = r.overall_sentiment_class ?? "other";
    if (cls === "positive" || cls === "negative" || cls === "mixed") {
      sentimentClassCounts[cls] += 1;
    } else {
      sentimentClassCounts.other += 1;
    }
  }

  // --- theme stats: exclude units with theme "other" (模块4.*) ---
  const units = session.units.filter((u) => u.theme !== "other");

  const themeByName = new Map<string, typeof session.themes[number]>();
  for (const t of session.themes) {
    themeByName.set(t.theme_name, t);
  }

  const themesFromSession = session.themes.filter((t) => t.theme_name !== "other");

  const themeIndexCards = themesFromSession.map((t) => {
    const relatedUnits = units.filter((u) => u.theme === t.theme_name);
    const mentionCount = relatedUnits.length;

    const examplesFromThemes = t.representative_examples ?? [];
    const examples =
      examplesFromThemes.length >= 2
        ? examplesFromThemes.slice(0, 2)
        : relatedUnits
          .slice()
          .sort((a, b) => {
            const di = b.emotion_intensity - a.emotion_intensity;
            if (di !== 0) return di;
            return a.unit_text.localeCompare(b.unit_text);
          })
          .slice(0, 2)
          .map((u) => u.unit_text);

    return {
      theme_id: t.theme_id,
      theme_name: t.theme_name,
      mention_count: mentionCount,
      representative_examples: examples,
    };
  });

  // theme_analysis per polarity
  type Polarity = "positive" | "negative";
  const themePolarityStats = themesFromSession.map((t) => {
    const relatedUnits = units.filter((u) => u.theme === t.theme_name);
    const pos = relatedUnits.filter((u) => u.polarity === "positive");
    const neg = relatedUnits.filter((u) => u.polarity === "negative");
    return {
      theme_id: t.theme_id,
      theme_name: t.theme_name,
      mention_count: relatedUnits.length,
      positive_mention_count: pos.length,
      negative_mention_count: neg.length,
      positive_avg_intensity: safeAvg(pos.map((u) => u.emotion_intensity)),
      negative_avg_intensity: safeAvg(neg.map((u) => u.emotion_intensity)),
      positive_units: pos,
      negative_units: neg,
    };
  });

  const positiveScatter = themePolarityStats
    .map((s) => ({
      theme_id: s.theme_id,
      theme_name: s.theme_name,
      mention_count: s.positive_mention_count,
      avg_intensity: s.positive_avg_intensity,
    }))
    .sort((a, b) => {
      if (b.mention_count !== a.mention_count) return b.mention_count - a.mention_count;
      return b.avg_intensity - a.avg_intensity;
    });

  const negativeScatter = themePolarityStats
    .map((s) => ({
      theme_id: s.theme_id,
      theme_name: s.theme_name,
      mention_count: s.negative_mention_count,
      avg_intensity: s.negative_avg_intensity,
    }))
    .sort((a, b) => {
      if (b.mention_count !== a.mention_count) return b.mention_count - a.mention_count;
      return b.avg_intensity - a.avg_intensity;
    });

  const positiveFrequencyBar = positiveScatter
    .slice()
    .sort((a, b) => b.mention_count - a.mention_count);
  const negativeFrequencyBar = negativeScatter
    .slice()
    .sort((a, b) => b.mention_count - a.mention_count);

  const positiveIntensityBar = positiveScatter
    .slice()
    .sort((a, b) => b.avg_intensity - a.avg_intensity);
  const negativeIntensityBar = negativeScatter
    .slice()
    .sort((a, b) => b.avg_intensity - a.avg_intensity);

  // theme_comparison (模块4.4)
  const themeComparisonFrequency = themePolarityStats.map((s) => ({
    theme_id: s.theme_id,
    theme_name: s.theme_name,
    positive_mention_count: s.positive_mention_count,
    negative_mention_count: s.negative_mention_count,
  }));

  const themeComparisonIntensity = themePolarityStats.map((s) => ({
    theme_id: s.theme_id,
    theme_name: s.theme_name,
    positive_avg_intensity: s.positive_avg_intensity,
    negative_avg_intensity: s.negative_avg_intensity,
  }));

  // theme_details (模块4.3A): use key_points if available
  const themeDetails = themePolarityStats.map((s) => {
    const t = themeByName.get(s.theme_name);
    const rawKeyPoints = (t?.key_points ?? []).filter(
      (kp) => typeof kp === "string" && kp.trim().length > 0,
    );

    const points = rawKeyPoints.length ? rawKeyPoints.slice(0, 4) : [];
    const keyPointsWithCounts = points.map((kp) => ({
      point: kp,
      count: countUnitsByKeyPointApprox(
        units.filter((u) => u.theme === s.theme_name).map((u) => ({
          unit_text: u.unit_text,
        })),
        kp,
      ),
    }));

    return {
      theme_id: s.theme_id,
      theme_name: s.theme_name,
      key_points_with_counts: keyPointsWithCounts,
      // 保留原字段位（给 Step B/Step C 可选）
      key_points_raw: rawKeyPoints,
    };
  });

  // optimization_suggestions (模块5)
  const negCounts = themePolarityStats.map((s) => s.negative_mention_count);
  const maxNegFreq = Math.max(0, ...negCounts);

  const optimizationCandidates = themePolarityStats
    .filter((s) => s.negative_mention_count > 0)
    .map((s) => {
      const F =
        maxNegFreq > 0 ? s.negative_mention_count / maxNegFreq : 0;
      const I = clamp01(s.negative_avg_intensity / 5);
      return {
        theme_id: s.theme_id,
        theme_name: s.theme_name,
        negative_frequency_raw: s.negative_mention_count,
        negative_frequency_normalized: F,
        negative_intensity_raw: s.negative_avg_intensity,
        negative_intensity_normalized: I,
        priority_score: F * I,
      };
    })
    .sort((a, b) => b.priority_score - a.priority_score);

  const optimization_suggestions = optimizationCandidates.map((c, i) => ({
    ...c,
    rank: i + 1,
  }));

  // appendix_examples (模块6)
  const appendix_examples = themesFromSession.map((t) => {
    const relatedUnits = units.filter((u) => u.theme === t.theme_name);
    const positiveUnits = relatedUnits
      .filter((u) => u.polarity === "positive")
      .sort((a, b) => b.emotion_intensity - a.emotion_intensity);
    const negativeUnits = relatedUnits
      .filter((u) => u.polarity === "negative")
      .sort((a, b) => b.emotion_intensity - a.emotion_intensity);

    return {
      theme_id: t.theme_id,
      theme_name: t.theme_name,
      representative_examples: (t.representative_examples ?? []).slice(0, 2),
      positive_samples: positiveUnits.slice(0, 2).map((u) => u.unit_text),
      negative_samples: negativeUnits.slice(0, 2).map((u) => u.unit_text),
    };
  });

  // time_trends (模块4.5) - only when enabled + granularity + valid date
  let time_trends: unknown = undefined;
  const canGenerateTimeTrends =
    enableTimeAnalysis &&
    (timeGranularity === "month" || timeGranularity === "quarter") &&
    validReviewsWithDate.length > 0;

  if (canGenerateTimeTrends) {
    const startD = validReviewsWithDate.reduce((min, r) =>
      r.d.getTime() < min.d.getTime() ? r : min,
    ).d;
    const endD = validReviewsWithDate.reduce((max, r) =>
      r.d.getTime() > max.d.getTime() ? r : max,
    ).d;

    const buckets = listBuckets(startD, endD, timeGranularity);

    // overall sentiment line by bucket: avg score
    const reviewScoreByBucket = buckets.map((b) => {
      const rs = validReviewsWithDate.filter(
        (r) => getTimeBucketKey(r.d, timeGranularity) === b,
      );
      const scores = rs
        .map((x) => session.reviews.find((r) => r.review_id === x.review_id))
        .filter((r): r is typeof session.reviews[number] => !!r)
        .map((r) => r.overall_sentiment_score)
        .filter((s): s is number => typeof s === "number");

      return {
        bucket: b,
        count: rs.length,
        avg_overall_sentiment_score: scores.length ? safeAvg(scores) : 0,
      };
    });

    // map review_id -> date bucket for units fallback
    const reviewDateBucket = new Map<string, string>();
    for (const r of validReviewsWithDate) {
      reviewDateBucket.set(r.review_id, getTimeBucketKey(r.d, timeGranularity));
    }

    const unitBucket = (u: typeof session.units[number]): string | null => {
      if (isValidDateString(u.date)) {
        const d = parseDateSafe(u.date as string);
        if (d) return getTimeBucketKey(d, timeGranularity);
      }
      return reviewDateBucket.get(u.review_id) ?? null;
    };

    // theme mention series (positive/negative)
    const allThemeNames = themesFromSession.map((t) => t.theme_name);

    const buildMentionSeries = (polarity: Polarity) => {
      const series = allThemeNames.map((themeName) => {
        const pts = buckets.map((b) => {
          const c = units.filter((u) => u.theme === themeName && u.polarity === polarity)
            .filter((u) => unitBucket(u) === b).length;
          return { bucket: b, count: c };
        });
        const total = pts.reduce((a, p) => a + p.count, 0);
        return {
          theme_id: themeByName.get(themeName)?.theme_id ?? `theme_${themeName}`,
          theme_name: themeName,
          total_mentions: total,
          points: pts,
        };
      });

      // sort for stable legend ordering
      series.sort((a, b) => b.total_mentions - a.total_mentions || a.theme_name.localeCompare(b.theme_name));
      return series;
    };

    const positiveSeries = buildMentionSeries("positive");
    const negativeSeries = buildMentionSeries("negative");

    // ranking changes per bucket
    const buildRankingChanges = (polarity: Polarity) => {
      const topN = Math.max(3, Math.min(8, allThemeNames.length));
      return buckets.map((b) => {
        const counts = allThemeNames.map((themeName) => {
          const c = units
            .filter((u) => u.theme === themeName && u.polarity === polarity)
            .filter((u) => unitBucket(u) === b).length;
          return { theme_name: themeName, count: c };
        });
        counts.sort((a, d) => d.count - a.count || a.theme_name.localeCompare(d.theme_name));
        const top = counts.slice(0, topN).map((x, idx) => ({
          theme_name: x.theme_name,
          count: x.count,
          rank: idx + 1,
        }));
        return { bucket: b, top_themes: top };
      });
    };

    time_trends = {
      granularity: timeGranularity,
      overall_sentiment_score_line: reviewScoreByBucket,
      theme_positive_mentions_series: positiveSeries,
      theme_negative_mentions_series: negativeSeries,
      ranking_changes_positive: buildRankingChanges("positive"),
      ranking_changes_negative: buildRankingChanges("negative"),
    };
  }

  const report_payload = {
    meta: {
      session_id: session.session_id,
      generated_at: new Date().toISOString(),
      product_name: session.config.product_name,
      enable_time_analysis: session.config.enable_time_analysis,
      time_granularity: session.config.time_granularity,
      start_date: session.config.start_date,
      end_date: session.config.end_date,
    },
    sample_overview: {
      sample_count: session.reviews.length,
      time_coverage: timeCoverage,
      review_time_distribution_curve: timelineCurve,
      review_time_distribution_bar: timelineBar,
    },
    overall_sentiment: {
      sentiment_density_curve: {
        points: Array.from(scoreDensity.entries())
          .sort((a, b) => a[0] - b[0])
          .map(([score, count]) => ({ score, count })),
      },
      sentiment_class_ratio_bar: {
        counts: sentimentClassCounts,
        total: session.reviews.length,
      },
    },
    theme_index: {
      themes: themeIndexCards.sort(
        (a, b) => b.mention_count - a.mention_count || a.theme_name.localeCompare(b.theme_name),
      ),
    },
    theme_analysis: {
      theme_details: themeDetails,
      positive: {
        scatter_frequency_x_intensity: positiveScatter,
        mention_frequency_bar: positiveFrequencyBar,
        intensity_heat_bar: positiveIntensityBar,
      },
      negative: {
        scatter_frequency_x_intensity: negativeScatter,
        mention_frequency_bar: negativeFrequencyBar,
        intensity_heat_bar: negativeIntensityBar,
      },
    },
    theme_comparison: {
      positive_negative_frequency: themeComparisonFrequency,
      positive_negative_intensity: themeComparisonIntensity,
    },
    time_trends,
    optimization_suggestions: {
      title: "建议优化方向",
      formula: "F × I",
      candidates: optimization_suggestions,
    },
    appendix_examples: appendix_examples,
  };

  return report_payload;
}

export async function writeReportPayloadToSessionDir(
  sessionDir: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const fs = await import("node:fs/promises");
  const outPath = path.join(sessionDir, "report_payload.json");
  await fs.writeFile(outPath, JSON.stringify(payload, null, 2), "utf8");
}

