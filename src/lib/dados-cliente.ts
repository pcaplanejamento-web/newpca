// DADOS NO NAVEGADOR — o armazém ÚNICO: memória da aba + IndexedDB (sobrevive a F5 e a fechar o navegador). Toda tela lê
// pelo `lerDado` com a VERSÃO do recurso que o servidor informou: mesma versão = o guardado, na hora; outra = o servidor.
// Nada aqui decide o que a pessoa pode ver (o servidor já filtrou o que mandou); qualquer falha do armazém cai no pedido
// normal ao servidor. A pessoa e o escopo vêm do `EscopoCliente` (layout do painel).

import { aApagar, chaveDado, type EntradaDado, type Escopo, entradaVale, FORMATO_DADOS, sessaoEncerrada } from "./dados-cliente-core";

const BANCO = "pca-dados";
const LOJA = "dados";
const CANAL = "pca-dados";

let escopo: Escopo | null = null;
let ligado = true;
const memoria = new Map<string, EntradaDado>();
const emCurso = new Map<string, Promise<unknown>>();
let banco: Promise<IDBDatabase | null> | null = null;
let canal: BroadcastChannel | null = null;
/** De onde vieram as leituras nesta aba (Armazenamento → "Dados neste navegador"): a prova do ganho. */
const contagem = { memoria: 0, aparelho: 0, servidor: 0, msServidor: 0 };
export function estatisticasDados(): { memoria: number; aparelho: number; servidor: number; msServidor: number; guardadas: number } {
  return { ...contagem, guardadas: memoria.size };
}

