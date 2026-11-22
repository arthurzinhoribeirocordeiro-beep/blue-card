"use strict";

// Conexão com a PSN feita direto pelo celular.
// Usa os mesmos endereços e passos da biblioteca psn-api (não oficial).
// Só funciona dentro do app instalado (APK): o navegador bloqueia
// pedidos para os servidores da Sony. No navegador dá para usar a PSN simulada.
const PSN = (() => {
  const AUTH = "https://ca.account.sony.com/api/authz/v3/oauth";
  const TROFEUS = "https://m.np.playstation.com/api/trophy/v1";
  const CLIENTE = "09515159-7237-4370-9b40-3806e67c0891";
  const BASIC = "Basic MDk1MTUxNTktNzIzNy00MzcwLTliNDAtMzgwNmU2N2MwODkxOnVjUGprYTV0bnRCMktxc1A=";
  const REDIRECT = "com.scee.psxandroid.scecompcall://redirect";
  const ESCOPO = "psn:mobile.v2.core psn:clientapp";

  let auth = null; // { accessToken, refreshToken, expiraEm, refreshExpiraEm, npsso }
  let demo = false;
  let inicioDemo = Date.now();

  class ErroPsn extends Error {
    constructor(msg, precisaReconectar = false) {
      super(msg);
      this.precisaReconectar = precisaReconectar;
    }
  }

  const nativo = () => !!(window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform() && Capacitor.Plugins.CapacitorHttp);

  async function http(opcoes) {
    try {
      return await Capacitor.Plugins.CapacitorHttp.request({ connectTimeout: 15000, readTimeout: 20000, ...opcoes });
    } catch (e) {
      throw new ErroPsn("Sem internet ou a PSN não respondeu. (" + (e.message || e) + ")");
    }
  }

  const cabecalho = (headers, nome) => {
    for (const k in headers || {}) if (k && k.toLowerCase() === nome) return headers[k];
    return null;
  };
  const json = (d) => {
    if (typeof d !== "string") return d;
    try {
      return JSON.parse(d);
    } catch {
      return null;
    }
  };

  // aceita o texto inteiro que a página da Sony mostra: {"npsso":"..."}
  function limparNpsso(texto) {
    let t = String(texto || "").trim();
    const achado = t.match(/"npsso"\s*:\s*"([^"]+)"/);
    if (achado) t = achado[1];
    if (!/^[A-Za-z0-9]{20,128}$/.test(t)) throw new ErroPsn("Esse código não parece um NPSSO. Copie tudo o que aparece na página da Sony, inclusive as chaves { }.");
    return t;
  }

  async function trocarPorTokens(dados) {
    const r = await http({
      url: `${AUTH}/token`,
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: BASIC },
      data: dados,
    });
    const d = json(r.data);
    if (!d || !d.access_token) throw new ErroPsn("A PSN não liberou o acesso (" + ((d && (d.error_description || d.error)) || r.status) + ").", true);
    const agora = Date.now();
    return {
      accessToken: d.access_token,
      refreshToken: d.refresh_token,
      expiraEm: agora + (Number(d.expires_in) - 60) * 1000,
      refreshExpiraEm: agora + (Number(d.refresh_token_expires_in) - 60) * 1000,
    };
  }

  async function entrarComNpsso(npsso) {
    const q = new URLSearchParams({ access_type: "offline", client_id: CLIENTE, redirect_uri: REDIRECT, response_type: "code", scope: ESCOPO });
    const r = await http({ url: `${AUTH}/authorize?${q}`, method: "GET", headers: { Cookie: `npsso=${npsso}` }, disableRedirects: true });
    const destino = cabecalho(r.headers, "location") || "";
    const codigo = destino.includes("?code=") ? new URLSearchParams(destino.split("?")[1]).get("code") : null;
    if (!codigo) throw new ErroPsn("A PSN recusou esse código NPSSO. Ele expira de tempos em tempos: entre de novo no site da PlayStation e pegue um novo.", true);
    const t = await trocarPorTokens({ code: codigo, redirect_uri: REDIRECT, grant_type: "authorization_code", token_format: "jwt" });
    return { ...t, npsso };
  }

  async function carregar() {
    if (auth === null) auth = (await Banco.get("psn-auth")) || false;
    return auth;
  }

  async function token() {
    await carregar();
    if (!auth) throw new ErroPsn("PSN não conectada.", true);
    if (Date.now() < auth.expiraEm) return auth.accessToken;
    if (Date.now() < auth.refreshExpiraEm) {
      try {
        const t = await trocarPorTokens({ refresh_token: auth.refreshToken, grant_type: "refresh_token", token_format: "jwt", scope: ESCOPO });
        auth = { ...t, npsso: auth.npsso };
        await Banco.set("psn-auth", auth);
        return auth.accessToken;
      } catch (e) {
        if (!e.precisaReconectar) throw e;
      }
    }
    try {
      auth = await entrarComNpsso(auth.npsso);
      await Banco.set("psn-auth", auth);
      return auth.accessToken;
    } catch (e) {
      if (!e.precisaReconectar) throw e;
      throw new ErroPsn("A conexão com a PSN expirou. Cole um código NPSSO novo na aba PSN.", true);
    }
  }

  async function pedir(caminho, tentativa = 1) {
    const r = await http({ url: TROFEUS + caminho, method: "GET", headers: { Authorization: "Bearer " + (await token()), "Content-Type": "application/json" } });
    const d = json(r.data);
    if (r.status === 401 && tentativa === 1) {
      auth.expiraEm = 0;
      return pedir(caminho, 2);
    }
    if (r.status >= 400 || !d || d.error) throw new ErroPsn("A PSN respondeu com erro: " + ((d && d.error && d.error.message) || r.status));
    return d;
  }

  // ---------- PSN simulada (para testar sem conta) ----------
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

  return {
    nativo,
    get demo() {
      return demo;
    },
    async iniciar() {
      demo = !!(await Banco.get("psn-demo"));
      await carregar();
    },
    async usarDemo(ligar) {
      demo = ligar;
      inicioDemo = Date.now();
      await Banco.set("psn-demo", ligar);
    },
    conectado: () => demo || !!auth,
    async conectar(texto) {
      if (!nativo()) throw new ErroPsn("A conexão com a PSN só funciona no app instalado no celular.");
      const npsso = limparNpsso(texto);
      auth = await entrarComNpsso(npsso);
      await Banco.set("psn-auth", auth);
    },
    async desconectar() {
      auth = false;
      demo = false;
      await Banco.del("psn-auth");
      await Banco.set("psn-demo", false);
    },
    async jogos() {
      if (demo) return demoJogos();
      const d = await pedir("/users/me/trophyTitles?limit=200");
      return (d.trophyTitles || []).map((t) => ({
        id: t.npCommunicationId,
        nome: t.trophyTitleName,
        plataforma: t.trophyTitlePlatform,
        servico: t.npServiceName,
        icone: t.trophyTitleIconUrl,
        progresso: t.progress,
      }));
    },
    async trofeus(jogo, servico) {
      if (demo) return demoTrofeus();
      const q = "?npServiceName=" + (servico === "trophy" ? "trophy" : "trophy2");
      const id = encodeURIComponent(jogo);
      const [titulo, meus] = await Promise.all([
        pedir(`/npCommunicationIds/${id}/trophyGroups/all/trophies${q}`),
        pedir(`/users/me/npCommunicationIds/${id}/trophyGroups/all/trophies${q}`),
      ]);
      const porId = new Map((meus.trophies || []).map((t) => [t.trophyId, t]));
      return (titulo.trophies || []).map((t) => {
        const m = porId.get(t.trophyId) || {};
        const alvo = Number(m.trophyProgressTargetValue || t.trophyProgressTargetValue) || null;
        // nos troféus de PS5 com contador, a PSN manda "progress" (quantos você já tem)
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
    },
  };
})();
