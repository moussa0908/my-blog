const root = document.documentElement;

function currentTheme() {
  return root.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

function render(button) {
  const dark = currentTheme() === "dark";
  button.textContent = dark ? "☀️" : "🌙";
  button.setAttribute("aria-label", dark ? "라이트 모드로 전환" : "다크 모드로 전환");
}

export function initTheme(button) {
  render(button);
  button.addEventListener("click", () => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    try {
      localStorage.setItem("theme", next);
    } catch (e) {
      // 저장 실패는 무시한다 (시크릿 모드 등)
    }
    render(button);
  });
}
