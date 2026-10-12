// 의존성 없는 간단한 마크다운 → HTML 변환기.
// 보안: 모든 텍스트를 먼저 이스케이프하므로 원시 HTML은 허용되지 않고,
// 링크/이미지 URL은 안전한 스킴(http, https, mailto, 상대 경로)만 통과한다.

const LIST_RE = /^( *)([-*+]|\d{1,9}[.)])( +)(.*)$/;
const FENCE_RE = /^ {0,3}(`{3,}|~{3,})\s*([^\s`]*)/;
const HEADING_RE = /^ {0,3}(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/;
const HR_RE = /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/;
const QUOTE_RE = /^ {0,3}>/;
const TABLE_SEP_RE = /^ {0,3}\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/;

const isBlank = (line) => /^\s*$/.test(line);
const indentOf = (line) => line.match(/^ */)[0].length;

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function safeUrl(url) {
  const u = url.trim();
  if (/^(https?:|mailto:|#|\/|\.\.?\/)/i.test(u)) return u;
  if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return null; // javascript:, data: 등 차단
  return u; // 상대 경로
}

// ---------- 인라인 ----------

function emphasis(text) {
  return text
    .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^\w])__(?=\S)([\s\S]*?\S)__(?!\w)/g, "$1<strong>$2</strong>")
    .replace(/\*(?=\S)([^*]*?\S)\*/g, "<em>$1</em>")
    .replace(/(^|[^\w])_(?=\S)([^_]*?\S)_(?!\w)/g, "$1<em>$2</em>")
    .replace(/~~(?=\S)([\s\S]*?\S)~~/g, "<del>$1</del>");
}

function renderInline(raw) {
  const stash = [];
  const keep = (html) => `\u0000${stash.push(html) - 1}\u0000`;

  // 코드 스팬은 내용을 건드리지 않도록 먼저 빼 둔다.
  let s = raw.replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, (_, __, code) =>
    keep(`<code>${escapeHtml(code.trim())}</code>`)
  );
  s = escapeHtml(s);

  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, url) => {
    const safe = safeUrl(url);
    return safe === null
      ? alt
      : keep(`<img src="${safe}" alt="${alt}" loading="lazy">`);
  });

  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, text, url) => {
    const safe = safeUrl(url);
    if (safe === null) return text;
    const rel = /^https?:/i.test(safe) ? ' rel="noopener noreferrer"' : "";
    return keep(`<a href="${safe}"${rel}>${emphasis(text)}</a>`);
  });

  s = emphasis(s);

  // 스택에 담긴 조각 안에 또 다른 조각이 있을 수 있어 반복해서 복원한다.
  const placeholder = /\u0000(\d+)\u0000/g;
  while (placeholder.test(s)) {
    placeholder.lastIndex = 0;
    s = s.replace(placeholder, (_, i) => stash[i]);
  }
  return s;
}

// ---------- 블록 ----------

function startsBlock(line, nextLine) {
  if (FENCE_RE.test(line) || HEADING_RE.test(line)) return true;
  if (HR_RE.test(line) || QUOTE_RE.test(line)) return true;
  const list = line.match(LIST_RE);
  if (list && (/^[-*+]$/.test(list[2]) || /^1[.)]$/.test(list[2]))) return true;
  return isTableStart(line, nextLine);
}

function isTableStart(line, nextLine) {
  return (
    nextLine !== undefined &&
    line.includes("|") &&
    nextLine.includes("|") &&
    TABLE_SEP_RE.test(nextLine)
  );
}

function splitRow(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim().replace(/\\\|/g, "|"));
}

function renderTable(lines, start) {
  const header = splitRow(lines[start]);
  const aligns = splitRow(lines[start + 1]).map((cell) => {
    const left = cell.startsWith(":");
    const right = cell.endsWith(":");
    if (left && right) return "center";
    if (right) return "right";
    return left ? "left" : "";
  });
  const cellTag = (tag, text, i) => {
    const style = aligns[i] ? ` style="text-align:${aligns[i]}"` : "";
    return `<${tag}${style}>${renderInline(text)}</${tag}>`;
  };

  let i = start + 2;
  const rows = [];
  while (i < lines.length && !isBlank(lines[i]) && lines[i].includes("|")) {
    const cells = splitRow(lines[i]);
    rows.push(`<tr>${header.map((_, c) => cellTag("td", cells[c] ?? "", c)).join("")}</tr>`);
    i++;
  }
  const head = `<tr>${header.map((text, c) => cellTag("th", text, c)).join("")}</tr>`;
  const html =
    `<div class="table-wrap"><table><thead>${head}</thead>` +
    `<tbody>${rows.join("")}</tbody></table></div>`;
  return { html, next: i };
}

