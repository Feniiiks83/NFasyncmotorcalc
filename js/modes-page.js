/* Логика страницы искусственных характеристик и сравнения режимов */
(function () {
  let compareChart = null;
  let naturalResult = null;

  function getEl(id) {
    return document.getElementById(id);
  }

  function populateSelect() {
    const sel = getEl("modesMotorSelect");
    window.MOTORS_CATALOG.forEach(function (m) {
      const opt = document.createElement("option");
      opt.value = m.id;
      opt.textContent = m.name + " (" + m.pNom + " кВт, " + m.nNom + " об/мин)";
      sel.appendChild(opt);
    });
    sel.value = "air100s4";
  }

  function loadSelectedMotor() {
    const id = getEl("modesMotorSelect").value;
    const m = window.MOTORS_CATALOG.find(function (item) { return item.id === id; }) || window.MOTORS_CATALOG[0];
    naturalResult = window.MotorCalc.calculateNatural(
      Object.assign({}, m, { refined: false, coeffA: 0 })
    );
  }

  function getControls() {
    const kf = parseFloat(getEl("freqSlider").value) / 50;
    const ufLock = getEl("ufConstToggle").checked;
    let ku = parseFloat(getEl("voltSlider").value) / 100;

    if (ufLock) {
      ku = Math.min(1.0, kf);
      getEl("voltSlider").value = Math.round(ku * 100);
      getEl("voltSlider").disabled = true;
    } else {
      getEl("voltSlider").disabled = false;
    }

    const kr = parseFloat(getEl("resSlider").value);
    const loadRatio = parseFloat(getEl("loadSlider").value) / 100;
    return { ku: ku, kf: kf, kr: kr, loadRatio: loadRatio };
  }

  function updateView() {
    if (!naturalResult || !naturalResult.ok) return;
    const ctrl = getControls();
    const s0 = naturalResult.summary;
    const art = window.MotorCalc.calculateArtificial(naturalResult, ctrl);

    getEl("voltVal").textContent = Math.round(ctrl.ku * 100) + "% (" + Math.round(naturalResult.input.uNom * ctrl.ku) + " В)";
    getEl("freqVal").textContent = (50 * ctrl.kf).toFixed(0) + " Гц (k_f = " + ctrl.kf.toFixed(2) + ")";
    getEl("resVal").textContent = "×" + ctrl.kr.toFixed(1) + " R₂";
    getEl("loadVal").textContent = Math.round(ctrl.loadRatio * 100) + "% (" + art.mLoad.toFixed(1) + " Н·м)";

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
      '<div class="metric-val">' + art.n1Art.toFixed(0) + " об/мин</div>" +
      '<div class="metric-sub">Естеств.: ' + s0.n1.toFixed(0) + " об/мин</div></div>" +

      '<div class="metric-item"><div class="metric-label">Критический момент Mк</div>' +
      '<div class="metric-val">' + art.mCritArt.toFixed(2) + " Н·м</div>" +
      '<div class="metric-sub">Естеств.: ' + s0.mCrit.toFixed(2) + " Н·м</div></div>" +

      '<div class="metric-item"><div class="metric-label">Критическое скольжение sк</div>' +
      '<div class="metric-val">' + (art.sCritArt * 100).toFixed(1) + " %</div>" +
      '<div class="metric-sub">Естеств.: ' + (s0.sCrit * 100).toFixed(1) + " %</div></div>" +

      '<div class="metric-item"><div class="metric-label">Пусковой момент Mп</div>' +
      '<div class="metric-val">' + art.mStartArt.toFixed(2) + " Н·м</div>" +
      '<div class="metric-sub">Естеств.: ' + s0.mStartCalc.toFixed(2) + " Н·м</div></div>" +

      '<div class="metric-item"><div class="metric-label">Рабочая скорость при Mс</div>' +
      '<div class="metric-val" style="font-size:1rem;">' + workText + "</div>" +
      '<div class="metric-sub">На естеств.: ' + natWorkText + "</div></div>";

    const colors = window.getChartThemeColors();
    const maxY = Math.max(s0.n1, art.n1Art) * 1.05;
    const maxX = Math.max(s0.mCrit, art.mCritArt, art.mLoad) * 1.08;

    const datasets = [
      {
        type: "line",
        label: "Естественная характеристика",
        data: naturalResult.curvePoints.map(function (pt) { return { x: pt.M, y: pt.n }; }),
        color: colors.primary,
        width: 2.6
      },
      {
        type: "line",
        label: "Искусственная характеристика",
        data: art.points.map(function (pt) { return { x: pt.M, y: pt.n }; }),
        color: colors.secondary,
        width: 2.6,
        dash: [7, 4]
      },
      {
        type: "line",
        label: "Нагрузка Mс = " + art.mLoad.toFixed(1) + " Н·м",
        data: [
          { x: art.mLoad, y: 0 },
          { x: art.mLoad, y: maxY }
        ],
        color: colors.amber,
        width: 1.8,
        dash: [3, 3]
      }
    ];

    if (art.workPoint) {
      datasets.push({
        type: "points",
        label: "Рабочая точка",
        data: [{ x: art.workPoint.M, y: art.workPoint.n, label: "Установившаяся рабочая точка" }],
        color: colors.tertiary,
        radius: 6.5
      });
    }

    if (compareChart) compareChart.destroy();
    compareChart = window.MotorCharts.createLineChart(getEl("compareChart"), {
      xTitle: "Момент M, Н·м",
      yTitle: "Частота вращения n, об/мин",
      xMin: 0,
      xMax: maxX,
      yMin: 0,
      yMax: maxY,
      datasets: datasets,
      formatTooltip: function (pt) {
        return "M = " + pt.x.toFixed(2) + " Н·м, n = " + pt.y.toFixed(0) + " об/мин";
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

    ["voltSlider", "freqSlider", "resSlider", "loadSlider", "ufConstToggle"].forEach(function (id) {
      getEl(id).addEventListener("input", updateView);
      getEl(id).addEventListener("change", updateView);
    });

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

    getEl("dlComparePngBtn").addEventListener("click", function () {
      if (compareChart) compareChart.downloadPNG("artificial_characteristic.png");
    });

    getEl("dlCompareSvgBtn").addEventListener("click", function () {
      if (compareChart) compareChart.downloadSVG("artificial_characteristic.svg");
    });

    window.addEventListener("themechange", updateView);
  });
})();
