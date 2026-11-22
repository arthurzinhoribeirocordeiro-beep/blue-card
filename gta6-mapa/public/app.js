"use strict";

// =====================================================================
//  Mapa de Coletáveis — filtros estilo "mapa interativo", marcação rápida
//  e conferência com os troféus da PSN.
// =====================================================================

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const novoId = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const limitar = (v) => Math.min(1, Math.max(0, v));
const ehCelular = () => matchMedia("(max-width: 820px)").matches;

// preferências deste aparelho (filtros, zoom...). O progresso fica no PC.
const LS = {
  get(k, padrao) {
    try {
      const v = localStorage.getItem("mapa:" + k);
      return v == null ? padrao : JSON.parse(v);
    } catch {
      return padrao;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem("mapa:" + k, JSON.stringify(v));
    } catch {}
  },
};

const S = {
  mapa: null, // { nome, grupos, categorias, itens }
  progresso: { encontrados: {}, psn: { jogo: null, vinculos: {} } },
  temImagem: false,
  psn: { configurada: false, demo: false, jogos: null, trofeus: null, anterior: null, ultimoSync: 0, carregando: false, erro: null },
  ui: {
    ocultas: new Set(LS.get("ocultas", [])),
    esconderEncontrados: LS.get("esconderEncontrados", false),
    rapido: LS.get("rapido", true),
    soFaltando: LS.get("soFaltando", false),
    autoSync: LS.get("autoSync", true),
    ultimaCategoria: LS.get("ultimaCategoria", null),
    editar: false,
    aba: "filtros",
    busca: "",
    destaque: null,
  },
  pendentes: LS.get("pendentes", []),
};

// ---------------------------------------------------------------- API

async function api(metodo, url, corpo) {
  const opcoes = { method: metodo, headers: {} };
  if (corpo instanceof Blob) {
    opcoes.body = corpo;
    opcoes.headers["Content-Type"] = corpo.type;
  } else if (corpo !== undefined) {
    opcoes.body = JSON.stringify(corpo);
    opcoes.headers["Content-Type"] = "application/json";
  }
  const r = await fetch(url, opcoes);
  const dados = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(dados.erro || `Erro ${r.status}`);
  return dados;
}

// ---------------------------------------------------------------- dados

const categorias = () => S.mapa?.categorias || [];
const itens = () => S.mapa?.itens || [];
const categoriaPorId = (id) => categorias().find((c) => c.id === id);
const itemPorId = (id) => itens().find((i) => i.id === id);
const encontrado = (id) => !!S.progresso.encontrados[id];

function nomeItem(item) {
  if (item.nome) return item.nome;
  const cat = categoriaPorId(item.categoria);
  const n = itens().filter((i) => i.categoria === item.categoria).indexOf(item) + 1;
  return `${cat ? cat.nome : "Coletável"} #${n}`;
}

function contagem(catId) {
  let total = 0, feitos = 0;
  for (const i of itens()) {
    if (i.categoria !== catId) continue;
    total++;
    if (encontrado(i.id)) feitos++;
  }
  return { total, feitos };
}

function gruposOrdenados() {
  const grupos = (S.mapa?.grupos || []).map((g) => ({ ...g, cats: [] }));
  const outros = { id: "_outros", nome: "Outros", cats: [] };
  for (const c of categorias()) (grupos.find((g) => g.id === c.grupo) || outros).cats.push(c);
  return [...grupos, outros].filter((g) => g.cats.length);
}

