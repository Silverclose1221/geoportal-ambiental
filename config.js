// =====================================================================
// Configuración del geoportal
// 1. En Supabase: Project Settings > API > copie "Project URL" y la
//    clave "anon public" (o "publishable"). Pegue los valores abajo.
// 2. NUNCA ponga aquí la clave "service_role" / "secret".
// Si se dejan vacíos, el geoportal funciona en MODO DEMO (sin base de datos).
// =====================================================================
window.GEOPORTAL_CONFIG = {
  SUPABASE_URL: "https://imbezkfgyrqgluoodrkz.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_Izvky6iWETLSVJumFIj_Dg_juzcw5YR", // clave pública (segura con RLS)

  // Vista inicial (Colombia)
  CENTRO: [4.3, -73.5],
  ZOOM: 6,

  // Servicios externos (no requieren servidor propio)
  GBIF_API: "https://api.gbif.org",
  SOILGRIDS_OCS: "https://maps.isric.org/mapserv?map=/map/ocs.map",
  WORLDCOVER_WMS: "https://titiler.terrascope.be/wms",
  LIMITES_DEPTOS_DEMO:
    "https://media.githubusercontent.com/media/wmgeolab/geoBoundaries/main/releaseData/gbOpen/COL/ADM1/geoBoundaries-COL-ADM1_simplified.geojson",
};
