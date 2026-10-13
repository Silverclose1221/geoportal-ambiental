# ADR 0001 — La búsqueda con IA pasa por una Edge Function

**Estado:** aceptada (2026-10-08)

**Contexto.** El geoportal es estático (GitHub Pages) y el repositorio es público. Llamar a un modelo de IA desde el navegador obligaría a publicar la API key.

**Decisión.** Una Edge Function de Supabase (`buscar-ia`) guarda la clave como secreto, aplica CORS y límite de uso, y llama al proveedor (Gemini por defecto, Claude opcional con `PROVIDER=anthropic`).

**Alternativas descartadas.** Clave en el JS (se filtra); servidor propio (costo y mantenimiento); modelo local (no hay dónde correrlo desde una página estática).

**Consecuencias.** Hay una pieza de backend que desplegar con la CLI de Supabase y un costo por uso del proveedor (con capa gratis en Gemini).
