// Um `chrome` FALSO para rodar o serviço da extensão (extensao-centi/background.js) em vm: abas, grupos, janelas,
// armazenamento da sessão e mensagens — o bastante para conferir as regras da aba da automação, do login, do andamento
// e do interromper.
import { readFileSync } from "node:fs";
import vm from "node:vm";

export const fonteExtensao = (n: string) => readFileSync(new URL(`../../extensao-centi/${n}`, import.meta.url), "utf8");
export const INICIO_CENTI = "https://rioverde.centi.com.br/";
/** O sistema Compras da Centi — onde a aba da automação trabalha (a raiz é só o portal). */
export const COMPRAS = "https://rioverde.centi.com.br/compras/";
export const TELA = "https://governarv.com.br/painel/automacao";

type Ouvinte = (m: unknown, sender: Record<string, unknown>, responder?: (r: unknown) => void) => unknown;
type Aba = { id: number; url: string; groupId?: number; windowId?: number };

export type OpcoesFalso = {
  /** O que a aba da Centi responde a cada mensagem do serviço. */
  naAba?: (tabId: number, m: { alvo: string; acao?: string; usuario?: string }) => unknown;
  /** O cofre (o real lê o IndexedDB); sem ele, o serviço segue sem login automático. */
  cofre?: Record<string, unknown>;
  /** A resposta da janela de confirmação do anexo (null = fechada). */
  confirmacao?: boolean | null;
  abas?: Aba[];
  sessao?: Record<string, unknown>;
  grupos?: { id: number; title: string; color?: string }[];
};

export function servicoFalso(o: OpcoesFalso = {}) {
  const ouvintes: Ouvinte[] = [];
  const atualizadas: ((id: number, info: Record<string, unknown>, tab?: Aba) => void)[] = [];
  const removidas: ((id: number) => void)[] = [];
  const janelasFechadas: ((id: number) => void)[] = [];
  const sessao: Record<string, unknown> = { ...(o.sessao ?? {}) };
  const abas: Aba[] = [...(o.abas ?? [])];
  const grupos = [...(o.grupos ?? [])];
  const enviados: { tabId: number; m: Record<string, unknown> }[] = [];
  const janelas: string[] = [];
  const selos: string[] = [];
  let proxAba = 100;
  const chrome = {
    runtime: {
      id: "ext",
      getURL: (p: string) => `chrome-extension://ext/${p}`,
      onInstalled: { addListener() {} },
      onMessage: {
        addListener: (f: Ouvinte) => ouvintes.push(f),
        removeListener: (f: Ouvinte) => {
          const i = ouvintes.indexOf(f);
          if (i >= 0) ouvintes.splice(i, 1);
        },
      },
    },
    action: {
      setBadgeText: async ({ text }: { text: string }) => {
        selos.push(text);
      },
      setBadgeBackgroundColor: async () => {},
      openPopup: async () => {
        janelas.push("dropdown");
      },
    },
    windows: {
      onRemoved: { addListener: (f: (id: number) => void) => janelasFechadas.push(f), removeListener() {} },
      create: async ({ url }: { url: string }) => {
        janelas.push(url);
        if (url.includes("confirmar.html")) {
          const pedido = new URL(url).searchParams.get("pedido");
          setTimeout(() => {
            if (o.confirmacao === null) for (const f of [...janelasFechadas]) f(7);
            else for (const f of [...ouvintes]) f({ tipo: "confirmacao", pedido, sim: o.confirmacao !== false }, { url });
          }, 0);
        }
        return { id: 7 };
      },
      update: async () => {},
      remove: async () => {},
    },
    storage: {
      session: {
        get: async (k: string) => ({ [k]: sessao[k] }),
        set: async (x: Record<string, unknown>) => Object.assign(sessao, x),
        remove: async (k: string) => {
          delete sessao[k];
        },
      },
    },
    tabGroups: {
      query: async ({ title }: { title?: string }) => grupos.filter((g) => title == null || g.title === title),
      update: async (id: number, p: { title?: string; color?: string }) => {
        const g = grupos.find((x) => x.id === id);
        if (g && p.title != null) g.title = p.title;
        if (g && p.color != null) g.color = p.color;
      },
    },
    tabs: {
      get: async (id: number) => {
        const t = abas.find((a) => a.id === id);
        if (!t) throw new Error("sem aba");
        return t;
      },
      query: async (q: { url?: string | string[]; groupId?: number }) =>
        abas.filter((a) => (q.groupId == null || a.groupId === q.groupId) && (!q.url || [q.url].flat().some((u) => a.url.startsWith(u.replace("*", ""))))),
      create: async ({ url }: { url: string }) => {
        const t = { id: ++proxAba, url, windowId: 1 };
        abas.push(t);
        setTimeout(() => {
          for (const f of [...atualizadas]) f(t.id, { status: "complete" }, t);
        }, 20);
        return t;
      },
      group: async ({ tabIds }: { tabIds: number[] }) => {
        const g: { id: number; title: string; color?: string } = { id: 900 + grupos.length, title: "" };
        grupos.push(g);
        for (const a of abas) if (tabIds.includes(a.id)) a.groupId = g.id;
        return g.id;
      },
      update: async (id: number, p: { url?: string }) => {
        const t = abas.find((a) => a.id === id);
        if (t && p.url) {
          t.url = p.url;
          setTimeout(() => {
            for (const f of [...atualizadas]) f(t.id, { status: "complete" }, t);
          }, 20);
        }
        return t;
      },
      sendMessage: async (tabId: number, m: Record<string, unknown>) => {
        enviados.push({ tabId, m });
        const r = o.naAba?.(tabId, m as { alvo: string; acao?: string });
        if (r !== undefined) return r;
        if (m.alvo === "centi" && m.acao === "estado") return { ok: true, logado: true, entidade: "1" };
        return { ok: true };
      },
      onUpdated: {
        addListener: (f: (id: number, info: Record<string, unknown>, tab?: Aba) => void) => atualizadas.push(f),
        removeListener: (f: (id: number, info: Record<string, unknown>, tab?: Aba) => void) => {
          const i = atualizadas.indexOf(f);
          if (i >= 0) atualizadas.splice(i, 1);
        },
      },
      onRemoved: { addListener: (f: (id: number) => void) => removidas.push(f) },
    },
    scripting: { executeScript: async () => [] },
  };
  const ctx: Record<string, unknown> = { chrome, URL, URLSearchParams, crypto, setTimeout, clearTimeout, Promise, Date, Math, Number, String, JSON };
  if (o.cofre) ctx.CofreCenti = o.cofre;
  vm.runInNewContext(fonteExtensao("background.js"), ctx);
  /** Uma mensagem ao serviço, como se viesse de `url` (a tela do sistema, por padrão). */
  const pedir = (msg: unknown, sender: Record<string, unknown> = { url: TELA, tab: { id: 50 } }) =>
    new Promise((ok) => {
      const devolveu = ouvintes[0](msg, { id: "ext", ...sender }, ok);
      if (devolveu !== true) ok(undefined);
    });
  return {
    pedir,
    sessao,
    abas,
    grupos,
    enviados,
    janelas,
    selos,
    fecharAba: (id: number) => {
      const i = abas.findIndex((a) => a.id === id);
      if (i >= 0) abas.splice(i, 1);
      for (const f of removidas) f(id);
    },
    atualizarAba: (id: number, info: Record<string, unknown>) => {
      for (const f of [...atualizadas]) f(id, info, abas.find((a) => a.id === id));
    },
  };
}

export const pausa = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
