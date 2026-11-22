// Junta o app inteiro num único arquivo HTML, para publicar como página
// (por exemplo, para testar dentro do app do Claude, sem instalar nada).
// Uso: node scripts/gerar-pagina.mjs [arquivo-de-saida.html]
import { readFileSync, writeFileSync } from "node:fs";

const ler = (f) => readFileSync(f, "utf8");
const seguro = (js) => js.replace(/<\/script/gi, "<\\/script");
const saida = process.argv[2] || "pagina-mapa-coletaveis.html";

const html = ler("www/index.html");
const corpo = html.slice(html.indexOf("<body>") + 6, html.indexOf('<script src="vendor/leaflet/leaflet.js">')).trim();
const exemplo = JSON.stringify(JSON.parse(ler("www/exemplo.json")));

const pagina = `<title>Mapa de Coletáveis</title>
<style>
${ler("node_modules/leaflet/dist/leaflet.css")}
${ler("www/style.css")}
</style>
${corpo}
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
<script>window.EXEMPLO = ${seguro(exemplo)};</script>
<script>
${seguro(ler("www/armazenamento.js"))}
</script>
<script>
${seguro(ler("www/psn.js"))}
</script>
<script>
${seguro(ler("www/app.js"))}
</script>
`;
writeFileSync(saida, pagina);
console.log(`Página gerada: ${saida} (${Math.round(pagina.length / 1024)} KB)`);
