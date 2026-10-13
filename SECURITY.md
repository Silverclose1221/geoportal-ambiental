# Seguridad del geoportal

## Qué hay y qué no hay en el repositorio (público)
- ✅ `SUPABASE_ANON_KEY` (clave *publishable*): es pública por diseño; **la protección real son las políticas RLS**.
- ❌ Nunca: `service_role`, contraseña de la base, cadena de conexión, claves de IA (Gemini/Claude). Las claves de IA viven solo en los secretos de Supabase (`supabase secrets set`).

## Verificar RLS (hacerlo una vez y tras cada tabla nueva)
En el SQL Editor de Supabase:
```sql
select tablename, rowsecurity from pg_tables where schemaname = 'public' and tablename <> 'spatial_ref_sys';
```
Toda tabla con datos propios debe tener `rowsecurity = true`. Tablas escribibles (muestras, observaciones): política de `insert/update/delete` solo para `auth.uid() = user_id`.
(`spatial_ref_sys` es de PostGIS y no es dato del proyecto.)

## Búsqueda con IA (Edge Function `buscar-ia`)
- La IA solo devuelve un plan JSON validado (municipio, pestaña, taxón, analizar); **no ejecuta SQL ni código**.
- CORS limitado a `ALLOWED_ORIGIN`; límite de uso por IP (`MAX_POR_HORA`); pregunta de 3 a 300 caracteres.
- Los errores del proveedor quedan en los logs de Supabase, no se devuelven al navegador.
- Texto de la IA se pinta con `textContent`, nunca con `innerHTML`.
- Revisar el panel de gasto del proveedor de IA y poner un tope mensual.

## Defensas del front-end
- Todo dato externo (catálogo, normas, propiedades de capas, GBIF) pasa por `esc()` antes de entrar a HTML.
- Colores del catálogo validados (`colorSeguro`) y URLs de normas limitadas a `http(s)` (`urlSegura`).
- Enlaces externos con `rel="noopener noreferrer"`.
- CSP mínima en `index.html` (`object-src 'none'; base-uri 'self'; form-action 'self'`) y `referrer` restringido.

## Pendiente recomendado (no aplicado porque requiere probar en el navegador real)
1. **CSP estricta de scripts**: `script-src 'self' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net 'wasm-unsafe-eval'; worker-src 'self' blob:`. Probar con la consola abierta que ninguna capa se rompa antes de dejarla.
2. **SRI** (`integrity="sha384-…" crossorigin="anonymous"`) en los `<script>` de CDN y fijar versión exacta de `@supabase/supabase-js` (hoy `@2`, flotante). Hash: `curl -s URL | openssl dgst -sha384 -binary | openssl base64 -A`.
3. Activar *secret scanning* y *Dependabot* en el repositorio de GitHub.

## Reportar un problema
Abrir un *issue* sin datos sensibles o escribir al mantenedor del repositorio.
