// 글 맨 앞의 `---` 블록을 읽어 { meta, body }로 돌려준다.
export function parseFrontmatter(source) {
  const text = source.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const match = text.match(/^---\n([\s\S]*?)\n---[ \t]*(?:\n|$)/);
  if (!match) return { meta: {}, body: text };

  const meta = {};
  for (const line of match[1].split("\n")) {
    const kv = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (!kv) continue;
    meta[kv[1]] = parseValue(kv[2].trim());
  }
  return { meta, body: text.slice(match[0].length) };
}

function parseValue(value) {
  if (value.startsWith("[") && value.endsWith("]")) {
    return value
      .slice(1, -1)
      .split(",")
      .map((item) => stripQuotes(item.trim()))
      .filter(Boolean);
  }
  return stripQuotes(value);
}

function stripQuotes(value) {
  return value.replace(/^(["'])(.*)\1$/, "$2");
}
