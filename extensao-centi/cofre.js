// COFRE do login da Centi — SÓ na extensão (página de opções e serviço). O usuário e a senha ficam CIFRADOS (AES-GCM
// 256) no armazenamento da extensão; a chave é NÃO EXTRAÍVEL e mora no IndexedDB da própria extensão (copiar os dados
// para outro computador não abre a senha). Nada daqui vai ao sistema PCA nem à página da Centi.
// Régua das tentativas: no máximo UMA a cada 5 minutos; senha recusada ou verificação pedida = PAUSA até salvar de novo
// (nunca insiste — não bloqueia a conta na Centi).
(() => {
  const g = globalThis;
  if (g.CofreCenti) return;
  const INTERVALO_MS = 5 * 60 * 1000;
  const CRED = "credCenti";
  const CFG = "loginCenti";
  const BANCO = "pca-cofre";
  const LOJA = "chaves";
  const ID_CHAVE = "centi";

  const b64 = (u8) => btoa(String.fromCharCode(...u8));
  const deB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

  /** A régua (pura): pode tentar entrar agora? `forcar` ignora só o intervalo — nunca a pausa. */
  function podeTentarLogin(agora, ultima, pausa, forcar) {
    if (pausa) return { pode: false, motivo: pausa };
    if (!forcar && typeof ultima === "number" && agora - ultima < INTERVALO_MS)
      return { pode: false, motivo: "Aguardando o intervalo entre tentativas.", esperarS: Math.ceil((INTERVALO_MS - (agora - ultima)) / 1000) };
    return { pode: true };
  }

  async function cifrarCom(chave, texto) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const dados = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, chave, new TextEncoder().encode(texto)));
    return { iv: b64(iv), dados: b64(dados) };
  }
  async function decifrarCom(chave, c) {
    const claro = await crypto.subtle.decrypt({ name: "AES-GCM", iv: deB64(c.iv) }, chave, deB64(c.dados));
    return new TextDecoder().decode(claro);
  }
  const novaChave = () => crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);

  const pedido = (r) => new Promise((ok, falha) => {
    r.onsuccess = () => ok(r.result);
    r.onerror = () => falha(r.error);
  });
  async function chaveDoCofre(criar) {
    const abrir = indexedDB.open(BANCO, 1);
    abrir.onupgradeneeded = () => abrir.result.createObjectStore(LOJA);
    const db = await pedido(abrir);
    try {
      const atual = await pedido(db.transaction(LOJA).objectStore(LOJA).get(ID_CHAVE));
      if (atual || !criar) return atual ?? null;
      const k = await novaChave();
      await pedido(db.transaction(LOJA, "readwrite").objectStore(LOJA).put(k, ID_CHAVE));
      return k;
    } finally {
      db.close();
    }
  }

  async function lerConfig() {
    const o = await chrome.storage.local.get([CRED, CFG]);
    const c = o[CFG] ?? {};
    return { tem: !!o[CRED], auto: c.auto !== false, pausadoEm: c.pausadoEm ?? null, motivo: c.motivo ?? null, ultima: c.ultima ?? null };
  }
  /** Usuário e senha decifrados (só o serviço e a página de opções chamam). */
  async function credenciais() {
    const o = await chrome.storage.local.get(CRED);
    if (!o[CRED]) return null;
    const k = await chaveDoCofre(false);
    if (!k) return null;
    const j = JSON.parse(await decifrarCom(k, o[CRED]));
    return typeof j?.usuario === "string" && typeof j?.senha === "string" ? j : null;
  }
  /** Salvar zera a pausa (credenciais novas = pode tentar de novo). */
  async function salvar(usuario, senha, auto) {
    const k = await chaveDoCofre(true);
    await chrome.storage.local.set({ [CRED]: await cifrarCom(k, JSON.stringify({ usuario, senha })), [CFG]: { auto: auto !== false } });
  }
  async function mudarAuto(auto) {
    const c = await lerConfig();
    await chrome.storage.local.set({ [CFG]: { auto: !!auto, pausadoEm: c.pausadoEm, motivo: c.motivo, ultima: c.ultima } });
  }
  async function esquecer() {
    await chrome.storage.local.remove([CRED, CFG]);
  }
  async function pausar(motivo) {
    const c = await lerConfig();
    await chrome.storage.local.set({ [CFG]: { auto: c.auto, pausadoEm: Date.now(), motivo: String(motivo).slice(0, 300), ultima: c.ultima } });
  }
  async function registrar(resultado) {
    const c = await lerConfig();
    await chrome.storage.local.set({ [CFG]: { auto: c.auto, pausadoEm: c.pausadoEm, motivo: c.motivo, ultima: { quando: Date.now(), resultado } } });
  }

  g.CofreCenti = Object.freeze({ INTERVALO_MS, podeTentarLogin, cifrarCom, decifrarCom, novaChave, lerConfig, credenciais, salvar, mudarAuto, esquecer, pausar, registrar });
})();
