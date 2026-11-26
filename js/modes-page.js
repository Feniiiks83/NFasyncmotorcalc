/* Логика страницы искусственных характеристик и сравнения режимов */
(function () {
  let compareChart = null;
  let naturalResult = null;

  function getEl(id) {
    return document.getElementById(id);
  }

  function populateSelect() {
    const sel = getEl("modesMotorSelect");
    window.MOTORS_CATALOG.forEach((m) => {
      const opt = document.createElement("option");
      opt.value = m.id;
      opt.textContent = m.name + " (" + m.pNom + " кВт, " + m.nNom + " об/мин)";
      sel.appendChild(opt);
    });
    sel.value = "air100s4";
  }

  function loadSelectedMotor() {
    const id = getEl("modesMotorSelect").value;
    const m = window.MOTORS_CATALOG.find((item) => item.id === id) || window.MOTORS_CATALOG[0];
    naturalResult = window.MotorCalc.calculateNatural({
      ...m,
      refined: false,
      coeffA: 0
    });
  }

  function getControls() {
    const kf = parseFloat(getEl("freqSlider").value) / 50;
    const ufLock = getEl("ufConstToggle").checked;
    let ku = parseFloat(getEl("voltSlider").value) / 100;

    if (ufLock) {
      ku = Math.min(1.0, kf); // До 50 Гц U/f = const, выше 50 Гц ограничение U = Uн
      getEl("voltSlider").value = Math.round(ku * 100);
      getEl("voltSlider").disabled = true;
    } else {
      getEl("voltSlider").disabled = false;
    }

    const kr = parseFloat(getEl("resSlider").value);
    const loadRatio = parseFloat(getEl("loadSlider").value) / 100;
    return { ku, kf, kr, loadRatio };
  }

  function updateView() {
    if (!naturalResult || !naturalResult.ok) return;
    const ctrl = getControls();
    const s0 = naturalResult.summary;
    const art = window.MotorCalc.calculateArtificial(naturalResult, ctrl);

    // Обновление подписей ползунков
    getEl("voltVal").textContent = Math.round(ctrl.ku * 100) + "% (" + Math.round(naturalResult.input.uNom * ctrl.ku) + " В)";
    getEl("freqVal").textContent = (50 * ctrl.kf).toFixed(0) + " Гц (k_f = " + ctrl.kf.toFixed(2) + ")";
    getEl("resVal").textContent = "×" + ctrl.kr.toFixed(1) + " R₂";
    getEl("loadVal").textContent = Math.round(ctrl.loadRatio * 100) + "% (" + art.mLoad.toFixed(1) + " Н·м)";

    // Сравнительная таблица метрик
    const workText = art.workPoint
      ? art.workPoint.n.toFixed(0) + " об/мин (s = " + (art.workPoint.s * 100).toFixed(1) + "%)"
      : "Опрокидывание (Mс > Mк)";

    const natLoadRes = window.MotorCalc.calculateArtificial(naturalResult, {
      ku: 1,
      kf: 1,
      kr: 1,
      loadRatio: ctrl.loadRatio
    });
    const natWorkText = natLoadRes.workPoint
      ? natLoadRes.workPoint.n.toFixed(0) + " об/мин"
      : "Опрокидывание";

    getEl("compareMetrics").innerHTML =
      '<div class="metric-item"><div class="metric-label">Синхронная скорость n₁</div>' +
      '<div class="metric-val">' + art.n1Art.toFixed(0) + ' об/мин</div>' +
      '<div class="metric-sub">Естеств.: ' + s0.n1.toFixed(0) + ' об/мин</div></div>' +

      '<div class="metric-item"><div class="metric-label">Критический момент Mк</div>' +
      '<div class="metric-val">' + art.mCritArt.toFixed(2) + ' Н·м</div>' +
      '<div class="metric-sub">Естеств.: ' + s0.mCrit.toFixed(2) + ' Н·м</div></div>' +

      '<div class="metric-item"><div class="metric-label">Критическое скольжение sк</div>' +
      '<div class="metric-val">' + (art.sCritArt * 100).toFixed(1) + ' %</div>' +
      '<div class="metric-sub">Естеств.: ' + (s0.sCrit * 100).toFixed(1) + ' %</div></div>' +

      '<div class="metric-item"><div class="metric-label">Пусковой момент Mп</div>' +
      '<div class="metric-val">' + art.mStartArt.toFixed(2) + ' Н·м</div>' +
      '<div class="metric-sub">Естеств.: ' + s0.mStartCalc.toFixed(2) + ' Н·м</div></div>' +

      '<div class="metric-item"><div class="metric-label">Рабочая скорость при Mс</div>' +
      '<div class="metric-val" style="font-size:1rem;">' + workText + '</div>' +
      '<div class="metric-sub">На естеств.: ' + natWorkText + '</div></div>';

    // Отрисовка графика сравнения
    if (typeof Chart === "undefined") return;
    const colors = window.getChartThemeColors();
    const maxY = Math.max(s0.n1, art.n1Art) * 1.08;
    const maxX = Math.max(s0.mCrit, art.mCritArt, art.mLoad) * 1.1;

    const datasets = [
      {
        label: "Естественная характеристика",
        data: naturalResult.curvePoints.map((pt) => ({ x: pt.M, y: pt.n })),
        showLine: true,
        borderColor: colors.primary,
        borderWidth: 2.5,
        pointRadius: 0,
        tension: 0.15
      },
      {
        label: "Искусственная характеристика",
        data: art.points.map((pt) => ({ x: pt.M, y: pt.n })),
        showLine: true,
        borderColor: colors.secondary,
        borderWidth: 2.5,
        borderDash: [7, 4],
        pointRadius: 0,
        tension: 0.15
      },
      {
        label: "Момент нагрузки Mс = " + art.mLoad.toFixed(1) + " Н·м",
        data: [
          { x: art.mLoad, y: 0 },
          { x: art.mLoad, y: maxY }
        ],
        showLine: true,
        borderColor: colors.amber,
        borderWidth: 1.8,
        borderDash: [3, 3],
        pointRadius: 0
      }
    ];

    if (art.workPoint) {
      datasets.push({
        label: "Рабочая точка (искусств.)",
        data: [{ x: art.workPoint.M, y: art.workPoint.n }],
        backgroundColor: colors.tertiary,
        borderColor: colors.bg,
        borderWidth: 2,
        pointRadius: 6.5
      });
    }

    if (compareChart) compareChart.destroy();
    compareChart = new Chart(getEl("compareChart").getContext("2d"), {
      type: "scatter",
      plugins: [window.chartBgPlugin],
      data: { datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 150 },
        plugins: {
          legend: { labels: { color: colors.text, usePointStyle: true } },
          tooltip: {
            callbacks: {
              label: (ctx) => ctx.dataset.label + ": M = " + ctx.parsed.x.toFixed(2) + " Н·м, n = " + ctx.parsed.y.toFixed(0) + " об/мин"
            }
          }
        },
        scales: {
          x: {
            type: "linear",
            min: 0,
            suggestedMax: maxX,
            title: { display: true, text: "Момент M, Н·м", color: colors.text, font: { weight: "600" } },
            ticks: { color: colors.text },
            grid: { color: colors.grid }
          },
          y: {
            type: "linear",
            min: 0,
            suggestedMax: maxY,
            title: { display: true, text: "Частота вращения n, об/мин", color: colors.text, font: { weight: "600" } },
            ticks: { color: colors.text },
            grid: { color: colors.grid }
          }
        }
      }
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    populateSelect();
    loadSelectedMotor();
    updateView();

    getEl("modesMotorSelect").addEventListener("change", function () {
      loadSelectedMotor();
      updateView();
    });

    ["voltSlider", "freqSlider", "resSlider", "loadSlider", "ufConstToggle"].forEach((id) => {
      getEl(id).addEventListener("input", updateView);
      getEl(id).addEventListener("change", updateView);
    });

    // Быстрые сценарии для демонстрации на защите
    getEl("demoVoltageBtn").addEventListener("click", function () {
      getEl("ufConstToggle").checked = false;
      getEl("voltSlider").value = 80;
      getEl("freqSlider").value = 50;
      getEl("resSlider").value = 1.0;
      updateView();
    });

    getEl("demoFreqBtn").addEventListener("click", function () {
      getEl("ufConstToggle").checked = true;
      getEl("freqSlider").value = 35;
      getEl("resSlider").value = 1.0;
      updateView();
    });

    getEl("demoRotorBtn").addEventListener("click", function () {
      getEl("ufConstToggle").checked = false;
      getEl("voltSlider").value = 100;
      getEl("freqSlider").value = 50;
      getEl("resSlider").value = 2.5;
      updateView();
    });

    getEl("resetModesBtn").addEventListener("click", function () {
      getEl("ufConstToggle").checked = false;
      getEl("voltSlider").value = 100;
      getEl("freqSlider").value = 50;
      getEl("resSlider").value = 1.0;
      getEl("loadSlider").value = 100;
      updateView();
    });

    getEl("dlCompareBtn").addEventListener("click", function () {
      if (!compareChart) return;
      const link = document.createElement("a");
      link.href = compareChart.toBase64Image("image/png", 1);
      link.download = "artificial_characteristic.png";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });

    window.addEventListener("themechange", updateView);
  });
})();
