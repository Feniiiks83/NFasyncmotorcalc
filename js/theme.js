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
    localStorage.setItem(STORAGE_KEY, theme);
    const btn = document.getElementById("themeToggle");
    if (btn) {
      btn.innerHTML = theme === "dark" ? "&#9728; Светлая" : "&#9790; Темная";
      btn.setAttribute("aria-label", theme === "dark" ? "Включить светлую тему" : "Включить темную тему");
    }
    window.dispatchEvent(new CustomEvent("themechange", { detail: { theme } }));
  }

  // Применяем тему сразу до загрузки графиков
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

  // Палитра для Chart.js под текущую тему
  window.getChartThemeColors = function () {
    const isDark = root.getAttribute("data-theme") === "dark";
    return {
      isDark,
      bg: isDark ? "#1e293b" : "#ffffff",
      text: isDark ? "#cbd5e1" : "#334155",
      grid: isDark ? "rgba(148, 163, 184, 0.16)" : "rgba(15, 23, 42, 0.1)",
      primary: isDark ? "#60a5fa" : "#2563eb",
      primaryFill: isDark ? "rgba(96, 165, 250, 0.14)" : "rgba(37, 99, 235, 0.10)",
      secondary: isDark ? "#f472b6" : "#dc2626",
      tertiary: isDark ? "#34d399" : "#15803d",
      amber: isDark ? "#fbbf24" : "#d97706",
      purple: isDark ? "#a78bfa" : "#7c3aed"
    };
  };

  // Плагин Chart.js для заливки фона при экспорте графика в PNG
  window.chartBgPlugin = {
    id: "customCanvasBackgroundColor",
    beforeDraw: function (chart) {
      const ctx = chart.canvas.getContext("2d");
      const colors = window.getChartThemeColors();
      ctx.save();
      ctx.globalCompositeOperation = "destination-over";
      ctx.fillStyle = colors.bg;
      ctx.fillRect(0, 0, chart.width, chart.height);
      ctx.restore();
    }
  };
})();
