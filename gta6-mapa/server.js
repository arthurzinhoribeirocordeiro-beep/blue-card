// Servidor local do Mapa de Coletáveis.
// - Serve o app (pasta public/) para o PC e para o celular na mesma rede Wi-Fi.
// - Guarda o mapa e o progresso em dados/ (assim celular e PC ficam iguais).
// - Faz a ponte com a PSN (troféus) usando a biblioteca não oficial psn-api.
//
// Uso: npm start            (normal)
//      npm run demo         (PSN de mentira, para testar sem token)

import http from "node:http";
import fs from "node:fs/promises";
import { existsSync, createReadStream } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import {
  exchangeNpssoForAccessCode,
  exchangeAccessCodeForAuthTokens,
  exchangeRefreshTokenForAuthTokens,
  getUserTitles,
  getTitleTrophies,
  getUserTrophiesEarnedForTitle,
} from "psn-api";

const RAIZ = path.dirname(fileURLToPath(import.meta.url));
const PUBLICO = path.join(RAIZ, "public");
const DADOS = path.join(RAIZ, "dados");
const LEAFLET = path.join(RAIZ, "node_modules", "leaflet", "dist");
const ARQ_MAPA = path.join(DADOS, "mapa.json");
const ARQ_PROGRESSO = path.join(DADOS, "progresso.json");
const ARQ_TOKEN = path.join(DADOS, ".psn-token");
const PORTA = Number(process.env.PORT) || 5173;
const DEMO_PSN = process.argv.includes("--demo-psn") || process.env.PSN_DEMO === "1";

const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
};
const EXT_IMAGEM = [".jpg", ".jpeg", ".png", ".webp"];

// ---------- arquivos de dados ----------

async function lerJson(arq, padrao) {
  try {
    return JSON.parse(await fs.readFile(arq, "utf8"));
  } catch {
    return padrao;
  }
}

// grava em arquivo temporário e renomeia, para nunca deixar um JSON pela metade
async function gravarJson(arq, dados) {
  await fs.mkdir(DADOS, { recursive: true });
  const tmp = arq + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(dados, null, 2));
  await fs.rename(tmp, arq);
}

function progressoVazio() {
  return { encontrados: {}, psn: { jogo: null, vinculos: {} } };
}

async function lerProgresso() {
  const p = await lerJson(ARQ_PROGRESSO, progressoVazio());
  p.encontrados ||= {};
  p.psn ||= { jogo: null, vinculos: {} };
  p.psn.vinculos ||= {};
  return p;
}

// fila simples: as gravações do progresso acontecem uma de cada vez
let filaProgresso = Promise.resolve();
function alterarProgresso(fn) {
  const tarefa = filaProgresso.then(async () => {
    const p = await lerProgresso();
    await fn(p);
    await gravarJson(ARQ_PROGRESSO, p);
    return p;
  });
  filaProgresso = tarefa.catch(() => {});
  return tarefa;
}

async function arquivoImagemMapa() {
  for (const ext of EXT_IMAGEM) {
    const arq = path.join(DADOS, "mapa" + ext);
    if (existsSync(arq)) return arq;
  }
  return null;
}

// ---------- PSN ----------

let auth = null; // { accessToken, refreshToken, expiraEm, refreshExpiraEm }

async function lerNpsso() {
  if (process.env.PSN_NPSSO) return process.env.PSN_NPSSO.trim();
  try {
    return (await fs.readFile(ARQ_TOKEN, "utf8")).trim() || null;
  } catch {
    return null;
  }
}

function guardarAuth(t) {
  const agora = Date.now();
  auth = {
    accessToken: t.accessToken,
    refreshToken: t.refreshToken,
    expiraEm: agora + (t.expiresIn - 60) * 1000,
    refreshExpiraEm: agora + (t.refreshTokenExpiresIn - 60) * 1000,
  };
}