function renderList(lines, start) {
  const first = lines[start].match(LIST_RE);
  const baseIndent = first[1].length;
  const ordered = /\d/.test(first[2]);
  const startNumber = ordered ? parseInt(first[2], 10) : 1;

  const items = [];
  let cur = null;
  let i = start;

  while (i < lines.length) {
    const line = lines[i].replace(/^\t+/, (t) => "    ".repeat(t.length));

    if (isBlank(line)) {
      let j = i + 1;
      while (j < lines.length && isBlank(lines[j])) j++;
      if (j >= lines.length) break;
      const next = lines[j].replace(/^\t+/, (t) => "    ".repeat(t.length));
      const ind = indentOf(next);
      const nextItem = next.match(LIST_RE);
      const sameKind = nextItem && /\d/.test(nextItem[2]) === ordered;
      if (ind > baseIndent || (ind === baseIndent && sameKind)) {
        cur.lines.push("");
        i = j;
        continue;
      }
      break;
    }

    const m = line.match(LIST_RE);
    const ind = indentOf(line);

    if (m && ind === baseIndent) {
      if (/\d/.test(m[2]) !== ordered) break;
      cur = { lines: [m[4]], offset: ind + m[2].length + Math.min(m[3].length, 4) };
      items.push(cur);
    } else if (ind > baseIndent) {
      cur.lines.push(line.slice(Math.min(cur.offset, ind)));
    } else if (!m && !startsBlock(line, lines[i + 1])) {
      cur.lines.push(line.trim()); // 들여쓰지 않은 이어지는 줄
    } else {
      break;
    }
    i++;
  }

  const body = items
    .map((item) => {
      const loose = item.lines.includes("");
      let html = renderBlocks(item.lines);
      if (!loose) html = html.replace(/^<p>([\s\S]*?)<\/p>/, "$1");
      return `<li>${html}</li>`;
    })
    .join("");

  const tag = ordered ? "ol" : "ul";
  const attr = ordered && startNumber !== 1 ? ` start="${startNumber}"` : "";
  return { html: `<${tag}${attr}>${body}</${tag}>`, next: i };
}

function renderBlocks(lines) {
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line)) {
      i++;
      continue;
    }

    let m = line.match(FENCE_RE);
    if (m) {
      const marker = m[1];
      const lang = /^[\w+#-]+$/.test(m[2]) ? m[2] : "";
      const buf = [];
      i++;
      while (i < lines.length) {
        const t = lines[i].trim();
        if (t.length >= marker.length && t === marker[0].repeat(t.length)) break;
        buf.push(lines[i]);
        i++;
      }
      i++; // 닫는 펜스
      const cls = lang ? ` class="language-${lang}"` : "";
      out.push(`<pre><code${cls}>${escapeHtml(buf.join("\n"))}</code></pre>`);
      continue;
    }

    m = line.match(HEADING_RE);
    if (m) {
      const level = m[1].length;
      out.push(`<h${level}>${renderInline(m[2])}</h${level}>`);
      i++;
      continue;
    }

    if (HR_RE.test(line)) {
      out.push("<hr>");
      i++;
      continue;
    }

    if (QUOTE_RE.test(line)) {
      const buf = [];
      while (i < lines.length && QUOTE_RE.test(lines[i])) {
        buf.push(lines[i].replace(/^ {0,3}> ?/, ""));
        i++;
      }
      out.push(`<blockquote>${renderBlocks(buf)}</blockquote>`);
      continue;
    }

    if (LIST_RE.test(line)) {
      const { html, next } = renderList(lines, i);
      out.push(html);
      i = next;
      continue;
    }

    if (isTableStart(line, lines[i + 1])) {
      const { html, next } = renderTable(lines, i);
      out.push(html);
      i = next;
      continue;
    }

    const buf = [line];
    i++;
    while (i < lines.length && !isBlank(lines[i]) && !startsBlock(lines[i], lines[i + 1])) {
      buf.push(lines[i]);
      i++;
    }
    const text = renderInline(buf.join("\n").trim()).replace(/ {2,}\n/g, "<br>\n");
    out.push(`<p>${text}</p>`);
  }

  return out.join("\n");
}

export function renderMarkdown(source) {
  const lines = source.replace(/\0/g, "").replace(/\r\n?/g, "\n").split("\n");
  return renderBlocks(lines);
}