function abrirBanco(): Promise<IDBDatabase | null> {
  if (banco) return banco;
  banco = new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const r = indexedDB.open(BANCO, 1);
      r.onupgradeneeded = () => {
        if (!r.result.objectStoreNames.contains(LOJA)) r.result.createObjectStore(LOJA, { keyPath: "chave" });
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => resolve(null);
      r.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return banco;
}

function naLoja<T>(modo: IDBTransactionMode, fazer: (l: IDBObjectStore) => IDBRequest<T> | undefined): Promise<T | undefined> {
  return abrirBanco().then(
    (db) =>
      new Promise<T | undefined>((resolve) => {
        if (!db) return resolve(undefined);
        try {
          const t = db.transaction(LOJA, modo);
          const req = fazer(t.objectStore(LOJA));
          t.oncomplete = () => resolve(req?.result);
          t.onerror = () => resolve(undefined);
          t.onabort = () => resolve(undefined);
        } catch {
          resolve(undefined);
        }
      }),
  );
}

function obterCanal(): BroadcastChannel | null {
  if (canal || typeof BroadcastChannel === "undefined") return canal;
  try {
    canal = new BroadcastChannel(CANAL);
    canal.onmessage = (ev) => {
      const m = ev.data as { t?: string; pessoa?: number; entrada?: EntradaDado };
      if (m?.t === "apagar") memoria.clear();
      // Outra aba buscou um dado: esta já o tem, sem pedir de novo (só da MESMA pessoa e do mesmo formato).
      if (m?.t === "valor" && m.entrada && escopo && m.entrada.pessoa === escopo.pessoa && m.entrada.formato === FORMATO_DADOS)
        memoria.set(m.entrada.chave, m.entrada);
      if (m?.t === "pessoa" && escopo && m.pessoa !== escopo.pessoa) memoria.clear();
    };
  } catch {
    canal = null;
  }
  return canal;
}

/** Define a pessoa e o escopo (o layout do painel). Outra pessoa = o guardado das demais sai do aparelho. */
export function definirEscopo(e: Escopo, guardar: boolean): void {
  const outraPessoa = escopo != null && escopo.pessoa !== e.pessoa;
  escopo = e;
  ligado = guardar;
  if (outraPessoa) memoria.clear();
  obterCanal()?.postMessage({ t: "pessoa", pessoa: e.pessoa });
  // Higiene em segundo plano: tira o de outras pessoas, de formato antigo, sem uso ou além do máximo.
  void limparAntigos(e.pessoa);
  if (!guardar) void apagarDadosLocais();
}

async function limparAntigos(pessoa: number): Promise<void> {
  try {
    const todas = (await naLoja<EntradaDado[]>("readonly", (l) => l.getAll() as IDBRequest<EntradaDado[]>)) ?? [];
    const fora = aApagar(todas, pessoa, Date.now());
    // Aquece a memória da aba com o guardado desta pessoa (os mais usados): ir a outra tela já desenha na hora.
    const saem = new Set(fora);
    const minhas = todas.filter((x) => !saem.has(x.chave) && x.pessoa === pessoa && x.formato === FORMATO_DADOS);
    for (const x of minhas.sort((a, b) => b.uso - a.uso).slice(0, 20)) if (!memoria.has(x.chave) && escopo?.pessoa === pessoa) memoria.set(x.chave, x);
    if (fora.length) await naLoja("readwrite", (l) => {
      for (const k of fora) l.delete(k);
      return undefined;
    });
  } catch {
    /* armazém indisponível: segue só com a memória */
  }
}

/** Apaga TUDO o que está guardado neste navegador (sair, trocar de conta, sessão encerrada) — e avisa as outras abas. */
export async function apagarDadosLocais(): Promise<void> {
  memoria.clear();
  obterCanal()?.postMessage({ t: "apagar" });
  await naLoja("readwrite", (l) => l.clear());
}

/** O valor já guardado NA MEMÓRIA desta aba (síncrono) — para desenhar a tela no 1º quadro, sem o esqueleto. */
export function jaGuardado<T>(recurso: string, url: string, versao: string): T | undefined {
  if (!escopo) return undefined;
  const chave = chaveDado(escopo, recurso, url);
  const e = memoria.get(chave);
  return entradaVale(e, chave, escopo, versao) ? (e.valor as T) : undefined;
}

/**
 * Lê um dado: a memória, depois o aparelho (IndexedDB), depois o servidor — com a MESMA versão; `fresco` = o servidor.
 * Pedidos iguais ao mesmo tempo = UM pedido. `ler` confere a resposta e lança na falha (a falha não é guardada).
 */
export async function lerDado<T>(recurso: string, url: string, versao: string, ler: (r: Response) => Promise<T>, fresco = false): Promise<T> {
  const e = escopo;
  const chave = e ? chaveDado(e, recurso, url) : null;
  if (e && chave && !fresco && versao) {
    const m = memoria.get(chave);
    if (entradaVale(m, chave, e, versao)) {
      m.uso = Date.now();
      contagem.memoria++;
      return m.valor as T;
    }
    if (ligado) {
      const guardada = await naLoja<EntradaDado>("readonly", (l) => l.get(chave) as IDBRequest<EntradaDado>).catch(() => undefined);
      if (entradaVale(guardada, chave, e, versao) && escopo === e) {
        guardada.uso = Date.now();
        memoria.set(chave, guardada);
        contagem.aparelho++;
        return guardada.valor as T;
      }
    }
  }
  const id = `${chave ?? url}|${versao}|${fresco ? 1 : 0}`;
  const atual = emCurso.get(id);
  if (atual) return atual as Promise<T>;
  const p = (async () => {
    const t0 = Date.now();
    const r = await fetch(url, { cache: "no-store" });
    contagem.servidor++;
    contagem.msServidor += Date.now() - t0;
    if (sessaoEncerrada(r.status)) void apagarDadosLocais();
    const valor = await ler(r);
    // Só guarda se a pessoa/escopo ainda são os mesmos de quando o pedido saiu.
    if (e && chave && versao && escopo === e) {
      const agora = Date.now();
      const entrada: EntradaDado = { chave, pessoa: e.pessoa, formato: FORMATO_DADOS, versao, valor, em: agora, uso: agora };
      memoria.set(chave, entrada);
      while (memoria.size > 40) memoria.delete(memoria.keys().next().value as string);
      if (ligado) void naLoja("readwrite", (l) => l.put(entrada)).catch(() => undefined);
      try {
        obterCanal()?.postMessage({ t: "valor", entrada });
      } catch {
        /* valor que não se copia entre abas: cada aba busca o seu */
      }
    }
    return valor;
  })();
  emCurso.set(id, p);
  p.then(
    () => emCurso.delete(id),
    () => emCurso.delete(id),
  );
  return p;
}
