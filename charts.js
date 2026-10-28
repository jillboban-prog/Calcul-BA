/* calculBA — graphiques (Chart.js 4, fourni localement dans /static/vendor).
 * Les couleurs sont lues dans les variables CSS : le mode sombre et le mode
 * clair partagent le même code. */
"use strict";

window.Charts = (() => {
  const instances = new Map();
  const nfBase = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 4 });
  // Valeurs inférieures à 0,01 : 4 chiffres significatifs (sinon 1,2e-8 s'afficherait « 0 »).
  const nfSmall = new Intl.NumberFormat("fr-FR", { maximumSignificantDigits: 4 });
  const nf = { format: (v) => (typeof v === "number" && v !== 0 && Math.abs(v) < 0.01 ? nfSmall : nfBase).format(v) };
  const int = new Intl.NumberFormat("fr-FR");
  const pct = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
  let themeCallback = null;

  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const tokens = () => ({
    ink: css("--ink"), muted: css("--muted"), rule: css("--rule"), surface: css("--surface"),
    data: css("--data"), dataFill: css("--data-fill"), fit: css("--fit"),
  });

  function setup() {
    if (!window.Chart) return false;
    const t = tokens();
    Chart.defaults.font.family = '"Barlow", "Segoe UI", system-ui, sans-serif';
    Chart.defaults.font.size = 13;
    Chart.defaults.color = t.muted;
    Chart.defaults.borderColor = t.rule;
    Chart.defaults.maintainAspectRatio = false;
    Chart.defaults.animation = matchMedia("(prefers-reduced-motion: reduce)").matches ? false : { duration: 250 };
    Chart.defaults.plugins.tooltip.backgroundColor = t.ink;
    Chart.defaults.plugins.tooltip.titleColor = t.surface;
    Chart.defaults.plugins.tooltip.bodyColor = t.surface;
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.plugins.tooltip.cornerRadius = 4;
    Chart.defaults.plugins.tooltip.displayColors = false;
    Chart.defaults.plugins.legend.labels.usePointStyle = true;
    Chart.defaults.plugins.legend.labels.boxHeight = 8;
    return true;
  }

  function message(id, text) {
    destroy(id);
    const canvas = document.getElementById(id);
    if (!canvas) return;
    const box = canvas.parentElement;
    box.querySelector(".chart-msg")?.remove();
    const m = document.createElement("p");
    m.className = "chart-msg"; m.textContent = text;
    box.append(m);
    canvas.setAttribute("aria-label", text);
  }

  function make(id, config, label) {
    destroy(id);
    const canvas = document.getElementById(id);
    if (!canvas) return null;
    canvas.parentElement.querySelector(".chart-msg")?.remove();
    if (!setup()) { message(id, "La bibliothèque de graphiques n'a pas pu être chargée."); return null; }
    canvas.setAttribute("aria-label", label);
    const chart = new Chart(canvas, config);
    instances.set(id, chart);
    return chart;
  }

  function destroy(id) {
    instances.get(id)?.destroy();
    instances.delete(id);
  }

  function destroyAll() {
    instances.forEach((c) => c.destroy());
    instances.clear();
    themeCallback = null;
  }

  const axis = (title, extra = {}) => ({
    title: { display: !!title, text: title, color: tokens().muted, font: { weight: 500 } },
    grid: { color: tokens().rule, drawTicks: false },
    border: { display: false },
    ticks: { padding: 6, callback: (v) => (typeof v === "number" ? nf.format(v) : v) },
    ...extra,
  });

  // ------------------------------------------------------------ histogramme
  function histogram(id, column, hist) {
    if (!hist.counts.length) return message(id, "Aucune valeur numérique dans cette colonne.");
    const t = tokens(), e = hist.edges;
    const data = hist.counts.map((n, i) => ({ x: (e[i] + e[i + 1]) / 2, y: n, lo: e[i], hi: e[i + 1] }));
    const total = hist.counts.reduce((a, b) => a + b, 0);
    return make(id, {
      type: "bar",
      data: { datasets: [{ data, backgroundColor: t.dataFill, hoverBackgroundColor: t.data,
        borderColor: t.surface, borderWidth: { left: 1, right: 1 }, borderSkipped: "bottom",
        borderRadius: { topLeft: 4, topRight: 4 }, barPercentage: 1, categoryPercentage: 1 }] },
      options: {
        parsing: false,
        scales: {
          x: axis(column, { type: "linear", offset: false, min: e[0], max: e[e.length - 1], grid: { display: false } }),
          y: axis("Effectif", { beginAtZero: true, ticks: { precision: 0, padding: 6 } }),
        },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: {
            title: (items) => { const r = items[0].raw; return `${nf.format(r.lo)} à ${nf.format(r.hi)}`; },
            label: (item) => `${int.format(item.raw.y)} valeur${item.raw.y > 1 ? "s" : ""} (${pct.format((item.raw.y / total) * 100)} %)`,
          } },
        },
      },
    }, `Histogramme de ${column} : ${total} valeurs réparties en ${hist.counts.length} classes.`);
  }

  // ------------------------------------------- loi ajustée sur l'histogramme
  // Histogramme en densité (aire totale = 1) pour être comparable à la courbe de la loi.
  function fit(id, column, r) {
    const p = r.plot, e = p.edges;
    if (!p.density.length) return message(id, "Aucune valeur à représenter.");
    const t = tokens();
    const bars = p.density.map((d, i) => ({ x: (e[i] + e[i + 1]) / 2, y: d, lo: e[i], hi: e[i + 1] }));
    const curve = p.x.map((x, i) => ({ x, y: p.pdf[i] })).filter((pt) => pt.y !== null);
    const xmin = Math.min(e[0], curve.length ? curve[0].x : e[0]);
    const xmax = Math.max(e[e.length - 1], curve.length ? curve[curve.length - 1].x : e[e.length - 1]);
    return make(id, {
      type: "bar",
      data: { datasets: [
        { type: "bar", label: "Mesures (histogramme)", data: bars, order: 2,
          backgroundColor: t.dataFill, hoverBackgroundColor: t.data, borderColor: t.surface,
          borderWidth: { left: 1, right: 1 }, borderSkipped: "bottom", barPercentage: 1, categoryPercentage: 1 },
        { type: "line", label: `Loi ${r.selected.label.toLowerCase()} ajustée`, data: curve, order: 1,
          borderColor: t.fit, borderWidth: 2, pointRadius: 0, pointHoverRadius: 0, tension: 0.25, pointStyle: "line" },
      ] },
      options: {
        parsing: false,
        interaction: { mode: "nearest", intersect: true },
        scales: {
          x: axis(column, { type: "linear", offset: false, min: xmin, max: xmax, grid: { display: false } }),
          y: axis("Densité de probabilité", { beginAtZero: true }),
        },
        plugins: {
          legend: { display: true, position: "top", align: "end" },
          tooltip: { filter: (item) => item.datasetIndex === 0, callbacks: {
            title: (items) => { const v = items[0].raw; return `${nf.format(v.lo)} à ${nf.format(v.hi)}`; },
            label: (item) => `Densité observée ${nf.format(item.raw.y)}`,
          } },
        },
      },
    }, `Histogramme de ${column} et densité de la loi ${r.selected.label.toLowerCase()} ajustée, ${r.n} valeurs.`);
  }

  // -------------------------------------------------------- moyenne par groupe
  function groups(id, g) {
    if (!g.groups.length) return message(id, "Aucune valeur à regrouper.");
    const t = tokens();
    return make(id, {
      type: "bar",
      data: { labels: g.groups.map((x) => x.group),
        datasets: [{ data: g.groups.map((x) => x.mean), backgroundColor: t.dataFill, hoverBackgroundColor: t.data,
          borderRadius: 4, borderSkipped: "start", maxBarThickness: 56 }] },
      options: {
        scales: {
          x: axis(g.by, { grid: { display: false }, ticks: { autoSkip: true, maxRotation: 45, padding: 6 } }),
          y: axis(`Moyenne de ${g.value}`, { beginAtZero: true }),
        },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: {
            title: (items) => `${g.by} : ${items[0].label}`,
            label: (item) => {
              const x = g.groups[item.dataIndex];
              return [`Moyenne ${nf.format(x.mean)}`, `n = ${int.format(x.n)}`,
                x.std === null ? "Écart-type : —" : `Écart-type ${nf.format(x.std)}`, `Étendue ${nf.format(x.min)} à ${nf.format(x.max)}`];
            },
          } },
        },
      },
    }, `Moyenne de ${g.value} pour ${g.groups.length} groupes de ${g.by}.`);
  }

  // ------------------------------------------------------- nuage de points
  function scatter(id, d) {
    if (!d.n) return message(id, "Aucune observation ne contient à la fois X et Y.");
    const t = tokens();
    const datasets = [{
      type: "scatter", label: "Mesures", data: d.points,
      backgroundColor: t.dataFill, borderColor: t.surface, borderWidth: 1.5, pointRadius: 4.5, pointHoverRadius: 6, order: 2,
    }];
    if (d.fit) {
      const f = d.fit;
      datasets.push({
        type: "line", label: "Droite de régression", order: 1,
        data: [{ x: f.x_min, y: f.slope * f.x_min + f.intercept }, { x: f.x_max, y: f.slope * f.x_max + f.intercept }],
        borderColor: t.fit, borderWidth: 2, borderDash: [6, 4], pointRadius: 0, pointHoverRadius: 0, pointStyle: "line",
      });
    }
    return make(id, {
      type: "scatter",
      data: { datasets },
      options: {
        scales: { x: axis(d.x, { type: "linear" }), y: axis(d.y) },
        plugins: {
          legend: { display: !!d.fit, position: "top", align: "end" },
          tooltip: { filter: (item) => item.datasetIndex === 0, callbacks: {
            title: () => "",
            label: (item) => [`${d.x} : ${nf.format(item.raw.x)}`, `${d.y} : ${nf.format(item.raw.y)}`],
          } },
        },
      },
    }, `Nuage de points de ${d.y} en fonction de ${d.x}, ${d.n} couples${d.fit ? `, R² ${d.fit.r2}` : ""}.`);
  }

  // ----------------------------------------------------- ordre de saisie
  function series(id, d, stat) {
    if (!d.points.length) return message(id, "Aucune valeur numérique dans cette colonne.");
    if (d.points.length < 2) return message(id, "Il faut au moins deux valeurs pour tracer une courbe.");
    const t = tokens();
    // Sans échantillonnage, une observation sans valeur crée une coupure dans
    // la courbe au lieu d'être reliée (ou pire, tracée à 0).
    let pts = d.points;
    if (d.plotted === d.available) {
      pts = [];
      d.points.forEach((p, i) => {
        if (i && p.x - d.points[i - 1].x > 1) pts.push({ x: p.x - 0.5, y: null });
        pts.push(p);
      });
    }
    const first = d.points[0].x, last = d.points[d.points.length - 1].x;
    const datasets = [{
      label: "Valeurs", data: pts, borderColor: t.data, backgroundColor: t.data, borderWidth: 2,
      pointRadius: d.points.length > 120 ? 0 : 3, pointHoverRadius: 5, spanGaps: false, tension: 0,
    }];
    if (stat && stat.mean !== null) {
      datasets.push({ label: "Moyenne", data: [{ x: first, y: stat.mean }, { x: last, y: stat.mean }],
        borderColor: t.muted, borderWidth: 1.5, borderDash: [4, 4], pointRadius: 0, pointHoverRadius: 0, pointStyle: "line" });
    }
    return make(id, {
      type: "line",
      data: { datasets },
      options: {
        parsing: false,
        interaction: { mode: "nearest", axis: "x", intersect: false },
        scales: { x: axis("N° d'observation", { type: "linear", min: first, max: last, ticks: { precision: 0, padding: 6 } }), y: axis(d.column) },
        plugins: {
          legend: { display: true, position: "top", align: "end" },
          tooltip: { filter: (item) => item.datasetIndex === 0 && item.raw.y !== null, callbacks: {
            title: (items) => `Observation n° ${int.format(items[0].raw.x)}`,
            label: (item) => `${d.column} : ${nf.format(item.raw.y)}`,
          } },
        },
      },
    }, `Courbe de ${d.column} dans l'ordre de saisie, ${d.available} valeurs.`);
  }

  // Redessine quand le système passe du mode clair au mode sombre.
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => themeCallback?.());

  return {
    histogram, fit, groups, scatter, series, destroy, destroyAll,
    onThemeChange: (fn) => { themeCallback = fn; },
  };
})();
