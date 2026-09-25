# Geoportal Ambiental de Colombia

Visor web para tres temas:

1. **Biodiversidad**: densidad de registros GBIF filtrable por taxón, áreas protegidas (RUNAP), ecosistemas, páramos y tus propias observaciones.
2. **Normas, desarrollo sostenible y uso del suelo**: catálogo de leyes y políticas, ESA WorldCover, coberturas Corine, conflictos de uso, frontera agrícola y Ley 2ª.
3. **Carbono orgánico del suelo (COS)**: mapa de referencia SoilGrids, calculadora de stock, registro de muestras (formulario o CSV) y cálculo de CO₂e.

**Análisis de área:** dibuja un polígono, elige un departamento o sube un archivo, y el visor calcula:
- área por clase de cada capa y porcentaje protegido (meta 30×30);
- especies y especies amenazadas (GBIF);
- stock de COS recortado de SoilGrids;
- estadísticas de tus muestras de suelo.

Además recorta capas y las descarga en GeoJSON o CSV.

**Arquitectura sin servidor propio:** página estática (GitHub Pages) + Supabase (PostgreSQL + PostGIS) + APIs públicas (GBIF, ISRIC SoilGrids, ESA WorldCover).

```
Navegador (Leaflet + Turf)  ──►  Supabase: tablas + funciones PostGIS (recorte, áreas, resúmenes)
          │                   └►  GBIF API · SoilGrids WMS/WCS · WorldCover WMS
          └── alojado en GitHub Pages (gratis)
```

---

## Paso 1 · Crear la base de datos en Supabase

1. En <https://supabase.com/dashboard> crea un proyecto (**New project**). La región más cercana es *South America (São Paulo)*. Guarda la contraseña de la base de datos.
2. Ve a **SQL Editor → New query** y ejecuta, **en este orden**, el contenido de:
   - `01_esquema.sql`: PostGIS, tablas y seguridad (RLS)
   - `02_funciones.sql`: funciones de recorte y resumen
   - `03_datos_iniciales.sql`: catálogo de capas y normas
3. En **Project Settings → API Keys** copia la **Project URL** y la clave **anon / publishable**.
4. En **Authentication → URL Configuration** pon como *Site URL* la dirección de GitHub Pages (Paso 3) y agrégala en *Redirect URLs*. Así funciona el enlace de acceso por correo.

> La clave *anon/publishable* puede ser pública: la seguridad la dan las políticas RLS (lectura para todos; escritura solo para usuarios con sesión y sobre sus propios registros).
> **Nunca** pongas la clave `service_role`/`secret` ni la contraseña de la base de datos en el código.

## Paso 2 · Configurar la web

Edita `config.js`:

```js
SUPABASE_URL: "https://TU-PROYECTO.supabase.co",
SUPABASE_ANON_KEY: "TU_CLAVE_ANON_O_PUBLISHABLE",
```

Sin estos valores el visor funciona en **modo demo**: GBIF, SoilGrids, WorldCover, la calculadora y las capas propias funcionan igual, pero las muestras se guardan solo en tu navegador.

Para probarlo en tu PC, abre una terminal en la carpeta del proyecto y ejecuta `python -m http.server 8000`. Luego abre <http://localhost:8000>.

## Paso 3 · Publicar en GitHub Pages

1. Crea un repositorio en GitHub (por ejemplo `geoportal-ambiental`).
2. Sube todos los archivos de esta carpeta, con `index.html` en la raíz. Puedes arrastrarlos en *Add file → Upload files* o usar git:
   ```bash
   git init && git add . && git commit -m "Geoportal ambiental"
   git branch -M main
   git remote add origin https://github.com/TU_USUARIO/geoportal-ambiental.git
   git push -u origin main
   ```
3. En **Settings → Pages**, en *Source* elige **Deploy from a branch**, rama `main`, carpeta `/ (root)`.
4. Espera 1–2 minutos y abre `https://TU_USUARIO.github.io/geoportal-ambiental/`.

## Paso 4 · Cargar capas oficiales

