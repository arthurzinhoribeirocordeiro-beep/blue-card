// Copia o Leaflet (biblioteca do mapa) para dentro de www/, para o app funcionar sem internet.
import { cpSync, mkdirSync } from "node:fs";
mkdirSync("www/vendor", { recursive: true });
cpSync("node_modules/leaflet/dist", "www/vendor/leaflet", { recursive: true });
console.log("www/ pronta.");
