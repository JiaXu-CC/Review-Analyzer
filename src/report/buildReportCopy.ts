import path from "node:path";

type AnyRecord = Record<string, unknown>;

function asRecord(x: unknown): AnyRecord {
  return typeof x === "object" && x !== null && !Array.isArray(x)
    ? (x as AnyRecord)
    : {};
}

function asArray<T = unknown>(x: unknown): T[] {
  return Array.isArray(x) ? (x as T[]) : [];
}

function asString(x: unknown, fallback = ""): string {
  return typeof x === "string" ? x : fallback;
}

function asNumber(x: unknown, fallback = 0): number {
  return typeof x === "number" && Number.isFinite(x) ? x : fallback;
}

function fmtPct(n: number, total: number): string {
  if (total <= 0) return "0.0%";
  return `${((n / total) * 100).toFixed(1)}%`;
}

function fmtDateISO(iso: unknown): string {
  const s = asString(iso, "");
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().slice(0, 10);
}

function buildOverallSentimentSummary(payload: AnyRecord): string {
  const counts = asRecord(
    asRecord(asRecord(payload.overall_sentiment).sentiment_class_ratio_bar).counts,
  );
  const total = asNumber(
    asRecord(asRecord(payload.overall_sentiment).sentiment_class_ratio_bar).total,
    0,
  );
  const positive = asNumber(counts.positive, 0);
  const negative = asNumber(counts.negative, 0);
  const mixed = asNumber(counts.mixed, 0);
  const other = asNumber(counts.other, 0);

  const pairs = [
    { key: "正向", v: positive },
    { key: "负向", v: negative },
    { key: "混合", v: mixed },
    { key: "其他", v: other },
  ].sort((a, b) => b.v - a.v);
  const dominant = pairs[0]?.key ?? "其他";

  return `整体情绪分布以${dominant}评论为主：正向 ${fmtPct(
    positive,
    total,
  )}，负向 ${fmtPct(negative, total)}，混合 ${fmtPct(mixed, total)}，其他 ${fmtPct(
    other,
    total,
  )}。该部分用于建立整体倾向基线，主题层分析以片段级结果为准。`;
}

type Candidate = {
  theme_id: string;
  theme_name: string;
  priority_score: number;
  negative_frequency_raw: number;
  negative_intensity_raw: number;
};

function groupNameForTheme(themeName: string): string {
  const s = themeName;
  if (/(技术|卡顿|帧|延迟|服务器|闪退|性能)/.test(s)) return "稳定性与性能体验";
  if (/(付费|奖励|价格|商城|抽卡|资源)/.test(s)) return "商业化与资源回报感知";
  if (/(机制|匹配|平衡|角色|玩法|对局)/.test(s)) return "玩法机制与对局公平性";
  if (/(社区|氛围|举报|申诉|运营|沟通)/.test(s)) return "社区生态与运营响应";
  return "综合体验问题";
}

function buildCorePainPoints(candidates: Candidate[]): Array<Record<string, unknown>> {
  const grouped = new Map<
    string,
    {
      score: number;
      themes: Candidate[];
    }
  >();

  for (const c of candidates) {
    const g = groupNameForTheme(c.theme_name);
    const old = grouped.get(g);
    if (!old) {
      grouped.set(g, { score: c.priority_score, themes: [c] });
    } else {
      old.score += c.priority_score;
      old.themes.push(c);
    }
  }

  return Array.from(grouped.entries())
    .map(([title, v]) => {
      const topThemes = [...v.themes]
        .sort((a, b) => b.priority_score - a.priority_score)
        .slice(0, 3);
      const names = topThemes.map((t) => t.theme_name);
      const meanFreq =
        topThemes.reduce((sum, t) => sum + t.negative_frequency_raw, 0) / topThemes.length;
      const meanIntensity =
        topThemes.reduce((sum, t) => sum + t.negative_intensity_raw, 0) / topThemes.length;
      return {
        pain_point_title: title,
        summary: `该方向下的负向反馈在频次与强度上同时偏高，建议优先围绕「${names.join(
          "、",
        )}」制定专项优化动作。`,
        related_themes: names,
        related_theme_ids: topThemes.map((t) => t.theme_id),
        aggregated_priority_score: Number(v.score.toFixed(4)),
        avg_negative_frequency: Number(meanFreq.toFixed(2)),
        avg_negative_intensity: Number(meanIntensity.toFixed(2)),
      };
    })
    .sort(
      (a, b) =>
        asNumber(b.aggregated_priority_score, 0) - asNumber(a.aggregated_priority_score, 0),
    )
    .slice(0, 4);
}

