import path from "node:path";
import {
  type AnalysisSession,
  type Theme,
  type ReviewUnit,
  type FeedbackBundle,
  ThemeSetFeedbackActionSchema,
  FeedbackBundleSchema,
} from "../schemas";
import type { LLMClient } from "../llm/client";
import { summarizeThemes } from "./theme_summary";
import { writeJsonFile, readJsonFile } from "../utils/json";

function cloneSession(session: AnalysisSession): AnalysisSession {
  return JSON.parse(JSON.stringify(session)) as AnalysisSession;
}

interface ThemeActionResult {
  session: AnalysisSession;
  affectedThemeNames: Set<string>;
  mergeReclassUnits: ReviewUnit[];
  deleteReclassUnits: ReviewUnit[];
}

async function applyThemeSetActions(
  session: AnalysisSession,
  actions: FeedbackBundle["theme_set"] extends { actions: infer A } ? A : never,
): Promise<ThemeActionResult> {
  const updated = cloneSession(session);
  const affectedThemeNames = new Set<string>();
  const mergeReclassUnits: ReviewUnit[] = [];
  const deleteReclassUnits: ReviewUnit[] = [];

  if (!actions) {
    return {
      session: updated,
      affectedThemeNames,
      mergeReclassUnits,
      deleteReclassUnits,
    };
  }

  for (const rawAction of actions) {
    const action = ThemeSetFeedbackActionSchema.parse(rawAction);

    if (action.type === "rename") {
      const { from, to } = action;
      for (const theme of updated.themes) {
        if (theme.theme_name === from) {
          theme.theme_name = to;
          affectedThemeNames.add(to);
        }
      }
      for (const unit of updated.units) {
        if (unit.theme === from) {
          unit.theme = to;
        }
      }
    } else if (action.type === "merge") {
      const { from, to } = action;
      let targetTheme: Theme | undefined = updated.themes.find(
        (t) => t.theme_name === to,
      );
      if (!targetTheme) {
        targetTheme = {
          theme_id: `theme_manual_${to}`,
          theme_name: to,
          representative_examples: [],
        };
        updated.themes.push(targetTheme);
      }

      for (const unit of updated.units) {
        if (from.includes(unit.theme)) {
          mergeReclassUnits.push({ ...unit, theme: to });
          unit.theme = to;
        }
      }

      updated.themes = updated.themes.filter(
        (theme) => !from.includes(theme.theme_name) || theme.theme_name === to,
      );

      affectedThemeNames.add(to);
      from.forEach((name) => affectedThemeNames.add(name));
    } else if (action.type === "delete") {
      const { theme } = action;
      updated.themes = updated.themes.filter(
        (t) => t.theme_name !== theme,
      );
      for (const unit of updated.units) {
        if (unit.theme === theme) {
          deleteReclassUnits.push({ ...unit });
        }
      }
    } else if (action.type === "regenerate_all") {
      // 仅标记，由上层触发整步 theme generation rerun
      updated.theme_status = "pending";
    }
  }

  return {
    session: updated,
    affectedThemeNames,
    mergeReclassUnits,
    deleteReclassUnits,
  };
}

async function applyUnitThemeFeedback(
  session: AnalysisSession,
  feedback: FeedbackBundle["unit_themes"],
): Promise<AnalysisSession> {
  if (!feedback || feedback.length === 0) return session;
  const updated = cloneSession(session);
  for (const item of feedback) {
    const unit = updated.units.find((u) => u.unit_id === item.unit_id);
    if (!unit) continue;
    if (item.is_correct) continue;
    if (!item.target_theme) continue;

    const oldTheme = unit.theme;
    const target =
      item.target_theme === "other" ? "other" : item.target_theme;
    unit.theme = target;

    let targetTheme = updated.themes.find((t) => t.theme_name === target);
    if (!targetTheme) {
      targetTheme = {
        theme_id: `theme_manual_${target}`,
        theme_name: target,
        representative_examples: [],
      };
      updated.themes.push(targetTheme);
    }
  }

  return updated;
}

function filterThemesByName(
  themes: Theme[],
  names: Set<string>,
): Theme[] {
  if (names.size === 0) return themes;
  return themes.filter((t) => names.has(t.theme_name));
}

function collectUnitsForThemes(
  units: ReviewUnit[],
  names: Set<string>,
): ReviewUnit[] {
  if (names.size === 0) return units;
  return units.filter((u) => names.has(u.theme));
}

export async function rerunThemeSummariesLevel1(
  session: AnalysisSession,
  llm: LLMClient,
  onlyThemeNames?: Set<string>,
): Promise<AnalysisSession> {
  const updated = cloneSession(session);
  const targetThemes = onlyThemeNames
    ? filterThemesByName(updated.themes, onlyThemeNames)
    : updated.themes;
  const targetUnits = onlyThemeNames
    ? collectUnitsForThemes(updated.units, onlyThemeNames)
    : updated.units;

  const summarized = await summarizeThemes(targetThemes, targetUnits, llm);

  const byName = new Map<string, Theme>(
    summarized.map((t) => [t.theme_name, t]),
  );

  updated.themes = updated.themes.map((theme) =>
    byName.get(theme.theme_name) ?? theme,
  );

  return updated;
}

