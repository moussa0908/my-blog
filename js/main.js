import { initTheme } from "./theme.js";
import { parseFrontmatter } from "./frontmatter.js";
import { renderMarkdown } from "./markdown.js";

const app = document.getElementById("app");
const SITE_TITLE = "My Blog";

let postsPromise = null;

function loadPosts() {
  postsPromise ??= fetch("posts/index.json")
    .then((res) => {
      if (!res.ok) throw new Error(`글 목록을 불러오지 못했습니다 (${res.status})`);
      return res.json();
    })
    .then((posts) =>
      posts.map((p) => ({ ...p, slug: p.file.replace(/\.md$/, "") }))
        .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    );
  return postsPromise;
}

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === "text") node.textContent = value;
    else if (key === "html") node.innerHTML = value;
    else node.setAttribute(key, value);
  }
  for (const child of [].concat(children)) node.append(child);
  return node;
}

function formatDate(value) {
  const m = String(value ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(value ?? "");
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return date.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
}

function metaLine(post) {
  const line = el("div", { class: "meta" });
  if (post.date) {
    line.append(el("time", { datetime: post.date, text: formatDate(post.date) }));
  }
  const tags = [].concat(post.tags ?? []);
  if (tags.length) {
    line.append(el("span", { class: "tags" }, tags.map((t) => el("span", { class: "tag", text: t }))));
  }
  return line;
}

function show(...nodes) {
  app.replaceChildren(...nodes);
  window.scrollTo(0, 0);
}

function showNotice(message) {
  document.title = SITE_TITLE;
  show(
    el("p", { class: "notice", text: message }),
    el("a", { href: "#/", text: "← 목록으로" })
  );
}

async function renderList() {
  const posts = await loadPosts();
  document.title = SITE_TITLE;
  if (!posts.length) return show(el("p", { class: "notice", text: "아직 글이 없습니다." }));

  const items = posts.map((post) => {
    const link = el("a", { href: `#/post/${encodeURIComponent(post.slug)}` }, [
      el("h2", { text: post.title ?? post.slug }),
      metaLine(post),
    ]);
    if (post.summary) link.append(el("p", { text: post.summary }));
    return el("li", { class: "post-item" }, link);
  });
  show(el("ul", { class: "post-list" }, items));
}

async function renderPost(slug) {
  const posts = await loadPosts();
  // 목록에 등록된 글만 열어 임의 경로 요청을 막는다.
  const entry = posts.find((p) => p.slug === slug);
  if (!entry) return showNotice("글을 찾을 수 없습니다.");

  const res = await fetch(`posts/${encodeURIComponent(entry.file)}`);
  if (!res.ok) return showNotice("글을 불러오지 못했습니다.");

  const { meta, body } = parseFrontmatter(await res.text());
  const post = { ...entry, ...meta };
  document.title = `${post.title ?? slug} · ${SITE_TITLE}`;

  show(
    el("a", { class: "back-link", href: "#/", text: "← 목록으로" }),
    el("article", {}, [
      el("header", { class: "post-header" }, [el("h1", { text: post.title ?? slug }), metaLine(post)]),
      el("div", { class: "prose", html: renderMarkdown(body) }),
    ])
  );
}

async function route() {
  const hash = location.hash.replace(/^#/, "") || "/";
  const post = hash.match(/^\/post\/([^/]+)$/);
  try {
    if (post) await renderPost(decodeURIComponent(post[1]));
    else await renderList();
  } catch (err) {
    showNotice(err.message || "문제가 발생했습니다.");
  }
}

initTheme(document.getElementById("theme-toggle"));
window.addEventListener("hashchange", route);
route();
