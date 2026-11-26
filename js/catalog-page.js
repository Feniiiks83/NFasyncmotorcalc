/* Логика страницы справочника двигателей АИР */
(function () {
  function renderCatalog() {
    const query = document.getElementById("searchInput").value.trim().toLowerCase();
    const speedFilter = document.getElementById("speedFilter").value;
    const tbody = document.getElementById("catalogBody");
    const countEl = document.getElementById("catalogCount");

    const filtered = window.MOTORS_CATALOG.filter((m) => {
      const n1 = Math.round((60 * m.freq) / m.poles);
      const matchesText =
        m.name.toLowerCase().includes(query) ||
        m.note.toLowerCase().includes(query) ||
        String(m.pNom).includes(query);
      const matchesSpeed = speedFilter === "all" || String(n1) === speedFilter;
      return matchesText && matchesSpeed;
    });

    countEl.textContent = "Найдено двигателей: " + filtered.length + " из " + window.MOTORS_CATALOG.length;

    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;font-family:inherit;color:var(--text-muted);padding:1.5rem;">Ничего не найдено по заданному фильтру.</td></tr>';
      return;
    }

    tbody.innerHTML = filtered
      .map((m) => {
        const n1 = Math.round((60 * m.freq) / m.poles);
        return (
          "<tr>" +
          "<td>" + m.name + '<div style="font-size:0.76rem;font-weight:400;color:var(--text-muted);">' + m.note + "</div></td>" +
          "<td>" + m.pNom.toFixed(2) + "</td>" +
          "<td>" + n1 + "</td>" +
          "<td>" + m.nNom + "</td>" +
          "<td>" + m.eta.toFixed(1) + "</td>" +
          "<td>" + m.cosPhi.toFixed(2) + "</td>" +
          "<td>" + m.lambdaM.toFixed(1) + "</td>" +
          "<td>" + m.kP.toFixed(1) + "</td>" +
          "<td>" + m.kI.toFixed(1) + "</td>" +
          '<td><a class="btn btn-primary btn-sm" href="index.html?motor=' + encodeURIComponent(m.id) + '">Рассчитать</a></td>' +
          "</tr>"
        );
      })
      .join("");
  }

  document.addEventListener("DOMContentLoaded", function () {
    document.getElementById("searchInput").addEventListener("input", renderCatalog);
    document.getElementById("speedFilter").addEventListener("change", renderCatalog);
    renderCatalog();
  });
})();