Descarga las capas desde la fuente oficial y súbelas con el script. Necesitas la cadena de conexión de Supabase: **Connect → Session pooler**, con la contraseña del Paso 1.

```bash
pip install geopandas "psycopg[binary]"
# Windows (PowerShell):
$env:SUPABASE_DB_URL="postgresql://postgres.xxxx:CONTRASEÑA@aws-0-sa-east-1.pooler.supabase.com:5432/postgres"
# Linux/Mac:
export SUPABASE_DB_URL="postgresql://postgres.xxxx:CONTRASEÑA@aws-0-sa-east-1.pooler.supabase.com:5432/postgres"

python cargar_capas.py MGN_DPTO_POLITICO.shp --capa departamentos --campo-nombre DPTO_CNMBR --campo-clase DPTO_CNMBR --simplificar 100 --reemplazar
python cargar_capas.py runap.shp --capa areas_protegidas --campo-clase categoria --campo-nombre nombre --simplificar 20 --reemplazar
```

Los nombres de columna cambian según la versión del archivo. Si pones uno que no existe, el script te muestra las columnas disponibles.

| Capa (`--capa`) | Fuente | Dónde descargar |
|---|---|---|
| `departamentos`, `municipios` | DANE, Marco Geoestadístico Nacional | geoportal.dane.gov.co → Descargas → MGN |
| `areas_protegidas` | Parques Nacionales, RUNAP | runap.parquesnacionales.gov.co |
| `ecosistemas`, `coberturas` | IDEAM | siac.gov.co → Catálogo de mapas |
| `paramos` | MinAmbiente / IAvH | siac.gov.co |
| `reserva_ley2` | MinAmbiente | siac.gov.co |
| `conflictos_uso`, `suelos` | IGAC | geoportal.igac.gov.co / Colombia en Mapas |
| `frontera_agricola` | UPRA | sipra.upra.gov.co |

**Plan gratuito (500 MB):** las capas nacionales a escala 1:100.000 (Corine, suelos) son pesadas. Simplifícalas (`--simplificar 30` a `100` metros) o carga solo tu región de interés recortándola antes en QGIS.

Para crear una capa nueva que no esté en el catálogo, usa un `--capa` nuevo con `--titulo "…" --tema biodiversidad|politicas_uso|carbono|base`. El visor la muestra sola en la pestaña correspondiente. El color y el orden se editan en la tabla `catalogo_capas` (columna `estilo`).

## Cálculos

- **Stock de COS (t C/ha)** = COS (%) × densidad aparente (g/cm³) × espesor (cm) × (1 − pedregosidad/100). Se calcula igual en la base de datos (columna generada) y en la calculadora web.
- **CO₂e** = stock × 44/12.
- **Área del polígono con muestras:** stock medio de las muestras dentro del área × área. Solo es válido si las muestras representan el área; lo ideal es estratificar por cobertura.
- **SoilGrids:** recorta `ocs_0-30cm_mean` (t C/ha, 250 m) por WCS y suma valor × área de cada píxel dentro del polígono. Es un modelo global, útil como referencia, no como reemplazo del muestreo.
- **% protegido:** área de RUNAP dentro del polígono ÷ área del polígono. Si hay áreas protegidas superpuestas, el porcentaje puede sobreestimarse.

## Estructura

```
index.html              página
styles.css              estilos (claro/oscuro, móvil)
config.js               claves de Supabase y servicios
datos.js                acceso a datos (Supabase o demo) y cálculos
app.js                  mapa, pestañas, análisis y recortes
catalogo.json, politicas.json   datos para el modo demo
01/02/03_*.sql          base de datos (ya ejecutados en Supabase)
cargar_capas.py         carga de shapefiles/GeoPackage a Supabase
```

## Notas

- GBIF, SoilGrids y WorldCover son servicios externos gratuitos. Si alguno no responde, esa sección muestra un aviso y el resto sigue funcionando.
- Los resúmenes de normas son orientativos. Verifica siempre el texto oficial (SUIN-Juriscol, Función Pública).
- Las capas propias que subes desde el visor solo quedan en tu navegador. Para compartirlas, cárgalas con el script.
