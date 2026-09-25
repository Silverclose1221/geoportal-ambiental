// =====================================================================
// Capa de datos: Supabase (PostGIS) o modo demo (navegador)
// =====================================================================
(function () {
  const CFG = window.GEOPORTAL_CONFIG;
  const FC = (features = []) => ({ type: "FeatureCollection", features });
  const DEMO_KEY = "geoportal_demo_v1";

  // ---------- cálculo de carbono (mismo criterio que la columna generada en SQL)
  function calcularStock({ cos_pct, densidad_aparente, prof_sup_cm = 0, prof_inf_cm, pedregosidad_pct = 0 }) {
    const cos = +cos_pct, da = +densidad_aparente, sup = +prof_sup_cm || 0, inf = +prof_inf_cm, ped = +pedregosidad_pct || 0;
    if (!(cos >= 0) || !(da > 0) || !(inf > sup) || !(ped >= 0 && ped < 100)) return null;
    const espesor = inf - sup;
    const stock = cos * da * espesor * (1 - ped / 100);
    return { espesor_cm: espesor, stock_cos_tha: +stock.toFixed(2), co2e_tha: +(stock * 44 / 12).toFixed(2) };
  }

  // ---------- almacenamiento demo (solo este navegador)
  function demoLeer() {
    try { return JSON.parse(localStorage.getItem(DEMO_KEY)) || { muestras: [], observaciones: [] }; }
    catch { return { muestras: [], observaciones: [] }; }
  }
  function demoGuardar(d) { try { localStorage.setItem(DEMO_KEY, JSON.stringify(d)); } catch {} }
  const puntoFeature = (obj) => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: [+obj.lon, +obj.lat] },
    properties: { ...obj },
  });

  // ---------- recorte en el navegador (modo demo y capas propias)
  function areaHa(f) { return +(turf.area(f) / 10000).toFixed(2); }
  function recortarFC(fc, area) {
    const out = [];
    for (const f of fc.features || []) {
      if (!f.geometry) continue;
      const t = f.geometry.type;
      try {
        if (t === "Point") {
          if (turf.booleanPointInPolygon(f, area)) out.push(f);
        } else if (t === "MultiPoint") {
          const pts = f.geometry.coordinates.filter((c) => turf.booleanPointInPolygon(turf.point(c), area));
          if (pts.length) out.push({ ...f, geometry: { type: "MultiPoint", coordinates: pts } });
        } else if (t.includes("Polygon")) {
          const inter = turf.intersect(turf.featureCollection([f, area]));
          if (inter) out.push({ type: "Feature", geometry: inter.geometry, properties: { ...f.properties, area_ha: areaHa(inter) } });
        } else if (t.includes("LineString")) {
          if (turf.booleanIntersects(f, area)) out.push(f); // líneas: se conservan completas
        }
      } catch (e) { console.warn("No se pudo recortar una entidad", e); }
    }
    return FC(out);
  }

  const API = {
    modo: "demo",
    sb: null,
    usuario: null,
    capasLocales: {}, // capa -> FeatureCollection (demo y capas propias)
    calcularStock,
    recortarFC,
    FC,

    async init() {
      if (CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY && window.supabase) {
        try {
          this.sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
          const { error } = await this.sb.from("catalogo_capas").select("capa").limit(1);
          if (error) throw error;
          this.modo = "supabase";
          const { data } = await this.sb.auth.getSession();
          this.usuario = data?.session?.user || null;
          this.sb.auth.onAuthStateChange((_e, s) => { this.usuario = s?.user || null; document.dispatchEvent(new Event("auth-cambio")); });
        } catch (e) {
          console.error("Supabase no disponible, se usa modo demo:", e);
          this.sb = null; this.modo = "demo";
          this.errorConexion = e.message || String(e);
        }
      }
      return this.modo;
    },

    // ---------- autenticación (enlace mágico por correo)
    async login(email) {
      if (!this.sb) throw new Error("Configure Supabase para iniciar sesión.");
      const { error } = await this.sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.href.split("#")[0] } });
      if (error) throw error;
    },
    async logout() { if (this.sb) await this.sb.auth.signOut(); },

    // ---------- catálogo, normas
    async catalogo() {
      if (this.sb) {
        const { data, error } = await this.sb.from("catalogo_capas").select("*").order("orden");
        if (error) throw error; return data;
      }
      return (await fetch("catalogo.json")).json();
    },
    async politicas() {
      if (this.sb) {
        const { data, error } = await this.sb.from("politicas").select("*").order("anio", { ascending: false });
        if (error) throw error; return data;
      }
      return (await fetch("politicas.json")).json();
    },

    // ---------- capas vectoriales
    async capa(capa, { tolerancia = 0, bbox = null } = {}) {
      if (this.capasLocales[capa]) return this.capasLocales[capa];
      if (this.sb) {
        const { data, error } = await this.sb.rpc("capa_geojson", { p_capa: capa, p_tolerancia: tolerancia, p_bbox: bbox });
        if (error) throw error;
        return data || FC();
      }
      if (capa === "departamentos") {
        const r = await fetch(CFG.LIMITES_DEPTOS_DEMO);
        if (!r.ok) throw new Error("No se pudieron descargar los límites departamentales");
        const gj = await r.json();
        gj.features.forEach((f) => { f.properties = { nombre: f.properties.shapeName, clase: f.properties.shapeName, fuente: "geoBoundaries" }; });
        this.capasLocales[capa] = gj;
        return gj;
      }
      return FC(); // en demo, las capas oficiales se cargan en Supabase
    },

    // ---------- puntos
    async muestras() {
      if (this.sb) {
        const { data, error } = await this.sb.rpc("muestras_geojson");
        if (error) throw error; return data || FC();
      }
      return FC(demoLeer().muestras.map(puntoFeature));
    },
    async observaciones() {
      if (this.sb) {
        const { data, error } = await this.sb.rpc("observaciones_geojson");
        if (error) throw error; return data || FC();
      }
      return FC(demoLeer().observaciones.map(puntoFeature));
    },
    async guardarMuestras(filas) {
      filas = filas.map((f) => limpiar(f, ["codigo","fecha_muestreo","municipio","departamento","cobertura","metodo_cos","lon","lat","prof_sup_cm","prof_inf_cm","cos_pct","densidad_aparente","pedregosidad_pct","observaciones"]));
      for (const f of filas) {
        if (!calcularStock(f)) throw new Error(`Muestra ${f.codigo || ""}: valores inválidos (revise COS, DA y profundidades)`);
        if (!(f.lat >= -4.3 && f.lat <= 13.5 && f.lon >= -82 && f.lon <= -66)) throw new Error(`Muestra ${f.codigo || ""}: coordenadas fuera de Colombia`);
      }
      if (this.sb) {
        if (!this.usuario) throw new Error("Inicie sesión para guardar en la base de datos.");
        const { error } = await this.sb.from("muestras_carbono").insert(filas);
        if (error) throw error; return;
      }
      const d = demoLeer();
      filas.forEach((f) => d.muestras.push({ id: Date.now() + Math.random(), ...f, ...calcularStock(f) }));
      demoGuardar(d);
    },
    async guardarObservacion(obs) {
      obs = limpiar(obs, ["especie","nombre_comun","grupo","individuos","fecha","categoria_uicn","gbif_taxon_key","lon","lat","observaciones"]);
      if (this.sb) {
        if (!this.usuario) throw new Error("Inicie sesión para guardar en la base de datos.");
        const { error } = await this.sb.from("observaciones_biodiversidad").insert(obs);
        if (error) throw error; return;
      }
      const d = demoLeer(); d.observaciones.push({ id: Date.now(), ...obs }); demoGuardar(d);
    },

    // ---------- análisis espacial
    async recortar(capa, area) {
      if (this.capasLocales[capa] || !this.sb) return recortarFC(await this.capa(capa), area);
      const { data, error } = await this.sb.rpc("recortar_capa", { p_capa: capa, p_geom: area.geometry || area });
      if (error) throw error; return data || FC();
    },
    async resumenArea(area, capasPoligonales = []) {
      if (this.sb) {
        const { data, error } = await this.sb.rpc("resumen_area", { p_geom: area.geometry || area });
        if (error) throw error;
        // añadir capas propias (solo navegador)
        for (const [capa, fc] of Object.entries(this.capasLocales)) if (capa.startsWith("propia:")) data.capas.push(...resumenCapaLocal(capa, fc, area));
        return data;
      }
      const area_ha = areaHa(area);
      const capas = [];
      for (const capa of Object.keys(this.capasLocales)) capas.push(...resumenCapaLocal(capa, this.capasLocales[capa], area));
      const ms = recortarFC(await this.muestras(), area).features.map((f) => +f.properties.stock_cos_tha);
      const co = recortarFC(await this.muestras(), area).features.map((f) => +f.properties.co2e_tha);
      const obs = recortarFC(await this.observaciones(), area).features;
      const media = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
      const sd = (a) => { if (a.length < 2) return null; const m = media(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
      const m = media(ms);
      return {
        area_ha, capas,
        muestras_carbono: {
          n: ms.length, stock_medio_tha: m && +m.toFixed(2), stock_min_tha: ms.length ? Math.min(...ms) : null,
          stock_max_tha: ms.length ? Math.max(...ms) : null, desv_tha: sd(ms) && +sd(ms).toFixed(2),
          co2e_medio_tha: media(co) && +media(co).toFixed(2),
          carbono_total_t: m && Math.round(m * area_ha), co2e_total_t: media(co) && Math.round(media(co) * area_ha),
        },
        observaciones: { n: obs.length, especies: new Set(obs.map((f) => f.properties.especie)).size },
        nota: "Carbono total = stock medio de las muestras dentro del área × área. Válido solo si las muestras representan el área.",
      };
    },
  };

  function resumenCapaLocal(capa, fc, area) {
    const acc = {};
    for (const f of recortarFC(fc, area).features) {
      if (!f.properties.area_ha) continue;
      const k = f.properties.clase || f.properties.nombre || "Sin clase";
      acc[k] = (acc[k] || 0) + f.properties.area_ha;
    }
    return Object.entries(acc).map(([clase, a]) => ({ capa, clase, area_ha: +a.toFixed(2) })).sort((a, b) => b.area_ha - a.area_ha);
  }

  function limpiar(obj, campos) {
    const o = {};
    for (const c of campos) {
      let v = obj[c];
      if (v === undefined || v === null || v === "") continue;
      if (["lon","lat","prof_sup_cm","prof_inf_cm","cos_pct","densidad_aparente","pedregosidad_pct","individuos","gbif_taxon_key"].includes(c)) {
        v = +String(v).replace(",", ".");
        if (Number.isNaN(v)) continue;
      }
      o[c] = v;
    }
    return o;
  }

  window.API = API;
})();
