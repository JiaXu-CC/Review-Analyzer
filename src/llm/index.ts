import { MockLLMClient } from "./mock_llm";
import type { LLMClient } from "./client";

export function createLLMClientFromEnv(
  overrideProvider?: string,
): LLMClient {
  const provider = (overrideProvider ?? process.env.LLM_PROVIDER ?? "mock")
    .trim()
    .toLowerCase();

  if (provider === "mock") {
    return new MockLLMClient();
  }

  if (provider === "openai") {
    try {
      if (!process.env.OPENAI_API_KEY) {
        console.warn(
          "LLM_PROVIDER=openai but OPENAI_API_KEY is missing. Falling back to mock LLM.",
        );
        return new MockLLMClient();
      }
      if (!process.env.OPENAI_BASE_URL) {
        console.warn(
          "LLM_PROVIDER=openai but OPENAI_BASE_URL is missing. Falling back to mock LLM.",
        );
        return new MockLLMClient();
      }
      if (!process.env.OPENAI_MODEL) {
        console.warn(
          "LLM_PROVIDER=openai but OPENAI_MODEL is missing. Falling back to mock LLM.",
        );
        return new MockLLMClient();
      }

      // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-assignment
      const mod = require("./openai_client") as {
        OpenAILLMClient: new () => LLMClient;
      };
      const { OpenAILLMClient } = mod;
      return new OpenAILLMClient();
    } catch (err) {
      console.warn(
        `Failed to create OpenAI client (${(err as Error).message}). Falling back to mock LLM.`,
      );
      return new MockLLMClient();
    }
  }

  if (provider === "deepseek") {
    try {
      if (!process.env.DEEPSEEK_API_KEY || !process.env.DEEPSEEK_BASE_URL) {
        console.warn(
          "LLM_PROVIDER=deepseek but DEEPSEEK_API_KEY or DEEPSEEK_BASE_URL is missing. Falling back to mock LLM.",
        );
        return new MockLLMClient();
      }
      if (!process.env.DEEPSEEK_MODEL) {
        console.warn(
          "LLM_PROVIDER=deepseek but DEEPSEEK_MODEL is missing. Falling back to mock LLM.",
        );
        return new MockLLMClient();
      }

      // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-assignment
      const mod = require("./deepseek_client") as {
        DeepSeekLLMClient: new () => LLMClient;
      };
      const { DeepSeekLLMClient } = mod;
      return new DeepSeekLLMClient();
    } catch (err) {
      console.warn(
        `Failed to create DeepSeek client (${(err as Error).message}). Falling back to mock LLM.`,
      );
      return new MockLLMClient();
    }
  }

  if (provider === "ark") {
    try {
      if (!process.env.ARK_API_KEY || !process.env.ARK_BASE_URL) {
        console.warn(
          "LLM_PROVIDER=ark but ARK_API_KEY or ARK_BASE_URL is missing. Falling back to mock LLM.",
        );
        return new MockLLMClient();
      }
      if (!process.env.ARK_MODEL) {
        console.warn(
          "LLM_PROVIDER=ark but ARK_MODEL is missing. Falling back to mock LLM.",
        );
        return new MockLLMClient();
      }

      // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-assignment
      const mod = require("./ark_client") as {
        ArkLLMClient: new () => LLMClient;
      };
      const { ArkLLMClient } = mod;
      return new ArkLLMClient();
    } catch (err) {
      console.warn(
        `Failed to create Ark client (${(err as Error).message}). Falling back to mock LLM.`,
      );
      return new MockLLMClient();
    }
  }

  console.warn(
    `Unknown LLM provider "${provider}", falling back to mock LLM.`,
  );
  return new MockLLMClient();
}


