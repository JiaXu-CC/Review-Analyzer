import { config as loadEnv } from "dotenv";
import { createLLMClientFromEnv } from "../src/llm";

loadEnv();

async function main() {
  const llm = createLLMClientFromEnv("ark");

  const reviews = [
    {
      review_id: "test_review_1",
      review_text: "这款产品质量很好，但是物流有点慢。",
      date: "2025-01-01",
    },
  ];

  // 简单调用 segmentation 验证 Ark 是否可用
  const segments = await llm.segmentReviews(
    reviews as unknown as import("../src/schemas").Review[],
  );

  // eslint-disable-next-line no-console
  console.log("Ark segmentation result:", JSON.stringify(segments, null, 2));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exitCode = 1;
});

