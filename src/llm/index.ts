import { MockLLMClient } from "./mock_llm";
import type { LLMClient } from "./client";

export function createLLMClientFromEnv(): LLMClient {
  const provider = (process.env.LLM_PROVIDER || "mock").toLowerCase();

  if (provider === "openai") {
    try {
      if (!process.env.OPENAI_API_KEY) {
        // eslint-disable-next-line no-console
        console.warn(
          "LLM_PROVIDER=openai but OPENAI_API_KEY is missing. Falling back to mock LLM.",
        );
        return new MockLLMClient();
      }

      // 使用 require 做惰性加载，避免在 mock 模式下静态依赖 openai 包
      // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-assignment
      const mod = require("./openai_client") as {
        OpenAILLMClient: new () => LLMClient;
      };

      const { OpenAILLMClient } = mod;
      return new OpenAILLMClient();
    } catch (err) {
      // 包未安装 / 模块解析失败 / 运行时报错 → 回退到 mock
      // eslint-disable-next-line no-console
      console.warn(
        `Failed to create OpenAI client (${(err as Error).message}). Falling back to mock LLM.`,
      );
      return new MockLLMClient();
    }
  }

  return new MockLLMClient();
}


