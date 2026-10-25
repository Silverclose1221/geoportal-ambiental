// Edge Function: eliminar-cuenta
// Permite que una persona con sesión iniciada elimine su propia cuenta (derecho de supresión, Ley 1581 de 2012).
// - Identifica a la persona SOLO por su token de sesión (Authorization: Bearer <access_token>); nunca por datos del cuerpo.
// - Con { conservar_registros: true } sus observaciones y muestras quedan sin autor (user_id = null); si no, se borran.
// - Usa la clave de servicio que Supabase inyecta como secreto del entorno (SUPABASE_SERVICE_ROLE_KEY); no sale de la función.
// - verify_jwt=false porque la función valida el token por su cuenta con auth.getUser().
import { createClient } from "npm:@supabase/supabase-js@2";

const ORIGEN = Deno.env.get("ALLOWED_ORIGIN") ?? "https://silverclose1221.github.io";
const cors = {
  "Access-Control-Allow-Origin": ORIGEN,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "Inicie sesión." }, 401);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return json({ error: "Sesión no válida." }, 401);
  const id = data.user.id;

  let conservar = false;
  try { conservar = (await req.json())?.conservar_registros === true; } catch { /* sin cuerpo */ }

  try {
    for (const tabla of ["observaciones_biodiversidad", "muestras_carbono"]) {
      const q = conservar ? admin.from(tabla).update({ user_id: null }).eq("user_id", id) : admin.from(tabla).delete().eq("user_id", id);
      const { error: e } = await q;
      if (e) throw e;
    }
    const { error: e2 } = await admin.auth.admin.deleteUser(id); // el perfil se borra en cascada
    if (e2) throw e2;
    return json({ ok: true });
  } catch (e) {
    console.error("eliminar-cuenta:", (e as Error).message); // el detalle queda en los logs
    return json({ error: "No se pudo eliminar la cuenta. Intente de nuevo o escriba al responsable." }, 500);
  }
});