export function buildReportCopyFromPayload(payloadJson: unknown): Record<string, unknown> {
  const payload = asRecord(payloadJson);
  const meta = asRecord(payload.meta);
  const sampleOverview = asRecord(payload.sample_overview);
  const optimization = asRecord(payload.optimization_suggestions);
  const candidates = asArray<Candidate>(optimization.candidates)
    .map((x) => ({
      theme_id: asString(asRecord(x).theme_id),
      theme_name: asString(asRecord(x).theme_name),
      priority_score: asNumber(asRecord(x).priority_score, 0),
      negative_frequency_raw: asNumber(asRecord(x).negative_frequency_raw, 0),
      negative_intensity_raw: asNumber(asRecord(x).negative_intensity_raw, 0),
    }))
    .filter((x) => x.theme_name && x.theme_id);

  const sampleCount = asNumber(sampleOverview.sample_count, 0);
  const tc = asRecord(sampleOverview.time_coverage);
  const startDate = fmtDateISO(tc.start_date);
  const endDate = fmtDateISO(tc.end_date);
  const hasTimeTrends = !!payload.time_trends;
  const productName = asString(meta.product_name, "—");

  const corePainPoints = buildCorePainPoints(candidates.slice(0, 12));

  return {
    meta: {
      session_id: asString(meta.session_id, ""),
      generated_at: new Date().toISOString(),
      source_payload_generated_at: asString(meta.generated_at, ""),
      product_name: productName,
    },
    page_copy: {
      report_title: "评论分析报告",
      report_subtitle: "基于评论片段库与主题体系的结构化洞察",
      header_brief: `本次纳入 ${sampleCount} 条评论，时间范围 ${startDate} 至 ${endDate}。本报告用于支持产品、运营与体验团队的优先级判断。`,
    },
    module3_sample_overview: {
      title: "模块3：样本总览",
      lead: `当前样本共 ${sampleCount} 条，覆盖时间 ${startDate} 至 ${endDate}。本部分仅用于展示样本规模与时间分布，不对文本倾向做解释。`,
    },
    module4_text_analysis: {
      title: "模块4：文本分析主区",
      lead: "评论被拆分为正向/负向片段并映射到统一主题体系，后续频率与强度分析均基于片段级数据进行。",
      section_4_1_overall_sentiment: {
        title: "第一部分：整体文本倾向",
        lead: buildOverallSentimentSummary(payload),
      },
      section_4_2_theme_index: {
        title: "第二部分：主题索引区",
        lead: "主题索引用于统一命名口径，帮助读者在后续图表中快速定位主题对象，并对照代表性原话理解语义来源。",
      },
      section_4_3_pros_cons: {
        title: "第三部分：正向优点 / 负向缺点",
        lead: "该部分联合观察主题提及频率与情绪强度：高频且高强度的正向主题代表核心优势，高频且高强度的负向主题代表高优先级问题。",
      },
      section_4_4_theme_comparison: {
        title: "第四部分：同主题正负对比",
        lead: "该部分在同一主题维度对比被肯定与被批评的差异，识别“有亮点但争议大”或“长期稳定短板”的主题。",
      },
      section_4_5_time_trends: hasTimeTrends
        ? {
            title: "第五部分：时间变化",
            lead: "该部分观察整体倾向与主题热度在时间上的变化，用于识别阶段性波动、异常时段与持续性问题。",
          }
        : {
            title: "第五部分：时间变化",
            lead: "",
          },
    },
    module5_optimization: {
      title: "建议优化方向",
      lead: "该部分在既有分析结果上做优先级整理，优先级由负向频率（F）与负向强度（I）共同决定，公式为 F × I。",
      core_pain_points: corePainPoints,
    },
    module6_appendix: {
      title: "模块6：示例 / 附录索引区",
      lead: "本部分提供代表性原话与索引，作为图表解读与问题复核的补充依据。",
    },
  };
}

export async function writeReportCopyToSessionDir(
  sessionDir: string,
  copy: Record<string, unknown>,
): Promise<void> {
  const fs = await import("node:fs/promises");
  const outPath = path.join(sessionDir, "report_copy.json");
  await fs.writeFile(outPath, JSON.stringify(copy, null, 2), "utf8");
}