function normalizarMapa(m) {
  if (!m || !Array.isArray(m.categorias) || !Array.isArray(m.itens)) throw new Error("Esse arquivo não tem 'categorias' e 'itens'.");
  const grupos = Array.isArray(m.grupos) ? m.grupos.filter((g) => g && g.id) : [];
  const cats = m.categorias
    .filter((c) => c && c.id)
    .map((c) => ({ id: String(c.id), nome: String(c.nome || c.id), icone: c.icone || "📍", cor: c.cor || "#ff4fa3", grupo: c.grupo || null }));
  const ids = new Set(cats.map((c) => c.id));
  const vistos = new Set();
  const its = [];
  for (const i of m.itens) {
    if (!i || !ids.has(String(i.categoria))) continue;
    const x = Number(i.x), y = Number(i.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    let id = i.id ? String(i.id) : novoId("i");
    while (vistos.has(id)) id = novoId("i");
    vistos.add(id);
    its.push({ id, categoria: String(i.categoria), x: limitar(x), y: limitar(y), nome: i.nome || "", descricao: i.descricao || "" });
  }
  return { versao: 1, nome: m.nome || "Mapa de Coletáveis", grupos, categorias: cats, itens: its };
}

let timerSalvar = null;
function salvarMapa() {
  clearTimeout(timerSalvar);
  timerSalvar = setTimeout(async () => {
    try {
      await api("PUT", "/api/mapa", S.mapa);
    } catch (e) {
      aviso("Não consegui salvar o mapa: " + e.message, { tipo: "erro" });
    }
  }, 300);
}

// ---------------------------------------------------------------- progresso
// Cada marcação vira uma operação pequena enviada ao PC. Se a conexão cair,
// fica numa fila neste aparelho e é reenviada sozinha.

function aplicarOperacao(op) {
  for (const id of op.ids) {
    if (op.encontrado) S.progresso.encontrados[id] ||= Date.now();
    else delete S.progresso.encontrados[id];
  }
}

let enviando = false, avisouOffline = false;
async function enviarPendentes() {
  if (enviando || !S.pendentes.length) return;
  enviando = true;
  try {
    while (S.pendentes.length) {
      await api("POST", "/api/progresso/marcar", S.pendentes[0]);
      S.pendentes.shift();
      LS.set("pendentes", S.pendentes);
    }
    if (avisouOffline) aviso("Conexão de volta, tudo salvo no PC.");
    avisouOffline = false;
  } catch {
    if (!avisouOffline) aviso("Sem conexão com o PC. Suas marcações ficam guardadas aqui e são enviadas quando voltar.", { tipo: "alerta", duracao: 7000 });
    avisouOffline = true;
    setTimeout(enviarPendentes, 5000);
  } finally {
    enviando = false;
  }
}

function marcar(ids, valor, { avisar = true, texto } = {}) {
  const mudados = ids.filter((id) => encontrado(id) !== valor);
  if (!mudados.length) return;
  const op = { ids: mudados, encontrado: valor };
  aplicarOperacao(op);
  S.pendentes.push(op);
  LS.set("pendentes", S.pendentes);
  enviarPendentes();

  for (const id of mudados) atualizarMarcador(id, valor);
  renderLateral();
  if (navigator.vibrate) navigator.vibrate(valor ? 30 : [15, 40, 15]);

  if (avisar) {
    let msg = texto;
    if (!msg) {
      const item = itemPorId(mudados[0]);
      const cat = item && categoriaPorId(item.categoria);
      if (mudados.length === 1 && item) {
        const c = contagem(item.categoria);
        msg = `${valor ? "✓" : "↩"} <b>${esc(nomeItem(item))}</b> ${valor ? "marcado" : "desmarcado"} · ${cat ? esc(cat.nome) : ""} ${c.feitos}/${c.total}`;
        if (valor && c.total && c.feitos === c.total) msg = `🎉 Você pegou todos de <b>${esc(cat.nome)}</b>! (${c.total}/${c.total})`;
      } else msg = `${mudados.length} ${valor ? "marcados" : "desmarcados"}`;
    }
    aviso(msg, { acao: "Desfazer", aoClicar: () => marcar(mudados, !valor, { avisar: false }) });
  }
}

function assinatura(p) {
  return Object.keys(p.encontrados).sort().join(",") + "|" + JSON.stringify(p.psn);
}

function receberProgresso(p) {
  const antes = assinatura(S.progresso);
  S.progresso = p;
  for (const op of S.pendentes) aplicarOperacao(op);
  if (assinatura(S.progresso) !== antes) {
    renderMarcadores();
    renderLateral();
  }
}

async function buscarProgresso() {
  if (enviando || S.pendentes.length || document.hidden) return;
  try {
    receberProgresso(await api("GET", "/api/progresso"));
  } catch {}
}

// ---------------------------------------------------------------- mapa (Leaflet)

const mapa = L.map("mapa", {
  crs: L.CRS.Simple,
  zoomSnap: 0.25,
  zoomDelta: 0.5,
  wheelPxPerZoomLevel: 90,
  minZoom: -6,
  maxZoom: 3,
  attributionControl: false,
  zoomControl: false,
  tapHold: true,
});
L.control.zoom({ position: "topright" }).addTo(mapa);

let dims = { w: 2000, h: 2000 };
let fundo = null;
const marcadores = new Map(); // id -> L.Marker

const paraLatLng = (x, y) => L.latLng(dims.h * (1 - y), dims.w * x);
const deLatLng = (ll) => ({ x: limitar(ll.lng / dims.w), y: limitar(1 - ll.lat / dims.h) });

// Mapa provisório (desenhado) para quando você ainda não enviou a imagem do mapa.
// As "ilhas" aqui são as mesmas usadas para espalhar o exemplo fictício.
function imagemProvisoria() {
  const grade = [];
  for (let i = 250; i < 2000; i += 250) {
    grade.push(`<line x1="${i}" y1="0" x2="${i}" y2="2000"/><line x1="0" y1="${i}" x2="2000" y2="${i}"/>`);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="2000" viewBox="0 0 2000 2000">
  <rect width="2000" height="2000" fill="#0c1d2b"/>
  <g fill="#1a2b22" stroke="#2c4536" stroke-width="6">
    <ellipse cx="880" cy="1080" rx="640" ry="760"/>
    <ellipse cx="1590" cy="520" rx="300" ry="250"/>
    <ellipse cx="1560" cy="1520" rx="220" ry="320"/>
  </g>
  <g stroke="#34493c" stroke-width="10" fill="none" stroke-linecap="round">
    <path d="M420 1500 C700 1300 900 1250 1300 900"/><path d="M600 600 C800 900 900 1300 880 1780"/><path d="M1300 900 L1590 560"/>
  </g>
  <g stroke="#ffffff" stroke-opacity=".05" stroke-width="2">${grade.join("")}</g>
  <text x="1000" y="120" fill="#ffffff" fill-opacity=".55" font-family="sans-serif" font-size="54" font-weight="700" text-anchor="middle">MAPA PROVISÓRIO</text>
  <text x="1000" y="185" fill="#ffffff" fill-opacity=".4" font-family="sans-serif" font-size="34" text-anchor="middle">Envie a imagem do mapa em ⚙ Configurações</text>
</svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

function carregarImagem(src) {
  return new Promise((ok) => {
    const img = new Image();
    img.onload = () => ok({ src, w: img.naturalWidth || 2000, h: img.naturalHeight || 2000 });
    img.onerror = () => ok(null);
    img.src = src;
  });
}

async function montarFundo({ manterVista = true } = {}) {
  let info = S.temImagem ? await carregarImagem("/mapa-imagem?v=" + Date.now()) : null;
  if (!info) info = { src: imagemProvisoria(), w: 2000, h: 2000 };
  dims = { w: info.w, h: info.h };
  const limites = L.latLngBounds([0, 0], [dims.h, dims.w]);
  if (fundo) fundo.remove();
  fundo = L.imageOverlay(info.src, limites).addTo(mapa);
  mapa.setMaxBounds(limites.pad(0.3));
  mapa.setMinZoom(-6);
  mapa.fitBounds(limites);
  mapa.setMinZoom(mapa.getZoom() - 0.5);

  const vista = manterVista && LS.get("vista", null);
  if (vista && vista.w === dims.w && vista.h === dims.h) mapa.setView(vista.centro, vista.zoom, { animate: false });
  tamanhoIcones();
  renderMarcadores();
}

function tamanhoIcones() {
  const z = mapa.getZoom() - mapa.getMinZoom();
  const el = mapa.getContainer();
  el.classList.toggle("zoom-longe", z < 0.9);
  el.classList.toggle("zoom-medio", z >= 0.9 && z < 1.9);
}
mapa.on("zoomend", tamanhoIcones);

mapa.on("moveend", () => {
  const c = mapa.getCenter();
  LS.set("vista", { centro: [c.lat, c.lng], zoom: mapa.getZoom(), w: dims.w, h: dims.h });
});

function iconeDe(item) {
  const cat = categoriaPorId(item.categoria) || { cor: "#888", icone: "📍" };
  const classes = ["marcador"];
  if (encontrado(item.id)) classes.push("feito");
  if (S.ui.destaque === item.id) classes.push("selecionado");
  return L.divIcon({
    className: "marcador-wrap",
    iconSize: [46, 46],
    iconAnchor: [23, 23],
    html: `<div class="${classes.join(" ")}" style="--cor:${esc(cat.cor)}">${esc(cat.icone)}</div>`,
  });
}

function visivel(item) {
  if (S.ui.destaque === item.id) return true;
  if (!categoriaPorId(item.categoria)) return false;
  if (S.ui.ocultas.has(item.categoria)) return false;
  if (S.ui.esconderEncontrados && encontrado(item.id) && !S.ui.editar) return false;
  return true;
}

function criarMarcador(item) {
  const id = item.id;
  const m = L.marker(paraLatLng(item.x, item.y), { icon: iconeDe(item), keyboard: true, title: nomeItem(item), riseOnHover: true });
  m.on("click", () => tocarItem(id));
  m.on("contextmenu", (e) => {
    if (e.originalEvent) e.originalEvent.preventDefault();
    if (!S.ui.editar) abrirDetalhes(id);
  });
  m.on("dragend", () => {
    const it = itemPorId(id);
    if (!it) return;
    Object.assign(it, deLatLng(m.getLatLng()));
    salvarMapa();
  });
  return m;
}

function ajustarMarcador(m, item) {
  const deveAparecer = visivel(item);
  if (deveAparecer && !mapa.hasLayer(m)) m.addTo(mapa);
  if (!deveAparecer && mapa.hasLayer(m)) m.remove();
  if (mapa.hasLayer(m) && m.dragging) S.ui.editar ? m.dragging.enable() : m.dragging.disable();
}

function renderMarcadores() {
  const vivos = new Set();
  for (const item of itens()) {
    vivos.add(item.id);
    let m = marcadores.get(item.id);
    if (!m) {
      m = criarMarcador(item);
      marcadores.set(item.id, m);
    } else {
      m.setLatLng(paraLatLng(item.x, item.y));
      m.setIcon(iconeDe(item));
    }
    ajustarMarcador(m, item);
  }
  for (const [id, m] of marcadores) {
    if (!vivos.has(id)) {
      m.remove();
      marcadores.delete(id);
    }
  }
}

function atualizarMarcador(id, pular = false) {
  const m = marcadores.get(id), item = itemPorId(id);
  if (!m || !item) return;
  m.setIcon(iconeDe(item));
  ajustarMarcador(m, item);
  if (pular) m.getElement()?.querySelector(".marcador")?.classList.add("pulo");
}

function tocarItem(id) {
  if (S.ui.editar) return abrirEdicaoItem(id);
  if (S.ui.rapido) marcar([id], !encontrado(id));
  else abrirDetalhes(id);
}

mapa.on("click", (e) => {
  if (S.ui.editar) abrirEdicaoItem(null, deLatLng(e.latlng));
  else if (!$("#painel").hidden) fecharPainel();
});

function destacar(id) {
  const anterior = S.ui.destaque;
  S.ui.destaque = id;
  if (anterior) atualizarMarcador(anterior);
  if (id) atualizarMarcador(id);
}

function irPara(id) {
  const item = itemPorId(id);
  if (!item) return;
  destacar(id);
  mapa.flyTo(paraLatLng(item.x, item.y), Math.max(mapa.getZoom(), mapa.getMinZoom() + 2), { duration: 0.6 });
}

// ---------------------------------------------------------------- barra lateral

function renderLateral() {
  let total = 0, feitos = 0;
  for (const i of itens()) {
    if (!categoriaPorId(i.categoria)) continue;
    total++;
    if (encontrado(i.id)) feitos++;
  }
  const pct = total ? Math.round((feitos / total) * 100) : 0;
  $("#nomeMapa").textContent = S.mapa?.nome || "Mapa de Coletáveis";
  $("#barraTotal").style.width = pct + "%";
  $("#textoTotal").textContent = `${feitos} / ${total} · ${pct}%`;
  $("#resumoTopo").textContent = `${feitos}/${total}`;
  $("#esconderEncontrados").checked = S.ui.esconderEncontrados;
  $("#listaSoFaltando").checked = S.ui.soFaltando;

  renderFiltros();
  if (S.ui.aba === "lista") renderLista();
  if (S.ui.aba === "psn") renderPsn();
  $("#psnBolinha").hidden = !psnTemDivergencia();
}

function renderFiltros() {
  const grupos = gruposOrdenados();
  if (!grupos.length) {
    $("#grupos").innerHTML = `<p class="vazio">Nenhuma categoria ainda.<br>Abra <b>⚙ Configurações</b> para criar ou importar.</p>`;
    return;
  }
  $("#grupos").innerHTML = grupos
    .map((g) => {
      const visiveis = g.cats.filter((c) => !S.ui.ocultas.has(c.id)).length;
      return `<div class="grupo">
        <button class="grupo-titulo" data-grupo="${esc(g.id)}">${esc(g.nome)} <small>${visiveis === g.cats.length ? "esconder grupo" : "mostrar grupo"}</small></button>
        <div class="categorias">${g.cats
          .map((c) => {
            const { total, feitos } = contagem(c.id);
            const cls = ["cat", S.ui.ocultas.has(c.id) ? "oculta" : "", total && feitos === total ? "completa" : ""].join(" ");
            return `<button class="${cls}" data-cat="${esc(c.id)}" aria-pressed="${!S.ui.ocultas.has(c.id)}" title="${esc(c.nome)}">
              <span class="cat-icone" style="--cor:${esc(c.cor)}">${esc(c.icone)}</span>
              <span class="cat-nome">${esc(c.nome)}</span>
              <span class="cat-conta">${feitos}/${total}</span>
            </button>`;
          })
          .join("")}</div>
      </div>`;
    })
    .join("");
}

function salvarOcultas() {
  LS.set("ocultas", [...S.ui.ocultas]);
  renderMarcadores();
  renderLateral();
}

$("#grupos").addEventListener("click", (e) => {
  const cat = e.target.closest("[data-cat]");
  if (cat) {
    const id = cat.dataset.cat;
    S.ui.ocultas.has(id) ? S.ui.ocultas.delete(id) : S.ui.ocultas.add(id);
    return salvarOcultas();
  }
  const g = e.target.closest("[data-grupo]");
  if (g) {
    const grupo = gruposOrdenados().find((x) => x.id === g.dataset.grupo);
    const todosVisiveis = grupo.cats.every((c) => !S.ui.ocultas.has(c.id));
    for (const c of grupo.cats) todosVisiveis ? S.ui.ocultas.add(c.id) : S.ui.ocultas.delete(c.id);
    salvarOcultas();
  }
});
$("#mostrarTodos").onclick = () => {
  S.ui.ocultas.clear();
  salvarOcultas();
};
$("#esconderTodos").onclick = () => {
  S.ui.ocultas = new Set(categorias().map((c) => c.id));
  salvarOcultas();
};
$("#esconderEncontrados").onchange = (e) => {
  S.ui.esconderEncontrados = e.target.checked;
  LS.set("esconderEncontrados", S.ui.esconderEncontrados);
  renderMarcadores();
};

// ----- lista

function renderLista() {
  const busca = S.ui.busca.trim().toLowerCase();
  const blocos = [];
  for (const g of gruposOrdenados()) {
    for (const c of g.cats) {
      if (S.ui.ocultas.has(c.id) && !busca) continue;
      let lista = itens().filter((i) => i.categoria === c.id);
      const numeros = new Map(lista.map((i, n) => [i.id, n + 1]));
      if (S.ui.soFaltando) lista = lista.filter((i) => !encontrado(i.id));
      if (busca) lista = lista.filter((i) => (nomeItem(i) + " " + i.descricao + " " + c.nome).toLowerCase().includes(busca));
      if (!lista.length) continue;
      const { total, feitos } = contagem(c.id);
      blocos.push(`<div class="lista-cat">
        <h3><span class="cat-icone" style="--cor:${esc(c.cor)}">${esc(c.icone)}</span>${esc(c.nome)}<small>${feitos}/${total}</small></h3>
        ${lista
          .map((i) => `<div class="item-linha${encontrado(i.id) ? " feito" : ""}">
            <button class="item-check" data-marcar="${esc(i.id)}" aria-label="Marcar ${esc(nomeItem(i))}"><span>${encontrado(i.id) ? "✓" : ""}</span></button>
            <button class="item-ir" data-ir="${esc(i.id)}">${esc(i.nome || `${c.nome} #${numeros.get(i.id)}`)}${i.descricao ? `<small>${esc(i.descricao)}</small>` : ""}</button>
          </div>`)
          .join("")}
      </div>`);
    }
  }
  $("#lista").innerHTML = blocos.join("") || `<p class="vazio">${busca ? "Nada encontrado." : S.ui.soFaltando ? "Nada faltando nas categorias visíveis. 🎉" : "Nenhum coletável nas categorias visíveis."}</p>`;
}

$("#lista").addEventListener("click", (e) => {
  const m = e.target.closest("[data-marcar]");
  if (m) return marcar([m.dataset.marcar], !encontrado(m.dataset.marcar));
  const ir = e.target.closest("[data-ir]");
  if (ir) {
    if (ehCelular()) fecharMenu();
    irPara(ir.dataset.ir);
    abrirDetalhes(ir.dataset.ir);
  }
});
$("#busca").addEventListener("input", (e) => {
  S.ui.busca = e.target.value;
  renderLista();
});
$("#listaSoFaltando").onchange = (e) => {
  S.ui.soFaltando = e.target.checked;
  LS.set("soFaltando", S.ui.soFaltando);
  renderLista();
};

// ----- abas

function trocarAba(aba) {
  S.ui.aba = aba;
  for (const b of $$(".abas button")) b.classList.toggle("ativa", b.dataset.aba === aba);
  for (const a of ["filtros", "lista", "psn"]) $("#aba-" + a).hidden = a !== aba;
  renderLateral();
}
for (const b of $$(".abas button")) b.onclick = () => trocarAba(b.dataset.aba);

// ----- menu no celular

function abrirMenu() {
  $("#lateral").classList.add("aberto");
  $("#fundoMenu").hidden = false;
}
function fecharMenu() {
  $("#lateral").classList.remove("aberto");
  $("#fundoMenu").hidden = true;
}
$("#abrirMenu").onclick = abrirMenu;
$("#fecharMenu").onclick = fecharMenu;
$("#fundoMenu").onclick = fecharMenu;

// ---------------------------------------------------------------- toque rápido e modo edição

function renderModos() {
  const b = $("#toqueRapido");
  b.setAttribute("aria-pressed", String(S.ui.rapido));
  b.querySelector("b").textContent = `Toque rápido: ${S.ui.rapido ? "LIGADO" : "DESLIGADO"}`;
  $("#toqueRapidoDica").textContent = S.ui.rapido ? "tocou, marcou · segure = detalhes" : "tocar abre os detalhes";
  $("#barraBaixo").hidden = S.ui.editar;
  $("#faixaEdicao").hidden = !S.ui.editar;
  $("#mapa").style.cursor = S.ui.editar ? "crosshair" : "";
}
$("#toqueRapido").onclick = () => {
  S.ui.rapido = !S.ui.rapido;
  LS.set("rapido", S.ui.rapido);
  renderModos();
  aviso(S.ui.rapido ? "⚡ Toque rápido ligado: tocou no ícone, marcou." : "Toque rápido desligado: tocar abre os detalhes.");
};

function entrarEdicao(ligar) {
  S.ui.editar = ligar;
  fecharPainel();
  renderModos();
  renderMarcadores();
  if (ligar && !categorias().length) abrirEdicaoCategoria(null);
}
$("#sairEdicao").onclick = () => entrarEdicao(false);

// ---------------------------------------------------------------- avisos

function aviso(html, { tipo = "", acao, aoClicar, duracao = 5000 } = {}) {
  const caixa = $("#avisos");
  while (caixa.children.length >= 3) caixa.firstElementChild.remove();
  const el = document.createElement("div");
  el.className = "aviso " + tipo;
  el.innerHTML = `<span class="aviso-texto">${html}</span>${acao ? `<button>${esc(acao)}</button>` : ""}`;
  if (acao) {
    el.querySelector("button").onclick = () => {
      el.remove();
      aoClicar();
    };
  }
  caixa.append(el);
  setTimeout(() => el.remove(), duracao);
}

// ---------------------------------------------------------------- painel de baixo

function abrirPainel(html) {
  $("#painelConteudo").innerHTML = html;
  $("#painel").hidden = false;
  document.body.classList.add("painel-aberto");
}
function fecharPainel() {
  $("#painel").hidden = true;
  document.body.classList.remove("painel-aberto");
  destacar(null);
}
$("#painel").addEventListener("click", (e) => {
  if (e.target.closest("[data-fechar]")) fecharPainel();
});

function cabecalho(cat, titulo, sub) {
  return `<div class="painel-cab">
    <span class="cat-icone" style="--cor:${esc(cat?.cor || "#888")}">${esc(cat?.icone || "📍")}</span>
    <div><h2>${esc(titulo)}</h2><small>${sub}</small></div>
    <button class="icone-btn" data-fechar aria-label="Fechar">✕</button>
  </div>`;
}

function abrirDetalhes(id) {
  const item = itemPorId(id);
  if (!item) return;
  const cat = categoriaPorId(item.categoria);
  const c = contagem(item.categoria);
  const feito = encontrado(id);
  const quando = feito ? new Date(S.progresso.encontrados[id]).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "";
  destacar(id);
  abrirPainel(`
    ${cabecalho(cat, nomeItem(item), `${esc(cat?.nome || "")} · ${c.feitos}/${c.total}`)}
    ${item.descricao ? `<p>${esc(item.descricao)}</p>` : ""}
    ${feito
      ? `<button class="btn-peguei desfazer" id="botaoMarcar">↩ Desmarcar</button><div class="dica">Marcado como pego em ${quando}.</div>`
      : `<button class="btn-peguei" id="botaoMarcar">✓ PEGUEI</button>`}
  `);
  $("#botaoMarcar").onclick = () => {
    marcar([id], !feito);
    fecharPainel();
  };
}

function opcoesCategorias(selecionada) {
  return categorias().map((c) => `<option value="${esc(c.id)}" ${c.id === selecionada ? "selected" : ""}>${esc(c.icone)} ${esc(c.nome)}</option>`).join("");
}

// criar (id = null, com posição) ou editar um coletável
function abrirEdicaoItem(id, posicao) {
  if (!categorias().length) return abrirEdicaoCategoria(null);
  const item = id ? itemPorId(id) : null;
  const catSel = item?.categoria || (categoriaPorId(S.ui.ultimaCategoria) ? S.ui.ultimaCategoria : categorias()[0].id);
  destacar(id);
  abrirPainel(`
    ${cabecalho(categoriaPorId(catSel), item ? "Editar coletável" : "Novo coletável", item ? "Arraste o ícone no mapa para mudar de lugar" : "Vai ficar onde você tocou")}
    <form class="form" id="formItem">
      <label>Categoria <select class="campo" name="categoria">${opcoesCategorias(catSel)}</select></label>
      <label>Nome (opcional, se vazio numera sozinho) <input class="campo" name="nome" value="${esc(item?.nome || "")}" maxlength="80"></label>
      <label>Dica / descrição (opcional) <textarea class="campo" name="descricao" maxlength="500" placeholder="Ex.: no telhado, suba pela escada dos fundos">${esc(item?.descricao || "")}</textarea></label>
      <div class="linha-botoes">
        ${item ? `<button type="button" class="btn perigo" id="excluirItem">Excluir</button>` : ""}
        <button type="submit" class="btn primario">${item ? "Salvar" : "Adicionar"}</button>
      </div>
    </form>
  `);
  const form = $("#formItem");
  form.onsubmit = (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(form));
    S.ui.ultimaCategoria = d.categoria;
    LS.set("ultimaCategoria", d.categoria);
    if (S.ui.ocultas.has(d.categoria)) {
      S.ui.ocultas.delete(d.categoria);
      LS.set("ocultas", [...S.ui.ocultas]);
    }
    if (item) Object.assign(item, { categoria: d.categoria, nome: d.nome.trim(), descricao: d.descricao.trim() });
    else S.mapa.itens.push({ id: novoId("i"), categoria: d.categoria, ...posicao, nome: d.nome.trim(), descricao: d.descricao.trim() });
    salvarMapa();
    fecharPainel();
    renderMarcadores();
    renderLateral();
  };
  if (item) {
    $("#excluirItem").onclick = () => {
      if (!confirm(`Excluir "${nomeItem(item)}"?`)) return;
      S.mapa.itens = S.mapa.itens.filter((i) => i.id !== id);
      salvarMapa();
      fecharPainel();
      renderMarcadores();
      renderLateral();
    };
  } else {
    // no PC, já deixa o Enter pronto para adicionar rápido
    if (!ehCelular()) form.querySelector("[type=submit]").focus();
  }
}

// ---------------------------------------------------------------- janela central

function abrirJanela(html) {
  $("#janela").innerHTML = html;
  $("#janelaFundo").hidden = false;
}
function fecharJanela() {
  $("#janelaFundo").hidden = true;
}
$("#janelaFundo").addEventListener("click", (e) => {
  if (e.target.id === "janelaFundo" || e.target.closest("[data-fechar-janela]")) fecharJanela();
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!$("#janelaFundo").hidden) fecharJanela();
  else if (!$("#painel").hidden) fecharPainel();
  else if (S.ui.editar) entrarEdicao(false);
});

const xJanela = `<button class="icone-btn" data-fechar-janela aria-label="Fechar">✕</button>`;

function abrirBoasVindas() {
  abrirJanela(`
    <h2>Bem-vindo! 👋</h2>
    <p class="sub">Seu mapa ainda está vazio. Como você quer começar?</p>
    <div class="opcoes">
      <button class="opcao" data-acao="exemplo"><span class="emoji">🧪</span><span><b>Ver um exemplo para testar</b><small>Coletáveis fictícios, só para você ver como funciona</small></span></button>
      <button class="opcao" data-acao="importar"><span class="emoji">📥</span><span><b>Importar uma lista de coletáveis</b><small>Arquivo .json com as posições</small></span></button>
      <button class="opcao" data-acao="zero"><span class="emoji">✏️</span><span><b>Montar o meu do zero</b><small>Você toca no mapa e vai adicionando</small></span></button>
    </div>
    <p class="dica">Dica: envie a imagem do mapa do jogo em ⚙ Configurações. Dá para fazer isso a qualquer momento.</p>
  `);
  ligarAcoesJanela();
}

function abrirConfig() {
  const cats = categorias();
  abrirJanela(`
    <div class="janela-cab"><h2>Configurações</h2>${xJanela}</div>

    <h3>Coletáveis no mapa</h3>
    <button class="btn largo" data-acao="editar">✏️ Entrar no modo edição (adicionar, mover, apagar)</button>

    <h3>Categorias</h3>
    ${cats.length ? cats.map((c) => {
      const { total } = contagem(c.id);
      return `<div class="cat-editar"><span class="cat-icone" style="--cor:${esc(c.cor)}">${esc(c.icone)}</span><span class="cat-nome">${esc(c.nome)}</span><span class="texto-2">${total}</span><button class="btn pequeno" data-editar-cat="${esc(c.id)}">Editar</button></div>`;
    }).join("") : `<p class="texto-2">Nenhuma categoria ainda.</p>`}
    <button class="btn largo" style="margin-top:10px" data-acao="novaCat">+ Nova categoria</button>

    <h3>Mapa</h3>
    <form class="form" id="formNome" style="margin-top:0"><label>Nome do mapa <input class="campo" name="nome" value="${esc(S.mapa?.nome || "")}" maxlength="60"></label></form>
    <button class="btn largo" style="margin-top:10px" data-acao="imagem">🗺️ ${S.temImagem ? "Trocar" : "Enviar"} a imagem do mapa</button>
    <p class="dica">As posições ficam guardadas em proporção. Se depois você trocar por uma imagem maior do mesmo mapa, nada sai do lugar.</p>

    <h3>Arquivos</h3>
    <div class="opcoes">
      <button class="opcao" data-acao="importar"><span class="emoji">📥</span><span><b>Importar lista de coletáveis</b><small>Substitui a lista atual (o progresso dos itens com o mesmo id continua)</small></span></button>
      <button class="opcao" data-acao="exportar"><span class="emoji">📤</span><span><b>Exportar lista de coletáveis</b><small>Para guardar ou compartilhar com amigos</small></span></button>
      <button class="opcao" data-acao="backup"><span class="emoji">💾</span><span><b>Baixar backup completo</b><small>Lista + seu progresso</small></span></button>
      <button class="opcao" data-acao="exemplo"><span class="emoji">🧪</span><span><b>Carregar o exemplo fictício</b><small>Substitui a lista atual</small></span></button>
    </div>

    <h3>Progresso</h3>
    <button class="btn largo perigo" data-acao="zerar">Zerar meu progresso</button>
  `);
  ligarAcoesJanela();
  $("#formNome").onsubmit = (e) => e.preventDefault();
  $("#formNome [name=nome]").onchange = (e) => {
    S.mapa.nome = e.target.value.trim() || "Mapa de Coletáveis";
    salvarMapa();
    renderLateral();
  };
  for (const b of $$("[data-editar-cat]")) b.onclick = () => abrirEdicaoCategoria(b.dataset.editarCat);
}

function ligarAcoesJanela() {
  for (const b of $$("#janela [data-acao]")) b.onclick = () => acoes[b.dataset.acao]();
}

const acoes = {
  editar() {
    fecharJanela();
    if (ehCelular()) fecharMenu();
    entrarEdicao(true);
  },
  novaCat: () => abrirEdicaoCategoria(null),
  imagem: () => $("#arquivoImagem").click(),
  importar: () => $("#arquivoJson").click(),
  exportar() {
    baixar("coletaveis.json", S.mapa);
  },
  backup() {
    baixar(`backup-mapa-${new Date().toISOString().slice(0, 10)}.json`, { mapa: S.mapa, progresso: S.progresso });
  },
  async exemplo() {
    if (itens().length && !confirm("Isso vai substituir a sua lista atual pelo exemplo fictício. Continuar?")) return;
    try {
      const r = await fetch("exemplo.json");
      await trocarMapa(normalizarMapa(await r.json()));
      fecharJanela();
      aviso("Exemplo carregado. Toque num ícone para marcar como pego!");
    } catch (e) {
      aviso("Não consegui carregar o exemplo: " + esc(e.message), { tipo: "erro" });
    }
  },
  zero() {
    S.mapa = {
      versao: 1,
      nome: "Meu mapa",
      grupos: [{ id: "colecionaveis", nome: "Coletáveis" }],
      categorias: [{ id: "c_coletavel", nome: "Coletáveis", icone: "⭐", cor: "#ff4fa3", grupo: "colecionaveis" }],
      itens: [],
    };
    salvarMapa();
    fecharJanela();
    renderLateral();
    entrarEdicao(true);
    aviso("Toque no mapa onde fica cada coletável. Crie mais categorias em ⚙ Configurações.", { duracao: 8000 });
  },
  async zerar() {
    if (!confirm("Zerar TODO o seu progresso? Isso desmarca todos os coletáveis.")) return;
    S.pendentes = [];
    LS.set("pendentes", []);
    receberProgresso(await api("POST", "/api/progresso/zerar"));
    fecharJanela();
    aviso("Progresso zerado.");
  },
};

async function trocarMapa(novo) {
  S.mapa = novo;
  S.ui.ocultas = new Set([...S.ui.ocultas].filter((id) => categoriaPorId(id)));
  LS.set("ocultas", [...S.ui.ocultas]);
  await api("PUT", "/api/mapa", S.mapa);
  renderMarcadores();
  renderLateral();
}

function baixar(nome, dados) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(dados, null, 2)], { type: "application/json" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: nome });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

