/* Логика главной страницы: ввод данных, пресеты, графики MotorCharts, таблица и экспорт */
(function () {
  const STORAGE_KEY = "async_motor_last_input";
  let chartMech = null;
  let chartTorque = null;
  let chartCurrent = null;
  let lastResult = null;

  function getEl(id) {
    return document.getElementById(id);
  }

  function populatePresets() {
    const select = getEl("presetSelect");
    if (!select || !window.MOTORS_CATALOG) return;
    window.MOTORS_CATALOG.forEach(function (m) {
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
    box.innerHTML =
      "<strong>Проверьте исходные данные:</strong><ul style='margin:0.35rem 0 0;padding-left:1.2rem;'>" +
      errors.map(function (e) { return "<li>" + e + "</li>"; }).join("") +
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

    getEl("metricsGrid").innerHTML = items
      .map(function (m) {
        return (
          '<div class="metric-item">' +
          '<div class="metric-label">' + m.label + "</div>" +
          '<div class="metric-val">' + m.val + "</div>" +
          '<div class="metric-sub">' + m.sub + "</div>" +
          "</div>"
        );
      })
      .join("");
  }

  function renderTable(res) {
    getEl("resultsTableBody").innerHTML = res.tableRows
      .map(function (r) {
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
    const colors = window.getChartThemeColors();
    const s = res.summary;
    const showExt = getEl("extendedSlipToggle").checked;

    // 1. Механическая характеристика n(M)
    if (chartMech) chartMech.destroy();
    chartMech = window.MotorCharts.createLineChart(getEl("mechChart"), {
      xTitle: "Момент M, Н·м",
      yTitle: "Частота вращения n, об/мин",
      xMin: 0,
      yMin: 0,
      datasets: [
        {
          type: "line",
          label: "Естественная n(M)",
          data: res.curvePoints.map(function (pt) { return { x: pt.M, y: pt.n }; }),
          color: colors.primary,
          width: 2.6
        },
        {
          type: "points",
          label: "Номинальная (Mн, nн)",
          data: [{ x: s.mNom, y: res.input.nNom, label: "Номинальная точка" }],
          color: colors.tertiary,
          radius: 6
        },
        {
          type: "points",
          label: "Критическая (Mк, nк)",
          data: [{ x: s.mCrit, y: s.nCrit, label: "Критическая точка" }],
          color: colors.secondary,
          radius: 6
        },
        {
          type: "points",
          label: "Пусковая (Mп, 0)",
          data: [{ x: s.mStartCalc, y: 0, label: "Пусковая точка" }],
          color: colors.amber,
          radius: 6
        }
      ],
      formatTooltip: function (pt) {
        return "M = " + pt.x.toFixed(2) + " Н·м, n = " + pt.y.toFixed(1) + " об/мин";
      }
    });

    // 2. Момент от скольжения M(s)
    if (chartTorque) chartTorque.destroy();
    const torqueData = showExt
      ? res.extendedPoints.map(function (pt) { return { x: pt.s, y: pt.M }; })
      : res.curvePoints.map(function (pt) { return { x: pt.s, y: pt.M }; });

    chartTorque = window.MotorCharts.createLineChart(getEl("torqueChart"), {
      xTitle: "Скольжение s, о.е.",
      yTitle: "Момент M, Н·м",
      xMin: showExt ? -0.5 : 0,
      xMax: showExt ? 1.5 : 1,
      yMin: showExt ? undefined : 0,
      datasets: [
        {
          type: "line",
          label: "Момент M(s)",
          data: torqueData,
          color: colors.purple,
          width: 2.4
        },
        {
          type: "points",
          label: "Номинал / Критическая",
          data: [
            { x: s.sNom, y: s.mNom, label: "Номинальная (sн, Mн)", color: colors.tertiary },
            { x: s.sCrit, y: s.mCrit, label: "Критическая (sк, Mк)", color: colors.secondary }
          ],
          color: [colors.tertiary, colors.secondary],
          radius: 5.5
        }
      ],
      formatTooltip: function (pt) {
        return "s = " + pt.x.toFixed(3) + ", M = " + pt.y.toFixed(2) + " Н·м";
      }
    });

    // 3. Токовая характеристика I(s)
    if (chartCurrent) chartCurrent.destroy();
    chartCurrent = window.MotorCharts.createLineChart(getEl("currentChart"), {
      xTitle: "Скольжение s, о.е.",
      yTitle: "Ток статора I, А",
      xMin: 0,
      xMax: 1,
      yMin: 0,
      datasets: [
        {
          type: "line",
          label: "Ток статора I(s)",
          data: res.curvePoints.map(function (pt) { return { x: pt.s, y: pt.I }; }),
          color: colors.secondary,
          width: 2.4
        },
        {
          type: "points",
          label: "Характерные точки (I₀, Iн, Iп)",
          data: [
            { x: 0, y: s.i0, label: "Ток холостого хода I₀", color: colors.primary },
            { x: s.sNom, y: s.iNom, label: "Номинальный ток Iн", color: colors.tertiary },
            { x: 1, y: s.iStart, label: "Пусковой ток Iп", color: colors.amber }
          ],
          color: [colors.primary, colors.tertiary, colors.amber],
          radius: 5.5
        }
      ],
      formatTooltip: function (pt) {
        return "s = " + pt.x.toFixed(3) + ", I = " + pt.y.toFixed(2) + " А";
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
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(input));
    } catch (e) {
      // Игнорируем ограничения приватного режима
    }
    renderMetrics(res);
    renderTable(res);
    renderCharts(res);
  }

  function initInitialMotor() {
    const params = new URLSearchParams(window.location.search);
    const motorId = params.get("motor");
    if (motorId && window.MOTORS_CATALOG) {
      const found = window.MOTORS_CATALOG.find(function (m) { return m.id === motorId; });
      if (found) {
        getEl("presetSelect").value = found.id;
        fillForm(found);
        return;
      }
    }

    try {
      const savedRaw = localStorage.getItem(STORAGE_KEY);
      if (savedRaw) {
        const saved = JSON.parse(savedRaw);
        if (saved && saved.pNom > 0) {
          fillForm(saved);
          getEl("refinedToggle").checked = Boolean(saved.refined);
          if (saved.coeffA !== undefined) getEl("coeffA").value = saved.coeffA;
          getEl("coeffAGroup").classList.toggle("hidden", !saved.refined);
          return;
        }
      }
    } catch (e) {
      // Игнорируем поврежденный кэш
    }

    const def = window.MOTORS_CATALOG.find(function (m) { return m.id === "air100s4"; }) || window.MOTORS_CATALOG[0];
    getEl("presetSelect").value = def.id;
    fillForm(def);
  }

  document.addEventListener("DOMContentLoaded", function () {
    populatePresets();
    initInitialMotor();

    getEl("presetSelect").addEventListener("change", function () {
      const val = this.value;
      const m = window.MOTORS_CATALOG.find(function (item) { return item.id === val; });
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
      const def = window.MOTORS_CATALOG.find(function (m) { return m.id === "air100s4"; }) || window.MOTORS_CATALOG[0];
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

    getEl("dlMechPngBtn").addEventListener("click", function () {
      if (chartMech) chartMech.downloadPNG("mech_characteristic_n_M.png");
    });
    getEl("dlMechSvgBtn").addEventListener("click", function () {
      if (chartMech) chartMech.downloadSVG("mech_characteristic_n_M.svg");
    });

    getEl("dlTorquePngBtn").addEventListener("click", function () {
      if (chartTorque) chartTorque.downloadPNG("torque_slip_M_s.png");
    });
    getEl("dlTorqueSvgBtn").addEventListener("click", function () {
      if (chartTorque) chartTorque.downloadSVG("torque_slip_M_s.svg");
    });

    getEl("dlCurrentPngBtn").addEventListener("click", function () {
      if (chartCurrent) chartCurrent.downloadPNG("current_slip_I_s.png");
    });
    getEl("dlCurrentSvgBtn").addEventListener("click", function () {
      if (chartCurrent) chartCurrent.downloadSVG("current_slip_I_s.svg");
    });

    window.addEventListener("themechange", function () {
      if (lastResult) renderCharts(lastResult);
    });

    runCalculation();
  });
})();
