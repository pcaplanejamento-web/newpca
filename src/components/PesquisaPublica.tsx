"use client";

import { useRouter } from "next/navigation";
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { itensDoCompacto } from "@/lib/itens-dash-texto";
import {
  type DadosPesquisaPublica,
  DICAS_PUBLICAS,
  indicePublico,
  lerAbrirPublico,
  type LinhaPublica,
  pesquisarPublico,
  TIPOS_PUBLICOS,
  type TipoPublico,
  TITULO_PUBLICO,
} from "@/lib/pesquisa-publica-core";
import type { VistaPublica } from "@/lib/publico-core";
import type { ItemRow } from "@/lib/queries";
import { EVENTO_ABRIR_PUBLICO } from "./AbrirDaUrl";
import type { AberturaMesa } from "./BannersMesa";
import { BannerItemPlanilha, BannersConsulta } from "./BannersConsulta";
import { VisualizadorPdf } from "./DocumentosView";
import { BannerPesquisa, EVENTO_ABRIR_PESQUISA, type GrupoPesquisa, type IconePesquisa, lerConsulta, type ResultadoPesquisaTela } from "./BannerPesquisa";
import { IconBuilding, IconClipboard, IconDocumentos, IconLayers, IconWallet } from "./icons";

type Indice = Map<TipoPublico, LinhaPublica[]>;
type DocPublico = DadosPesquisaPublica["documentos"][number];
/** O índice do PCA, o rótulo dele ("PCA 2027" — o escopo em destaque no banner) e os dados já carregados que abrem os
 *  banners na própria tela (o item de planilha, o documento). */
type Carga = { indice: Indice; escopo: string; itens: Map<number, ItemRow>; documentos: Map<number, DocPublico> };
/** O que o resultado abriu NA TELA — o componente padrão de cada um. */
type Aberto = { tipo: "consulta"; abrir: AberturaMesa } | { tipo: "planilha"; item: ItemRow } | { tipo: "documento"; doc: DocPublico };

// O índice de cada PCA fica só na MEMÓRIA da aba (5 min) — pedido ao abrir a pesquisa, uma vez por PCA.
const VALIDADE = 5 * 60_000;
const indices = new Map<number, { em: number; carga: Carga }>();
const pedidos = new Map<number, Promise<Carga>>();

