# ADR 0002 — La IA devuelve un plan de acciones, no SQL

**Estado:** aceptada (2026-10-08)

**Contexto.** Se quiere preguntar en lenguaje natural ("¿cuánto carbono tiene Choachí?").

**Decisión.** El modelo solo puede devolver `{respuesta, acciones:{municipio, tab, taxon, analizar}}`. La función valida tipos y valores permitidos y descarta cualquier otro campo. `ia.js` ejecuta ese plan usando los controles que ya existen en la página (buscador de municipios, pestañas, filtro GBIF, botón Analizar).

**Alternativas descartadas.** Texto a SQL sobre PostGIS (riesgo de inyección y de consultas costosas; la base solo guarda parte de los datos, el resto es en vivo).

**Consecuencias.** Más seguro y predecible; limitado a un municipio por pregunta. Preguntas de ranking entre municipios requerirían datos precalculados (idea futura: tabla de resúmenes por municipio).
