/* Переключение светлой и темной темы + сохранение в localStorage */
(function () {
  const STORAGE_KEY = "async_motor_theme";
  const root = document.documentElement;

  function getPreferredTheme() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "dark" || saved === "light") return saved;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }

  function applyTheme(theme) {
    root.setAttribute("data-theme", theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (e) {
      // Игнорируем ограничения приватного режима
    }
    const btn = document.getElementById("themeToggle");
    if (btn) {
      btn.innerHTML = theme === "dark" ? "&#9728; Светлая" : "&#9790; Темная";
      btn.setAttribute("aria-label", theme === "dark" ? "Включить светлую тему" : "Включить темную тему");
    }
    window.dispatchEvent(new CustomEvent("themechange", { detail: { theme: theme } }));
  }

  applyTheme(getPreferredTheme());

  document.addEventListener("DOMContentLoaded", function () {
    applyTheme(root.getAttribute("data-theme") || getPreferredTheme());
    const btn = document.getElementById("themeToggle");
    if (btn) {
      btn.addEventListener("click", function () {
        const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
        applyTheme(next);
      });
    }
  });

  // Палитра для графиков под текущую тему
  window.getChartThemeColors = function () {
    const isDark = root.getAttribute("data-theme") === "dark";
    return {
      isDark: isDark,
      bg: isDark ? "#1e293b" : "#ffffff",
      text: isDark ? "#cbd5e1" : "#334155",
      muted: isDark ? "#94a3b8" : "#64748b",
      grid: isDark ? "rgba(148, 163, 184, 0.18)" : "rgba(15, 23, 42, 0.10)",
      axis: isDark ? "rgba(148, 163, 184, 0.55)" : "rgba(15, 23, 42, 0.38)",
      tooltipBg: isDark ? "rgba(15, 23, 42, 0.94)" : "rgba(30, 41, 59, 0.92)",
      tooltipText: "#f8fafc",
      primary: isDark ? "#60a5fa" : "#2563eb",
      secondary: isDark ? "#f472b6" : "#dc2626",
      tertiary: isDark ? "#34d399" : "#15803d",
      amber: isDark ? "#fbbf24" : "#d97706",
      purple: isDark ? "#a78bfa" : "#7c3aed"
    };
  };
})();
