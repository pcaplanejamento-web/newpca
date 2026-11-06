"use client";

import { useRouter } from "next/navigation";
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { itensDoCompacto } from "@/lib/itens-dash-texto";
import type { LinhaIndice } from "@/lib/pesquisa-core";
import {
  type DadosPesquisaPublica,
  DICAS_PUBLICAS,
  indicePublico,
  pesquisarPublico,
  TIPOS_PUBLICOS,
  type TipoPublico,
  TITULO_PUBLICO,
} from "@/lib/pesquisa-publica-core";
import type { VistaPublica } from "@/lib/publico-core";
import { EVENTO_ABRIR_PUBLICO } from "./AbrirDaUrl";
import { BannerPesquisa, EVENTO_ABRIR_PESQUISA, type GrupoPesquisa, type IconePesquisa, lerConsulta, type ResultadoPesquisaTela } from "./BannerPesquisa";
import { IconBox, IconBuilding, IconClipboard, IconDocumentos, IconLayers, IconWallet } from "./icons";

type Indice = Map<TipoPublico, LinhaIndice[]>;

// O índice de cada PCA fica só na MEMÓRIA da aba (5 min) — pedido ao abrir a pesquisa, uma vez por PCA.
const VALIDADE = 5 * 60_000;
const indices = new Map<number, { em: number; indice: Indice }>();
const pedidos = new Map<number, Promise<Indice>>();

function carregarIndice(pcaId: number): Promise<Indice> {
  const c = indices.get(pcaId);
  if (c && Date.now() - c.em < VALIDADE) return Promise.resolve(c.indice);
  let p = pedidos.get(pcaId);
  if (!p) {
    p = (async () => {
      try {
        const r = await fetch(`/api/pca/${pcaId}/consulta/pesquisa`);
        const j = (await r.json()) as Omit<DadosPesquisaPublica, "itens"> & { ok?: boolean; itens?: unknown };
        if (!r.ok || !j.ok) throw new Error("indisponível");
        const indice = indicePublico({ ...j, itens: itensDoCompacto(j.itens ?? []) });
        indices.set(pcaId, { em: Date.now(), indice });
        return indice;
      } finally {
        pedidos.delete(pcaId);
      }
    })();
    pedidos.set(pcaId, p);
  }
  return p;
}

const RECENTES = "pesquisa-publica:recentes";
const MAX_RECENTES = 6;
function lerRecentes(): ResultadoPesquisaTela[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENTES) ?? "[]");
    return Array.isArray(v) ? v.filter((r) => r && typeof r.href === "string" && typeof r.rotulo === "string" && typeof r.chave === "string").slice(0, MAX_RECENTES) : [];
  } catch {
    return [];
  }
}
function gravarRecentes(lista: ResultadoPesquisaTela[]) {
  try {
    localStorage.setItem(RECENTES, JSON.stringify(lista.slice(0, MAX_RECENTES)));
  } catch {
    /* sem armazenamento: só não lembra */
  }
}

const ICONES: Record<TipoPublico, IconePesquisa> = {
  aba: IconLayers,
  item: IconClipboard,
  dfd: IconClipboard,
  protocolo: IconClipboard,
  documento: IconDocumentos,
  orcamento: IconWallet,
  unidade: IconBuilding,
  pca: IconBox,
};
const SINGULAR: Record<TipoPublico, string> = { aba: "Aba", item: "Item", dfd: "DFD", protocolo: "Protocolo", documento: "Documento", orcamento: "Orçamento", unidade: "Unidade", pca: "PCA" };
const converter = (t: TipoPublico, l: LinhaIndice): ResultadoPesquisaTela => ({ chave: `${t}:${l.id}`, rotulo: l.rotulo, detalhe: l.detalhe || undefined, href: l.href, tipo: t });
const ehTipo = (t: string): t is TipoPublico => (TIPOS_PUBLICOS as readonly string[]).includes(t);

/**
 * A PESQUISA DA TELA PÚBLICA (o campo do cabeçalho e Ctrl+K/⌘K): o MESMO banner da pesquisa do sistema (`BannerPesquisa`),
 * só com o que a página pública mostra — o índice da rota pública (`GET /api/pca/[id]/consulta/pesquisa`: PCA publicado,
 * abas publicadas, textos mascarados), procurado no navegador (`pesquisarPublico`). O resultado abre NA PÁGINA: o item, o
 * DFD e o protocolo nos banners da consulta, o documento no visualizador, a unidade do orçamento na origem dela.
 */
