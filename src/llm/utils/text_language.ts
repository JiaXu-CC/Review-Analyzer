export function isChineseText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;

  // 含有任何英文字母则视为不合格
  if (/[A-Za-z]/.test(trimmed)) return false;

  // 至少包含一个常见中日韩统一表意文字
  if (/[一-龥]/.test(trimmed)) return true;

  // 对于很短的词，只要没有字母也可以接受
  if (trimmed.length <= 2) return true;

  return false;
}

export function allChineseLines(lines: string[]): boolean {
  if (!lines.length) return false;
  return lines.every((line) => isChineseText(line));
}