async function autorizacao() {
  const agora = Date.now();
  if (auth && agora < auth.expiraEm) return { accessToken: auth.accessToken };
  if (auth && agora < auth.refreshExpiraEm) {
    try {
      guardarAuth(await exchangeRefreshTokenForAuthTokens(auth.refreshToken));
      return { accessToken: auth.accessToken };
    } catch {
      auth = null;
    }
  }
  const npsso = await lerNpsso();
  if (!npsso) throw new ErroHttp(400, "PSN não configurada: cole o seu código NPSSO no painel da PSN.");
  try {
    const codigo = await exchangeNpssoForAccessCode(npsso);
    guardarAuth(await exchangeAccessCodeForAuthTokens(codigo));
  } catch (e) {
    throw new ErroHttp(401, "A PSN recusou o código NPSSO (ele expira de tempos em tempos). Pegue um novo e cole de novo. Detalhe: " + e.message);
  }
  return { accessToken: auth.accessToken };
}

async function psnJogos() {
  if (DEMO_PSN) return demoJogos();
  const a = await autorizacao();
  const r = await getUserTitles(a, "me", { limit: 200 });
  return r.trophyTitles.map((t) => ({
    id: t.npCommunicationId,
    nome: t.trophyTitleName,
    plataforma: t.trophyTitlePlatform,
    servico: t.npServiceName,
    icone: t.trophyTitleIconUrl,
    progresso: t.progress,
    atualizado: t.lastUpdatedDateTime,
  }));
}

async function psnTrofeus(jogo, servico) {
  if (DEMO_PSN) return demoTrofeus();
  if (!/^[A-Z0-9_]+$/i.test(jogo || "")) throw new ErroHttp(400, "Jogo inválido.");
  const opcoes = { npServiceName: servico === "trophy" ? "trophy" : "trophy2" };
  const a = await autorizacao();
  const [titulo, meus] = await Promise.all([
    getTitleTrophies(a, jogo, "all", opcoes),
    getUserTrophiesEarnedForTitle(a, "me", jogo, "all", opcoes),
  ]);
  const porId = new Map(meus.trophies.map((t) => [t.trophyId, t]));
  return titulo.trophies.map((t) => {
    const m = porId.get(t.trophyId) || {};
    const alvo = Number(m.trophyProgressTargetValue || t.trophyProgressTargetValue) || null;
    // A PSN devolve "progress" nos troféus de PS5 com contador (não está nos tipos da biblioteca)
    let progresso = m.progress != null ? Number(m.progress) : null;
    if (progresso == null && alvo && m.progressRate != null) progresso = Math.round((Number(m.progressRate) / 100) * alvo);
    if (m.earned && alvo) progresso = alvo;
    return {
      id: t.trophyId,
      nome: t.trophyName,
      descricao: t.trophyDetail,
      tipo: t.trophyType,
      icone: t.trophyIconUrl,
      oculto: t.trophyHidden,
      conquistado: !!m.earned,
      alvo,
      progresso,
    };
  });
}

// ---------- PSN de demonstração ----------
// Simula um jogo com troféus de contador que vão subindo sozinhos,
// para dar para testar o app sem token.
const inicioDemo = Date.now();
function demoJogos() {
  return [
    { id: "DEMO00001_00", nome: "Jogo de Demonstração (PSN simulada)", plataforma: "PS5", servico: "trophy2", icone: "", progresso: 12 },
    { id: "DEMO00002_00", nome: "Outro Jogo Qualquer", plataforma: "PS5", servico: "trophy2", icone: "", progresso: 40 },
  ];
}
function demoTrofeus() {
  const passo = Math.floor((Date.now() - inicioDemo) / 60000); // +1 por minuto
  const t = (id, nome, descricao, alvo, base) => {
    const progresso = alvo ? Math.min(alvo, base + passo) : null;
    return { id, nome, descricao, tipo: "bronze", icone: "", oculto: false, alvo, progresso, conquistado: alvo ? progresso >= alvo : false };
  };
  return [
    t(1, "Colecionador de Relíquias", "Encontre todas as relíquias", 12, 2),
    t(2, "Fotógrafo da Natureza", "Fotografe todos os pontos de interesse", 10, 0),
    t(3, "Caçador de Pacotes", "Encontre todos os pacotes escondidos", 15, 5),
    t(4, "Primeiro Passo", "Complete o prólogo", null, 0),
  ];
}

