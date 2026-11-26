/* =====================================================================
   MotorCharts — автономный модуль построения инженерных графиков
   (HTML5 Canvas 2D + интерактивные подсказки + экспорт PNG и SVG)
   Не требует сторонних библиотек и подключения к CDN.
   ===================================================================== */
window.MotorCharts = (function () {
  function niceStep(rawStep) {
    if (!isFinite(rawStep) || rawStep <= 0) return 1;
    const exp = Math.floor(Math.log10(rawStep));
    const base = Math.pow(10, exp);
    const frac = rawStep / base;
    let niceFrac = 1;
    if (frac <= 1) niceFrac = 1;
    else if (frac <= 2) niceFrac = 2;
    else if (frac <= 2.5) niceFrac = 2.5;
    else if (frac <= 5) niceFrac = 5;
    else niceFrac = 10;
    return niceFrac * base;
  }

  function buildAxis(minVal, maxVal, targetTicks) {
    let min = minVal;
    let max = maxVal;
    if (!isFinite(min) || !isFinite(max)) {
      min = 0;
      max = 10;
    }
    if (Math.abs(max - min) < 1e-9) {
      max = min + 1;
    }
    const step = niceStep((max - min) / Math.max(2, targetTicks));
    const niceMin = Math.floor(min / step) * step;
    const niceMax = Math.ceil(max / step) * step;
    const ticks = [];
    for (let v = niceMin; v <= niceMax + step * 0.5; v += step) {
      const cleaned = Math.abs(v) < step * 1e-6 ? 0 : Number(v.toFixed(6));
      ticks.push(cleaned);
      if (ticks.length > 30) break;
    }
    return { min: niceMin, max: niceMax, step: step, ticks: ticks };
  }

  function formatTick(val, step) {
    if (Math.abs(val) < 1e-9) return "0";
    if (step >= 10) return String(Math.round(val));
    if (step >= 1) return Number.isInteger(val) ? String(val) : val.toFixed(1);
    if (step >= 0.1) return val.toFixed(1);
    return val.toFixed(2);
  }

  function escapeXml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1500);
  }

  function computeBounds(config) {
    let xMin = Infinity;
    let xMax = -Infinity;
    let yMin = Infinity;
    let yMax = -Infinity;

    config.datasets.forEach(function (ds) {
      ds.data.forEach(function (pt) {
        if (isFinite(pt.x) && isFinite(pt.y)) {
          if (pt.x < xMin) xMin = pt.x;
          if (pt.x > xMax) xMax = pt.x;
          if (pt.y < yMin) yMin = pt.y;
          if (pt.y > yMax) yMax = pt.y;
        }
      });
    });

    if (!isFinite(xMin)) { xMin = 0; xMax = 10; }
    if (!isFinite(yMin)) { yMin = 0; yMax = 10; }

    if (typeof config.xMin === "number") xMin = config.xMin;
    if (typeof config.xMax === "number") xMax = config.xMax;
    if (typeof config.yMin === "number") yMin = config.yMin;
    if (typeof config.yMax === "number") yMax = config.yMax;

    if (typeof config.xMax !== "number") xMax = xMax + (xMax - xMin) * 0.05;
    if (typeof config.yMax !== "number") yMax = yMax + (yMax - yMin) * 0.06;

    return {
      xAxis: buildAxis(xMin, xMax, 7),
      yAxis: buildAxis(yMin, yMax, 6)
    };
  }

  function layoutLegend(ctx, datasets, maxWidth) {
    const rows = [];
    let currentRow = [];
    let currentWidth = 0;
    const itemGap = 16;
    const markerW = 20;

    ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';
    datasets.forEach(function (ds) {
      if (!ds.label) return;
      const textW = ctx.measureText(ds.label).width;
      const itemW = markerW + textW;
      if (currentRow.length > 0 && currentWidth + itemGap + itemW > maxWidth) {
        rows.push({ items: currentRow, width: currentWidth });
        currentRow = [];
        currentWidth = 0;
      }
      if (currentRow.length > 0) currentWidth += itemGap;
      currentRow.push({ ds: ds, width: itemW });
      currentWidth += itemW;
    });
    if (currentRow.length > 0) {
      rows.push({ items: currentRow, width: currentWidth });
    }
    return rows;
  }

  function createLineChart(canvas, config) {
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    let hoverState = null;
    let width = 600;
    let height = 360;
    let lastLayout = null;

    function getMetrics(w, h) {
      const bounds = computeBounds(config);
      const legendRows = layoutLegend(ctx, config.datasets, Math.max(200, w - 32));
      const padTop = 14 + legendRows.length * 22 + 8;
      const padRight = 22;
      const padBottom = 46;
      const padLeft = 64;
      const plotW = Math.max(80, w - padLeft - padRight);
      const plotH = Math.max(80, h - padTop - padBottom);

      function toX(v) {
        return padLeft + ((v - bounds.xAxis.min) / (bounds.xAxis.max - bounds.xAxis.min)) * plotW;
      }
      function toY(v) {
        return padTop + plotH - ((v - bounds.yAxis.min) / (bounds.yAxis.max - bounds.yAxis.min)) * plotH;
      }

      return {
        w: w,
        h: h,
        padTop: padTop,
        padRight: padRight,
        padBottom: padBottom,
        padLeft: padLeft,
        plotW: plotW,
        plotH: plotH,
        xAxis: bounds.xAxis,
        yAxis: bounds.yAxis,
        legendRows: legendRows,
        toX: toX,
        toY: toY
      };
    }

    function draw() {
      const rect = canvas.parentElement.getBoundingClientRect();
      width = Math.max(280, Math.round(rect.width || 600));
      height = Math.max(220, Math.round(rect.height || 360));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = width + "px";
      canvas.style.height = height + "px";

      ctx.save();
      ctx.scale(dpr, dpr);

      const colors = window.getChartThemeColors();
      const m = getMetrics(width, height);
      lastLayout = m;

      // 1. Фон
      ctx.fillStyle = colors.bg;
      ctx.fillRect(0, 0, width, height);

      // 2. Легенда сверху
      ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';
      ctx.textBaseline = "middle";
      m.legendRows.forEach(function (row, rowIdx) {
        let x = Math.max(16, (width - row.width) / 2);
        const y = 14 + rowIdx * 22 + 8;
        row.items.forEach(function (item) {
          const ds = item.ds;
          const markerColor = Array.isArray(ds.color) ? ds.color[0] : ds.color;
          ctx.save();
          if (ds.type === "points") {
            ctx.beginPath();
            ctx.arc(x + 7, y, 4.5, 0, Math.PI * 2);
            ctx.fillStyle = markerColor;
            ctx.fill();
          } else {
            ctx.beginPath();
            if (ds.dash && ds.dash.length) ctx.setLineDash(ds.dash);
            ctx.strokeStyle = markerColor;
            ctx.lineWidth = 2.5;
            ctx.moveTo(x, y);
            ctx.lineTo(x + 15, y);
            ctx.stroke();
          }
          ctx.restore();
          ctx.fillStyle = colors.text;
          ctx.textAlign = "left";
          ctx.fillText(ds.label, x + 20, y);
          x += item.width + 16;
        });
      });

      // 3. Сетка и подписи делений
      ctx.font = '11px "Consolas", "SFMono-Regular", monospace';
      m.xAxis.ticks.forEach(function (tick) {
        const px = m.toX(tick);
        if (px < m.padLeft - 1 || px > m.padLeft + m.plotW + 1) return;
        ctx.beginPath();
        ctx.strokeStyle = tick === 0 ? colors.axis : colors.grid;
        ctx.lineWidth = tick === 0 ? 1.4 : 1;
        ctx.moveTo(px, m.padTop);
        ctx.lineTo(px, m.padTop + m.plotH);
        ctx.stroke();

        ctx.fillStyle = colors.muted;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(formatTick(tick, m.xAxis.step), px, m.padTop + m.plotH + 6);
      });

      m.yAxis.ticks.forEach(function (tick) {
        const py = m.toY(tick);
        if (py < m.padTop - 1 || py > m.padTop + m.plotH + 1) return;
        ctx.beginPath();
        ctx.strokeStyle = tick === 0 ? colors.axis : colors.grid;
        ctx.lineWidth = tick === 0 ? 1.4 : 1;
        ctx.moveTo(m.padLeft, py);
        ctx.lineTo(m.padLeft + m.plotW, py);
        ctx.stroke();

        ctx.fillStyle = colors.muted;
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillText(formatTick(tick, m.yAxis.step), m.padLeft - 8, py);
      });

      // Рамка области построения
      ctx.strokeStyle = colors.axis;
      ctx.lineWidth = 1;
      ctx.strokeRect(m.padLeft, m.padTop, m.plotW, m.plotH);

      // Подписи осей
      ctx.fillStyle = colors.text;
      ctx.font = '600 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(config.xTitle || "", m.padLeft + m.plotW / 2, height - 6);

      ctx.save();
      ctx.translate(15, m.padTop + m.plotH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(config.yTitle || "", 0, 0);
      ctx.restore();

      // 4. Отрисовка кривых и точек внутри области графика
      ctx.save();
      ctx.beginPath();
      ctx.rect(m.padLeft, m.padTop, m.plotW, m.plotH);
      ctx.clip();

      config.datasets.forEach(function (ds) {
        if (ds.type === "points") return;
        if (!ds.data || ds.data.length < 2) return;
        ctx.save();
        ctx.beginPath();
        ctx.strokeStyle = ds.color;
        ctx.lineWidth = ds.width || 2.4;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        if (ds.dash && ds.dash.length) ctx.setLineDash(ds.dash);

        let started = false;
        ds.data.forEach(function (pt) {
          if (!isFinite(pt.x) || !isFinite(pt.y)) return;
          const px = m.toX(pt.x);
          const py = m.toY(pt.y);
          if (!started) {
            ctx.moveTo(px, py);
            started = true;
          } else {
            ctx.lineTo(px, py);
          }
        });
        ctx.stroke();
        ctx.restore();
      });

      ctx.restore();

      // Точки рисуем поверх рамки, чтобы граничные маркеры (например, при n=0 или s=0) не обрезались
      config.datasets.forEach(function (ds) {
        if (ds.type !== "points") return;
        ds.data.forEach(function (pt, idx) {
          if (!isFinite(pt.x) || !isFinite(pt.y)) return;
          const px = m.toX(pt.x);
          const py = m.toY(pt.y);
          const fill = pt.color || (Array.isArray(ds.color) ? ds.color[idx % ds.color.length] : ds.color);
          ctx.beginPath();
          ctx.arc(px, py, ds.radius || 5.5, 0, Math.PI * 2);
          ctx.fillStyle = fill;
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = colors.bg;
          ctx.stroke();
        });
      });

      // 5. Подсказка при наведении
      if (hoverState) {
        const px = m.toX(hoverState.pt.x);
        const py = m.toY(hoverState.pt.y);

        ctx.save();
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = colors.muted;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px, m.padTop);
        ctx.lineTo(px, m.padTop + m.plotH);
        ctx.moveTo(m.padLeft, py);
        ctx.lineTo(m.padLeft + m.plotW, py);
        ctx.stroke();
        ctx.restore();

        ctx.beginPath();
        ctx.arc(px, py, 6, 0, Math.PI * 2);
        ctx.fillStyle = hoverState.color;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = colors.bg;
        ctx.stroke();

        const titleLine = hoverState.title;
        const valueLine = config.formatTooltip
          ? config.formatTooltip(hoverState.pt, hoverState.dataset)
          : "x = " + hoverState.pt.x.toFixed(2) + ", y = " + hoverState.pt.y.toFixed(2);

        ctx.font = '600 11.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';
        const w1 = ctx.measureText(titleLine).width;
        ctx.font = '11.5px "Consolas", "SFMono-Regular", monospace';
        const w2 = ctx.measureText(valueLine).width;
        const boxW = Math.max(w1, w2) + 20;
        const boxH = 42;

        let bx = px + 12;
        let by = py - boxH - 10;
        if (bx + boxW > width - 8) bx = px - boxW - 12;
        if (bx < 8) bx = 8;
        if (by < 8) by = py + 12;
        if (by + boxH > height - 8) by = height - boxH - 8;

        ctx.fillStyle = colors.tooltipBg;
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(bx, by, boxW, boxH, 6);
        } else {
          ctx.rect(bx, by, boxW, boxH);
        }
        ctx.fill();

        ctx.fillStyle = colors.tooltipText;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.font = '600 11.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';
        ctx.fillText(titleLine, bx + 10, by + 7);
        ctx.font = '11.5px "Consolas", "SFMono-Regular", monospace';
        ctx.fillText(valueLine, bx + 10, by + 23);
      }

      ctx.restore();
    }

    function onMouseMove(e) {
      if (!lastLayout) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      if (
        mx < lastLayout.padLeft - 8 ||
        mx > lastLayout.padLeft + lastLayout.plotW + 8 ||
        my < lastLayout.padTop - 8 ||
        my > lastLayout.padTop + lastLayout.plotH + 8
      ) {
        if (hoverState) {
          hoverState = null;
          draw();
        }
        return;
      }

      let best = null;
      let bestDist = 28; // радиус привязки в пикселях

      // Сначала ищем среди выделенных точек (приоритет)
      config.datasets.forEach(function (ds) {
        if (ds.type !== "points") return;
        ds.data.forEach(function (pt, idx) {
          const px = lastLayout.toX(pt.x);
          const py = lastLayout.toY(pt.y);
          const dist = Math.hypot(px - mx, py - my);
          if (dist < 18 && dist < bestDist) {
            bestDist = dist;
            best = {
              pt: pt,
              dataset: ds,
              title: pt.label || ds.label,
              color: pt.color || (Array.isArray(ds.color) ? ds.color[idx % ds.color.length] : ds.color)
            };
          }
        });
      });

      // Если рядом нет особой точки, привязываемся к ближайшей точке на кривой
      if (!best) {
        config.datasets.forEach(function (ds) {
          if (ds.type === "points") return;
          ds.data.forEach(function (pt) {
            const px = lastLayout.toX(pt.x);
            const py = lastLayout.toY(pt.y);
            const dist = Math.hypot(px - mx, py - my);
            if (dist < bestDist) {
              bestDist = dist;
              best = {
                pt: pt,
                dataset: ds,
                title: ds.label,
                color: ds.color
              };
            }
          });
        });
      }

      hoverState = best;
      draw();
    }

    function onMouseLeave() {
      if (hoverState) {
        hoverState = null;
        draw();
      }
    }

    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mouseleave", onMouseLeave);

    let resizeObs = null;
    function onWindowResize() {
      draw();
    }
    if (typeof ResizeObserver !== "undefined") {
      resizeObs = new ResizeObserver(function () {
        draw();
      });
      resizeObs.observe(canvas.parentElement);
    } else {
      window.addEventListener("resize", onWindowResize);
    }

    // Генерация векторного SVG (удобно вставлять в отчет Word / ГОСТ)
    function toSVGString() {
      const colors = window.getChartThemeColors();
      const svgW = Math.max(640, width);
      const svgH = Math.max(380, height);
      const m = getMetrics(svgW, svgH);
      const parts = [];

      parts.push('<?xml version="1.0" encoding="UTF-8"?>');
      parts.push(
        '<svg xmlns="http://www.w3.org/2000/svg" width="' + svgW + '" height="' + svgH + '" viewBox="0 0 ' + svgW + " " + svgH + '">'
      );
      parts.push('<rect width="100%" height="100%" fill="' + colors.bg + '"/>');

      // Легенда
      m.legendRows.forEach(function (row, rowIdx) {
        let x = Math.max(16, (svgW - row.width) / 2);
        const y = 14 + rowIdx * 22 + 8;
        row.items.forEach(function (item) {
          const ds = item.ds;
          const markerColor = Array.isArray(ds.color) ? ds.color[0] : ds.color;
          if (ds.type === "points") {
            parts.push('<circle cx="' + (x + 7).toFixed(1) + '" cy="' + y.toFixed(1) + '" r="4.5" fill="' + markerColor + '"/>');
          } else {
            const dashAttr = ds.dash && ds.dash.length ? ' stroke-dasharray="' + ds.dash.join(",") + '"' : "";
            parts.push(
              '<line x1="' + x.toFixed(1) + '" y1="' + y.toFixed(1) + '" x2="' + (x + 15).toFixed(1) + '" y2="' + y.toFixed(1) + '" stroke="' + markerColor + '" stroke-width="2.5"' + dashAttr + "/>"
            );
          }
          parts.push(
            '<text x="' + (x + 20).toFixed(1) + '" y="' + (y + 4).toFixed(1) + '" fill="' + colors.text + '" font-family="Segoe UI, Arial, sans-serif" font-size="12">' +
              escapeXml(ds.label) +
              "</text>"
          );
          x += item.width + 16;
        });
      });

      // Сетка
      m.xAxis.ticks.forEach(function (tick) {
        const px = m.toX(tick);
        if (px < m.padLeft - 1 || px > m.padLeft + m.plotW + 1) return;
        const stroke = tick === 0 ? colors.axis : colors.grid;
        const sw = tick === 0 ? "1.4" : "1";
        parts.push('<line x1="' + px.toFixed(1) + '" y1="' + m.padTop + '" x2="' + px.toFixed(1) + '" y2="' + (m.padTop + m.plotH) + '" stroke="' + stroke + '" stroke-width="' + sw + '"/>');
        parts.push('<text x="' + px.toFixed(1) + '" y="' + (m.padTop + m.plotH + 17) + '" fill="' + colors.muted + '" font-family="Consolas, monospace" font-size="11" text-anchor="middle">' + escapeXml(formatTick(tick, m.xAxis.step)) + "</text>");
      });

      m.yAxis.ticks.forEach(function (tick) {
        const py = m.toY(tick);
        if (py < m.padTop - 1 || py > m.padTop + m.plotH + 1) return;
        const stroke = tick === 0 ? colors.axis : colors.grid;
        const sw = tick === 0 ? "1.4" : "1";
        parts.push('<line x1="' + m.padLeft + '" y1="' + py.toFixed(1) + '" x2="' + (m.padLeft + m.plotW) + '" y2="' + py.toFixed(1) + '" stroke="' + stroke + '" stroke-width="' + sw + '"/>');
        parts.push('<text x="' + (m.padLeft - 8) + '" y="' + (py + 4).toFixed(1) + '" fill="' + colors.muted + '" font-family="Consolas, monospace" font-size="11" text-anchor="end">' + escapeXml(formatTick(tick, m.yAxis.step)) + "</text>");
      });

      // Рамка
      parts.push('<rect x="' + m.padLeft + '" y="' + m.padTop + '" width="' + m.plotW + '" height="' + m.plotH + '" fill="none" stroke="' + colors.axis + '" stroke-width="1"/>');

      // Подписи осей
      parts.push('<text x="' + (m.padLeft + m.plotW / 2).toFixed(1) + '" y="' + (svgH - 8) + '" fill="' + colors.text + '" font-family="Segoe UI, Arial, sans-serif" font-size="12" font-weight="600" text-anchor="middle">' + escapeXml(config.xTitle || "") + "</text>");
      parts.push('<text x="16" y="' + (m.padTop + m.plotH / 2).toFixed(1) + '" fill="' + colors.text + '" font-family="Segoe UI, Arial, sans-serif" font-size="12" font-weight="600" text-anchor="middle" transform="rotate(-90 16 ' + (m.padTop + m.plotH / 2).toFixed(1) + ')">' + escapeXml(config.yTitle || "") + "</text>");

      // ClipPath для кривых
      const clipId = "plotClip_" + Math.floor(Math.random() * 100000);
      parts.push('<defs><clipPath id="' + clipId + '"><rect x="' + m.padLeft + '" y="' + m.padTop + '" width="' + m.plotW + '" height="' + m.plotH + '"/></clipPath></defs>');

      parts.push('<g clip-path="url(#' + clipId + ')">');
      config.datasets.forEach(function (ds) {
        if (ds.type === "points" || !ds.data || ds.data.length < 2) return;
        const ptsStr = ds.data
          .filter(function (pt) { return isFinite(pt.x) && isFinite(pt.y); })
          .map(function (pt) { return m.toX(pt.x).toFixed(2) + "," + m.toY(pt.y).toFixed(2); })
          .join(" ");
        const dashAttr = ds.dash && ds.dash.length ? ' stroke-dasharray="' + ds.dash.join(",") + '"' : "";
        parts.push('<polyline fill="none" stroke="' + ds.color + '" stroke-width="' + (ds.width || 2.4) + '" stroke-linejoin="round" stroke-linecap="round"' + dashAttr + ' points="' + ptsStr + '"/>');
      });
      parts.push("</g>");

      // Точки
      config.datasets.forEach(function (ds) {
        if (ds.type !== "points") return;
        ds.data.forEach(function (pt, idx) {
          if (!isFinite(pt.x) || !isFinite(pt.y)) return;
          const fill = pt.color || (Array.isArray(ds.color) ? ds.color[idx % ds.color.length] : ds.color);
          parts.push('<circle cx="' + m.toX(pt.x).toFixed(2) + '" cy="' + m.toY(pt.y).toFixed(2) + '" r="' + (ds.radius || 5.5) + '" fill="' + fill + '" stroke="' + colors.bg + '" stroke-width="2"/>');
        });
      });

      parts.push("</svg>");
      return parts.join("\n");
    }

    function downloadPNG(filename) {
      hoverState = null;
      draw();
      if (canvas.toBlob) {
        canvas.toBlob(function (blob) {
          if (blob) triggerDownload(blob, filename);
        }, "image/png");
      } else {
        const link = document.createElement("a");
        link.href = canvas.toDataURL("image/png");
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    }

    function downloadSVG(filename) {
      const svgText = toSVGString();
      const blob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
      triggerDownload(blob, filename);
    }

    function destroy() {
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mouseleave", onMouseLeave);
      if (resizeObs) resizeObs.disconnect();
      else window.removeEventListener("resize", onWindowResize);
    }

    draw();

    return {
      redraw: draw,
      downloadPNG: downloadPNG,
      downloadSVG: downloadSVG,
      destroy: destroy
    };
  }

  return {
    createLineChart: createLineChart
  };
})();
