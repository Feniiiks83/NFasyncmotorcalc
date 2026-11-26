/* Логика главной страницы: ввод данных, пресеты, графики Chart.js, таблица и экспорт */
(function () {
  const STORAGE_KEY = "async_motor_last_input";
  let chartMech = null;
  let chartTorque = null;
  let chartCurrent = null;
  let lastResult = null;

  const fieldIds = ["pNom", "uNom", "freq", "poles", "nNom", "eta", "cosPhi", "lambdaM", "kP", "kI", "coeffA"];

  function getEl(id) {
    return document.getElementById(id);
  }

  function populatePresets() {
    const select = getEl("presetSelect");
    if (!select || !window.MOTORS_CATALOG) return;
    window.MOTORS_CATALOG.forEach((m) => {
      const opt = document.createElement("option");
      opt.value = m.id;
      opt.textContent = m.name + " — " + m.pNom + " кВт, " + Math.round((60 * m.freq) / m.poles) + " об/мин";
      select.appendChild(opt);
    });
  }

  function fillForm(motor) {
    getEl("pNom").value = motor.pNom;
    getEl("uNom").value = motor.uNom;
    getEl("freq").value = motor.freq;
    getEl("poles").value = motor.poles;
    getEl("nNom").value = motor.nNom;
    getEl("eta").value = motor.eta;
    getEl("cosPhi").value = motor.cosPhi;
    getEl("lambdaM").value = motor.lambdaM;
    getEl("kP").value = motor.kP;
    getEl("kI").value = motor.kI;
    updateSyncHint();
  }

  function readForm() {
    return {
      pNom: parseFloat(getEl("pNom").value),
      uNom: parseFloat(getEl("uNom").value),
      freq: parseFloat(getEl("freq").value),
      poles: parseInt(getEl("poles").value, 10),
      nNom: parseFloat(getEl("nNom").value),
      eta: parseFloat(getEl("eta").value),
      cosPhi: parseFloat(getEl("cosPhi").value),
      lambdaM: parseFloat(getEl("lambdaM").value),
      kP: parseFloat(getEl("kP").value),
      kI: parseFloat(getEl("kI").value),
      refined: getEl("refinedToggle").checked,
      coeffA: parseFloat(getEl("coeffA").value)
    };
  }

  function updateSyncHint() {
    const f = parseFloat(getEl("freq").value) || 50;
    const p = parseInt(getEl("poles").value, 10) || 2;
    const hint = getEl("syncSpeedHint");
    if (hint) {
      hint.textContent = "n1 = " + ((60 * f) / p).toFixed(0) + " об/мин";
    }
  }

  function showErrors(errors) {
    const box = getEl("errorBox");
    if (!errors || errors.length === 0) {
      box.classList.add("hidden");
      box.innerHTML = "";
      return;
    }
    box.classList.remove("hidden");
    box.innerHTML = "<strong>Проверьте исходные данные:</strong><ul style='margin:0.35rem 0 0;padding-left:1.2rem;'>" +
      errors.map((e) => "<li>" + e + "</li>").join("") +
      "</ul>";
  }

  function renderMetrics(res) {
    const s = res.summary;
    const items = [
      { label: "Синхронная скорость n₁", val: s.n1.toFixed(0) + " об/мин", sub: "ω₀ = " + s.omega0.toFixed(2) + " рад/с" },
      { label: "Номинальное скольжение sн", val: (s.sNom * 100).toFixed(2) + " %", sub: s.sNom.toFixed(4) + " о.е." },
      { label: "Критическое скольжение sк", val: (s.sCrit * 100).toFixed(2) + " %", sub: "nк = " + s.nCrit.toFixed(0) + " об/мин" },
      { label: "Номинальный момент Mн", val: s.mNom.toFixed(2) + " Н·м", sub: "при nн = " + res.input.nNom + " об/мин" },
      { label: "Критический момент Mк", val: s.mCrit.toFixed(2) + " Н·м", sub: "λm = " + res.input.lambdaM.toFixed(2) },
      { label: "Пусковой момент Mп", val: s.mStartCalc.toFixed(2) + " Н·м", sub: "паспорт: " + s.mStartCatalog.toFixed(2) + " Н·м" },
      { label: "Номинальный ток Iн", val: s.iNom.toFixed(2) + " А", sub: "I₀ ≈ " + s.i0.toFixed(2) + " А" },
      { label: "Пусковой ток Iп", val: s.iStart.toFixed(1) + " А", sub: "P₁ = " + s.p1.toFixed(2) + " кВт" }
    ];

    const grid = getEl("metricsGrid");
    grid.innerHTML = items
      .map(
        (m) =>
          '<div class="metric-item">' +
          '<div class="metric-label">' + m.label + "</div>" +
          '<div class="metric-val">' + m.val + "</div>" +
          '<div class="metric-sub">' + m.sub + "</div>" +
          "</div>"
      )
      .join("");
  }

  function renderTable(res) {
    const tbody = getEl("resultsTableBody");
    tbody.innerHTML = res.tableRows
      .map((r) => {
        const cls = r.label ? ' class="row-highlight"' : "";
        const badge = r.label ? '<span class="badge">' + r.label + "</span>" : "";
        return (
          "<tr" + cls + ">" +
          "<td>" + r.s.toFixed(4) + badge + "</td>" +
          "<td>" + (r.s * 100).toFixed(2) + "</td>" +
          "<td>" + r.n.toFixed(1) + "</td>" +
          "<td>" + r.omega.toFixed(2) + "</td>" +
          "<td>" + r.M.toFixed(2) + "</td>" +
          "<td>" + r.I.toFixed(2) + "</td>" +
          "<td>" + r.p2.toFixed(3) + "</td>" +
          "</tr>"
        );
      })
      .join("");
  }

  function renderCharts(res) {
    if (typeof Chart === "undefined") {
      getEl("chartOfflineAlert").classList.remove("hidden");
      return;
    }
    getEl("chartOfflineAlert").classList.add("hidden");

    const colors = window.getChartThemeColors();
    const s = res.summary;
    const showExt = getEl("extendedSlipToggle").checked;

    const commonScales = (xTitle, yTitle) => ({
      x: {
        type: "linear",
        title: { display: true, text: xTitle, color: colors.text, font: { weight: "600" } },
        ticks: { color: colors.text },
        grid: { color: colors.grid }
      },
      y: {
        type: "linear",
        title: { display: true, text: yTitle, color: colors.text, font: { weight: "600" } },
        ticks: { color: colors.text },
        grid: { color: colors.grid }
      }
    });

    // 1. Механическая характеристика n(M)
    if (chartMech) chartMech.destroy();
    chartMech = new Chart(getEl("mechChart").getContext("2d"), {
      type: "scatter",
      plugins: [window.chartBgPlugin],
      data: {
        datasets: [
          {
            label: "Естественная n(M)",
            data: res.curvePoints.map((pt) => ({ x: pt.M, y: pt.n })),
            showLine: true,
            borderColor: colors.primary,
            backgroundColor: colors.primary,
            borderWidth: 2.5,
            pointRadius: 0,
            tension: 0.15
          },
          {
            label: "Номинальная точка (Mн, nн)",
            data: [{ x: s.mNom, y: res.input.nNom }],
            backgroundColor: colors.tertiary,
            borderColor: colors.bg,
            borderWidth: 2,
            pointRadius: 6
          },
          {
            label: "Критическая точка (Mк, nк)",
            data: [{ x: s.mCrit, y: s.nCrit }],
            backgroundColor: colors.secondary,
            borderColor: colors.bg,
            borderWidth: 2,
            pointRadius: 6
          },
          {
            label: "Пусковая точка (Mп, 0)",
            data: [{ x: s.mStartCalc, y: 0 }],
            backgroundColor: colors.amber,
            borderColor: colors.bg,
            borderWidth: 2,
            pointRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: colors.text, usePointStyle: true } },
          tooltip: {
            callbacks: {
              label: (ctx) => ctx.dataset.label + ": M = " + ctx.parsed.x.toFixed(2) + " Н·м, n = " + ctx.parsed.y.toFixed(1) + " об/мин"
            }
          }
        },
        scales: {
          x: { ...commonScales("Момент M, Н·м", "Частота вращения n, об/мин").x, min: 0 },
          y: { ...commonScales("Момент M, Н·м", "Частота вращения n, об/мин").y, min: 0, suggestedMax: s.n1 * 1.05 }
        }
      }
    });

    // 2. Зависимость момента от скольжения M(s)
    if (chartTorque) chartTorque.destroy();
    const torqueData = showExt
      ? res.extendedPoints.map((pt) => ({ x: pt.s, y: pt.M }))
      : res.curvePoints.map((pt) => ({ x: pt.s, y: pt.M }));

    chartTorque = new Chart(getEl("torqueChart").getContext("2d"), {
      type: "scatter",
      plugins: [window.chartBgPlugin],
      data: {
        datasets: [
          {
            label: "Момент M(s)",
            data: torqueData,
            showLine: true,
            borderColor: colors.purple,
            backgroundColor: colors.purple,
            borderWidth: 2.3,
            pointRadius: 0,
            tension: 0.18
          },
          {
            label: "Номинал / Критическая",
            data: [
              { x: s.sNom, y: s.mNom },
              { x: s.sCrit, y: s.mCrit }
            ],
            backgroundColor: [colors.tertiary, colors.secondary],
            borderColor: colors.bg,
            borderWidth: 2,
            pointRadius: 5.5
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: colors.text, usePointStyle: true } },
          tooltip: {
            callbacks: {
              label: (ctx) => "s = " + ctx.parsed.x.toFixed(3) + ", M = " + ctx.parsed.y.toFixed(2) + " Н·м"
            }
          }
        },
        scales: commonScales("Скольжение s, о.е.", "Момент M, Н·м")
      }
    });

    // 3. Токовая характеристика I(s)
    if (chartCurrent) chartCurrent.destroy();
    chartCurrent = new Chart(getEl("currentChart").getContext("2d"), {
      type: "scatter",
      plugins: [window.chartBgPlugin],
      data: {
        datasets: [
          {
            label: "Ток статора I(s)",
            data: res.curvePoints.map((pt) => ({ x: pt.s, y: pt.I })),
            showLine: true,
            borderColor: colors.secondary,
            backgroundColor: colors.secondary,
            borderWidth: 2.3,
            pointRadius: 0,
            tension: 0.18
          },
          {
            label: "I₀, Iн, Iп",
            data: [
              { x: 0, y: s.i0 },
              { x: s.sNom, y: s.iNom },
              { x: 1, y: s.iStart }
            ],
            backgroundColor: [colors.primary, colors.tertiary, colors.amber],
            borderColor: colors.bg,
            borderWidth: 2,
            pointRadius: 5.5
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: colors.text, usePointStyle: true } },
          tooltip: {
            callbacks: {
              label: (ctx) => "s = " + ctx.parsed.x.toFixed(3) + ", I = " + ctx.parsed.y.toFixed(2) + " А"
            }
          }
        },
        scales: {
          x: { ...commonScales("Скольжение s, о.е.", "Ток статора I, А").x, min: 0, max: 1 },
          y: { ...commonScales("Скольжение s, о.е.", "Ток статора I, А").y, min: 0 }
        }
      }
    });
  }

  function runCalculation() {
    const input = readForm();
    const res = window.MotorCalc.calculateNatural(input);
    if (!res.ok) {
      showErrors(res.errors);
      return;
    }
    showErrors([]);
    lastResult = res;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(input));
    renderMetrics(res);
    renderTable(res);
    renderCharts(res);
  }

  function downloadChartPng(chart, filename) {
    if (!chart) return;
    const link = document.createElement("a");
    link.href = chart.toBase64Image("image/png", 1);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function initInitialMotor() {
    const params = new URLSearchParams(window.location.search);
    const motorId = params.get("motor");
    if (motorId && window.MOTORS_CATALOG) {
      const found = window.MOTORS_CATALOG.find((m) => m.id === motorId);
      if (found) {
        getEl("presetSelect").value = found.id;
        fillForm(found);
        return;
      }
    }

    const savedRaw = localStorage.getItem(STORAGE_KEY);
    if (savedRaw) {
      try {
        const saved = JSON.parse(savedRaw);
        fillForm(saved);
        getEl("refinedToggle").checked = Boolean(saved.refined);
        if (saved.coeffA !== undefined) getEl("coeffA").value = saved.coeffA;
        getEl("coeffAGroup").classList.toggle("hidden", !saved.refined);
        return;
      } catch (e) {
        // Игнорируем поврежденный кэш
      }
    }

    // По умолчанию АИР100S4
    const def = window.MOTORS_CATALOG.find((m) => m.id === "air100s4") || window.MOTORS_CATALOG[0];
    getEl("presetSelect").value = def.id;
    fillForm(def);
  }

  document.addEventListener("DOMContentLoaded", function () {
    populatePresets();
    initInitialMotor();

    getEl("presetSelect").addEventListener("change", function () {
      const m = window.MOTORS_CATALOG.find((item) => item.id === this.value);
      if (m) {
        fillForm(m);
        runCalculation();
      }
    });

    getEl("refinedToggle").addEventListener("change", function () {
      getEl("coeffAGroup").classList.toggle("hidden", !this.checked);
      runCalculation();
    });

    getEl("extendedSlipToggle").addEventListener("change", function () {
      if (lastResult) renderCharts(lastResult);
    });

    getEl("freq").addEventListener("input", updateSyncHint);
    getEl("poles").addEventListener("change", updateSyncHint);

    getEl("motorForm").addEventListener("submit", function (e) {
      e.preventDefault();
      runCalculation();
    });

    getEl("resetBtn").addEventListener("click", function () {
      const def = window.MOTORS_CATALOG.find((m) => m.id === "air100s4") || window.MOTORS_CATALOG[0];
      getEl("presetSelect").value = def.id;
      getEl("refinedToggle").checked = false;
      getEl("coeffAGroup").classList.add("hidden");
      getEl("coeffA").value = "0.2";
      fillForm(def);
      runCalculation();
    });

    getEl("exportCsvBtn").addEventListener("click", function () {
      if (!lastResult) return;
      const preset = getEl("presetSelect");
      const label = preset.value || "custom";
      window.MotorCalc.exportTableToCsv(lastResult, label);
    });

    getEl("printBtn").addEventListener("click", function () {
      window.print();
    });

    getEl("dlMechBtn").addEventListener("click", () => downloadChartPng(chartMech, "mech_characteristic_n_M.png"));
    getEl("dlTorqueBtn").addEventListener("click", () => downloadChartPng(chartTorque, "torque_slip_M_s.png"));
    getEl("dlCurrentBtn").addEventListener("click", () => downloadChartPng(chartCurrent, "current_slip_I_s.png"));

    window.addEventListener("themechange", function () {
      if (lastResult) renderCharts(lastResult);
    });

    // Авторасчет при загрузке
    runCalculation();
  });
})();
