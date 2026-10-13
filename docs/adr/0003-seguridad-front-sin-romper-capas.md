# ADR 0003 — Endurecer el front-end sin romper las capas

**Estado:** aceptada (2026-10-08)

**Contexto.** GitHub Pages no permite cabeceras HTTP; la página carga 7 librerías de CDN y muchos servicios externos (IGAC, GBIF, SoilGrids…).

**Decisión.** Aplicar ya las defensas que no pueden romper nada (escape de datos, validación de colores y URLs, CSP mínima, `referrer`, `rel="noopener noreferrer"`) y dejar documentadas, sin aplicar, la CSP estricta de scripts y SRI hasta probarlas en navegador (ver `SECURITY.md`).

**Consecuencias.** Mejora inmediata sin riesgo de regresión; queda una tarea de verificación manual para el endurecimiento completo.
