"use strict";

// Guarda tudo no próprio celular (IndexedDB): o mapa, o progresso,
// a imagem do mapa e a conexão com a PSN.
const Banco = (() => {
  let conexao = null;

  function abrir() {
    if (conexao) return conexao;
    conexao = new Promise((ok, erro) => {
      const r = indexedDB.open("mapa-coletaveis", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("kv");
      r.onsuccess = () => ok(r.result);
      r.onerror = () => erro(r.error);
    });
    return conexao;
  }

  const memoria = new Map();
  let usarMemoria = false;

  async function operar(modo, fn) {
    let db;
    try {
      if (usarMemoria) throw new Error("memória");
      db = await abrir();
    } catch {
      usarMemoria = true; // sem IndexedDB (modo privado, prévia): funciona, mas não guarda
      const loja = { get: (k) => ({ result: memoria.get(k) }), put: (v, k) => (memoria.set(k, v), { result: k }), delete: (k) => (memoria.delete(k), { result: undefined }) };
      return fn(loja).result;
    }
    return new Promise((ok, erro) => {
      const tx = db.transaction("kv", modo);
      const req = fn(tx.objectStore("kv"));
      tx.oncomplete = () => ok(req.result);
      tx.onerror = () => erro(tx.error);
      tx.onabort = () => erro(tx.error || new Error("Gravação cancelada (sem espaço?)"));
    });
  }

  // pede ao sistema para não apagar os dados quando faltar espaço
  try {
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  } catch {}

  return {
    get semMemoriaPermanente() {
      return usarMemoria;
    },
    get: (k) => operar("readonly", (s) => s.get(k)),
    set: (k, v) => operar("readwrite", (s) => s.put(v, k)),
    del: (k) => operar("readwrite", (s) => s.delete(k)),
  };
})();
