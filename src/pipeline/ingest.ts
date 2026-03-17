import { readReviewsCsv } from "../utils/csv";
import { generateId } from "../utils/ids";
import { ReviewSchema, type Review } from "../schemas";

export async function ingestCsv(csvPath: string): Promise<Review[]> {
  const rows = await readReviewsCsv(csvPath);

  const reviews: Review[] = rows.map((row) => {
    const candidate = {
      review_id: generateId("review"),
      review_text: row.review_text,
      date: row.date,
    };
    const parsed = ReviewSchema.parse(candidate);
    return parsed;
  });

  return reviews;
}