// ---------- HTTP ----------

class ErroHttp extends Error {
  constructor(status, msg) {
    super(msg);
    this.status = status;
  }
}

function enviarJson(res, status, dados) {
  res.writeHead(status, { "Content-Type": TIPOS[".json"], "Cache-Control": "no-store" });
  res.end(JSON.stringify(dados));
}

async function lerCorpo(req, limite = 2 * 1024 * 1024) {
  const partes = [];
  let total = 0;
  for await (const p of req) {
    total += p.length;
    if (total > limite) throw new ErroHttp(413, "Arquivo grande demais.");
    partes.push(p);
  }
  return Buffer.concat(partes);
}

async function lerCorpoJson(req) {
  const b = await lerCorpo(req);
  try {
    return JSON.parse(b.toString("utf8") || "{}");
  } catch {
    throw new ErroHttp(400, "JSON inválido.");
  }
}

function servirArquivo(res, arq, cache = "no-cache") {
  const tipo = TIPOS[path.extname(arq).toLowerCase()] || "application/octet-stream";
  res.writeHead(200, { "Content-Type": tipo, "Cache-Control": cache });
  createReadStream(arq).pipe(res);
}

// impede sair da pasta com "../"
function dentroDe(base, relativo) {
  const alvo = path.normalize(path.join(base, relativo));
  return alvo.startsWith(base + path.sep) || alvo === base ? alvo : null;
}

