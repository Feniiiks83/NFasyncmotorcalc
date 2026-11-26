/* Математическое ядро для расчета характеристик асинхронного двигателя */
window.MotorCalc = (function () {
  /**
   * Валидация паспортных данных двигателя
   * @param {Object} p - входные параметры
   * @returns {string[]} массив текстов ошибок (пустой, если все корректно)
   */
  function validate(p) {
    const errors = [];
    if (!(p.pNom > 0 && p.pNom <= 5000)) errors.push("Номинальная мощность Pн должна быть от 0.01 до 5000 кВт.");
    if (!(p.uNom >= 36 && p.uNom <= 10000)) errors.push("Линейное напряжение Uн должно быть в пределах 36–10000 В.");
    if (!(p.freq >= 10 && p.freq <= 400)) errors.push("Частота сети f должна быть в пределах 10–400 Гц.");
    if (!(Number.isInteger(p.poles) && p.poles >= 1 && p.poles <= 8)) errors.push("Число пар полюсов p должно быть целым от 1 до 8.");

    const n1 = (60 * p.freq) / p.poles;
    if (!(p.nNom > 0 && p.nNom < n1)) {
      errors.push("Номинальная скорость nн должна быть больше 0 и строго меньше синхронной n1 (" + n1.toFixed(0) + " об/мин).");
    }
    if (!(p.eta > 10 && p.eta <= 99.5)) errors.push("КПД ηн должен быть в диапазоне 10–99.5%.");
    if (!(p.cosPhi > 0.1 && p.cosPhi <= 1.0)) errors.push("Коэффициент мощности cos φн должен быть в диапазоне 0.1–1.0.");
    if (!(p.lambdaM > 1.05 && p.lambdaM <= 6.0)) errors.push("Кратность максимального момента λm должна быть больше 1.05.");
    if (!(p.kP > 0.1 && p.kP <= 5.0)) errors.push("Кратность пускового момента kп должна быть в пределах 0.1–5.0.");
    if (!(p.kI > 1.2 && p.kI <= 15.0)) errors.push("Кратность пускового тока kI должна быть в пределах 1.2–15.0.");
    if (p.refined && (p.coeffA < 0 || p.coeffA > 2)) {
      errors.push("Коэффициент уточнения a = R1/R2' должен быть в диапазоне 0–2.");
    }
    return errors;
  }

  /**
   * Расчет основных параметров и массивов точек естественных характеристик
   */
  function calculateNatural(p) {
    const errors = validate(p);
    if (errors.length > 0) {
      return { ok: false, errors };
    }

    const etaDec = p.eta / 100;
    const n1 = (60 * p.freq) / p.poles;
    const omega0 = (Math.PI * n1) / 30;
    const omegaN = (Math.PI * p.nNom) / 30;
    const sNom = (n1 - p.nNom) / n1;

    // Мощности и моменты
    const p1 = p.pNom / etaDec; // кВт
    const mNom = (p.pNom * 1000) / omegaN; // Н*м
    const mCrit = p.lambdaM * mNom; // Н*м
    const mStartCatalog = p.kP * mNom; // Н*м (по паспорту)

    // Токи
    const iNom = (p.pNom * 1000) / (Math.sqrt(3) * p.uNom * etaDec * p.cosPhi);
    const iStart = p.kI * iNom;

    // Коэффициент уточненной формулы Клосса (0 для упрощенной)
    const a = p.refined ? Number(p.coeffA || 0) : 0;

    // Критическое скольжение s_k
    let sCrit;
    if (a === 0) {
      sCrit = sNom * (p.lambdaM + Math.sqrt(p.lambdaM * p.lambdaM - 1));
    } else {
      const A = 1 - 2 * a * sNom * (p.lambdaM - 1);
      if (A > 0.05 && p.lambdaM * p.lambdaM - A >= 0) {
        sCrit = (p.lambdaM * sNom + sNom * Math.sqrt(p.lambdaM * p.lambdaM - A)) / A;
      } else {
        sCrit = sNom * (p.lambdaM + Math.sqrt(p.lambdaM * p.lambdaM - 1));
      }
    }

    const nCrit = n1 * (1 - sCrit);
    const omegaCrit = omega0 * (1 - sCrit);

    // Момент по формуле Клосса
    function torqueAtSlip(s) {
      if (Math.abs(s) < 1e-9) return 0;
      const denom = s / sCrit + sCrit / s + 2 * a * sCrit;
      return (2 * mCrit * (1 + a * sCrit)) / denom;
    }

    const mStartCalc = torqueAtSlip(1);

    // Оценка тока холостого хода I0 и аппроксимация токовой кривой I(s)
    const sinPhi = Math.sqrt(Math.max(0, 1 - p.cosPhi * p.cosPhi));
    let i0Ratio = sinPhi - p.cosPhi * (sNom / sCrit);
    i0Ratio = Math.min(0.65, Math.max(0.25, i0Ratio));
    const i0 = iNom * i0Ratio;

    // Параметры аппроксимации I^2(s) = I0^2 + (C * s^2) / (1 + B * s^2),
    // строго проходящей через (0, I0), (sNom, iNom) и (1, iStart)
    const dn = iNom * iNom - i0 * i0;
    const dp = iStart * iStart - i0 * i0;
    let B = (dn - dp * sNom * sNom) / (sNom * sNom * (dp - dn));
    let C;
    if (!isFinite(B) || B <= 0) {
      B = 1 / (sCrit * sCrit);
      C = dp * (1 + B);
    } else {
      C = dp * (1 + B);
    }

    function currentAtSlip(s) {
      const s2 = s * s;
      return Math.sqrt(i0 * i0 + (C * s2) / (1 + B * s2));
    }

    // Генерация плотного массива точек для плавных графиков
    const slipSet = new Set([0, sNom, sCrit, 1]);
    // Плотная сетка в рабочем участке (0..sCrit) и пусковом (sCrit..1)
    for (let i = 1; i <= 40; i++) {
      slipSet.add((sCrit * i) / 40);
    }
    for (let i = 1; i <= 50; i++) {
      slipSet.add(sCrit + ((1 - sCrit) * i) / 50);
    }
    const sortedSlips = Array.from(slipSet).sort((x, y) => x - y);

    const curvePoints = sortedSlips.map((s) => {
      const n = n1 * (1 - s);
      const omega = omega0 * (1 - s);
      const M = torqueAtSlip(s);
      const I = currentAtSlip(s);
      const p2 = (M * omega) / 1000;
      return { s, n, omega, M, I, p2 };
    });

    // Расширенная кривая M(s) включая генераторный (s < 0) и тормозной (s > 1) режимы
    const extendedPoints = [];
    for (let s = -0.5; s <= 1.5001; s += 0.025) {
      const sv = Math.abs(s) < 1e-6 ? 0 : Number(s.toFixed(4));
      extendedPoints.push({ s: sv, M: torqueAtSlip(sv) });
    }

    // Таблица ключевых и равномерных расчетных точек (15-18 строк)
    const tableSlips = [
      0,
      Number((sNom * 0.5).toFixed(4)),
      sNom,
      Number((sNom + (sCrit - sNom) * 0.5).toFixed(4)),
      sCrit,
      0.25,
      0.35,
      0.5,
      0.65,
      0.8,
      0.9,
      1.0
    ]
      .filter((s, idx, arr) => s >= 0 && s <= 1 && arr.findIndex((v) => Math.abs(v - s) < 0.003) === idx)
      .sort((x, y) => x - y);

    const tableRows = tableSlips.map((s) => {
      const n = n1 * (1 - s);
      const omega = omega0 * (1 - s);
      const M = torqueAtSlip(s);
      const I = currentAtSlip(s);
      const p2 = (M * omega) / 1000;
      let label = "";
      if (Math.abs(s) < 1e-4) label = "Холостой ход";
      else if (Math.abs(s - sNom) < 1e-4) label = "Номинальный";
      else if (Math.abs(s - sCrit) < 1e-4) label = "Критический";
      else if (Math.abs(s - 1) < 1e-4) label = "Пусковой";
      return { s, n, omega, M, I, p2, label };
    });

    return {
      ok: true,
      input: p,
      summary: {
        n1,
        omega0,
        omegaN,
        sNom,
        sCrit,
        nCrit,
        omegaCrit,
        mNom,
        mCrit,
        mStartCatalog,
        mStartCalc,
        p1,
        iNom,
        iStart,
        i0,
        a
      },
      curvePoints,
      extendedPoints,
      tableRows,
      torqueAtSlip,
      currentAtSlip
    };
  }

  /**
   * Расчет искусственной механической характеристики
   * @param {Object} natural - результат calculateNatural
   * @param {Object} ctrl - { ku, kf, kr, loadRatio }
   */
  function calculateArtificial(natural, ctrl) {
    const s0 = natural.summary;
    const ku = ctrl.ku; // U / Uн
    const kf = ctrl.kf; // f / fн
    const kr = ctrl.kr; // R2_сум / R2

    const n1Art = s0.n1 * kf;
    const fluxRatio = ku / kf;
    const mCritArt = s0.mCrit * fluxRatio * fluxRatio;
    const sCritArt = (s0.sCrit * kr) / kf;
    const nCritArt = n1Art * (1 - sCritArt);

    function torqueAtSlipArt(s) {
      if (Math.abs(s) < 1e-9) return 0;
      return (2 * mCritArt) / (s / sCritArt + sCritArt / s);
    }

    const mStartArt = torqueAtSlipArt(1);

    // Точки кривой n(M) для искусственной характеристики
    const slips = new Set([0, 1]);
    if (sCritArt > 0 && sCritArt < 1) slips.add(sCritArt);
    const maxS = 1;
    const pivot = Math.min(sCritArt, 0.9);
    for (let i = 1; i <= 40; i++) slips.add((pivot * i) / 40);
    for (let i = 1; i <= 50; i++) slips.add(pivot + ((maxS - pivot) * i) / 50);

    const points = Array.from(slips)
      .sort((a, b) => a - b)
      .map((s) => ({
        s,
        n: n1Art * (1 - s),
        M: torqueAtSlipArt(s)
      }));

    // Поиск установившейся рабочей скорости на устойчивой ветви при заданном моменте нагрузки Mc
    const mLoad = s0.mNom * ctrl.loadRatio;
    let workPoint = null;
    if (mLoad <= mCritArt && mLoad > 0) {
      // Решаем M(s) = mLoad на устойчивом участке (0 < s <= sCritArt)
      // (s/sk)^2 - (2*Mk/Mc)*(s/sk) + 1 = 0 => берем меньший корень
      const k = mCritArt / mLoad;
      const ratio = k - Math.sqrt(Math.max(0, k * k - 1));
      const sWork = sCritArt * ratio;
      if (sWork <= 1) {
        workPoint = {
          s: sWork,
          n: n1Art * (1 - sWork),
          M: mLoad
        };
      }
    }

    return {
      n1Art,
      mCritArt,
      sCritArt,
      nCritArt,
      mStartArt,
      mLoad,
      workPoint,
      points
    };
  }

  /**
   * Экспорт таблицы расчетных точек в CSV (с BOM для корректного открытия в Excel)
   */
  function exportTableToCsv(result, motorLabel) {
    const header = ["s (отн. ед.)", "s (%)", "n (об/мин)", "w (рад/с)", "M (Н*м)", "I (А)", "P2 (кВт)", "Режим"];
    const lines = [header.join(";")];
    result.tableRows.forEach((r) => {
      lines.push(
        [
          r.s.toFixed(4),
          (r.s * 100).toFixed(2),
          r.n.toFixed(1),
          r.omega.toFixed(2),
          r.M.toFixed(2),
          r.I.toFixed(2),
          r.p2.toFixed(3),
          r.label || ""
        ]
          .join(";")
          .replace(/\./g, ",")
      );
    });
    const csvContent = "﻿" + lines.join("
");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "async_motor_" + (motorLabel || "calc").replace(/\s+/g, "_") + ".csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return {
    validate,
    calculateNatural,
    calculateArtificial,
    exportTableToCsv
  };
})();