async function reclassifyUnitsAndMerge(
  session: AnalysisSession,
  unitsToReclassify: ReviewUnit[],
  llm: LLMClient,
): Promise<AnalysisSession> {
  if (unitsToReclassify.length === 0) return session;
  const updated = cloneSession(session);

  const reclassified = await llm.reclassifyUnits(
    unitsToReclassify,
    updated.themes,
  );

  const byId = new Map<string, ReviewUnit>();
  for (const u of updated.units) {
    byId.set(u.unit_id, u);
  }

  for (const newUnit of reclassified) {
    const original = updated.units.find(
      (u) =>
        u.review_id === newUnit.review_id &&
        u.unit_text === newUnit.unit_text,
    );
    if (!original) continue;
    original.theme = newUnit.theme;
    original.polarity = newUnit.polarity;
    original.emotion_intensity = newUnit.emotion_intensity;
  }

  // 再次保证“同评论同主题只保留一个 unit”
  const dedup = new Map<string, ReviewUnit>();
  for (const unit of updated.units) {
    const key = `${unit.review_id}::${unit.theme}`;
    const existing = dedup.get(key);
    if (!existing) {
      dedup.set(key, unit);
    } else {
      const mergedText = `${existing.unit_text} ${unit.unit_text}`.trim();
      const maxIntensity =
        (Math.max(
          existing.emotion_intensity,
          unit.emotion_intensity,
        ) as 1 | 2 | 3 | 4 | 5) || existing.emotion_intensity;
      const chosenPolarity =
        existing.emotion_intensity >= unit.emotion_intensity
          ? existing.polarity
          : unit.polarity;

      dedup.set(key, {
        ...existing,
        unit_text: mergedText,
        emotion_intensity: maxIntensity,
        polarity: chosenPolarity,
      });
    }
  }

  updated.units = Array.from(dedup.values());
  return updated;
}

export async function applyFeedbackAndRerun(
  session: AnalysisSession,
  rawFeedback: unknown,
  llm: LLMClient,
): Promise<AnalysisSession> {
  const feedback = FeedbackBundleSchema.parse(rawFeedback);

  let updated = cloneSession(session);

  const hasThemeFeedback =
    !!feedback.theme_set ||
    (feedback.unit_themes && feedback.unit_themes.length > 0);

  let affectedThemeNames = new Set<string>();
  let mergeReclassUnits: ReviewUnit[] = [];
  let deleteReclassUnits: ReviewUnit[] = [];

  if (feedback.theme_set) {
    const themeResult = await applyThemeSetActions(
      updated,
      feedback.theme_set.actions,
    );
    updated = themeResult.session;
    affectedThemeNames = themeResult.affectedThemeNames;
    mergeReclassUnits = themeResult.mergeReclassUnits;
    deleteReclassUnits = themeResult.deleteReclassUnits;
  }

  if (mergeReclassUnits.length > 0) {
    updated = await reclassifyUnitsAndMerge(updated, mergeReclassUnits, llm);
  }

  if (deleteReclassUnits.length > 0) {
    updated = await reclassifyUnitsAndMerge(updated, deleteReclassUnits, llm);
  }

  if (feedback.unit_themes && feedback.unit_themes.length > 0) {
    updated = await applyUnitThemeFeedback(updated, feedback.unit_themes);
  }

  if (feedback.segmentation) {
    const allCorrect = feedback.segmentation.every((s) => s.is_correct);
    updated.segmentation_status = allCorrect ? "approved" : "needs_revision";
  }

  const names = new Set<string>();
  for (const theme of updated.themes) {
    names.add(theme.theme_name);
  }

  updated = await rerunThemeSummariesLevel1(updated, llm, names);
  if (hasThemeFeedback) {
    // 处理过主题相关反馈后，需要用户再次确认，因此保持 needs_revision
    updated.theme_status = "needs_revision";
  }
  // 第一阶段 report_status 始终保持 locked
  updated.report_status = "locked";

  return updated;
}

export async function loadSessionFromDir(
  sessionDir: string,
): Promise<AnalysisSession> {
  const filePath = path.join(sessionDir, "session.json");
  return readJsonFile<AnalysisSession>(filePath);
}

export async function saveSessionToDir(
  sessionDir: string,
  session: AnalysisSession,
): Promise<void> {
  await writeJsonFile(path.join(sessionDir, "session.json"), session);
  await writeJsonFile(path.join(sessionDir, "reviews.json"), session.reviews);
  await writeJsonFile(path.join(sessionDir, "units.json"), session.units);
  await writeJsonFile(path.join(sessionDir, "themes.json"), session.themes);
}