async function rotear(req, res) {
  const url = new URL(req.url, "http://localhost");
  const p = decodeURIComponent(url.pathname);
  const m = req.method;

  // ----- API -----
  if (p === "/api/estado" && m === "GET") {
    return enviarJson(res, 200, {
      mapa: await lerJson(ARQ_MAPA, null),
      progresso: await lerProgresso(),
      imagem: (await arquivoImagemMapa()) ? true : false,
      psn: { configurada: DEMO_PSN || !!(await lerNpsso()), demo: DEMO_PSN },
    });
  }
  if (p === "/api/progresso" && m === "GET") return enviarJson(res, 200, await lerProgresso());

  if (p === "/api/mapa" && m === "PUT") {
    const mapa = await lerCorpoJson(req);
    if (!Array.isArray(mapa.categorias) || !Array.isArray(mapa.itens)) throw new ErroHttp(400, "Formato de mapa inválido.");
    await gravarJson(ARQ_MAPA, mapa);
    return enviarJson(res, 200, { ok: true });
  }

  // marca/desmarca um ou vários itens: { ids: [...], encontrado: true|false }
  if (p === "/api/progresso/marcar" && m === "POST") {
    const { ids, encontrado } = await lerCorpoJson(req);
    if (!Array.isArray(ids)) throw new ErroHttp(400, "ids precisa ser uma lista.");
    const prog = await alterarProgresso((pr) => {
      for (const id of ids) {
        if (encontrado) pr.encontrados[id] = pr.encontrados[id] || Date.now();
        else delete pr.encontrados[id];
      }
    });
    return enviarJson(res, 200, prog);
  }
  if (p === "/api/progresso/psn" && m === "POST") {
    const { jogo, vinculos } = await lerCorpoJson(req);
    const prog = await alterarProgresso((pr) => {
      if (jogo !== undefined) pr.psn.jogo = jogo;
      if (vinculos) pr.psn.vinculos = vinculos;
    });
    return enviarJson(res, 200, prog);
  }
  if (p === "/api/progresso/zerar" && m === "POST") {
    const prog = await alterarProgresso((pr) => {
      pr.encontrados = {};
    });
    return enviarJson(res, 200, prog);
  }

  if (p === "/api/mapa-imagem" && m === "POST") {
    const tipo = (req.headers["content-type"] || "").split(";")[0];
    const ext = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" }[tipo];
    if (!ext) throw new ErroHttp(400, "Envie uma imagem JPG, PNG ou WEBP.");
    const corpo = await lerCorpo(req, 60 * 1024 * 1024);
    await fs.mkdir(DADOS, { recursive: true });
    for (const e of EXT_IMAGEM) await fs.rm(path.join(DADOS, "mapa" + e), { force: true });
    await fs.writeFile(path.join(DADOS, "mapa" + ext), corpo);
    return enviarJson(res, 200, { ok: true });
  }
  if (p === "/mapa-imagem" && m === "GET") {
    const arq = await arquivoImagemMapa();
    if (!arq) throw new ErroHttp(404, "Sem imagem do mapa.");
    return servirArquivo(res, arq);
  }

  if (p === "/api/psn/token" && m === "POST") {
    let { npsso } = await lerCorpoJson(req);
    npsso = String(npsso || "").trim();
    // aceita o JSON inteiro que a página da Sony mostra: {"npsso":"..."}
    const achado = npsso.match(/"npsso"\s*:\s*"([^"]+)"/);
    if (achado) npsso = achado[1];
    if (!/^[A-Za-z0-9]{20,128}$/.test(npsso)) throw new ErroHttp(400, "Esse código não parece um NPSSO (são 64 letras e números).");
    await fs.mkdir(DADOS, { recursive: true });
    await fs.writeFile(ARQ_TOKEN, npsso, { mode: 0o600 });
    auth = null;
    await autorizacao(); // testa na hora
    return enviarJson(res, 200, { ok: true });
  }
  if (p === "/api/psn/token" && m === "DELETE") {
    await fs.rm(ARQ_TOKEN, { force: true });
    auth = null;
    return enviarJson(res, 200, { ok: true });
  }
  if (p === "/api/psn/jogos" && m === "GET") return enviarJson(res, 200, await psnJogos());
  if (p === "/api/psn/trofeus" && m === "GET") {
    return enviarJson(res, 200, await psnTrofeus(url.searchParams.get("jogo"), url.searchParams.get("servico")));
  }
  if (p.startsWith("/api/")) throw new ErroHttp(404, "Rota não encontrada.");

  // ----- arquivos -----
  if (m !== "GET" && m !== "HEAD") throw new ErroHttp(405, "Método não permitido.");
  if (p.startsWith("/vendor/leaflet/")) {
    const arq = dentroDe(LEAFLET, p.slice("/vendor/leaflet/".length));
    if (arq && existsSync(arq)) return servirArquivo(res, arq, "max-age=86400");
    throw new ErroHttp(404, "Não encontrado.");
  }
  const arq = dentroDe(PUBLICO, p === "/" ? "index.html" : p.slice(1));
  if (arq && existsSync(arq) && (await fs.stat(arq)).isFile()) return servirArquivo(res, arq);
  throw new ErroHttp(404, "Não encontrado.");
}

const servidor = http.createServer(async (req, res) => {
  try {
    await rotear(req, res);
  } catch (e) {
    const status = e.status || 500;
    if (status === 500) console.error(e);
    if (!res.headersSent) enviarJson(res, status, { erro: e.message || "Erro interno." });
    else res.end();
  }
});

servidor.listen(PORTA, "0.0.0.0", () => {
  const ips = Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === "IPv4" && !i.internal)
    .map((i) => i.address);
  console.log("\n  Mapa de Coletáveis rodando!\n");
  console.log(`  No PC:       http://localhost:${PORTA}`);
  for (const ip of ips) console.log(`  No celular:  http://${ip}:${PORTA}   (mesmo Wi-Fi)`);
  if (DEMO_PSN) console.log("\n  Modo demonstração: a PSN é simulada (os contadores sobem 1 por minuto).");
  console.log("\n  Para parar: Ctrl+C\n");
});