$("#arquivoJson").onchange = async (e) => {
  const arq = e.target.files[0];
  e.target.value = "";
  if (!arq) return;
  try {
    const dados = JSON.parse(await arq.text());
    const ehBackup = dados.mapa && dados.progresso;
    const novo = normalizarMapa(ehBackup ? dados.mapa : dados);
    if (itens().length && !confirm(`Substituir a lista atual por "${novo.nome}" (${novo.itens.length} coletáveis)?`)) return;
    await trocarMapa(novo);
    if (ehBackup) {
      const ids = Object.keys(dados.progresso.encontrados || {}).filter((id) => novo.itens.some((i) => i.id === id));
      marcar(ids, true, { texto: `Backup restaurado: ${ids.length} coletáveis marcados.` });
    } else aviso(`Lista importada: ${novo.itens.length} coletáveis em ${novo.categorias.length} categorias.`);
    fecharJanela();
  } catch (err) {
    aviso("Não consegui importar: " + esc(err.message), { tipo: "erro", duracao: 8000 });
  }
};

$("#arquivoImagem").onchange = async (e) => {
  const arq = e.target.files[0];
  e.target.value = "";
  if (!arq) return;
  try {
    aviso("Enviando a imagem…");
    await api("POST", "/api/mapa-imagem", arq);
    S.temImagem = true;
    await montarFundo({ manterVista: false });
    fecharJanela();
    aviso("Imagem do mapa atualizada!");
  } catch (err) {
    aviso("Não consegui enviar a imagem: " + esc(err.message), { tipo: "erro" });
  }
};

