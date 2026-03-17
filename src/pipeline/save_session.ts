import path from "node:path";
import { writeJsonFile } from "../utils/json";
import type { AnalysisSession } from "../schemas";

export async function saveSession(
  baseDir: string,
  session: AnalysisSession,
): Promise<void> {
  const sessionDir = path.join(baseDir, session.session_id);

  await writeJsonFile(path.join(sessionDir, "session.json"), session);
  await writeJsonFile(path.join(sessionDir, "reviews.json"), session.reviews);
  await writeJsonFile(path.join(sessionDir, "units.json"), session.units);
  await writeJsonFile(path.join(sessionDir, "themes.json"), session.themes);
}

