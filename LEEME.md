# Búsqueda con IA para el Geoportal — pasos

Contenido: `ia.js` (nuevo), `index.html` y `styles.css` (modificados), `supabase/functions/buscar-ia/index.ts` (nuevo).

## 1. Subir los archivos a GitHub (repo geoportal-ambiental)
Reemplaza `index.html` y `styles.css`, y agrega `ia.js` y la carpeta `supabase/`. GitHub Pages se actualiza solo.

## 2. Clave del modelo (elige UNA)
- Gemini (capa gratis): crea una clave en https://aistudio.google.com/apikey
- Claude (de pago por uso): https://console.anthropic.com

## 3. Desplegar la función (en tu PC, con Supabase CLI)
```
supabase login
supabase link --project-ref imbezkfgyrqgluoodrkz
supabase secrets set PROVIDER=gemini GEMINI_API_KEY=TU_CLAVE ALLOWED_ORIGIN=https://silverclose1221.github.io
supabase functions deploy buscar-ia
```
Para Claude: `PROVIDER=anthropic ANTHROPIC_API_KEY=TU_CLAVE`.
La clave va SOLO en los secretos de Supabase, nunca en config.js ni en el repo.

## 4. Probar
Abre el geoportal y pregunta, por ejemplo: "¿Cuánto carbono tiene Choachí?" o "osos en Santander".

## Notas
- La IA solo devuelve un plan (municipio, pestaña, taxón, analizar). No ejecuta SQL ni código.
- Límite: 20 consultas por hora por IP (variable MAX_POR_HORA).
- Verifica el nombre del modelo vigente (GEMINI_MODEL / ANTHROPIC_MODEL) en la documentación del proveedor.
- Trabaja de a un municipio; preguntas tipo "¿qué municipios tienen más de 30 % protegido?" aún no se pueden responder.

## Iniciar sesión con GitHub (v3)
Archivos que cambian: `index.html`, `app.js`, `datos.js`, `styles.css`.

1. En GitHub: Settings → Developer settings → OAuth Apps → New OAuth App.
   - Homepage URL: `https://silverclose1221.github.io/geoportal-ambiental/`
   - Authorization callback URL: `https://imbezkfgyrqgluoodrkz.supabase.co/auth/v1/callback`
   - Copia el Client ID y genera un Client Secret.
2. En Supabase: Authentication → Sign In / Providers → GitHub → activar y pegar Client ID y Client Secret.
3. En Supabase: Authentication → URL Configuration:
   - Site URL: `https://silverclose1221.github.io/geoportal-ambiental/`
   - Redirect URLs: agrega la misma dirección.
4. Sube los archivos nuevos a GitHub y prueba "Continuar con GitHub".

Nota: si la cuenta de GitHub tiene el correo privado, el panel mostrará el nombre de usuario en lugar del correo.
El Client Secret solo va en Supabase, nunca en el repositorio.