// criar (id = null) ou editar uma categoria
function abrirEdicaoCategoria(id) {
  const cat = id ? categoriaPorId(id) : null;
  const grupos = S.mapa?.grupos || [];
  const grupoAtual = grupos.find((g) => g.id === cat?.grupo)?.nome || grupos[0]?.nome || "Coletáveis";
  const { total } = cat ? contagem(cat.id) : { total: 0 };
  abrirJanela(`
    <div class="janela-cab"><h2>${cat ? "Editar categoria" : "Nova categoria"}</h2>${xJanela}</div>
    <form class="form" id="formCat">
      <label>Nome <input class="campo" name="nome" required maxlength="40" value="${esc(cat?.nome || "")}" placeholder="Ex.: Cartas de baralho"></label>
      <div class="dupla">
        <label>Ícone (um emoji) <input class="campo" name="icone" maxlength="4" value="${esc(cat?.icone || "⭐")}"></label>
        <label>Cor <input class="campo" type="color" name="cor" value="${esc(cat?.cor || "#ff4fa3")}"></label>
      </div>
      <label>Grupo (aparece como título no filtro)
        <input class="campo" name="grupo" list="listaGrupos" maxlength="30" value="${esc(grupoAtual)}">
        <datalist id="listaGrupos">${grupos.map((g) => `<option value="${esc(g.nome)}">`).join("")}</datalist>
      </label>
      <div class="linha-botoes">
        ${cat ? `<button type="button" class="btn perigo" id="excluirCat">Excluir</button>` : ""}
        <button type="button" class="btn" data-fechar-janela>Cancelar</button>
        <button type="submit" class="btn primario">Salvar</button>
      </div>
    </form>
  `);
  $("#formCat").onsubmit = (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    if (!S.mapa) S.mapa = { versao: 1, nome: "Meu mapa", grupos: [], categorias: [], itens: [] };
    const nomeGrupo = d.grupo.trim() || "Outros";
    let grupo = S.mapa.grupos.find((g) => g.nome.toLowerCase() === nomeGrupo.toLowerCase());
    if (!grupo) S.mapa.grupos.push((grupo = { id: novoId("g"), nome: nomeGrupo }));
    const dados = { nome: d.nome.trim(), icone: d.icone.trim() || "📍", cor: d.cor, grupo: grupo.id };
    if (cat) Object.assign(cat, dados);
    else S.mapa.categorias.push({ id: novoId("c"), ...dados });
    // apaga grupos que ficaram vazios
    S.mapa.grupos = S.mapa.grupos.filter((g) => S.mapa.categorias.some((c) => c.grupo === g.id));
    salvarMapa();
    renderMarcadores();
    renderLateral();
    abrirConfig();
  };
  if (cat) {
    $("#excluirCat").onclick = () => {
      if (!confirm(`Excluir a categoria "${cat.nome}" e os ${total} coletáveis dela?`)) return;
      S.mapa.categorias = S.mapa.categorias.filter((c) => c.id !== id);
      S.mapa.itens = S.mapa.itens.filter((i) => i.categoria !== id);
      S.mapa.grupos = S.mapa.grupos.filter((g) => S.mapa.categorias.some((c) => c.grupo === g.id));
      salvarMapa();
      renderMarcadores();
      renderLateral();
      abrirConfig();
    };
  }
}

