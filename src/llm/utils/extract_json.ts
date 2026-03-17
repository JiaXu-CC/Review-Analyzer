/**
 * 从 LLM 返回的原始文本中提取适合 JSON.parse 的 JSON 字符串。
 *
 * 兼容情况：
 * 1. 纯 JSON 文本
 * 2. ```json ... ``` fenced code block
 * 3. ``` ... ``` fenced code block
 * 4. 前后有少量说明文字，中间包含一个 JSON object 或 array
 */
export function extractJsonString(raw: string): { json: string | null } {
  const content = raw.trim();

  // 1. 尝试直接当 JSON 解析
  try {
    JSON.parse(content);
    return { json: content };
  } catch {
    // ignore
  }

  // 2. ```json ... ``` fenced
  const fenceJsonMatch = content.match(/```json\s*([\s\S]*?)```/i);
  if (fenceJsonMatch) {
    const inner = fenceJsonMatch[1].trim();
    try {
      JSON.parse(inner);
      return { json: inner };
    } catch {
      // ignore
    }
  }

  // 3. ``` ... ``` fenced
  const fenceMatch = content.match(/```[\w-]*\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    const inner = fenceMatch[1].trim();
    try {
      JSON.parse(inner);
      return { json: inner };
    } catch {
      // ignore
    }
  }

  // 4. 文本中寻找第一个 { 或 [ 及其配对的最后一个 } 或 ]
  const firstBrace = content.indexOf("{");
  const firstBracket = content.indexOf("[");
  const candidates: string[] = [];

  if (firstBrace !== -1) {
    const lastBrace = content.lastIndexOf("}");
    if (lastBrace > firstBrace) {
      candidates.push(content.slice(firstBrace, lastBrace + 1));
    }
  }
  if (firstBracket !== -1) {
    const lastBracket = content.lastIndexOf("]");
    if (lastBracket > firstBracket) {
      candidates.push(content.slice(firstBracket, lastBracket + 1));
    }
  }

  for (const candidate of candidates) {
    const trimmed = candidate.trim();
    try {
      JSON.parse(trimmed);
      return { json: trimmed };
    } catch {
      // try next candidate
    }
  }

  // 提取失败，调用方可根据 raw 自行处理或 fallback
  return { json: null };
}

