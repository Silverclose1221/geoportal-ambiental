// =====================================================================
// Aviso de privacidad (Ley 1581 de 2012) y panel «Mis datos»:
// ver/editar el perfil, exportar y borrar los propios registros, eliminar la cuenta.
// Todo se hace con la sesión de la persona y las políticas RLS; la eliminación de la cuenta
// la ejecuta la Edge Function "eliminar-cuenta", que identifica a la persona por su token.
// =====================================================================
(function () {
  const CFG = window.GEOPORTAL_CONFIG || {};
  const $ = (s) => document.querySelector(s);
  const KEY_PENDIENTE = "geoportal_acepto_pendiente";
  const toast = (m, e) => window.__geoportal?.toast?.(m, e);
  const API = () => window.__geoportal?.API;
  const fecha = (iso) => (iso ? new Date(iso).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" }) : "—");
  let version = 0; // evita que respuestas viejas pinten el panel

  // ---------- textos del aviso que dependen de la configuración
  function pintarAviso() {
    const r = $("#priv-responsable"), c = $("#priv-contacto");
    if (r) r.textContent = CFG.RESPONSABLE_DATOS || "Responsable del proyecto Geoportal Ambiental de Colombia (GitHub: Silverclose1221)";
    if (c) {
      c.textContent = "";
      const mail = CFG.CONTACTO_PRIVACIDAD_EMAIL;
      const a = document.createElement("a");
      a.rel = "noopener noreferrer"; a.target = "_blank";
      if (mail) { a.href = "mailto:" + mail; a.textContent = mail; a.removeAttribute("target"); c.append("Correo: ", a, " · o abra un «issue» sin datos sensibles en el repositorio del proyecto."); }
      else { a.href = "https://github.com/Silverclose1221/geoportal-ambiental/issues"; a.textContent = "github.com/Silverclose1221/geoportal-ambiental/issues"; c.append("Abra una solicitud en ", a, " (no incluya datos sensibles) o use el panel «Mis datos»."); }
    }
  }

  // ---------- abrir diálogos
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-abrir]");
    if (!b) return;
    e.preventDefault();
    const d = $("#dlg-" + b.dataset.abrir);
    if (d && !d.open) { if (b.dataset.abrir === "misdatos") abrirMisDatos(); else d.showModal(); }
  });
  document.addEventListener("click", (e) => { // cerrar al hacer clic fuera del cuadro
    if (e.target instanceof HTMLDialogElement && e.target.classList.contains("ancho")) e.target.close();
  });

  // ---------- consentimiento al iniciar sesión (lo exige app.js antes de llamar a login)
  window.__consentimiento = {
    pedir() { // marca que la persona aceptó el aviso; se registra en su perfil al volver de iniciar sesión
      try { localStorage.setItem(KEY_PENDIENTE, new Date().toISOString()); } catch { /* sin almacenamiento */ }
    },
  };

  async function registrarConsentimientoPendiente() {
    const a = API(); if (!a?.sb || !a.usuario) return;
    let pendiente = null;
    try { pendiente = localStorage.getItem(KEY_PENDIENTE); } catch { /* */ }
    if (!pendiente) return;
    const { error } = await a.sb.from("perfiles").update({ acepta_datos_at: pendiente }).eq("id", a.usuario.id).is("acepta_datos_at", null);
    if (!error) { try { localStorage.removeItem(KEY_PENDIENTE); } catch { /* */ } }
  }

  // ---------- botón «Mis datos» en la barra superior
  function actualizarBoton() {
    const a = API(), b = $("#btn-misdatos");
    if (b) b.hidden = !(a?.sb && a.usuario);
  }
  document.addEventListener("auth-cambio", () => { actualizarBoton(); registrarConsentimientoPendiente(); });

  // ---------- panel Mis datos
  const dlg = () => $("#dlg-misdatos");
  async function abrirMisDatos() {
    const a = API(); if (!a?.sb || !a.usuario) { toast("Inicie sesión para ver sus datos.", true); return; }
    dlg().showModal();
    await cargar();
  }

  async function cargar() {
    const a = API(), u = a.usuario, mi = ++version;
    $("#md-cuenta").textContent = [u.email, u.user_metadata?.user_name && "GitHub: " + u.user_metadata.user_name].filter(Boolean).join(" · ") || "Sesión iniciada";
    $("#md-estado").textContent = "Cargando…";
    await registrarConsentimientoPendiente();
    const [p, o, m] = await Promise.all([
      a.sb.from("perfiles").select("nombre,institucion,acepta_datos_at,creado_en").eq("id", u.id).maybeSingle(),
      a.sb.from("observaciones_biodiversidad").select("id", { count: "exact", head: true }).eq("user_id", u.id),
      a.sb.from("muestras_carbono").select("id", { count: "exact", head: true }).eq("user_id", u.id),
    ]);
    if (mi !== version) return;
    if (p.error) { $("#md-estado").textContent = "No se pudo leer el perfil: " + p.error.message; return; }
    const perfil = p.data || {};
    const f = $("#form-perfil");
    f.nombre.value = perfil.nombre || ""; f.institucion.value = perfil.institucion || "";
    $("#md-consent").textContent = perfil.acepta_datos_at ? "Aviso de privacidad aceptado el " + fecha(perfil.acepta_datos_at) : "Aún no ha aceptado el aviso de privacidad.";
    $("#md-aceptar").hidden = !!perfil.acepta_datos_at;
    $("#md-n-obs").textContent = o.count ?? "—";
    $("#md-n-mue").textContent = m.count ?? "—";
    $("#md-estado").textContent = "";
  }

  document.addEventListener("submit", async (e) => {
    if (e.target.id !== "form-perfil") return;
    e.preventDefault();
    const a = API(), f = e.target;
    const v = (x) => (x.value.trim().slice(0, 120) || null);
    const { error } = await a.sb.from("perfiles").upsert({ id: a.usuario.id, nombre: v(f.nombre), institucion: v(f.institucion) });
    if (error) toast("No se pudo guardar: " + error.message, true); else toast("Perfil actualizado");
  });

  document.addEventListener("click", async (e) => {
    const a = API();
    if (e.target.id === "md-aceptar") {
      const { error } = await a.sb.from("perfiles").upsert({ id: a.usuario.id, acepta_datos_at: new Date().toISOString() });
      if (error) toast("No se pudo registrar: " + error.message, true); else { toast("Aceptación registrada"); cargar(); }
    }
    if (e.target.id === "md-exportar") exportar();
    if (e.target.id === "md-borrar-registros") confirmar(e.target, "¿Seguro? Clic otra vez para borrar", borrarRegistros);
    if (e.target.id === "md-eliminar") eliminarCuenta();
  });
  document.addEventListener("input", (e) => {
    if (e.target.id === "md-confirmar") $("#md-eliminar").disabled = e.target.value.trim().toUpperCase() !== "ELIMINAR";
  });

  // Confirmación en dos clics (sin ventanas emergentes del navegador)
  function confirmar(btn, texto, accion) {
    if (btn.dataset.listo === "1") { delete btn.dataset.listo; btn.textContent = btn.dataset.txt; accion(); return; }
    btn.dataset.txt = btn.textContent; btn.dataset.listo = "1"; btn.textContent = texto;
    setTimeout(() => { if (btn.dataset.listo === "1") { delete btn.dataset.listo; btn.textContent = btn.dataset.txt; } }, 5000);
  }

  async function exportar() {
    const a = API(), u = a.usuario;
    try {
      const [p, o, m] = await Promise.all([
        a.sb.from("perfiles").select("nombre,institucion,acepta_datos_at,creado_en,actualizado_en").eq("id", u.id).maybeSingle(),
        a.sb.from("observaciones_biodiversidad").select("especie,nombre_comun,grupo,individuos,fecha,categoria_uicn,gbif_taxon_key,lat,lon,observaciones,created_at").eq("user_id", u.id),
        a.sb.from("muestras_carbono").select("codigo,fecha_muestreo,municipio,departamento,cobertura,metodo_cos,lat,lon,prof_sup_cm,prof_inf_cm,cos_pct,densidad_aparente,pedregosidad_pct,stock_cos_tha,co2e_tha,observaciones,created_at").eq("user_id", u.id),
      ]);
      for (const r of [p, o, m]) if (r.error) throw r.error;
      const datos = {
        exportado_en: new Date().toISOString(),
        cuenta: { id: u.id, correo: u.email || null, proveedor: u.app_metadata?.provider || null, usuario_github: u.user_metadata?.user_name || null },
        perfil: p.data, observaciones: o.data, muestras_carbono: m.data,
      };
      const url = URL.createObjectURL(new Blob([JSON.stringify(datos, null, 2)], { type: "application/json" }));
      const l = document.createElement("a"); l.href = url; l.download = "mis-datos-geoportal.json"; document.body.append(l); l.click(); l.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (err) { toast("No se pudo exportar: " + (err.message || err), true); }
  }

  async function borrarRegistros() {
    const a = API(), id = a.usuario.id;
    const r1 = await a.sb.from("observaciones_biodiversidad").delete().eq("user_id", id);
    const r2 = await a.sb.from("muestras_carbono").delete().eq("user_id", id);
    if (r1.error || r2.error) toast("No se pudo borrar: " + (r1.error || r2.error).message, true);
    else { toast("Sus registros fueron borrados. Recargue el mapa para verlo."); cargar(); }
  }

  async function eliminarCuenta() {
    const a = API();
    const btn = $("#md-eliminar"); btn.disabled = true; btn.textContent = "Eliminando…";
    try {
      const { data } = await a.sb.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) throw new Error("Sesión vencida; vuelva a iniciar sesión.");
      const r = await fetch(CFG.SUPABASE_URL.replace(/\/$/, "") + "/functions/v1/eliminar-cuenta", {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: CFG.SUPABASE_ANON_KEY, Authorization: "Bearer " + token },
        body: JSON.stringify({ conservar_registros: $("#md-conservar").checked }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Error " + r.status);
      await a.sb.auth.signOut().catch(() => {});
      dlg().close();
      toast("Su cuenta fue eliminada.");
    } catch (err) {
      toast(err.message || String(err), true);
      btn.textContent = "Eliminar mi cuenta definitivamente"; btn.disabled = $("#md-confirmar").value.trim().toUpperCase() !== "ELIMINAR";
    }
  }

  pintarAviso();
  // app.js inicia la API de forma asíncrona: espera a que esté lista (máx. ~30 s) y entonces actualiza el botón
  let intentos = 0;
  const espera = setInterval(() => {
    if (API() || ++intentos > 60) { clearInterval(espera); actualizarBoton(); registrarConsentimientoPendiente(); }
  }, 500);
})();