$("#abrirConfig").onclick = () => {
  if (ehCelular()) fecharMenu();
  abrirConfig();
};

// ---------------------------------------------------------------- PSN

function trofeuDe(catId) {
  const tid = S.progresso.psn.vinculos[catId];
  if (tid == null || !S.psn.trofeus) return null;
  return S.psn.trofeus.find((t) => String(t.id) === String(tid)) || null;
}

// compara o que a PSN diz com o que você marcou
function comparar(catId) {
  const t = trofeuDe(catId);
  if (!t) return null;
  const { total, feitos } = contagem(catId);
  if (t.alvo && t.progresso != null) {
    if (t.progresso > feitos) return { tipo: "falta", psn: t.progresso, feitos, total, t };
    if (t.progresso < feitos) return { tipo: "sobra", psn: t.progresso, feitos, total, t };
    return { tipo: "ok", psn: t.progresso, feitos, total, t };
  }
  if (t.conquistado) return feitos < total ? { tipo: "conquistado", feitos, total, t } : { tipo: "ok", feitos, total, t };
  return { tipo: "semContador", feitos, total, t };
}

function psnTemDivergencia() {
  return categorias().some((c) => {
    const r = comparar(c.id);
    return r && (r.tipo === "falta" || r.tipo === "conquistado");
  });
}

