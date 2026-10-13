// =====================================================================
// Búsqueda con IA: la pregunta va a la Edge Function "buscar-ia", que devuelve un plan
// seguro (municipio / pestaña / taxón / analizar). Aquí se ejecuta ese plan usando los
// mismos controles que ya existen en la página.
// =====================================================================
(function () {
  const CFG = window.GEOPORTAL_CONFIG || {};
  const URL_IA = CFG.IA_URL || (CFG.SUPABASE_URL ? CFG.SUPABASE_URL.replace(/\/$/, "") + "/functions/v1/buscar-ia" : "");
  const $ = (s) => document.querySelector(s);
  const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
  const sinTildes = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const toast = (m, e) => window.__geoportal?.toast?.(m, e);

  function montar() {
    const panel = document.querySelector(".panel");
    if (!panel || $("#ia-card")) return;
    panel.insertAdjacentHTML("afterbegin", `
      <form id="ia-card" class="ia-card" autocomplete="off">
        <label for="ia-pregunta">Pregunte al geoportal</label>
        <div class="ia-fila">
          <input id="ia-pregunta" maxlength="300" placeholder="Ej: ¿Cuánto carbono tiene Choachí? · osos en Santander" />
          <button class="btn" id="ia-enviar" type="submit">Buscar</button>
        </div>
        <p id="ia-respuesta" class="muted" aria-live="polite"></p>
      </form>`);
    $("#ia-card").addEventListener("submit", (e) => { e.preventDefault(); preguntar(); });
  }

  // Espera a que aparezca una opción en un datalist
  async function esperarOpcion(idLista, texto, ms = 9000) {
    const t0 = Date.now(), q = sinTildes(texto);
    while (Date.now() - t0 < ms) {
      const op = [...document.querySelectorAll(`#${idLista} option`)].find((o) => sinTildes(o.value).startsWith(q));
      if (op) return op.value;
      await dormir(250);
    }
    return null;
  }

  async function irMunicipio(nombre) {
    const input = $("#buscar-mpio");
    if (!input) return false;
    $('.tab[data-tab="analisis"]')?.click();
    input.value = nombre;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    const valor = await esperarOpcion("mpios-sug", nombre);
    if (!valor) return false;
    input.value = valor;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  async function irTaxon(nombre) {
    const input = $("#gbif-taxon");
    if (!input) return false;
    $('.tab[data-tab="bio"]')?.click();
    const on = $("#gbif-on"); if (on && !on.checked) { on.checked = true; on.dispatchEvent(new Event("change")); }
    input.value = nombre;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    const valor = await esperarOpcion("gbif-sugerencias", nombre, 6000);
    if (!valor) return false;
    input.value = valor;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  async function analizarCuandoListo() {
    const t0 = Date.now();
    while (Date.now() - t0 < 20000) {
      const b = $("#btn-analizar");
      if (b && !b.disabled) { b.click(); return true; }
      await dormir(300);
    }
    return false;
  }

  let ocupado = false;
  async function preguntar() {
    const q = $("#ia-pregunta").value.trim();
    const salida = $("#ia-respuesta");
    if (q.length < 3 || ocupado) return;
    if (!URL_IA) { salida.textContent = "La búsqueda con IA no está configurada."; return; }
    ocupado = true; $("#ia-enviar").disabled = true; salida.textContent = "Pensando…";
    try {
      const r = await fetch(URL_IA, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: CFG.SUPABASE_ANON_KEY, Authorization: "Bearer " + CFG.SUPABASE_ANON_KEY },
        body: JSON.stringify({ pregunta: q }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Error " + r.status);
      salida.textContent = d.respuesta;
      const a = d.acciones || {};
      let fallo = "";
      if (a.taxon && !(await irTaxon(a.taxon))) fallo += `No encontré el taxón «${a.taxon}» en GBIF. `;
      if (a.municipio) {
        if (await irMunicipio(a.municipio)) { if (a.analizar) await analizarCuandoListo(); }
        else fallo += `No encontré el municipio «${a.municipio}». `;
      }
      if (a.tab && !a.municipio) $(`.tab[data-tab="${a.tab}"]`)?.click();
      if (fallo) salida.textContent += " · " + fallo.trim();
    } catch (e) {
      salida.textContent = "No se pudo completar la búsqueda: " + e.message;
      toast("Búsqueda con IA: " + e.message, true);
    } finally { ocupado = false; $("#ia-enviar").disabled = false; }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", montar); else montar();
})();
