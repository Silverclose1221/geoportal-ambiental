// =====================================================================
// Capas externas: servicios ArcGIS REST del IGAC, Parques Nacionales, etc.
// Se configuran en la tabla catalogo_capas (origen = 'arcgis' o 'arcgis_raster').
// No guardan nada en Supabase: se consultan en vivo.
// =====================================================================
(function () {
  const API = window.API;
  const TIMEOUT = 30000;
  let catalogo = [];
  const activas = new Map(); // capa -> { entry, capaMapa }
  const cacheCapas = {};

  const ROMANOS = { I: "1", II: "2", III: "3", IV: "4", V: "5", VI: "6", VII: "7", VIII: "8" };
  const esExterna = (e) => e && (e.origen === "arcgis" || e.origen === "arcgis_raster");
  const q = (obj) => new URLSearchParams(obj).toString();

  async function pedir(url, ms = TIMEOUT) {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), ms);
    try {
      const r = await fetch(url, { signal: c.signal });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const j = await r.json();
      if (j.error) throw new Error(j.error.message || "error del servicio");
      return j;
    } catch (e) {
      throw new Error(e.name === "AbortError" ? "el servidor tardó demasiado" : e.message);
    } finally { clearTimeout(t); }
  }

  // Añade nombre/clase normalizados según el catálogo
  function normalizar(entry, fc) {
    for (const f of fc.features || []) {
      const p = f.properties || (f.properties = {});
      const nom = entry.campo_nombre ? p[entry.campo_nombre] : null;
      let cla = entry.campo_clase ? p[entry.campo_clase] : null;
      if (cla !== null && cla !== undefined && entry.plantilla_clase) cla = entry.plantilla_clase.replace("{v}", ROMANOS[String(cla).trim().toUpperCase()] || String(cla).trim());
      p.nombre = nom ?? p.nombre ?? null;
      p.clase = cla ?? p.clase ?? nom ?? null;
    }
    return fc;
  }

  // Consulta de entidades (paginada) en formato GeoJSON
  async function consultar(entry, { bbox, punto, where = "1=1", geometria = true, simplificar = 0, max = 15000, campos = "*", ms = TIMEOUT } = {}) {
    const base = { where, outFields: campos, returnGeometry: geometria, outSR: 4326, f: "geojson", geometryPrecision: 6 };
    if (simplificar) base.maxAllowableOffset = simplificar;
    if (bbox) Object.assign(base, { geometry: bbox.join(","), geometryType: "esriGeometryEnvelope", inSR: 4326, spatialRel: "esriSpatialRelIntersects" });
    if (punto) Object.assign(base, { geometry: punto.join(","), geometryType: "esriGeometryPoint", inSR: 4326, spatialRel: "esriSpatialRelIntersects" });
    const pagina = 1000;
    let features = [], offset = 0;
    for (let i = 0; i < 20 && features.length < max; i++) {
      let j;
      try {
        j = await pedir(`${entry.servicio}/${entry.capa_id}/query?${q({ ...base, resultOffset: offset, resultRecordCount: pagina })}`, ms);
      } catch (e) {
        if (!/pagination/i.test(e.message) || offset) throw e;
        j = await pedir(`${entry.servicio}/${entry.capa_id}/query?${q(base)}`, ms); // servicios que no aceptan paginación
        features = j.features || []; break;
      }
      const fs = j.features || [];
      features = features.concat(fs);
      const excedido = j.exceededTransferLimit || j.properties?.exceededTransferLimit;
      if (!excedido || !fs.length) break;
      offset += fs.length;
    }
    return normalizar(entry, API.FC(features));
  }

  // Valor de un ráster en un punto (identify)
  async function valorRaster(entry, lng, lat, ms = 15000) {
    const p = { geometry: `${lng},${lat}`, geometryType: "esriGeometryPoint", sr: 4326, layers: `all:${entry.capa_id}`, tolerance: 0,
      mapExtent: [lng - 0.01, lat - 0.01, lng + 0.01, lat + 0.01].join(","), imageDisplay: "100,100,96", returnGeometry: false, f: "json" };
    const j = await pedir(`${entry.servicio}/identify?${q(p)}`, ms);
    const at = j.results?.[0]?.attributes || {};
    const k = Object.keys(at).find((x) => /pixel value/i.test(x));
    const v = k ? parseFloat(String(at[k]).replace(",", ".")) : NaN;
    return Number.isFinite(v) && v > 0 ? v : null;
  }

  // Respaldo cuando el IGAC no responde: límites de geoBoundaries (abiertos, en GitHub)
  const GB = "https://media.githubusercontent.com/media/wmgeolab/geoBoundaries/main/releaseData/gbOpen/COL/";
  const gbCache = {};
  const sinTildes = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  async function respaldo(nivel) {
    if (!gbCache[nivel]) gbCache[nivel] = fetch(`${GB}${nivel}/geoBoundaries-COL-${nivel}_simplified.geojson`).then((r) => r.json());
    return gbCache[nivel];
  }
  async function buscarRespaldo(txt) {
    const [mun, dep] = await Promise.all([respaldo("ADM2"), respaldo("ADM1")]);
    const t = sinTildes(txt);
    return mun.features.filter((f) => sinTildes(f.properties.shapeName).includes(t)).slice(0, 15).map((f) => {
      const c = turf.pointOnFeature(f);
      const d = dep.features.find((x) => turf.booleanPointInPolygon(c, x));
      return { etiqueta: `${f.properties.shapeName} (${d?.properties.shapeName || "Colombia"})`, feature: f };
    });
  }

  // Capa de mapa: imágenes del servicio (export) en teselas de 512 px
  const CapaExport = L.TileLayer.extend({
    initialize(entry, opts) { this._entry = entry; L.TileLayer.prototype.initialize.call(this, "", { tileSize: 512, opacity: 0.8, ...opts }); },
    getTileUrl(coords) {
      const b = this._tileCoordsToBounds(coords);
      const sw = L.CRS.EPSG3857.project(b.getSouthWest()), ne = L.CRS.EPSG3857.project(b.getNorthEast());
      const p = { bbox: [sw.x, sw.y, ne.x, ne.y].join(","), bboxSR: 3857, imageSR: 3857, size: "512,512", format: "png32", transparent: true, layers: `show:${this._entry.capa_id}`, dpi: 96, f: "image" };
      return `${this._entry.servicio}/export?${q(p)}`;
    },
  });

  // ---------------------------------------------------------------- API pública
  const Externas = {
    esExterna, consultar, valorRaster,

    async activar(entry, on, mapa) {
      const reg = activas.get(entry.capa);
      if (!on) { if (reg?.capaMapa) mapa.removeLayer(reg.capaMapa); activas.delete(entry.capa); return; }
      let capaMapa = reg?.capaMapa;
      if (!capaMapa && entry.origen === "arcgis") {
        capaMapa = new CapaExport(entry, { attribution: entry.fuente || "", zIndex: 350 + (entry.orden || 0) });
        capaMapa.on("tileerror", () => {});
      }
      if (capaMapa) capaMapa.addTo(mapa);
      activas.set(entry.capa, { entry, capaMapa });
    },

    // Consulta al hacer clic sobre el mapa
    async identificar(lng, lat) {
      const tareas = [...activas.values()].map(async ({ entry }) => {
        try {
          if (entry.origen === "arcgis_raster") {
            const v = await valorRaster(entry, lng, lat);
            return v === null ? null : { titulo: entry.titulo, props: { valor: v, unidad: entry.descripcion?.match(/\(([^)]*ha[^)]*)\)/)?.[1] || "" } };
          }
          const fc = await consultar(entry, { punto: [lng, lat], geometria: false, max: 5 });
          return fc.features.length ? { titulo: entry.titulo, props: fc.features[0].properties } : null;
        } catch (e) { return { titulo: entry.titulo, error: e.message }; }
      });
      return (await Promise.all(tareas)).filter(Boolean);
    },

    // Resumen por clase de todas las capas externas poligonales dentro del área
    async resumen(area) {
      const [xmin, ymin, xmax, ymax] = turf.bbox(area);
      const simp = Math.max(0.00005, Math.hypot(xmax - xmin, ymax - ymin) / 3000);
      const capas = [], errores = [];
      const entradas = catalogo.filter((e) => e.origen === "arcgis" && e.capa !== "departamentos");
      await Promise.all(entradas.map(async (entry) => {
        try {
          const fc = await consultar(entry, { bbox: [xmin, ymin, xmax, ymax], simplificar: simp, ms: 20000 });
          const acc = {};
          for (const f of API.recortarFC(fc, area).features) {
            if (!f.properties.area_ha) continue;
            const k = f.properties.clase || f.properties.nombre || "Sin clase";
            acc[k] = (acc[k] || 0) + f.properties.area_ha;
          }
          Object.entries(acc).sort((a, b) => b[1] - a[1]).forEach(([clase, a]) => capas.push({ capa: entry.capa, clase, area_ha: +a.toFixed(2) }));
        } catch (e) { errores.push(`${entry.titulo} (${e.message})`); }
      }));
      return { capas, errores };
    },

    // Muestreo del ráster de carbono dentro del área
    async muestrearCarbono(area, nObjetivo = 40) {
      const entry = catalogo.find((e) => e.origen === "arcgis_raster");
      if (!entry) return null;
      const areaKm2 = turf.area(area) / 1e6;
      const lado = Math.max(0.05, Math.sqrt(areaKm2 / nObjetivo));
      let pts = turf.pointGrid(turf.bbox(area), lado, { units: "kilometers", mask: area }).features;
      if (pts.length > 60) pts = pts.filter((_, i) => i % Math.ceil(pts.length / 60) === 0);
      if (pts.length < 3) pts.push(turf.pointOnFeature(area));
      const valores = [];
      let fallos = 0;
      for (let i = 0; i < pts.length; i += 6) {
        const lote = pts.slice(i, i + 6).map((p) => valorRaster(entry, ...p.geometry.coordinates, 8000).then((v) => ({ v }), () => ({ fallo: true })));
        const res = await Promise.all(lote);
        res.forEach((r) => (r.fallo ? fallos++ : valores.push(r.v)));
        if (i >= 6 && fallos >= i + 6 - 1 && !valores.some((x) => x !== null)) throw new Error("el servidor del IGAC no responde");
      }
      const v = valores.filter((x) => x !== null);
      if (!v.length) throw new Error("sin valores en el área");
      const media = v.reduce((s, x) => s + x, 0) / v.length;
      const area_ha = areaKm2 * 100;
      return { n: v.length, media, min: Math.min(...v), max: Math.max(...v), total_t: media * area_ha, co2e_t: (media * area_ha * 44) / 12 };
    },
  };
  window.Externas = Externas;

  // ---------------------------------------------------------------- integración con la capa de datos
  const origCatalogo = API.catalogo.bind(API);
  API.catalogo = async function () { catalogo = await origCatalogo(); return catalogo; };

  const origCapa = API.capa.bind(API);
  API.capa = async function (capa, opts = {}) {
    const entry = catalogo.find((e) => e.capa === capa);
    if (!esExterna(entry)) return origCapa(capa, opts);
    if (cacheCapas[capa]) return cacheCapas[capa];
    // Solo se descarga completa si es pequeña (departamentos); las demás se consultan por área
    try {
      const fc = await consultar(entry, { simplificar: opts.tolerancia || 0.005, max: 3000, ms: 12000 });
      if (!fc.features.length) throw new Error("sin datos");
      return (cacheCapas[capa] = fc);
    } catch (e) {
      if (capa !== "departamentos") throw e;
      window.__geoportal?.toast?.("El IGAC no responde; se usan límites de respaldo (geoBoundaries)");
      const gj = await respaldo("ADM1");
      gj.features.forEach((f) => { f.properties.nombre = f.properties.clase = f.properties.shapeName; });
      return (cacheCapas[capa] = gj);
    }
  };

  const origRecortar = API.recortar.bind(API);
  API.recortar = async function (capa, area) {
    const entry = catalogo.find((e) => e.capa === capa);
    if (!esExterna(entry)) return origRecortar(capa, area);
    if (entry.origen === "arcgis_raster") throw new Error("Esta capa es un ráster: su valor aparece en el análisis de área");
    const [xmin, ymin, xmax, ymax] = turf.bbox(area);
    return API.recortarFC(await consultar(entry, { bbox: [xmin, ymin, xmax, ymax], simplificar: 0.00005 }), area);
  };

  const origResumen = API.resumenArea.bind(API);
  API.resumenArea = async function (area) {
    const [base, ext, carb] = await Promise.all([
      origResumen(area).catch((e) => ({ area_ha: +(turf.area(area) / 10000).toFixed(2), capas: [], muestras_carbono: { n: 0 }, observaciones: { n: 0 }, error_base: e.message })),
      Externas.resumen(area),
      Externas.muestrearCarbono(area).catch((e) => ({ error: e.message })),
    ]);
    base.capas = (base.capas || []).concat(ext.capas);
    base.externas_errores = ext.errores;
    base.carbono_igac = carb;
    return base;
  };

  // ---------------------------------------------------------------- UI: búsqueda de municipios y consulta por clic
  const alCargar = (fn) => (document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", fn) : fn());
  alCargar(() => {
    const tarjeta = document.querySelector("#tab-analisis .card");
    if (tarjeta) {
      tarjeta.querySelector(".grid-btn").insertAdjacentHTML("beforebegin",
        `<div class="field"><label for="buscar-mpio">Buscar municipio (límites oficiales IGAC)</label>
         <input id="buscar-mpio" list="mpios-sug" placeholder="Ej: Choachí, Guasca, San José del Guaviare" autocomplete="off" />
         <datalist id="mpios-sug"></datalist></div>`);
      const input = document.querySelector("#buscar-mpio");
      const opciones = new Map();
      let t;
      input.addEventListener("input", () => {
        clearTimeout(t);
        const txt = input.value.trim();
        if (opciones.has(txt)) return seleccionar(txt);
        if (txt.length < 3) return;
        t = setTimeout(async () => {
          const entry = catalogo.find((e) => e.capa === "municipios" && esExterna(e));
          if (!entry) return;
          const limpio = txt.replace(/'/g, "''").split(" (")[0];
          let lista = [];
          try {
            const fc = await consultar(entry, { where: `UPPER(${entry.campo_nombre}) LIKE UPPER('%${limpio}%')`, geometria: false, max: 15, campos: "MpCodigo,MpNombre,Depto", ms: 8000 });
            lista = fc.features.map((f) => ({ etiqueta: `${f.properties.MpNombre} (${f.properties.Depto})`, codigo: f.properties.MpCodigo }));
          } catch (e) {
            try { lista = await buscarRespaldo(limpio); window.__geoportal?.toast?.("El IGAC no responde; se usan límites de respaldo (geoBoundaries)"); }
            catch (e2) { window.__geoportal?.toast?.("Búsqueda de municipios: " + e2.message, true); }
          }
          document.querySelector("#mpios-sug").innerHTML = lista.slice(0, 15).map((o) => {
            opciones.set(o.etiqueta, o);
            return `<option value="${o.etiqueta.replace(/"/g, "&quot;")}"></option>`;
          }).join("");
        }, 300);
      });
      input.addEventListener("change", () => opciones.has(input.value.trim()) && seleccionar(input.value.trim()));
      async function seleccionar(et) {
        const entry = catalogo.find((e) => e.capa === "municipios");
        const op = opciones.get(et);
        try {
          let geom = op.feature?.geometry;
          if (!geom) {
            try {
              const fc = await consultar(entry, { where: `MpCodigo='${op.codigo}'`, simplificar: 0.0001, max: 1, ms: 12000 });
              geom = fc.features[0]?.geometry;
            } catch (e) {
              const alt = (await buscarRespaldo(et.split(" (")[0])).find((o) => sinTildes(o.etiqueta).startsWith(sinTildes(et.split(" (")[0])));
              geom = alt?.feature.geometry;
              if (geom) window.__geoportal?.toast?.("El IGAC no responde; se usa el límite de respaldo (geoBoundaries)");
            }
          }
          if (!geom) throw new Error("no encontrado");
          window.__geoportal.fijarArea({ type: "Feature", geometry: geom, properties: {} }, et);
        } catch (e) { window.__geoportal?.toast?.("No se pudo cargar el municipio: " + e.message, true); }
      }
    }
  });

  // Consulta por clic (solo si no se está ubicando un punto o eligiendo departamento)
  let modoEspecial = false;
  const esperarMapa = setInterval(() => {
    const g = window.__geoportal;
    if (!g?.mapa) return;
    clearInterval(esperarMapa);
    g.mapa.on("preclick", () => { modoEspecial = !!g.mapa.getContainer().style.cursor; });
    g.mapa.on("click", async (e) => {
      if (modoEspecial || !activas.size) return;
      const popup = L.popup({ maxWidth: 320 }).setLatLng(e.latlng).setContent("Consultando capas…").openOn(g.mapa);
      const res = await Externas.identificar(e.latlng.lng, e.latlng.lat);
      if (!res.length) { popup.setContent("Sin datos de las capas activas en este punto."); return; }
      const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
      popup.setContent(res.map((r) => {
        if (r.error) return `<strong>${esc(r.titulo)}</strong><br><span style="color:#9a5b00">${esc(r.error)}</span>`;
        const filas = Object.entries(r.props).filter(([k, v]) => v !== null && v !== "" && typeof v !== "object" && !/objectid|shape|globalid|^st_/i.test(k))
          .slice(0, 10).map(([k, v]) => `<tr><td>${esc(k.replace(/_/g, " "))}</td><td>${esc(typeof v === "number" ? v.toLocaleString("es-CO", { maximumFractionDigits: 2 }) : v)}</td></tr>`).join("");
        return `<strong>${esc(r.titulo)}</strong><table>${filas}</table>`;
      }).join("<hr>"));
    });
  }, 300);
})();