function mostrarFaltando(catId) {
  const cat = categoriaPorId(catId);
  S.ui.ocultas = new Set(categorias().filter((c) => c.id !== catId).map((c) => c.id));
  S.ui.esconderEncontrados = true;
  LS.set("esconderEncontrados", true);
  salvarOcultas();
  const faltando = itens().filter((i) => i.categoria === catId && !encontrado(i.id));
  if (faltando.length) mapa.flyToBounds(L.latLngBounds(faltando.map((i) => paraLatLng(i.x, i.y))).pad(0.3), { duration: 0.6, maxZoom: 1 });
  if (ehCelular()) fecharMenu();
  aviso(`Mostrando só os ${faltando.length} que faltam de <b>${esc(cat.nome)}</b>. Toque no que você pegou. Para voltar: Filtros → Mostrar todos.`, { tipo: "psn", duracao: 9000 });
}

function statusHtml(catId) {
  const r = comparar(catId);
  if (!S.psn.trofeus) return `<div class="psn-status texto-2">Sincronize para comparar.</div>`;
  if (!r) return "";
  const meta = r.t.alvo && r.t.alvo !== r.total ? `<div class="texto-2" style="margin-top:4px">O troféu pede ${r.t.alvo} e o seu mapa tem ${r.total} desse tipo.</div>` : "";
  switch (r.tipo) {
    case "falta":
      return `<div class="psn-status alerta">A PSN conta <b>${r.psn}</b>, você marcou <b>${r.feitos}</b>. Falta marcar ${r.psn - r.feitos}.${meta}
        <button class="btn pequeno" data-faltando="${esc(catId)}">Ver no mapa os que faltam</button></div>`;
    case "sobra":
      return `<div class="psn-status alerta">Você marcou <b>${r.feitos}</b>, mas a PSN só conta <b>${r.psn}</b>. Será que marcou algum sem querer?${meta}</div>`;
    case "conquistado":
      return `<div class="psn-status alerta">🏆 Troféu conquistado! Você marcou ${r.feitos} de ${r.total}.
        <button class="btn pequeno" data-todos="${esc(catId)}">Marcar todos como pegos</button></div>`;
    case "ok":
      return `<div class="psn-status ok">✓ Bate com a PSN${r.psn != null ? ` (${r.psn}/${r.t.alvo})` : ""}.${meta}</div>`;
    default:
      return `<div class="psn-status texto-2">Esse troféu não tem contador: o app só fica sabendo quando você conquistar ele.</div>`;
  }
}

