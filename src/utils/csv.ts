import fs from "node:fs/promises";
import Papa from "papaparse";

export interface RawCsvReview {
  review_text: string;
  date?: string;
  // allow passthrough of other columns but we ignore them for now
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export async function readReviewsCsv(csvPath: string): Promise<RawCsvReview[]> {
  const content = await fs.readFile(csvPath, "utf8");
  const result = Papa.parse<RawCsvReview>(content, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
  });

  if (result.errors.length > 0) {
    const first = result.errors[0];
    throw new Error(
      `Failed to parse CSV: ${first.message} at row ${first.row ?? "unknown"}`,
    );
  }

  const rows = result.data.filter((row) => {
    return row && typeof row.review_text === "string" && row.review_text.trim().length > 0;
  });

  if (rows.length === 0) {
    throw new Error("No valid rows with non-empty review_text found in CSV.");
  }

  return rows;
}