export function PesquisaPublica({ pcaId, vista, unidade }: { pcaId: number; vista: VistaPublica; unidade?: number }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState("");
  const [indice, setIndice] = useState<Indice | null>(() => indices.get(pcaId)?.indice ?? null);
  const [falhou, setFalhou] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  const [recentes, setRecentes] = useState<ResultadoPesquisaTela[]>([]);

  useEffect(() => {
    const abrir = () => setAberto(true);
    const k = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setAberto((v) => !v);
      }
    };
    window.addEventListener(EVENTO_ABRIR_PESQUISA, abrir);
    window.addEventListener("keydown", k);
    return () => {
      window.removeEventListener(EVENTO_ABRIR_PESQUISA, abrir);
      window.removeEventListener("keydown", k);
    };
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `tentativa` pede de novo depois de uma falha.
  useEffect(() => {
    if (!aberto) return;
    setTexto("");
    setIndice(indices.get(pcaId)?.indice ?? null);
    setRecentes(lerRecentes());
    setFalhou(false);
    let vivo = true;
    carregarIndice(pcaId).then(
      (i) => vivo && setIndice(i),
      () => vivo && setFalhou(true),
    );
    return () => {
      vivo = false;
    };
  }, [aberto, pcaId, tentativa]);

  // A procura acompanha a digitação sem travar o campo (milhares de itens).
  const adiado = useDeferredValue(texto);
  const { tipo: tipoLido, termo } = lerConsulta(adiado, DICAS_PUBLICAS);
  const tipo = tipoLido && ehTipo(tipoLido) ? tipoLido : null;

  const comDados = useMemo(() => TIPOS_PUBLICOS.filter((t) => (indice?.get(t)?.length ?? 0) > 0), [indice]);
  const todos = useMemo(() => (indice && termo.length >= 2 ? pesquisarPublico(indice, termo, null, 5) : []), [indice, termo]);
  const escolhidos = useMemo(() => (indice && tipo && termo.length >= 2 ? pesquisarPublico(indice, termo, tipo, 50) : null), [indice, termo, tipo]);

  const grupos = useMemo<GrupoPesquisa[]>(() => {
    if (!adiado.trim()) {
      const g: GrupoPesquisa[] = [];
      if (recentes.length) g.push({ tipo: "recentes", titulo: "Recentes", itens: recentes });
      const abas = indice?.get("aba") ?? [];
      if (abas.length) g.push({ tipo: "aba", titulo: "Abas da página", itens: abas.map((l) => converter("aba", l)) });
      return g;
    }
    if (falhou) return [];
    if (!indice) return termo.length >= 2 ? [{ tipo: "carregando", titulo: "Carregando os dados da página…", itens: [], carregando: true }] : [];
    return (escolhidos ?? todos).map((g) => ({ tipo: g.tipo, titulo: TITULO_PUBLICO[g.tipo], total: g.total, itens: g.linhas.map((l) => converter(g.tipo, l)) }));
  }, [adiado, recentes, indice, falhou, termo, todos, escolhidos]);

  const contas = termo.length >= 2 && indice ? new Map(todos.map((g) => [g.tipo, g.total])) : null;
  const filtros = !indice
    ? null
    : [
        { value: "", label: "Tudo" },
        ...comDados
          .filter((t) => !contas || contas.has(t) || t === tipo)
          .map((t) => ({ value: t, label: TITULO_PUBLICO[t], conta: contas?.get(t) })),
      ];
  const dicasAcesso = DICAS_PUBLICAS.filter((d) => comDados.includes(d.tipo));
  const baixo = texto.trim().toLowerCase();
  const dicas = !baixo ? dicasAcesso : texto.includes(":") ? [] : dicasAcesso.filter((d) => d.prefixo.startsWith(baixo) || d.curto.startsWith(baixo));

  const fechar = useCallback(() => setAberto(false), []);

  /** Abre o resultado: na PRÓPRIA página (mesmo PCA e aba, sem unidade filtrada) sem recarregar; senão navega. */
  function ir(href: string) {
    const u = new URL(href, window.location.origin);
    const abrir = u.searchParams.get("abrir");
    const mesma = abrir && Number(u.searchParams.get("pca")) === pcaId && (u.searchParams.get("aba") ?? "dashboard") === vista && unidade == null;
    if (mesma) window.dispatchEvent(new CustomEvent(EVENTO_ABRIR_PUBLICO, { detail: abrir }));
    else router.push(href);
  }

  function escolher(r: ResultadoPesquisaTela) {
    gravarRecentes([r, ...lerRecentes().filter((x) => x.chave !== r.chave)]);
    setAberto(false);
    if (r.href) ir(r.href);
  }

  if (!aberto) return null;
  return (
    <BannerPesquisa
      rotulo="Pesquisa na página pública"
      placeholder="Pesquise no PCA — itens, DFDs, protocolos, documentos, orçamento…"
      texto={texto}
      onTexto={setTexto}
      onFechar={fechar}
      dicas={DICAS_PUBLICAS}
      dicasVisiveis={dicas}
      grupos={grupos}
      filtros={filtros}
      carregando={!indice && !falhou && termo.length >= 2}
      previaCarregando={!indice && !falhou && termo.length >= 2}
      falhou={falhou}
      onTentar={() => setTentativa((n) => n + 1)}
      icones={ICONES}
      rotuloTipo={(r) => (ehTipo(r.tipo) ? SINGULAR[r.tipo] : "Resultado")}
      onEscolher={escolher}
      onEsquecer={(chave) => {
        const novos = recentes.filter((r) => r.chave !== chave);
        setRecentes(novos);
        gravarRecentes(novos);
      }}
      onLimparRecentes={() => {
        setRecentes([]);
        gravarRecentes([]);
      }}
    />
  );
}
