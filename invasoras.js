// Fichas de especies invasoras (datos: api-colombia.com, API pública sin clave).
// Se cargan solo al abrir el diálogo. Todo el texto se inserta con textContent (sin innerHTML).
(() => {
  "use strict";
  const URL_API = "https://api-colombia.com/api/v1/InvasiveSpecie";
  const $ = (s) => document.querySelector(s);
  let datos = null, cargando = false;

  function ficha(e) {
    const det = document.createElement("details");
    det.className = "inv-ficha";
    const sum = document.createElement("summary");
    const n = document.createElement("strong"); n.textContent = e.name || "Sin nombre";
    const ci = document.createElement("em"); ci.textContent = " " + (e.scientificName || "");
    const r = document.createElement("span"); r.className = "inv-riesgo"; r.textContent = "Riesgo " + (e.riskLevel ?? "—");
    sum.append(n, ci, r);
    det.append(sum);
    const campos = [["Nombres comunes", e.commonNames], ["Impacto", e.impact], ["Manejo recomendado", e.manage]];
    for (const [t, v] of campos) {
      if (!v) continue;
      const p = document.createElement("p");
      const b = document.createElement("strong"); b.textContent = t + ": ";
      p.append(b, String(v));
      det.append(p);
    }
    return det;
  }

  function pintar() {
    const lista = $("#inv-lista"); if (!lista || !datos) return;
    const q = ($("#inv-buscar").value || "").trim().toLowerCase();
    const nivel = $("#inv-nivel").value;
    const f = datos.filter((e) =>
      (!nivel || String(e.riskLevel) === nivel) &&
      (!q || [e.name, e.scientificName, e.commonNames].some((x) => String(x || "").toLowerCase().includes(q))));
    lista.textContent = "";
    f.forEach((e) => lista.append(ficha(e)));
    $("#inv-estado").textContent = f.length + " de " + datos.length + " especies";
  }

  async function cargar() {
    if (datos || cargando) return;
    cargando = true;
    const est = $("#inv-estado"); est.textContent = "Cargando…";
    try {
      const r = await fetch(URL_API, { signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw new Error(String(r.status));
      const d = await r.json();
      if (!Array.isArray(d)) throw new Error("formato");
      datos = d.sort((a, b) => String(a.name).localeCompare(String(b.name), "es"));
      const niveles = [...new Set(datos.map((e) => e.riskLevel).filter((x) => x != null))].sort();
      const sel = $("#inv-nivel");
      niveles.forEach((n) => { const o = document.createElement("option"); o.value = String(n); o.textContent = "Riesgo " + n; sel.append(o); });
      pintar();
    } catch { est.textContent = "No se pudo cargar la lista. Intente más tarde."; }
    finally { cargando = false; }
  }

  // ---------- se monta solo: estilos, botón y diálogo (no depende de index.html)
  function montar() {
    if ($("#dlg-invasoras")) return;
    const st = document.createElement("style");
    st.textContent = `.inv-filtros { display: flex; gap: 8px; margin: 8px 0; }
.inv-filtros input { flex: 1; }
.inv-ficha { border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; margin: 6px 0; font-size: 13px; }
.inv-ficha summary { cursor: pointer; display: flex; flex-wrap: wrap; gap: 6px; align-items: baseline; }
.inv-ficha summary em { color: var(--text-2); }
.inv-riesgo { margin-left: auto; font-size: 11.5px; padding: 1px 8px; border-radius: 99px; border: 1px solid var(--border); }
.inv-ficha p { margin: 6px 0; line-height: 1.5; }`;
    document.head.append(st);
    const barra = document.querySelector(".top-actions");
    if (barra) {
      const b = document.createElement("button");
      b.id = "btn-invasoras"; b.type = "button"; b.className = "btn btn-ghost"; b.textContent = "Especies invasoras";
      barra.insertBefore(b, $("#btn-misdatos") || $("#btn-login") || null);
      b.addEventListener("click", () => { $("#dlg-invasoras").showModal(); cargar(); });
    }
    const d = document.createElement("dialog");
    d.id = "dlg-invasoras"; d.className = "ancho"; d.setAttribute("aria-labelledby", "inv-titulo");
    d.innerHTML = `<div class="dlg-cab"><h2 id="inv-titulo">Especies invasoras de Colombia</h2><form method="dialog"><button class="btn btn-ghost" aria-label="Cerrar">Cerrar</button></form></div>
      <div class="dlg-cuerpo">
        <p class="muted">Fuente: <a href="https://api-colombia.com" target="_blank" rel="noopener noreferrer">api-colombia.com</a>. Información de referencia; no es un registro oficial de presencia en su zona.</p>
        <div class="inv-filtros">
          <input id="inv-buscar" type="search" placeholder="Buscar por nombre común o científico" aria-label="Buscar especie" maxlength="80" />
          <select id="inv-nivel" aria-label="Nivel de riesgo"><option value="">Todos los niveles</option></select>
        </div>
        <p class="muted" id="inv-estado" aria-live="polite"></p>
        <div id="inv-lista"></div>
      </div>`;
    document.body.append(d);
    d.addEventListener("click", (e) => { if (e.target === d) d.close(); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", montar); else montar();
  document.addEventListener("input", (e) => { if (e.target.id === "inv-buscar" || e.target.id === "inv-nivel") pintar(); });
})();
