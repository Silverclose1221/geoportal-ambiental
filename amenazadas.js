// Especies amenazadas (categorías UICN vía GBIF): leyenda, categoría de la especie filtrada
// (con color en el mapa) y listado de especies amenazadas en el área seleccionada.
// Se monta solo; todo el texto externo se inserta con textContent.
(() => {
  "use strict";
  const CFG = window.GEOPORTAL_CONFIG || {};
  const GBIF = (CFG.GBIF_API || "https://api.gbif.org").replace(/\/$/, "");
  const $ = (s) => document.querySelector(s);
  const CATS = {
    CR: { n: "En peligro crítico", c: "#b3202a", hue: 0 },
    EN: { n: "En peligro", c: "#e8710a", hue: 28 },
    VU: { n: "Vulnerable", c: "#c9a400", hue: 52 },
    NT: { n: "Casi amenazada", c: "#6a9a2a", hue: 90 },
    LC: { n: "Preocupación menor", c: "#2e7d4f", hue: 120 },
  };
  const json = (u) => fetch(u, { signal: AbortSignal.timeout(20000) }).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); });
  const el = (t, props, ...hijos) => { const e = document.createElement(t); Object.assign(e, props || {}); e.append(...hijos); return e; };
  const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
  const mapa = () => window.__geoportal?.mapa;

  function badge(cod) {
    const c = CATS[cod];
    const b = el("span", { className: "amz-badge", textContent: cod });
    if (c) { b.style.background = c.c; b.title = c.n; }
    return b;
  }

  // ---------- color del mapa según la categoría de la especie filtrada
  function capaDensidad() {
    let found = null;
    mapa()?.eachLayer((l) => { if (l._url && String(l._url).includes("/v2/map/occurrence/density/")) found = l; });
    return found;
  }
  function colorear(cod) {
    const l = capaDensidad(); if (!l) return;
    const c = CATS[cod];
    const hex = /\.poly/.test(l._url);
    const url = l._url.replace(/style=[^&]*/, "style=" + (hex ? "red.poly" : "red.point"));
    if (c && url !== l._url) l.setUrl(url);
    const cont = l.getContainer?.(); if (cont) cont.style.filter = c ? `hue-rotate(${c.hue}deg)` : "";
  }

  async function categoriaDe(nombre) {
    const m = await json(`${GBIF}/v1/species/match?name=${encodeURIComponent(nombre)}`);
    if (!m.usageKey || m.rank !== "SPECIES") return { rank: m.rank || null, cod: null };
    try { const i = await json(`${GBIF}/v1/species/${m.usageKey}/iucnRedListCategory`); return { rank: "SPECIES", cod: i.code || null }; }
    catch { return { rank: "SPECIES", cod: null }; }
  }

  let seq = 0;
  async function actualizarCategoria() {
    const mi = ++seq;
    const nombre = ($("#gbif-taxon")?.value || "").trim();
    const out = $("#amz-categoria"); if (!out) return;
    out.textContent = "";
    if (!nombre) { colorear(null); return; }
    await pausa(1300); // deja que app.js aplique el filtro y recree la capa
    if (mi !== seq) return;
    try {
      const r = await categoriaDe(nombre);
      if (mi !== seq) return;
      if (r.cod && CATS[r.cod]) {
        out.append(badge(r.cod), ` ${CATS[r.cod].n} (UICN, categoría global). El color del mapa sigue esta categoría; la intensidad indica la densidad de registros.`);
        colorear(r.cod);
      } else if (r.rank === "SPECIES") { out.textContent = "Sin categoría UICN en GBIF para esta especie (no evaluada o sin datos)."; colorear(null); }
      else { out.textContent = "La categoría de amenaza aplica a especies; para géneros o familias se ve la densidad general."; colorear(null); }
    } catch { out.textContent = "No se pudo consultar la categoría de amenaza."; }
  }

  // ---------- especies amenazadas en el área seleccionada
  function areaActual() {
    let g = null;
    mapa()?.eachLayer((l) => { if (l.options && l.options.dashArray === "6 4" && l.options.color === "#d1495b" && l.toGeoJSON) g = l.toGeoJSON(); });
    if (!g) return null;
    const f = g.type === "FeatureCollection" ? g.features[0] : g;
    return f && /Polygon/.test(f.geometry?.type || "") ? f : null;
  }
  function filtrarPor(nombre) {
    const i = $("#gbif-taxon"); if (!i) return;
    i.value = nombre; i.dispatchEvent(new Event("input", { bubbles: true }));
    setTimeout(() => { i.dispatchEvent(new Event("change", { bubbles: true })); actualizarCategoria(); }, 1000);
  }
  async function buscarEnArea() {
    const lista = $("#amz-lista"), est = $("#amz-estado");
    lista.textContent = "";
    const f = areaActual();
    if (!f) { est.textContent = "Primero seleccione un municipio o dibuje un área en «Análisis de área»."; return; }
    est.textContent = "Consultando GBIF…";
    try {
      const wkt = window.__geoportal.geometriaWKT(f);
      const res = await Promise.all(["CR", "EN", "VU"].map(async (cod) => {
        const p = new URLSearchParams({ geometry: wkt, limit: 0, facet: "speciesKey", facetLimit: 8, iucnRedListCategory: cod });
        const r = await json(`${GBIF}/v1/occurrence/search?${p}`);
        const cuentas = (r.facets.find((x) => x.field === "SPECIES_KEY")?.counts || []);
        const nombres = await Promise.all(cuentas.map((c) => json(`${GBIF}/v1/species/${c.name}`).then((s) => s.canonicalName || s.scientificName).catch(() => c.name)));
        return { cod, total: r.count, items: cuentas.map((c, i) => ({ nombre: nombres[i], v: c.count })) };
      }));
      let n = 0;
      for (const g of res) {
        if (!g.items.length) continue;
        lista.append(el("h4", { textContent: `${CATS[g.cod].n} (${g.total.toLocaleString("es-CO")} registros)` }));
        for (const it of g.items) {
          n++;
          const b = el("button", { type: "button", className: "amz-item" }, badge(g.cod), el("span", { textContent: it.nombre }), el("em", { textContent: it.v.toLocaleString("es-CO") + " reg." }));
          b.addEventListener("click", () => filtrarPor(it.nombre));
          lista.append(b);
        }
      }
      est.textContent = n ? "Principales especies por categoría. Haga clic en una para verla en el mapa." : "No hay registros de especies CR, EN o VU en esta área.";
    } catch { est.textContent = "No se pudo consultar GBIF. Intente más tarde."; }
  }

  function montar() {
    const panel = $("#tab-bio");
    if (!panel || $("#amz-card")) return;
    const st = el("style", { textContent: `
      .amz-leyenda { display:flex; flex-wrap:wrap; gap:6px 10px; margin:8px 0; font-size:12px; }
      .amz-leyenda span { display:inline-flex; align-items:center; gap:4px; }
      .amz-badge { display:inline-block; min-width:26px; text-align:center; padding:1px 6px; border-radius:99px; color:#fff; font-size:11px; font-weight:700; }
      .amz-item { display:flex; align-items:center; gap:8px; width:100%; text-align:left; background:none; border:1px solid var(--border); border-radius:8px; padding:6px 8px; margin:4px 0; cursor:pointer; color:inherit; font:inherit; font-size:12.5px; }
      .amz-item span { flex:1; font-style:italic; }
      .amz-item em { color:var(--text-2); font-style:normal; font-size:11.5px; }
      #amz-lista h4 { margin:10px 0 2px; font-size:12.5px; }
      #amz-categoria { margin:6px 0 0; font-size:12.5px; }` });
    document.head.append(st);
    const card = el("div", { className: "card", id: "amz-card" });
    const ley = el("div", { className: "amz-leyenda", ariaLabel: "Leyenda de categorías UICN" });
    for (const [cod, c] of Object.entries(CATS)) ley.append(el("span", {}, badge(cod), c.n));
    const btn = el("button", { type: "button", className: "btn", id: "amz-buscar", textContent: "Ver amenazadas en el área" });
    btn.addEventListener("click", buscarEnArea);
    card.append(
      el("h2", { textContent: "Especies amenazadas (UICN)" }),
      el("p", { className: "muted", textContent: "Categorías globales de la Lista Roja de la UICN según GBIF. Al filtrar una especie arriba, el mapa toma el color de su categoría." }),
      ley,
      el("p", { id: "amz-categoria", className: "muted", ariaLive: "polite" }),
      btn,
      el("p", { id: "amz-estado", className: "muted", ariaLive: "polite" }),
      el("div", { id: "amz-lista" }),
      el("p", { className: "muted", textContent: "Ojo: más registros no significa más biodiversidad; refleja también dónde hay más observadores. Los Libros Rojos de Colombia y la Res. 1912/2017 son listas nacionales y pueden diferir de la categoría global." }),
    );
    const primera = panel.querySelector(".card");
    primera ? primera.after(card) : panel.prepend(card);
    $("#gbif-taxon")?.addEventListener("change", actualizarCategoria);
    $("#gbif-limpiar")?.addEventListener("click", () => { seq++; $("#amz-categoria").textContent = ""; });
    for (const id of ["#gbif-estilo", "#gbif-on"]) $(id)?.addEventListener("change", () => { setTimeout(actualizarCategoria, 100); });
  }
  const esperar = setInterval(() => { if ($("#tab-bio") && window.__geoportal?.mapa) { clearInterval(esperar); montar(); } }, 500);
  setTimeout(() => clearInterval(esperar), 60000);
})();
