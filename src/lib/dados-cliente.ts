// DADOS NO NAVEGADOR — o armazém ÚNICO: memória da aba + IndexedDB (sobrevive a F5 e a fechar o navegador). Toda tela lê
// pelo `lerDado` com a VERSÃO do recurso que o servidor informou: mesma versão = o guardado, na hora; outra = o servidor.
// Nada aqui decide o que a pessoa pode ver (o servidor já filtrou o que mandou); qualquer falha do armazém cai no pedido
// normal ao servidor. A pessoa e o escopo vêm do `EscopoCliente` (layout do painel).

import { useSyncExternalStore } from "react";
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
      if (m?.t === "gravou") gravou(false);
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
const semAviso = () => () => {};
/**
 * O guardado pode desenhar JÁ no 1º quadro? Só numa tela montada no CLIENTE (voltar a ela pela navegação). Na HIDRATAÇÃO
 * (F5, 1º acesso) vale o que o servidor desenhou — o esqueleto —, senão o React acusa a diferença e refaz a árvore: a
 * memória pode ter sido enchida (o aparelho, outra tela) antes de a página terminar de hidratar. Quem usa `jaGuardado` no
 * estado inicial pergunta isto antes.
 */
export function useGuardadoNoDesenho(): boolean {
  return useSyncExternalStore(semAviso, () => true, () => false);
}

export function jaGuardado<T>(recurso: string, url: string, versao: string): T | undefined {
  if (!escopo) return undefined;
  const chave = chaveDado(escopo, recurso, url);
  const e = memoria.get(chave);
  return entradaVale(e, chave, escopo, versao) ? (e.valor as T) : undefined;
}

/** Quando o dado guardado (na memória desta aba) foi buscado do servidor — o selo "Dados de hh:mm". */
export function momentoDoDado(recurso: string, url: string, versao: string): number | null {
  if (!escopo) return null;
  const chave = chaveDado(escopo, recurso, url);
  const e = memoria.get(chave);
  return entradaVale(e, chave, escopo, versao) ? e.em : null;
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

/** A versão COMPLETA dos dados (toda escrita do sistema) — o `SincronizarDados` a mantém; o que não tem versão própria
 * (histórico, banners) a usa: qualquer gravação nova = outra versão = o servidor. */
let versaoGeral = "";
export function definirVersaoGeral(v: string): void {
  if (v) versaoGeral = v;
}
/** Gravações feitas NESTA aba (e nas outras, pelo canal): mudam a versão local na hora, sem esperar o servidor. */
let geracao = 0;
export function versaoGeralDados(): string {
  return versaoGeral ? `${versaoGeral}.${geracao}` : "";
}
function gravou(avisar: boolean): void {
  geracao++;
  if (avisar) obterCanal()?.postMessage({ t: "gravou" });
}
let vigiando = false;
/** Toda gravação ao servidor (POST/PUT/PATCH/DELETE em /api/) torna velho o que depende da versão geral. */
export function vigiarGravacoes(): void {
  if (vigiando || typeof window === "undefined") return;
  vigiando = true;
  const original = window.fetch.bind(window);
  window.fetch = async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const metodo = (init?.method ?? (entrada instanceof Request ? entrada.method : "GET")).toUpperCase();
    const url = typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url;
    const grava = metodo !== "GET" && metodo !== "HEAD" && /(^|\/\/[^/]+)\/api\//.test(url) && !/\/api\/(erros|perfil\/eventos|chat\/sinal|dados\/versao)/.test(url);
    try {
      return await original(entrada, init);
    } finally {
      if (grava) gravou(true);
    }
  };
}

/**
 * O ADAPTADOR das telas que leem um JSON `{ ok, ... }`: o mesmo resultado do `fetch` + `json`, guardado no navegador pela
 * versão GERAL (nenhuma gravação desde então = sem pedir de novo). Falha (rede, `ok:false`) lança com a mensagem do servidor.
 */
export async function lerJsonGuardado<T extends object>(recurso: string, url: string, falha = "Não foi possível carregar.", fresco = false): Promise<T & { ok: true }> {
  return lerDado(
    recurso,
    url,
    versaoGeralDados(),
    async (r) => {
      const j = (await r.json().catch(() => ({}))) as T & { ok?: boolean; error?: string };
      if (!r.ok || !j.ok) throw new Error(j.error ?? falha);
      return j as T & { ok: true };
    },
    fresco,
  );
}