function opcoesTrofeus(catId) {
  const atual = S.progresso.psn.vinculos[catId];
  const { total } = contagem(catId);
  const lista = [...(S.psn.trofeus || [])].sort((a, b) => {
    const pa = (a.alvo === total ? 2 : 0) + (a.alvo ? 1 : 0), pb = (b.alvo === total ? 2 : 0) + (b.alvo ? 1 : 0);
    return pb - pa;
  });
  // se o troféu vinculado ainda não foi carregado, mantém ele na lista
  const extra = atual != null && !lista.some((t) => String(t.id) === String(atual)) ? `<option value="${esc(atual)}" selected>Troféu #${esc(atual)}</option>` : "";
  return `<option value="">— sem troféu —</option>${extra}` +
    lista.map((t) => {
      const sel = String(t.id) === String(atual) ? "selected" : "";
      const conta = t.alvo ? ` (${t.progresso ?? 0}/${t.alvo})` : "";
      const combina = t.alvo && t.alvo === total ? " ★" : "";
      return `<option value="${esc(t.id)}" ${sel}>${t.conquistado ? "🏆 " : ""}${esc(t.nome || "Troféu oculto")}${conta}${combina}</option>`;
    }).join("");
}

function renderPsn() {
  const el = $("#psn");
  const p = S.psn;
  if (!p.configurada) {
    el.innerHTML = `
      <p>Conecte sua conta da PSN para o app conferir seus troféus de coletáveis.</p>
      <ol class="psn-passos">
        <li>No navegador, entre em <a href="https://www.playstation.com" target="_blank" rel="noopener">playstation.com</a> e faça login.</li>
        <li>Na mesma aba, abra:<br><a href="https://ca.account.sony.com/api/v1/ssocookie" target="_blank" rel="noopener">https://ca.account.sony.com/api/v1/ssocookie</a></li>
        <li>Vai aparecer algo como <code>{"npsso":"abc123…"}</code>. Copie tudo e cole aqui:</li>
      </ol>
      <textarea class="campo" id="npsso" placeholder='{"npsso":"..."}' autocomplete="off" spellcheck="false"></textarea>
      <button class="btn primario largo" id="conectarPsn" style="margin-top:10px">Conectar</button>
      ${p.erro ? `<div class="psn-status alerta">${esc(p.erro)}</div>` : ""}
      <div class="caixa aviso-caixa">🔒 Esse código dá acesso à sua conta da PSN. <b>Não mande para ninguém.</b> Ele fica salvo só no seu PC (na pasta <code>dados</code>) e só é usado para ler seus troféus. De tempos em tempos ele expira, e aí é só repetir estes passos.</div>`;
    $("#conectarPsn").onclick = async () => {
      const npsso = $("#npsso").value;
      $("#conectarPsn").disabled = true;
      $("#conectarPsn").textContent = "Conectando…";
      try {
        await api("POST", "/api/psn/token", { npsso });
        p.configurada = true;
        p.erro = null;
        aviso("PSN conectada! Agora escolha o jogo.", { tipo: "psn" });
      } catch (e) {
        p.erro = e.message;
      }
      renderPsn();
    };
    return;
  }

  const jogo = S.progresso.psn.jogo;
  if (!jogo || p.escolhendo) {
    el.innerHTML = `
      ${p.demo ? `<div class="caixa aviso-caixa">🧪 Modo demonstração: a PSN é simulada.</div>` : ""}
      <p><b>Escolha o jogo</b></p>
      <div id="jogos" class="opcoes"><p class="texto-2">Carregando seus jogos…</p></div>
      ${p.erro ? `<div class="psn-status alerta">${esc(p.erro)}</div>` : ""}
      ${jogo ? `<button class="btn largo" style="margin-top:10px" id="cancelarJogo">Cancelar</button>` : ""}`;
    if ($("#cancelarJogo")) $("#cancelarJogo").onclick = () => { p.escolhendo = false; renderPsn(); };
    carregarJogos();
    return;
  }

  el.innerHTML = `
    ${p.demo ? `<div class="caixa aviso-caixa">🧪 Modo demonstração: a PSN é simulada (os contadores sobem 1 por minuto).</div>` : ""}
    <div class="caixa">
      <div style="display:flex;align-items:center;gap:8px"><span>🎮</span><b style="flex:1">${esc(jogo.nome)}</b><button class="btn pequeno" id="trocarJogo">Trocar</button></div>
      <button class="btn primario largo" id="sincronizar" style="margin-top:10px" ${p.carregando ? "disabled" : ""}>${p.carregando ? "Sincronizando…" : "🔄 Sincronizar agora"}</button>
      <label class="chave pequena"><input type="checkbox" id="autoSync" ${S.ui.autoSync ? "checked" : ""}><span class="trilho"></span><span>Sincronizar sozinho a cada 2 min</span></label>
      <div class="texto-2">${p.ultimoSync ? "Última vez: " + new Date(p.ultimoSync).toLocaleTimeString("pt-BR") : "Ainda não sincronizou."}</div>
      ${p.erro ? `<div class="psn-status alerta">${esc(p.erro)}</div>` : ""}
    </div>
    <p style="margin-top:16px"><b>Ligue cada categoria ao troféu dela</b><br><span class="texto-2">Ex.: "Pacotes escondidos" → troféu "Encontre todos os pacotes". ★ = o número do troféu bate com o do seu mapa.</span></p>
    ${categorias().map((c) => `
      <div class="psn-cat">
        <div class="psn-cat-topo"><span class="cat-icone" style="--cor:${esc(c.cor)}">${esc(c.icone)}</span>${esc(c.nome)}</div>
        <select class="campo" data-vinculo="${esc(c.id)}" ${S.psn.trofeus ? "" : "disabled"}>${opcoesTrofeus(c.id)}</select>
        ${S.progresso.psn.vinculos[c.id] != null ? statusHtml(c.id) : ""}
      </div>`).join("") || `<p class="texto-2">Crie categorias primeiro.</p>`}
    <div class="caixa aviso-caixa" style="margin-top:16px">A PSN só informa <b>quantos</b> você pegou (nos troféus com contador), não <b>quais</b>. Por isso o app avisa quando o número sobe, e você toca no que pegou.</div>
    <button class="btn largo perigo" id="desconectarPsn" style="margin-top:12px">Desconectar PSN</button>`;

  $("#trocarJogo").onclick = () => { p.escolhendo = true; renderPsn(); };
  $("#sincronizar").onclick = () => sincronizarPsn(true);
  $("#autoSync").onchange = (e) => {
    S.ui.autoSync = e.target.checked;
    LS.set("autoSync", S.ui.autoSync);
  };
  for (const s of $$("[data-vinculo]")) {
    s.onchange = async () => {
      const v = { ...S.progresso.psn.vinculos };
      if (s.value === "") delete v[s.dataset.vinculo];
      else v[s.dataset.vinculo] = Number.isNaN(Number(s.value)) ? s.value : Number(s.value);
      S.progresso.psn.vinculos = v;
      renderLateral();
      try {
        receberProgresso(await api("POST", "/api/progresso/psn", { vinculos: v }));
      } catch (e) {
        aviso("Não consegui salvar: " + esc(e.message), { tipo: "erro" });
      }
    };
  }
  for (const b of $$("[data-faltando]")) b.onclick = () => mostrarFaltando(b.dataset.faltando);
  for (const b of $$("[data-todos]")) {
    b.onclick = () => {
      const ids = itens().filter((i) => i.categoria === b.dataset.todos).map((i) => i.id);
      marcar(ids, true, { texto: `🏆 ${ids.length} marcados como pegos.` });
    };
  }
  $("#desconectarPsn").onclick = async () => {
    if (!confirm("Desconectar a PSN? (Seus vínculos de troféus continuam salvos.)")) return;
    await api("DELETE", "/api/psn/token");
    Object.assign(p, { configurada: false, trofeus: null, anterior: null, ultimoSync: 0, erro: null });
    renderLateral();
  };
}