function carregarIndice(pcaId: number): Promise<Carga> {
  const c = indices.get(pcaId);
  if (c && Date.now() - c.em < VALIDADE) return Promise.resolve(c.carga);
  let p = pedidos.get(pcaId);
  if (!p) {
    p = (async () => {
      try {
        const r = await fetch(`/api/pca/${pcaId}/consulta/pesquisa`);
        const j = (await r.json()) as Omit<DadosPesquisaPublica, "itens"> & { ok?: boolean; itens?: unknown };
        if (!r.ok || !j.ok) throw new Error("indisponível");
        const itens = itensDoCompacto(j.itens ?? []);
        const carga: Carga = {
          indice: indicePublico({ ...j, itens }),
          escopo: j.pca.ano != null ? `PCA ${j.pca.ano}` : j.pca.nome,
          itens: new Map(itens.map((i) => [i.id, i])),
          documentos: new Map(j.documentos.map((d) => [d.id, d])),
        };
        indices.set(pcaId, { em: Date.now(), carga });
        return carga;
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
};
const SINGULAR: Record<TipoPublico, string> = { aba: "Aba", item: "Item", dfd: "DFD", protocolo: "Protocolo", documento: "Documento", orcamento: "Orçamento", unidade: "Unidade" };
const converter = (t: TipoPublico, l: LinhaPublica): ResultadoPesquisaTela => ({ chave: `${t}:${l.id}`, rotulo: l.rotulo, detalhe: l.detalhe || undefined, info: l.info, ...(l.ids ? { ids: l.ids } : {}), ...(l.selo ? { selo: l.selo } : {}), href: l.href, tipo: t });
const ehTipo = (t: string): t is TipoPublico => (TIPOS_PUBLICOS as readonly string[]).includes(t);

/**
 * A PESQUISA DA TELA PÚBLICA (o campo do cabeçalho e Ctrl+K/⌘K): o MESMO banner da pesquisa do sistema (`BannerPesquisa`),
 * só com o que a página pública mostra — o índice da rota pública (`GET /api/pca/[id]/consulta/pesquisa`: PCA publicado,
 * abas publicadas, textos mascarados), procurado no navegador (`pesquisarPublico`). O resultado abre o COMPONENTE PADRÃO
 * na tela em que se está (qualquer aba, sem navegar): o item, o DFD e o protocolo nos banners da consulta
 * (`BannersConsulta`), o item de planilha no `BannerItemPlanilha`, o documento no `VisualizadorPdf`. Só a unidade do
 * orçamento (a origem precisa do orçamento da aba), a unidade e as abas navegam.
 */
export function PesquisaPublica({ pcaId, vista, unidade }: { pcaId: number; vista: VistaPublica; unidade?: number }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState("");
  const [carga, setCarga] = useState<Carga | null>(() => indices.get(pcaId)?.carga ?? null);
  const indice = carga?.indice ?? null;
  const [falhou, setFalhou] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  const [recentes, setRecentes] = useState<ResultadoPesquisaTela[]>([]);
  const [visto, setVisto] = useState<Aberto | null>(null);

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
    setCarga(indices.get(pcaId)?.carga ?? null);
    setRecentes(lerRecentes());
    setFalhou(false);
    let vivo = true;
    carregarIndice(pcaId).then(
      (c) => vivo && setCarga(c),
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

  /** Abre o resultado: o item, o DFD, o protocolo e o documento no componente padrão, AQUI (os dados do índice); o resto na
   *  própria página (mesmo PCA e aba, sem unidade filtrada) sem recarregar, senão navega. */
  async function ir(href: string) {
    const u = new URL(href, window.location.origin);
    const abrir = u.searchParams.get("abrir");
    const a = abrir ? lerAbrirPublico(abrir) : null;
    if (a?.tipo === "dfd" || a?.tipo === "protocolo") return setVisto({ tipo: "consulta", abrir: { tipo: a.tipo, id: a.id } });
    if (a?.tipo === "item" || a?.tipo === "documento") {
      const c = await carregarIndice(pcaId).catch(() => null);
      if (a.tipo === "documento") {
        const doc = c?.documentos.get(a.id);
        return doc && setVisto({ tipo: "documento", doc });
      }
      const r = c?.itens.get(a.id);
      if (!r) return;
      return setVisto(
        r.dfdId != null
          ? { tipo: "consulta", abrir: { tipo: "item", dfdId: r.dfdId, itemId: r.id, item: { item: r.itemNumero ?? null, codigo: r.idProduto } } }
          : { tipo: "planilha", item: r },
      );
    }
    const mesma = abrir && Number(u.searchParams.get("pca")) === pcaId && (u.searchParams.get("aba") ?? "dashboard") === vista && unidade == null;
    if (mesma) window.dispatchEvent(new CustomEvent(EVENTO_ABRIR_PUBLICO, { detail: abrir }));
    else router.push(href);
  }

  function escolher(r: ResultadoPesquisaTela) {
    gravarRecentes([r, ...lerRecentes().filter((x) => x.chave !== r.chave)]);
    setAberto(false);
    if (r.href) void ir(r.href);
  }

  const fecharVisto = () => setVisto(null);
  return (
    <>
      {visto?.tipo === "consulta" && <BannersConsulta pcaId={pcaId} abrir={visto.abrir} onFechar={fecharVisto} />}
      {visto?.tipo === "planilha" && <BannerItemPlanilha item={visto.item} onFechar={fecharVisto} />}
      {visto?.tipo === "documento" && <VisualizadorPdf doc={visto.doc} url={`/api/pca/${pcaId}/consulta/documento/${visto.doc.id}`} onFechar={fecharVisto} />}
      {aberto && (
    <BannerPesquisa
      rotulo="Pesquisa na página pública"
      escopo={carga?.escopo}
      placeholder={`Pesquise ${carga ? `no ${carga.escopo}` : "no PCA"} — itens, DFDs, protocolos, documentos, orçamento…`}
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
      )}
    </>
  );
}
