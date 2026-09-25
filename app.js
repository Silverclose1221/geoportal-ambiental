// =====================================================================
// Geoportal Ambiental de Colombia — interfaz y mapa
// =====================================================================
(async function () {
  const CFG = window.GEOPORTAL_CONFIG;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 });
  const nf0 = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
  const fmt = (v, d = 1) => (v === null || v === undefined || Number.isNaN(+v) ? "—" : new Intl.NumberFormat("es-CO", { maximumFractionDigits: d }).format(+v));
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // ---------------------------------------------------------------- utilidades UI
  let toastT;
  function toast(msg, error = false) {
    const t = $("#toast");
    t.textContent = msg; t.className = "toast ver" + (error ? " error" : "");
    clearTimeout(toastT); toastT = setTimeout(() => (t.className = "toast"), error ? 6000 : 3500);
  }
  function descargar(nombre, contenido, tipo = "application/json") {
    const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
    const a = Object.assign(document.createElement("a"), { href: url, download: nombre });
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function aCSV(filas) {
    if (!filas.length) return "";
    const cols = [...new Set(filas.flatMap((f) => Object.keys(f)))];
    const q = (v) => { const s = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v); return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    return "﻿" + [cols.join(","), ...filas.map((f) => cols.map((c) => q(f[c])).join(","))].join("\n");
  }
  const tile = (valor, unidad, etiqueta) => `<div class="tile"><div><span class="v">${valor}</span><span class="u">${unidad || ""}</span></div><div class="l">${etiqueta}</div></div>`;
  function barras(items, { valor = "v", nombre = "n", unidad = "", total = null } = {}) {
    if (!items.length) return `<p class="muted">Sin datos.</p>`;
    const max = Math.max(...items.map((i) => +i[valor]));
    return `<div class="barras">${items.map((i) => {
      const pct = total ? ` · ${fmt((100 * i[valor]) / total, 1)} %` : "";
      return `<div class="barra-fila" title="${esc(i[nombre])}: ${fmt(i[valor])} ${unidad}${pct}">
        <span class="n">${esc(i[nombre])}</span>
        <span class="t"><span style="width:${Math.max(2, (100 * i[valor]) / max)}%"></span></span>
        <span class="val">${fmt(i[valor])} ${unidad}${pct}</span></div>`;
    }).join("")}</div>`;
  }
  function tablaPopup(props) {
    const filas = Object.entries(props || {})
      .filter(([k, v]) => v !== null && v !== "" && typeof v !== "object" && !["id", "user_id"].includes(k))
      .slice(0, 18)
      .map(([k, v]) => `<tr><td>${esc(k.replace(/_/g, " "))}</td><td>${esc(typeof v === "number" ? fmt(v, 2) : v)}</td></tr>`)
      .join("");
    return `<table>${filas}</table>`;
  }

  // ---------------------------------------------------------------- mapa
  const mapa = L.map("mapa", { zoomControl: true, preferCanvas: true }).setView(CFG.CENTRO, CFG.ZOOM);
  const bases = {
    "Mapa claro": L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}", { maxZoom: 16, attribution: "Esri, HERE, Garmin, © OpenStreetMap" }),
    "OpenStreetMap": L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }),
    "Imagen satelital": L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, attribution: "Esri, Maxar, Earthstar Geographics" }),
  };
  bases["Mapa claro"].addTo(mapa);
  L.control.layers(bases, null, { position: "topright" }).addTo(mapa);
  L.control.scale({ imperial: false }).addTo(mapa);
  mapa.createPane("superior").style.zIndex = 650;
  mapa.on("mousemove", (e) => ($("#coords").textContent = `Lat ${e.latlng.lat.toFixed(5)} · Lon ${e.latlng.lng.toFixed(5)}`));

  // ---------------------------------------------------------------- conexión
  const modo = await API.init();
  const badge = $("#estado-conexion");
  if (modo === "supabase") { badge.textContent = "Conectado a Supabase"; badge.className = "badge ok"; }
  else {
    badge.textContent = "Modo demo"; badge.className = "badge demo";
    badge.title = API.errorConexion ? `Error de conexión: ${API.errorConexion}` : "Configure SUPABASE_URL y SUPABASE_ANON_KEY en config.js";
    if (API.errorConexion) toast("No se pudo conectar a Supabase; se usa modo demo. Revise config.js", true);
  }
  function actualizarUsuario() {
    const u = API.usuario;
    $("#btn-login").hidden = modo !== "supabase" || !!u;
    $("#btn-logout").hidden = !u;
    $("#usuario").hidden = !u;
    $("#usuario").textContent = u ? u.email : "";
  }
  actualizarUsuario();
  document.addEventListener("auth-cambio", actualizarUsuario);
  $("#btn-login").onclick = () => $("#dlg-login").showModal();
  $("#btn-logout").onclick = async () => { await API.logout(); toast("Sesión cerrada"); };
  $("#form-login").addEventListener("submit", async (e) => {
    if (e.submitter?.value !== "ok") return;
    try { await API.login(new FormData(e.target).get("email")); toast("Revise su correo y abra el enlace de acceso."); }
    catch (err) { toast(err.message, true); }
  });

  // ---------------------------------------------------------------- pestañas
  $$(".tab").forEach((b) => b.addEventListener("click", () => {
    $$(".tab").forEach((x) => x.classList.toggle("activa", x === b));
    $$(".tab-panel").forEach((p) => p.classList.toggle("activa", p.id === "tab-" + b.dataset.tab));
  }));

  // ---------------------------------------------------------------- catálogo de capas vectoriales
  const capasMapa = {}; // capa -> L.GeoJSON
  const datosCapa = {}; // capa -> FeatureCollection
  let catalogo = [];
  try { catalogo = await API.catalogo(); } catch (e) { toast("No se pudo leer el catálogo de capas: " + e.message, true); }

  async function activarCapa(entry, on, silencioso = false) {
    if (entry.origen && entry.origen !== "supabase" && window.Externas) return window.Externas.activar(entry, on, mapa);
    if (!on) { if (capasMapa[entry.capa]) mapa.removeLayer(capasMapa[entry.capa]); return; }
    if (!capasMapa[entry.capa]) {
      try {
        const tol = entry.capa === "departamentos" || entry.capa === "municipios" ? 0.002 : 0.0005;
        const fc = await API.capa(entry.capa, { tolerancia: tol });
        datosCapa[entry.capa] = fc;
        if (!fc.features.length) {
          if (!silencioso) toast(`La capa "${entry.titulo}" aún no tiene datos. Cárguela en Supabase (ver README).`, true);
          const chk = $(`input[data-capa="${entry.capa}"]`); if (chk) chk.checked = false;
          return;
        }
        const est = { color: "#2f7d4f", weight: 1, fillOpacity: 0.3, ...(entry.estilo || {}) };
        capasMapa[entry.capa] = L.geoJSON(fc, {
          style: () => ({ ...est, fillColor: est.color }),
          pointToLayer: (_f, ll) => L.circleMarker(ll, { radius: 5, ...est }),
          onEachFeature: (f, l) => l.bindPopup(`<strong>${esc(entry.titulo)}</strong><br>${tablaPopup(f.properties)}`),
        });
      } catch (e) { toast(`Error cargando ${entry.titulo}: ${e.message}`, true); return; }
    }
    capasMapa[entry.capa].addTo(mapa);
    if (entry.tema === "base") capasMapa[entry.capa].bringToBack();
  }

  function pintarCatalogo() {
    for (const tema of ["biodiversidad", "politicas_uso", "carbono"]) {
      const cont = $("#capas-" + tema); if (!cont) continue;
      const items = catalogo.filter((c) => c.tema === tema || (tema === "politicas_uso" && c.tema === "base"));
      cont.innerHTML = items.length ? items.map((c) => {
        const col = c.estilo?.color || "#2f7d4f";
        return `<label class="capa-item" title="${esc(c.descripcion || "")}">
          <input type="checkbox" data-capa="${esc(c.capa)}" ${c.visible_inicio && (API.modo === "supabase" || c.capa === "departamentos") ? "checked" : ""}/>
          <span class="swatch" style="border-color:${col};background:${c.estilo?.fillOpacity ? col + "55" : "transparent"}"></span>
          <span>${esc(c.titulo)}</span><span class="fuente">${esc(c.fuente || "")}</span></label>`;
      }).join("") : `<p class="capa-vacia">Sin capas en el catálogo.</p>`;
    }
    $$("input[data-capa]").forEach((chk) => {
      const entry = catalogo.find((c) => c.capa === chk.dataset.capa);
      chk.addEventListener("change", () => activarCapa(entry, chk.checked));
      if (chk.checked) activarCapa(entry, true, true);
    });
    if (API.modo === "demo") {
      $$(".lista-capas").forEach((l) => l.insertAdjacentHTML("beforeend", `<p class="capa-vacia">Modo demo: las capas oficiales se activan al conectar Supabase y cargarlas (ver README).</p>`));
    }
  }
  pintarCatalogo();

  // ---------------------------------------------------------------- GBIF (biodiversidad)
  const gbif = { taxonKey: null, nombre: "" };
  let capaGBIF = null;
  function urlGBIF() {
    const hex = $("#gbif-estilo").value === "hex";
    const p = new URLSearchParams({ srs: "EPSG:3857", country: "CO", style: hex ? "classic.poly" : "purpleYellow.point" });
    if (hex) { p.set("bin", "hex"); p.set("hexPerTile", "45"); }
    if (gbif.taxonKey) p.set("taxonKey", gbif.taxonKey);
    return `${CFG.GBIF_API}/v2/map/occurrence/density/{z}/{x}/{y}@1x.png?${p}`;
  }
  function actualizarGBIF() {
    if (capaGBIF) mapa.removeLayer(capaGBIF);
    capaGBIF = null;
    if (!$("#gbif-on").checked) return;
    capaGBIF = L.tileLayer(urlGBIF(), { opacity: 0.85, attribution: "Registros: GBIF.org", zIndex: 400 }).addTo(mapa);
    contarGBIF();
  }
  async function contarGBIF() {
    const p = new URLSearchParams({ country: "CO", limit: 0 });
    if (gbif.taxonKey) p.set("taxonKey", gbif.taxonKey);
    try {
      const r = await (await fetch(`${CFG.GBIF_API}/v1/occurrence/search?${p}`)).json();
      $("#gbif-conteo").textContent = `${nf0.format(r.count)} registros en Colombia${gbif.nombre ? " para " + gbif.nombre : ""}.`;
    } catch { $("#gbif-conteo").textContent = "No se pudo consultar GBIF."; }
  }
  const sugerencias = new Map();
  let sugT;
  $("#gbif-taxon").addEventListener("input", (e) => {
    clearTimeout(sugT);
    const q = e.target.value.trim();
    if (sugerencias.has(q)) { gbif.taxonKey = sugerencias.get(q); gbif.nombre = q; actualizarGBIF(); return; }
    if (q.length < 3) return;
    sugT = setTimeout(async () => {
      try {
        const r = await (await fetch(`${CFG.GBIF_API}/v1/species/suggest?limit=10&q=${encodeURIComponent(q)}`)).json();
        $("#gbif-sugerencias").innerHTML = r.map((s) => { sugerencias.set(s.canonicalName || s.scientificName, s.key); return `<option value="${esc(s.canonicalName || s.scientificName)}">${esc(s.rank)}</option>`; }).join("");
      } catch {}
    }, 250);
  });
  $("#gbif-taxon").addEventListener("change", (e) => {
    const k = sugerencias.get(e.target.value.trim());
    if (k) { gbif.taxonKey = k; gbif.nombre = e.target.value.trim(); actualizarGBIF(); }
  });
  $("#gbif-limpiar").onclick = () => { gbif.taxonKey = null; gbif.nombre = ""; $("#gbif-taxon").value = ""; actualizarGBIF(); };
  $("#gbif-on").onchange = actualizarGBIF;
  $("#gbif-estilo").onchange = actualizarGBIF;
  actualizarGBIF();

  // ---------------------------------------------------------------- WMS externos
  const WC_CLASES = [
    ["Cobertura arbórea", "#006400"], ["Arbustal", "#ffbb22"], ["Pastizal", "#ffff4c"], ["Cultivos", "#f096ff"],
    ["Construido", "#fa0000"], ["Suelo desnudo / escasa vegetación", "#b4b4b4"], ["Nieve y hielo", "#f0f0f0"],
    ["Agua permanente", "#0064c8"], ["Humedal herbáceo", "#0096a0"], ["Manglar", "#00cf75"], ["Musgos y líquenes", "#fae6a0"],
  ];
  $("#leyenda-worldcover").innerHTML = WC_CLASES.map(([n, c]) => `<div class="leyenda-item"><i style="background:${c}"></i>${n}</div>`).join("") + `<p class="muted">ESA WorldCover 2021 v200 (10 m). © ESA WorldCover project / Copernicus.</p>`;
  const capaWorldCover = L.tileLayer.wms(CFG.WORLDCOVER_WMS, { layers: "esa-worldcover-map-10m-2021-v2_map", version: "1.3.0", styles: "", TIME: "2021-01-01", format: "image/png", transparent: true, opacity: 0.75, attribution: "ESA WorldCover 2021", zIndex: 300 });
  $("#worldcover-on").onchange = (e) => { $("#leyenda-worldcover").hidden = !e.target.checked; e.target.checked ? capaWorldCover.addTo(mapa) : mapa.removeLayer(capaWorldCover); };

  const capaSoilGrids = L.tileLayer.wms(CFG.SOILGRIDS_OCS, { layers: "ocs_0-30cm_mean", format: "image/png", transparent: true, opacity: 0.75, attribution: "ISRIC SoilGrids 2.0 (CC-BY 4.0)", zIndex: 310 });
  $("#leyenda-soilgrids img").src = `${CFG.SOILGRIDS_OCS}&SERVICE=WMS&VERSION=1.3.0&REQUEST=GetLegendGraphic&FORMAT=image/png&LAYER=ocs_0-30cm_mean&SLD_VERSION=1.1.0`;
  $("#soilgrids-on").onchange = (e) => { $("#leyenda-soilgrids").hidden = !e.target.checked; e.target.checked ? capaSoilGrids.addTo(mapa) : mapa.removeLayer(capaSoilGrids); };

  // ---------------------------------------------------------------- muestras y observaciones
  const RAMPA_STOCK = [[30, "#f3e2c7"], [60, "#dfb47e"], [90, "#bf8040"], [120, "#8c5a2b"], [Infinity, "#5a3413"]];
  const colorStock = (v) => RAMPA_STOCK.find(([lim]) => v < lim)[1];
  $("#leyenda-muestras").innerHTML = `<div class="muted">Stock COS (t C/ha)</div>` + RAMPA_STOCK.map(([lim, c], i) => {
    const desde = i ? RAMPA_STOCK[i - 1][0] : 0;
    return `<div class="leyenda-item"><i style="background:${c};border-radius:50%"></i>${lim === Infinity ? "≥ " + desde : desde + " – " + lim}</div>`;
  }).join("");
  let capaMuestras = null, capaObs = null;
  async function cargarMuestras() {
    if (capaMuestras) mapa.removeLayer(capaMuestras);
    try {
      datosCapa.__muestras = await API.muestras();
      capaMuestras = L.geoJSON(datosCapa.__muestras, {
        pane: "superior",
        pointToLayer: (f, ll) => L.circleMarker(ll, { radius: 7, color: "#fff", weight: 1.5, fillColor: colorStock(+f.properties.stock_cos_tha), fillOpacity: 1, pane: "superior" }),
        onEachFeature: (f, l) => l.bindPopup(`<strong>Muestra ${esc(f.properties.codigo || "")}</strong><br>Stock: <b>${fmt(f.properties.stock_cos_tha, 2)} t C/ha</b> · CO₂e ${fmt(f.properties.co2e_tha, 1)} t/ha<br>${tablaPopup(f.properties)}`),
      });
      if ($("#muestras-on").checked) capaMuestras.addTo(mapa);
    } catch (e) { toast("Error al cargar muestras: " + e.message, true); }
  }
  async function cargarObservaciones() {
    if (capaObs) mapa.removeLayer(capaObs);
    try {
      datosCapa.__observaciones = await API.observaciones();
      capaObs = L.geoJSON(datosCapa.__observaciones, {
        pane: "superior",
        pointToLayer: (_f, ll) => L.circleMarker(ll, { radius: 6, color: "#fff", weight: 1.5, fillColor: "#1f6f8b", fillOpacity: 1, pane: "superior" }),
        onEachFeature: (f, l) => l.bindPopup(`<strong><i>${esc(f.properties.especie)}</i></strong><br>${tablaPopup(f.properties)}`),
      });
      if ($("#obs-on").checked) capaObs.addTo(mapa);
    } catch (e) { toast("Error al cargar observaciones: " + e.message, true); }
  }
  $("#muestras-on").onchange = (e) => capaMuestras && (e.target.checked ? capaMuestras.addTo(mapa) : mapa.removeLayer(capaMuestras));
  $("#obs-on").onchange = (e) => capaObs && (e.target.checked ? capaObs.addTo(mapa) : mapa.removeLayer(capaObs));
  cargarMuestras(); cargarObservaciones();

  // ---------------------------------------------------------------- ubicar punto en el mapa
  let formUbicar = null, marcadorTemp = null;
  $$("[data-ubicar]").forEach((b) => b.addEventListener("click", () => {
    formUbicar = $("#" + b.dataset.ubicar);
    $("#aviso-ubicar").hidden = false; mapa.getContainer().style.cursor = "crosshair";
  }));
  function terminarUbicar() { formUbicar = null; $("#aviso-ubicar").hidden = true; mapa.getContainer().style.cursor = ""; }
  $("#cancelar-ubicar").onclick = terminarUbicar;

  // ---------------------------------------------------------------- formulario observaciones
  $("#form-obs").addEventListener("submit", async (e) => {
    e.preventDefault();
    const obj = Object.fromEntries(new FormData(e.target));
    if (sugerencias.has(obj.especie)) obj.gbif_taxon_key = sugerencias.get(obj.especie);
    try { await API.guardarObservacion(obj); toast("Observación guardada"); e.target.reset(); cargarObservaciones(); }
    catch (err) { toast(err.message, true); }
  });

  // ---------------------------------------------------------------- calculadora de carbono
  const formC = $("#form-carbono");
  function recalcular() {
    const v = Object.fromEntries(new FormData(formC));
    const r = API.calcularStock(v);
    if (!r) { $("#carbono-resultado").innerHTML = `<p class="muted" style="grid-column:1/-1">Ingrese COS, densidad aparente y profundidades válidas.</p>`; return; }
    let html = tile(fmt(r.stock_cos_tha, 2), "t C/ha", `Stock de COS (${fmt(r.espesor_cm)} cm)`) + tile(fmt(r.co2e_tha, 1), "t CO₂e/ha", "CO₂ equivalente");
    if (+v.area_ha > 0) html += tile(nf0.format(r.stock_cos_tha * v.area_ha), "t C", `Total en ${fmt(v.area_ha)} ha`) + tile(nf0.format(r.co2e_tha * v.area_ha), "t CO₂e", "CO₂e total");
    $("#carbono-resultado").innerHTML = html;
  }
  formC.addEventListener("input", recalcular); recalcular();
  formC.addEventListener("submit", async (e) => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(formC));
    if (!v.lat || !v.lon) { toast("Indique latitud y longitud (o use «Ubicar en mapa»).", true); return; }
    try { await API.guardarMuestras([v]); toast("Muestra guardada"); cargarMuestras(); }
    catch (err) { toast(err.message, true); }
  });

  // ---------------------------------------------------------------- CSV de muestras
  const COLS_CSV = ["codigo","fecha_muestreo","municipio","departamento","cobertura","lat","lon","prof_sup_cm","prof_inf_cm","cos_pct","densidad_aparente","pedregosidad_pct"];
  $("#csv-plantilla").onclick = () => descargar("plantilla_muestras_carbono.csv",
    "﻿" + COLS_CSV.join(",") + "\nM-001,2026-09-01,Choachí,Cundinamarca,Bosque,4.5270,-73.9230,0,30,3.2,0.95,5\n", "text/csv");
  $("#csv-archivo").addEventListener("change", (e) => {
    const f = e.target.files[0]; if (!f) return;
    Papa.parse(f, {
      header: true, skipEmptyLines: true, transformHeader: (h) => h.trim().toLowerCase(),
      complete: async (res) => {
        const filas = res.data;
        $("#csv-estado").textContent = `${filas.length} filas leídas. Guardando…`;
        try {
          for (let i = 0; i < filas.length; i += 200) await API.guardarMuestras(filas.slice(i, i + 200));
          $("#csv-estado").textContent = `${filas.length} muestras guardadas.`; cargarMuestras();
        } catch (err) { $("#csv-estado").textContent = "Error: " + err.message; toast(err.message, true); }
        e.target.value = "";
      },
    });
  });

  // ---------------------------------------------------------------- normas
  let normas = [], temaNorma = "";
  try { normas = await API.politicas(); } catch (e) { toast("No se pudieron cargar las normas: " + e.message, true); }
  function pintarNormas() {
    const q = $("#normas-buscar").value.trim().toLowerCase();
    const lista = normas.filter((n) => (!temaNorma || (n.temas || []).includes(temaNorma)) &&
      (!q || `${n.titulo} ${n.resumen} ${n.entidad}`.toLowerCase().includes(q)));
    $("#normas-lista").innerHTML = lista.map((n) => `<article class="norma">
      <h3>${esc(n.titulo)}</h3>
      <div class="meta">${esc(n.tipo || "")} · ${esc(n.anio || "")} · ${esc(n.entidad || "")}</div>
      <p>${esc(n.resumen || "")}</p>
      ${n.relacion_mapa ? `<div class="rel">En el mapa: ${esc(n.relacion_mapa)}</div>` : ""}
      <a target="_blank" rel="noopener" href="${esc(n.url || "https://www.google.com/search?q=" + encodeURIComponent(n.titulo + " texto oficial"))}">${n.url ? "Texto oficial" : "Buscar texto oficial"} ↗</a>
    </article>`).join("") || `<p class="muted">Sin resultados.</p>`;
  }
  $("#normas-buscar").addEventListener("input", pintarNormas);
  $$("#normas-filtros .chip").forEach((c) => c.addEventListener("click", () => {
    $$("#normas-filtros .chip").forEach((x) => x.classList.toggle("activa", x === c)); temaNorma = c.dataset.tema; pintarNormas();
  }));
  pintarNormas();

  // ---------------------------------------------------------------- análisis de área
  let area = null, capaArea = null, modoDepto = false, ultimoResumen = null, recorteActual = null, capaRecorte = null;
  const estiloArea = { color: "#d1495b", weight: 2.5, dashArray: "6 4", fillOpacity: 0.05 };
  function fijarArea(feature, etiqueta) {
    area = feature.type === "Feature" ? feature : turf.feature(feature);
    if (capaArea) mapa.removeLayer(capaArea);
    capaArea = L.geoJSON(area, { style: estiloArea, interactive: false }).addTo(mapa);
    mapa.fitBounds(capaArea.getBounds(), { padding: [20, 20] });
    $("#area-info").textContent = `${etiqueta ? etiqueta + " · " : ""}${fmt(turf.area(area) / 10000, 1)} ha`;
    $("#btn-analizar").disabled = false; $("#btn-limpiar-area").disabled = false; $("#btn-recortar").disabled = false;
  }
  $("#btn-limpiar-area").onclick = () => {
    area = null; if (capaArea) mapa.removeLayer(capaArea); if (capaRecorte) mapa.removeLayer(capaRecorte);
    $("#area-info").textContent = "Ningún área seleccionada."; $("#resultados").hidden = true;
    ["#btn-analizar", "#btn-limpiar-area", "#btn-recortar", "#btn-desc-geojson", "#btn-desc-csv"].forEach((s) => ($(s).disabled = true));
  };
  const opcionesDibujo = { shapeOptions: estiloArea, allowIntersection: false, showArea: true, metric: true };
  $("#dibujar-poligono").onclick = () => new L.Draw.Polygon(mapa, opcionesDibujo).enable();
  $("#dibujar-rectangulo").onclick = () => new L.Draw.Rectangle(mapa, { shapeOptions: estiloArea, metric: true }).enable();
  mapa.on(L.Draw.Event.CREATED, (e) => fijarArea(e.layer.toGeoJSON(), "Área dibujada"));

  $("#elegir-depto").onclick = async () => {
    const entry = catalogo.find((c) => c.capa === "departamentos") || { capa: "departamentos", titulo: "Departamentos", tema: "base", estilo: { color: "#555", fillOpacity: 0, weight: 1.2 } };
    const chk = $('input[data-capa="departamentos"]'); if (chk) chk.checked = true;
    await activarCapa(entry, true);
    if (!datosCapa.departamentos?.features?.length) { try { toast("Cargando departamentos…"); datosCapa.departamentos = await API.capa("departamentos", { tolerancia: 0.005 }); } catch (e) { toast("No se pudieron cargar los departamentos: " + e.message, true); } }
    if (!datosCapa.departamentos?.features?.length) return;
    modoDepto = true; mapa.getContainer().style.cursor = "pointer"; toast("Haga clic sobre un departamento");
  };

  mapa.on("click", (e) => {
    if (formUbicar) {
      formUbicar.querySelector('[name="lat"]').value = e.latlng.lat.toFixed(6);
      formUbicar.querySelector('[name="lon"]').value = e.latlng.lng.toFixed(6);
      if (marcadorTemp) mapa.removeLayer(marcadorTemp);
      marcadorTemp = L.circleMarker(e.latlng, { radius: 8, color: "#d1495b", weight: 3, fillOpacity: 0 }).addTo(mapa);
      terminarUbicar(); return;
    }
    if (modoDepto) {
      const pt = turf.point([e.latlng.lng, e.latlng.lat]);
      const f = datosCapa.departamentos.features.find((d) => turf.booleanPointInPolygon(pt, d));
      modoDepto = false; mapa.getContainer().style.cursor = "";
      if (f) fijarArea({ type: "Feature", geometry: f.geometry, properties: {} }, f.properties.nombre);
      else toast("No hay un departamento en ese punto", true);
    }
  });

  async function leerArchivoGeo(file) {
    if (file.name.toLowerCase().endsWith(".zip")) {
      const r = await shp(await file.arrayBuffer());
      return Array.isArray(r) ? turf.featureCollection(r.flatMap((x) => x.features)) : r;
    }
    const gj = JSON.parse(await file.text());
    return gj.type === "FeatureCollection" ? gj : gj.type === "Feature" ? turf.featureCollection([gj]) : turf.featureCollection([turf.feature(gj)]);
  }
  $("#subir-area").addEventListener("change", async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try {
      const fc = await leerArchivoGeo(file);
      const pols = fc.features.filter((f) => f.geometry && f.geometry.type.includes("Polygon"));
      if (!pols.length) throw new Error("El archivo no contiene polígonos");
      let unido = pols[0];
      if (pols.length > 1) { try { unido = turf.union(turf.featureCollection(pols)) || pols[0]; } catch { toast("No se pudieron unir los polígonos; se usa el primero", true); } }
      fijarArea(unido, file.name);
    } catch (err) { toast("Archivo no válido: " + err.message, true); }
    e.target.value = "";
  });

  // ---------- GBIF dentro del área
  function geometriaWKT(feature) {
    let f = feature, tol = 0.0005;
    const nCoords = (g) => turf.coordAll(g).length;
    while (nCoords(f) > 180 && tol < 1) { f = turf.simplify(feature, { tolerance: tol, highQuality: false }); tol *= 2; }
    f = turf.rewind(f);
    const anillo = (r) => "(" + r.map((c) => `${c[0].toFixed(5)} ${c[1].toFixed(5)}`).join(",") + ")";
    const g = f.geometry;
    return g.type === "Polygon" ? `POLYGON(${g.coordinates.map(anillo).join(",")})`
      : `MULTIPOLYGON(${g.coordinates.map((p) => "(" + p.map(anillo).join(",") + ")").join(",")})`;
  }
  async function gbifArea(feature) {
    const base = new URLSearchParams({ geometry: geometriaWKT(feature), limit: 0 });
    if (gbif.taxonKey) base.set("taxonKey", gbif.taxonKey);
    const q = (extra) => fetch(`${CFG.GBIF_API}/v1/occurrence/search?${base}&${extra}`).then((r) => { if (!r.ok) throw new Error("GBIF " + r.status); return r.json(); });
    const [gen, amen] = await Promise.all([
      q("facet=speciesKey&facetLimit=1000&facet=iucnRedListCategory&facet=kingdomKey"),
      q("iucnRedListCategory=CR&iucnRedListCategory=EN&iucnRedListCategory=VU&facet=speciesKey&facetLimit=200"),
    ]);
    const facet = (r, campo) => (r.facets.find((x) => x.field === campo)?.counts || []);
    const top = facet(gen, "SPECIES_KEY").slice(0, 10), topAm = facet(amen, "SPECIES_KEY").slice(0, 10);
    const nombres = {};
    await Promise.all([...new Set([...top, ...topAm].map((c) => c.name))].map(async (k) => {
      try { const s = await (await fetch(`${CFG.GBIF_API}/v1/species/${k}`)).json(); nombres[k] = s.canonicalName || s.scientificName; } catch { nombres[k] = k; }
    }));
    return {
      registros: gen.count,
      especies: facet(gen, "SPECIES_KEY").length,
      especies_tope: facet(gen, "SPECIES_KEY").length >= 1000,
      uicn: facet(gen, "IUCN_RED_LIST_CATEGORY"),
      reinos: facet(gen, "KINGDOM_KEY"),
      top: top.map((c) => ({ n: nombres[c.name], v: c.count })),
      amenazadas_n: facet(amen, "SPECIES_KEY").length,
      amenazadas_registros: amen.count,
      topAm: topAm.map((c) => ({ n: nombres[c.name], v: c.count })),
    };
  }

  // ---------- SoilGrids: recorte del ráster de stock de COS 0-30 cm
  async function soilgridsArea(feature) {
    const [xmin, ymin, xmax, ymax] = turf.bbox(feature);
    const areaDeg = (xmax - xmin) * (ymax - ymin);
    const res = Math.max(0.0025, Math.sqrt(areaDeg / 250000)); // máx. ~250.000 píxeles
    const p = new URLSearchParams({ SERVICE: "WCS", VERSION: "1.0.0", REQUEST: "GetCoverage", COVERAGE: "ocs_0-30cm_mean",
      CRS: "EPSG:4326", RESPONSE_CRS: "EPSG:4326", BBOX: [xmin, ymin, xmax, ymax].join(","), RESX: res, RESY: res, FORMAT: "GEOTIFF_INT16" });
    const r = await fetch(`${CFG.SOILGRIDS_OCS}&${p}`);
    if (!r.ok) throw new Error("SoilGrids respondió " + r.status);
    const tiff = await GeoTIFF.fromArrayBuffer(await r.arrayBuffer());
    const img = await tiff.getImage();
    const [bx0, by0, bx1, by1] = img.getBoundingBox();
    const w = img.getWidth(), h = img.getHeight();
    const dx = (bx1 - bx0) / w, dy = (by1 - by0) / h;
    const nodata = img.getGDALNoData() ?? -32768;
    const banda = (await img.readRasters())[0];
    let suma = 0, sumaArea = 0, n = 0, min = Infinity, max = -Infinity, totalT = 0;
    for (let j = 0; j < h; j++) {
      const lat = by1 - (j + 0.5) * dy;
      const celdaHa = (dx * 111320) * (dy * 111320 * Math.cos((lat * Math.PI) / 180)) / 10000;
      for (let i = 0; i < w; i++) {
        const v = banda[j * w + i];
        if (v === nodata || v <= 0) continue;
        const lon = bx0 + (i + 0.5) * dx;
        if (!turf.booleanPointInPolygon([lon, lat], feature)) continue;
        suma += v * celdaHa; sumaArea += celdaHa; n++; totalT += v * celdaHa;
        if (v < min) min = v; if (v > max) max = v;
      }
    }
    if (!n) throw new Error("sin píxeles válidos en el área");
    return { media: suma / sumaArea, min, max, pixeles: n, res_m: Math.round(dx * 111320), area_ha: sumaArea, total_t: totalT, co2e_t: (totalT * 44) / 12 };
  }

  $("#btn-analizar").onclick = async () => {
    if (!area) return;
    const btn = $("#btn-analizar"); btn.disabled = true; btn.textContent = "Analizando…";
    $("#resultados").hidden = false;
    ["#res-tiles", "#res-bio", "#res-capas", "#res-carbono"].forEach((s) => ($(s).innerHTML = `<p class="muted">Calculando…</p>`));
    const [rRes, rBio, rSoil] = await Promise.allSettled([API.resumenArea(area), gbifArea(area), soilgridsArea(area)]);
    const res = rRes.value, bio = rBio.value, soil = rSoil.value;
    const areaHa = res?.area_ha ?? turf.area(area) / 10000;
    ultimoResumen = { area_ha: areaHa, res, bio, soil, fecha: new Date().toISOString() };

    // % protegido (meta 30x30)
    const prot = res?.capas?.filter((c) => c.capa === "areas_protegidas").reduce((s, c) => s + c.area_ha, 0) || 0;
    $("#res-tiles").innerHTML =
      tile(fmt(areaHa, 0), "ha", "Área analizada") +
      tile(res?.capas?.some((c) => c.capa === "areas_protegidas") ? fmt(Math.min(100, (100 * prot) / areaHa), 1) : "—", "%", "Área protegida (RUNAP) · meta 30×30") +
      tile(bio ? nf0.format(bio.registros) : "—", "", "Registros GBIF") +
      tile(bio ? (bio.especies_tope ? "≥ 1.000" : nf0.format(bio.especies)) : "—", "", "Especies (GBIF)") +
      tile(soil ? fmt(soil.media, 1) : "—", "t C/ha", "COS 0–30 cm medio (SoilGrids)") +
      tile(soil ? nf0.format(soil.total_t) : "—", "t C", "Stock total estimado");

    // Biodiversidad
    if (bio) {
      const cat = { CR: "En peligro crítico", EN: "En peligro", VU: "Vulnerable", NT: "Casi amenazada", LC: "Preocupación menor", DD: "Datos insuficientes", NE: "No evaluada" };
      $("#res-bio").innerHTML = `${gbif.nombre ? `<p class="nota">Filtrado por taxón: <i>${esc(gbif.nombre)}</i></p>` : ""}
        <div class="subt">Especies con más registros</div>${barras(bio.top, { unidad: "reg." })}
        <div class="subt">Especies amenazadas (UICN CR/EN/VU): ${nf0.format(bio.amenazadas_n)}</div>${barras(bio.topAm, { unidad: "reg." })}
        <div class="subt">Registros por categoría UICN</div>${barras(bio.uicn.map((c) => ({ n: cat[c.name] || c.name, v: c.count })), { unidad: "reg." })}
        <p class="nota">GBIF agrega registros de museos, herbarios y ciencia ciudadana; la cantidad depende del esfuerzo de muestreo, no solo de la riqueza real.</p>`;
    } else $("#res-bio").innerHTML = `<p class="aviso-err">No se pudo consultar GBIF: ${esc(rBio.reason?.message)}</p>`;

    // Capas
    if (res) {
      const porCapa = {};
      res.capas.forEach((c) => (porCapa[c.capa] ??= []).push({ n: c.clase, v: c.area_ha }));
      const titulo = (k) => catalogo.find((c) => c.capa === k)?.titulo || k.replace(/^propia:/, "Capa propia: ");
      $("#res-capas").innerHTML = Object.keys(porCapa).length
        ? Object.entries(porCapa).map(([k, items]) => `<div class="subt">${esc(titulo(k))}</div>${barras(items.slice(0, 12), { unidad: "ha", total: areaHa })}`).join("")
        : `<p class="muted">No hay capas vectoriales con datos en esta área${API.modo === "demo" ? " (modo demo: conecte Supabase o cargue una capa propia)" : ""}.</p>`;
    } else $("#res-capas").innerHTML = `<p class="aviso-err">Error: ${esc(rRes.reason?.message)}</p>`;
    if (res?.externas_errores?.length) $("#res-capas").insertAdjacentHTML("beforeend", `<p class="nota">Sin respuesta del servidor (intente de nuevo): ${esc(res.externas_errores.join(", "))}</p>`);

    // Carbono
    const m = res?.muestras_carbono;
    $("#res-carbono").innerHTML = `
      <div class="subt">Mapa de referencia SoilGrids (0–30 cm)</div>
      ${soil ? `<div class="tiles">${tile(fmt(soil.media, 1), "t C/ha", "Media ponderada por área")}${tile(`${fmt(soil.min, 0)}–${fmt(soil.max, 0)}`, "t C/ha", "Rango")}
        ${tile(nf0.format(soil.total_t), "t C", "Stock total")}${tile(nf0.format(soil.co2e_t), "t CO₂e", "CO₂ equivalente")}</div>
        <p class="nota">${nf0.format(soil.pixeles)} píxeles de ~${soil.res_m} m. Modelo global con incertidumbre alta a escala local.</p>`
        : `<p class="aviso-err">No se pudo recortar SoilGrids: ${esc(rSoil.reason?.message)}</p>`}
      ${res?.carbono_igac?.n ? `<div class="subt">Mapa nacional de carbono orgánico IGAC–FAO (0–30 cm)</div><div class="tiles">${tile(fmt(res.carbono_igac.media, 1), "t C/ha", `Media de ${res.carbono_igac.n} puntos`)}${tile(`${fmt(res.carbono_igac.min, 0)}–${fmt(res.carbono_igac.max, 0)}`, "t C/ha", "Rango")}${tile(nf0.format(res.carbono_igac.total_t), "t C", "Stock total estimado")}${tile(nf0.format(res.carbono_igac.co2e_t), "t CO₂e", "CO₂ equivalente")}</div><p class="nota">Muestreo de ${res.carbono_igac.n} puntos dentro del área sobre el mapa oficial del IGAC.</p>` : res?.carbono_igac?.error ? `<p class="aviso-err">Mapa de carbono IGAC no disponible: ${esc(res.carbono_igac.error)}</p>` : ""}
      <div class="subt">Muestras propias dentro del área</div>
      ${m && m.n ? `<div class="tiles">${tile(m.n, "", "Muestras")}${tile(fmt(m.stock_medio_tha, 1), "t C/ha", `Stock medio (${fmt(m.stock_min_tha, 0)}–${fmt(m.stock_max_tha, 0)})`)}
        ${tile(nf0.format(m.carbono_total_t), "t C", "Total extrapolado")}${tile(nf0.format(m.co2e_total_t), "t CO₂e", "CO₂e extrapolado")}</div>
        ${soil ? `<p class="nota">Diferencia muestras vs. SoilGrids: ${fmt(m.stock_medio_tha - soil.media, 1)} t C/ha (${fmt((100 * (m.stock_medio_tha - soil.media)) / soil.media, 0)} %).</p>` : ""}
        <p class="nota">${esc(res.nota)}</p>`
        : `<p class="muted">No hay muestras registradas en el área.</p>`}`;

    btn.disabled = false; btn.textContent = "2. Analizar área";
  };

  $("#descargar-resumen").onclick = () => {
    if (!ultimoResumen) return;
    const { area_ha, res, bio, soil } = ultimoResumen;
    const filas = [{ seccion: "general", indicador: "area_ha", valor: area_ha }];
    res?.capas?.forEach((c) => filas.push({ seccion: c.capa, indicador: c.clase, valor: c.area_ha, unidad: "ha" }));
    if (bio) {
      filas.push({ seccion: "gbif", indicador: "registros", valor: bio.registros }, { seccion: "gbif", indicador: "especies", valor: bio.especies }, { seccion: "gbif", indicador: "especies_amenazadas", valor: bio.amenazadas_n });
      bio.top.forEach((t) => filas.push({ seccion: "gbif_top_especies", indicador: t.n, valor: t.v, unidad: "registros" }));
    }
    if (soil) Object.entries(soil).forEach(([k, v]) => filas.push({ seccion: "soilgrids_ocs_0_30", indicador: k, valor: +(+v).toFixed(2) }));
    if (res?.muestras_carbono) Object.entries(res.muestras_carbono).forEach(([k, v]) => filas.push({ seccion: "muestras_carbono", indicador: k, valor: v }));
    descargar("resumen_area.csv", aCSV(filas), "text/csv");
  };

  // ---------------------------------------------------------------- recorte y descarga
  function opcionesRecorte() {
    const ops = [
      ...catalogo.map((c) => [c.capa, c.titulo]),
      ["__muestras", "Muestras de carbono"], ["__observaciones", "Observaciones de biodiversidad"], ["__gbif", "Registros GBIF (máx. 300)"],
      ...Object.keys(API.capasLocales).filter((k) => k.startsWith("propia:")).map((k) => [k, k.replace("propia:", "Capa propia: ")]),
    ];
    $("#recorte-capa").innerHTML = ops.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join("");
  }
  opcionesRecorte();

  $("#btn-recortar").onclick = async () => {
    if (!area) return;
    const capa = $("#recorte-capa").value;
    $("#recorte-info").textContent = "Recortando…";
    try {
      let fc;
      if (capa === "__muestras") fc = API.recortarFC(datosCapa.__muestras || (await API.muestras()), area);
      else if (capa === "__observaciones") fc = API.recortarFC(datosCapa.__observaciones || (await API.observaciones()), area);
      else if (capa === "__gbif") {
        const p = new URLSearchParams({ geometry: geometriaWKT(area), limit: 300, hasCoordinate: true });
        if (gbif.taxonKey) p.set("taxonKey", gbif.taxonKey);
        const r = await (await fetch(`${CFG.GBIF_API}/v1/occurrence/search?${p}`)).json();
        fc = API.FC(r.results.filter((o) => o.decimalLongitude != null).map((o) => ({
          type: "Feature", geometry: { type: "Point", coordinates: [o.decimalLongitude, o.decimalLatitude] },
          properties: { gbifID: o.gbifID, especie: o.species || o.scientificName, reino: o.kingdom, clase: o.class, familia: o.family, fecha: o.eventDate, uicn: o.iucnRedListCategory, tipo_registro: o.basisOfRecord, institucion: o.institutionCode, dataset: o.datasetName },
        })));
      } else fc = await API.recortar(capa, area);
      recorteActual = { capa, fc };
      if (capaRecorte) mapa.removeLayer(capaRecorte);
      capaRecorte = L.geoJSON(fc, {
        pane: "superior",
        style: { color: "#f2a900", weight: 2, fillOpacity: 0.35 },
        pointToLayer: (_f, ll) => L.circleMarker(ll, { radius: 5, color: "#fff", weight: 1, fillColor: "#f2a900", fillOpacity: 1, pane: "superior" }),
        onEachFeature: (f, l) => l.bindPopup(tablaPopup(f.properties)),
      }).addTo(mapa);
      const ha = fc.features.reduce((s, f) => s + (+f.properties?.area_ha || 0), 0);
      $("#recorte-info").textContent = `${fc.features.length} entidades${ha ? ` · ${fmt(ha, 1)} ha` : ""}.`;
      $("#btn-desc-geojson").disabled = $("#btn-desc-csv").disabled = !fc.features.length;
    } catch (err) { $("#recorte-info").textContent = "Error: " + err.message; }
  };
  const nombreArchivo = () => "recorte_" + recorteActual.capa.replace(/[^a-z0-9]+/gi, "_").replace(/^_+/, "");
  $("#btn-desc-geojson").onclick = () => recorteActual && descargar(nombreArchivo() + ".geojson", JSON.stringify(recorteActual.fc), "application/geo+json");
  $("#btn-desc-csv").onclick = () => recorteActual && descargar(nombreArchivo() + ".csv",
    aCSV(recorteActual.fc.features.map((f) => {
      const c = f.geometry?.type === "Point" ? { lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] } : {};
      return { ...f.properties, ...c };
    })), "text/csv");

  // ---------------------------------------------------------------- capa propia
  $("#subir-capa").addEventListener("change", async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try {
      const fc = await leerArchivoGeo(file);
      fc.features = fc.features.filter((f) => f.geometry);
      if (!fc.features.length) throw new Error("sin geometrías");
      const clave = "propia:" + file.name.replace(/\.(zip|geojson|json)$/i, "");
      API.capasLocales[clave] = fc;
      if (capasMapa[clave]) mapa.removeLayer(capasMapa[clave]);
      capasMapa[clave] = L.geoJSON(fc, {
        style: { color: "#7b3fa0", weight: 1.5, fillOpacity: 0.25 },
        pointToLayer: (_f, ll) => L.circleMarker(ll, { radius: 5, color: "#fff", weight: 1, fillColor: "#7b3fa0", fillOpacity: 1 }),
        onEachFeature: (f, l) => l.bindPopup(tablaPopup(f.properties)),
      }).addTo(mapa);
      mapa.fitBounds(capasMapa[clave].getBounds(), { padding: [20, 20] });
      opcionesRecorte(); $("#recorte-capa").value = clave;
      $("#capa-propia-info").textContent = `${file.name}: ${fc.features.length} entidades cargadas (solo en este navegador).`;
    } catch (err) { toast("No se pudo leer la capa: " + err.message, true); }
    e.target.value = "";
  });

  window.__geoportal = { mapa, API, fijarArea, soilgridsArea, gbifArea, geometriaWKT, toast, datosCapa }; // depuración
})();