async function carregarJogos() {
  const p = S.psn;
  try {
    if (!p.jogos) p.jogos = await api("GET", "/api/psn/jogos");
    p.erro = null;
  } catch (e) {
    p.erro = e.message;
    const el = $("#jogos");
    if (el) el.innerHTML = "";
    return renderPsnErro();
  }
  const el = $("#jogos");
  if (!el) return;
  const pareceGta = (j) => /grand theft auto|\bgta\b/i.test(j.nome);
  const lista = [...p.jogos].sort((a, b) => pareceGta(b) - pareceGta(a));
  el.innerHTML = lista.length
    ? lista.map((j) => `<button class="opcao" data-jogo="${esc(j.id)}">${j.icone ? `<img src="${esc(j.icone)}" alt="" width="40" height="40" style="border-radius:8px;object-fit:cover">` : `<span class="emoji">🎮</span>`}<span><b>${esc(j.nome)}</b><small>${esc(j.plataforma || "")}${j.progresso != null ? ` · ${j.progresso}% dos troféus` : ""}</small></span></button>`).join("")
    : `<p class="texto-2">Nenhum jogo com troféus na sua conta ainda. Jogue um pouco e tente de novo.</p>`;
  for (const b of $$("[data-jogo]", el)) {
    b.onclick = async () => {
      const j = p.jogos.find((x) => x.id === b.dataset.jogo);
      const mudou = S.progresso.psn.jogo?.id !== j.id;
      p.escolhendo = false;
      try {
        receberProgresso(await api("POST", "/api/progresso/psn", { jogo: { id: j.id, nome: j.nome, servico: j.servico }, ...(mudou ? { vinculos: {} } : {}) }));
      } catch (e) {
        aviso("Não consegui salvar: " + esc(e.message), { tipo: "erro" });
      }
      if (mudou) Object.assign(p, { trofeus: null, anterior: null });
      renderPsn();
      sincronizarPsn(true);
    };
  }
}

function renderPsnErro() {
  const el = $("#jogos");
  if (el && S.psn.erro) el.innerHTML = `<div class="psn-status alerta">${esc(S.psn.erro)}</div><button class="btn largo" id="tentarDeNovo" style="margin-top:8px">Tentar de novo</button>`;
  if ($("#tentarDeNovo")) $("#tentarDeNovo").onclick = () => { S.psn.jogos = null; renderPsn(); };
}

async function sincronizarPsn(manual = false) {
  const p = S.psn;
  const jogo = S.progresso.psn.jogo;
  if (!p.configurada || !jogo || p.carregando) return;
  p.carregando = true;
  if (S.ui.aba === "psn") renderPsn();
  try {
    const trofeus = await api("GET", `/api/psn/trofeus?jogo=${encodeURIComponent(jogo.id)}&servico=${encodeURIComponent(jogo.servico || "trophy2")}`);
    // avisa o que mudou desde a última vez
    if (p.anterior) {
      for (const c of categorias()) {
        const tid = S.progresso.psn.vinculos[c.id];
        if (tid == null) continue;
        const novo = trofeus.find((t) => String(t.id) === String(tid));
        const velho = p.anterior.get(String(tid));
        if (!novo || !velho) continue;
        if (novo.conquistado && !velho.conquistado) {
          aviso(`🏆 Troféu <b>${esc(novo.nome)}</b> conquistado!`, {
            tipo: "psn", duracao: 12000, acao: "Marcar todos",
            aoClicar: () => marcar(itens().filter((i) => i.categoria === c.id).map((i) => i.id), true),
          });
        } else if (novo.progresso != null && velho.progresso != null && novo.progresso > velho.progresso) {
          const dif = novo.progresso - velho.progresso;
          aviso(`🎮 PSN: <b>+${dif}</b> em ${esc(c.nome)} (${novo.progresso}/${novo.alvo}). Toque no que você pegou.`, {
            tipo: "psn", duracao: 12000, acao: "Ver", aoClicar: () => mostrarFaltando(c.id),
          });
        }
      }
    }
    p.anterior = new Map(trofeus.map((t) => [String(t.id), t]));
    p.trofeus = trofeus;
    p.ultimoSync = Date.now();
    p.erro = null;
    if (manual) aviso("PSN sincronizada.", { tipo: "psn", duracao: 2500 });
  } catch (e) {
    p.erro = e.message;
    if (manual) aviso("PSN: " + esc(e.message), { tipo: "erro", duracao: 8000 });
  } finally {
    p.carregando = false;
    renderLateral();
  }
}

setInterval(() => {
  if (S.ui.autoSync && !document.hidden && Date.now() - S.psn.ultimoSync >= 120000) sincronizarPsn();
}, 20000);

// ---------------------------------------------------------------- início

async function iniciar() {
  renderModos();
  try {
    const e = await api("GET", "/api/estado");
    S.mapa = e.mapa ? normalizarMapa(e.mapa) : null;
    S.temImagem = e.imagem;
    S.psn.configurada = e.psn.configurada;
    S.psn.demo = e.psn.demo;
    receberProgresso(e.progresso);
  } catch (err) {
    aviso("Não consegui falar com o PC. O programa (npm start) está aberto? " + esc(err.message), { tipo: "erro", duracao: 15000 });
  }
  await montarFundo();
  renderLateral();
  enviarPendentes();
  if (!S.mapa || !S.mapa.categorias.length) abrirBoasVindas();
  if (S.psn.configurada && S.progresso.psn.jogo) sincronizarPsn();

  // mantém PC e celular iguais: busca o progresso de tempos em tempos
  setInterval(buscarProgresso, 10000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      buscarProgresso();
      enviarPendentes();
    }
  });
}

iniciar();
