# DESIGN.md — Geoportal Ambiental de Colombia

Contrato visual del geoportal. Los valores son los que ya usa `styles.css`; si se cambia uno, se cambia aquí y allá.
Cualquier agente o persona que añada pantallas debe leer este archivo primero.

## Principios
- **Claridad científica antes que decoración**: datos legibles, unidades siempre visibles, fuente citada.
- **Una sola voz visual**: verde institucional como único color de acento; el color de datos (capas, rampas) no se reutiliza para la interfaz.
- **Móvil primero en lectura**: el mapa va arriba (58 vh) y el panel debajo en pantallas ≤ 860 px.
- **Claro y oscuro** con las mismas variables (`prefers-color-scheme`).

## Tokens (variables CSS en `:root`)
| Token | Claro | Oscuro | Uso |
|---|---|---|---|
| `--bg` | #f4f5f2 | #111512 | Fondo de página |
| `--surface` | #ffffff | #1a1f1b | Tarjetas, barra superior, diálogos |
| `--surface-2` | #f0f2ee | #222823 | Zonas secundarias |
| `--border` | #dde1d9 | #323a34 | Bordes y separadores |
| `--text` / `--text-2` / `--muted` | #17201a / #4d5a51 / #6b7770 | #eef2ee / #c2cbc4 / #95a198 | Texto principal, secundario, ayudas |
| `--brand` / `--brand-strong` / `--brand-soft` | #2f7d4f / #226140 / #e3f0e7 | #4fae78 / #6cc792 / #1f3528 | Acento, hover, fondos suaves |
| `--warn` | #9a5b00 | #e0a64a | Avisos |
| `--bar` / `--bar-track` | #2f7d4f / #e6ebe4 | #4fae78 / #2a322c | Barras de resultados |
| `--radius` | 10px | | Esquinas de tarjetas |

Regla: **no usar colores literales en componentes nuevos**; usar siempre una variable (así funciona el modo oscuro).

## Tipografía
Inter (400/500/600/700) con respaldo del sistema. Base 14 px, interlineado 1,45. Títulos de tarjeta 600; etiquetas de formulario 12 px 500; botones 13 px 600.

## Componentes
- **Tarjeta** (`.card`): fondo `--surface`, borde `--border`, radio `--radius`, sombra suave. Una idea por tarjeta.
- **Botón** (`.btn` primario, `.btn-ghost` secundario): un solo primario por tarjeta.
- **Pestañas** (`.tab`, `role="tab"` con `aria-selected`): cuatro temas; la activa lleva `--brand`.
- **Tiles de resultado** (`.tile`): valor grande + unidad + etiqueta. Siempre con unidad (ha, %, t C/ha).
- **Barras** (`.barras`): comparación de clases; el texto de la fila repite el valor numérico (no depender solo del color).
- **Búsqueda con IA** (`.ia-card`): arriba del panel; la respuesta se muestra como texto plano (`textContent`).
- **Avisos**: `.nota` (informativo), `.aviso-err` (error), toast para eventos efímeros.

## Accesibilidad (mínimos)
- Contraste de texto ≥ 4,5:1 en ambos temas; volver a medirlo al cambiar tokens. Medido hoy: texto 16,7:1, texto secundario 7,3:1, `--muted` sobre tarjeta 4,7:1 (sobre el fondo de página queda en 4,3:1: usarlo solo dentro de tarjetas), botón primario 5,0:1 en claro y 6,5:1 en oscuro (texto oscuro `#0f1a13`).
- `:focus-visible` con contorno de 2 px en `--brand` para todo control.
- Enlace "Saltar al contenido", `lang="es"`, etiquetas asociadas a cada campo.
- `prefers-reduced-motion` respetado.
- La información nunca se transmite solo por color.

## Mapa y datos
- Rampas de color de capas (stock de COS, WorldCover) viven en `app.js`; usan escalas secuenciales y leyenda visible.
- Toda capa muestra su **fuente** en el catálogo y en los créditos del pie.
