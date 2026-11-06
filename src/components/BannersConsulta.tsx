"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ConciliacaoCapa } from "@/lib/dfd-tratamento";
import { dataBR } from "@/lib/format";
import { opcoesPrevisao, previsaoDoItem } from "@/lib/item-planilha-core";
import { totalDoItem } from "@/lib/parse-dfd-comum";
import type { DfdConsulta } from "@/lib/pca-publico-core";
import type { ItemRow } from "@/lib/queries";
import type { ProtocoloConsulta } from "@/lib/pca-espaco";
import { type AberturaMesa, LARGURA } from "./BannersMesa";
import { Badge } from "./Badge";
import { BotaoAcao } from "./BotaoAcao";
import { CampoCongelado } from "./CampoCadeado";
import { Callout } from "./Callout";
import { useConfirmacao } from "./Confirmacao";
import { RodapePainelItem } from "./DfdPainelDireito";
import { DfdCabecalho, DfdView, type DfdVisualItem, ItemCabecalho } from "./DfdView";
import { Historico, useHistorico } from "./Historico";
import { IconAlert, IconClock, IconNenhum, IconSave, IconUndo } from "./icons";
import { ItemDetalhe } from "./ItemDetalhe";
import { duracaoMotionMs, Modal, type ModalPainel } from "./Modal";
import { ProtocoloCabecalho, ProtocoloView } from "./ProtocoloView";
import { SkeletonLinhas } from "./Skeleton";
import { toast } from "./Toast";

/** Conciliação neutra — a consulta não aponta divergência da capa. */
const SEM_CONCILIACAO: ConciliacaoCapa = { ativa: false, divergente: false, zerada: false, bloqueia: false, somatorio: 0, motivo: null };

/** Carrega (com cache por URL, na vida da pilha) um dado da rota PÚBLICA da consulta. */
function useConsulta<T>(url: string | null, chave: "dfd" | "protocolo", cache: Map<string, unknown>): { dado: T | null; erro: string | null } {
  const [estado, setEstado] = useState<{ url: string; dado: T | null; erro: string | null } | null>(null);
  useEffect(() => {
    if (!url) return;
    const salvo = cache.get(url) as T | undefined;
    if (salvo) {
      setEstado({ url, dado: salvo, erro: null });
      return;
    }
    const ac = new AbortController();
    setEstado(null);
    fetch(url, { signal: ac.signal })
      .then(async (r) => {
        const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string } & Record<string, unknown>;
        if (!r.ok || !j.ok) throw new Error(j.error ?? "Não foi possível carregar.");
        const dado = j[chave] as T;
        cache.set(url, dado);
        setEstado({ url, dado, erro: null });
      })
      .catch((e: unknown) => {
        if (!ac.signal.aborted) setEstado({ url, dado: null, erro: e instanceof Error ? e.message : "Não foi possível carregar." });
      });
    return () => ac.abort();
  }, [url, chave, cache]);
  return estado && estado.url === url ? { dado: estado.dado, erro: estado.erro } : { dado: null, erro: null };
}

/** Corpo enquanto carrega / com falha. */
function Carregando({ erro }: { erro: string | null }) {
  return erro ? (
    <Callout kind="danger" icon={<IconAlert className="h-5 w-5" />}>
      {erro}
    </Callout>
  ) : (
    <SkeletonLinhas linhas={6} />
  );
}

/**
 * PILHA DE BANNERS da CONSULTA do PCA (Dashboard — tela inicial e painel): a MESMA ordem fixa da Mesa **Protocolo |
 * DFD | Item** (`Modal` com `esquerda`/`paineis`, mesmas larguras), só LEITURA e DISCRETA — os dados vêm da rota
 * PÚBLICA já higienizada (sem CPF, matrícula, e-mail, telefone e assinaturas) e os componentes em modo `consulta`
 * (campos congelados, sem estado/erros/avisos). Histórico (só protocolos incorporados, sem autor) no CABEÇALHO; no
 * rodapé, só os ícones Ver DFD/protocolo (o X fecha).
 */
export function BannersConsulta({ pcaId, abrir, onFechar }: { pcaId: number; abrir: AberturaMesa | null; onFechar: () => void }) {
  const cache = useRef(new Map<string, unknown>()).current;
  const [raiz, setRaiz] = useState<AberturaMesa["tipo"] | null>(null);
  const [protoId, setProtoId] = useState<number | null>(null);
  const [dfdId, setDfdId] = useState<number | null>(null);
  const [itemId, setItemId] = useState<number | null>(null);
  const [verDfd, setVerDfd] = useState(false);
  const [hist, setHist] = useState<{ tipo: "dfd" | "protocolo"; id: number } | null>(null);
  const timer = useRef<number | null>(null);
  const limparTimer = useCallback(() => {
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = null;
  }, []);

  useEffect(() => {
    limparTimer();
    setRaiz(abrir?.tipo ?? null);
    setVerDfd(false);
    setHist(null);
    setProtoId(abrir?.tipo === "protocolo" ? abrir.id : null);
    setDfdId(abrir?.tipo === "dfd" ? abrir.id : abrir?.tipo === "item" ? abrir.dfdId : null);
    setItemId(abrir?.tipo === "item" ? abrir.itemId : null);
  }, [abrir, limparTimer]);
  useEffect(() => limparTimer, [limparTimer]);

  const base = `/api/pca/${pcaId}/consulta`;
  const proto = useConsulta<ProtocoloConsulta>(protoId != null ? `${base}/protocolo/${protoId}` : null, "protocolo", cache);
  const dfd = useConsulta<DfdConsulta>(dfdId != null ? `${base}/dfd/${dfdId}` : null, "dfd", cache);
  const historico = useHistorico(hist ? `${base}/historico?${hist.tipo}=${hist.id}` : null);
  const item = itemId != null ? (dfd.dado?.itens.find((i) => i.id === itemId) ?? null) : null;

  if (!raiz) return null;

  /** "Ver protocolo": a partir do ITEM, o DFD entra antes e só então o protocolo (a mesma sequência da Mesa). */
  const verProtocolo = (pid: number) => {
    limparTimer();
    if (raiz === "item" && !verDfd) {
      setVerDfd(true);
      timer.current = window.setTimeout(() => setProtoId(pid), duracaoMotionMs());
    } else setProtoId(pid);
  };
  /** Linha de DFD dentro do protocolo: raiz protocolo → o DFD surge à direita; senão o DFD vira a raiz. */
  const abrirDfdDoProtocolo = (id: number) => {
    setItemId(null);
    setHist(null);
    if (raiz !== "protocolo") {
      setRaiz("dfd");
      setVerDfd(false);
    }
    setDfdId(id);
  };

  const conteudoProto = (): Omit<ModalPainel, "id" | "aberto" | "onClose"> => {
    const p = proto.dado;
    return {
      titulo: p ? `Protocolo ${p.numero}` : "Protocolo",
      cabecalho: p ? <ProtocoloCabecalho numero={p.numero} idExterno={p.idExterno} assunto={p.assunto} /> : undefined,
      acoesCabecalho: p ? (
        <BotaoAcao
          rotulo="Histórico do protocolo"
          icon={<IconClock className="h-4 w-4" />}
          pressionado={hist?.tipo === "protocolo" && hist.id === p.id}
          onClick={() => setHist((h) => (h?.tipo === "protocolo" && h.id === p.id ? null : { tipo: "protocolo", id: p.id }))}
        />
      ) : undefined,
      children: !p ? (
        <Carregando erro={proto.erro} />
      ) : (
        <ProtocoloView
          modoCapa="consulta"
          capa={{
            numero: p.numero,
            idExterno: p.idExterno,
            data: p.data ?? "",
            documento: "",
            interessado: p.interessado ?? "",
            assunto: p.assunto ?? "",
            observacao: p.observacao ?? "",
            valorCapa: p.valorCapa,
            localReparticao: p.localReparticao,
          }}
          unidade={{ id: null, opcoes: [], textoLeitura: p.unidade ?? "Sem unidade" }}
          pca={<CampoCongelado label="PCA (ano)" valor={p.anoPca != null ? String(p.anoPca) : null} />}
          totais={{ dfds: p.dfds.length, itens: p.dfds.reduce((s, d) => s + d.itens, 0), somatorio: p.dfds.reduce((s, d) => s + d.valor, 0) }}
          conciliacao={SEM_CONCILIACAO}
          linhas={p.dfds.map((d) => ({
            key: d.id,
            numero: d.numero,
            planejamento: d.planejamento,
            sigla: d.sigla ?? "—",
            tipo: d.tipo,
            itens: d.itens,
            valor: d.valor,
            estado: "regular", // não exibido (consulta = `semEstado`)
          }))}
          unica
          onVerDfd={abrirDfdDoProtocolo}
          dfdAtivo={dfdId}
          compacta={raiz !== "protocolo" || dfdId != null}
        />
      ),
    };
  };

  const conteudoDfd = (): Omit<ModalPainel, "id" | "aberto" | "onClose"> => {
    const d = dfd.dado;
    return {
      titulo: d ? `DFD ${d.numero}` : "DFD",
      cabecalho: d ? <DfdCabecalho numero={d.numero} tipo={d.tipo} planejamento={d.planejamento} /> : undefined,
      acoesCabecalho: d ? (
        <BotaoAcao
          rotulo="Histórico do DFD"
          icon={<IconClock className="h-4 w-4" />}
          pressionado={hist?.tipo === "dfd" && hist.id === d.id}
          onClick={() => setHist((h) => (h?.tipo === "dfd" && h.id === d.id ? null : { tipo: "dfd", id: d.id }))}
        />
      ) : undefined,
      rodape:
        d?.protocoloId != null && protoId == null ? <RodapePainelItem onVerProtocolo={() => verProtocolo(d.protocoloId as number)} /> : undefined,
      children: !d ? (
        <Carregando erro={dfd.erro} />
      ) : (
        <DfdView
          dfd={d}
          consulta
          onItemClick={(idx) => {
            setHist(null);
            setItemId(d.itens[idx]?.id ?? null);
          }}
          itemAtivo={itemId != null && d.itens.some((i) => i.id === itemId) ? d.itens.findIndex((i) => i.id === itemId) : null}
        />
      ),
    };
  };

  const conteudoItem = (): Omit<ModalPainel, "id" | "aberto" | "onClose"> => {
    const d = dfd.dado;
    return {
      titulo: `Item ${item?.item ?? "—"}${d ? ` — DFD ${d.numero}` : ""}`,
      // O nº do DFD vem com o TIPO e o PLANEJAMENTO no cabeçalho do banner do item.
      cabecalho: d ? <ItemCabecalho item={item?.item} numero={d.numero} tipo={d.tipo} planejamento={d.planejamento} /> : undefined,
      rodape: (
        <RodapePainelItem
          onVerDfd={raiz === "item" && !verDfd ? () => setVerDfd(true) : undefined}
          onVerProtocolo={d?.protocoloId != null && protoId == null ? () => verProtocolo(d.protocoloId as number) : undefined}
        />
      ),
      children: !d ? (
        <Carregando erro={dfd.erro} />
      ) : item ? (
        <ItemDetalhe key={item.id} item={item} consulta={{ urlHistorico: `${base}/historico?dfd=${d.id}` }} />
      ) : (
        <p className="text-sm text-muted">Este item não faz parte do PCA.</p>
      ),
    };
  };

  const painelHist: ModalPainel = {
    id: "historico",
    aberto: hist != null,
    largura: LARGURA.item,
    titulo: hist?.tipo === "protocolo" ? "Histórico do protocolo" : "Histórico do DFD",
    onClose: () => setHist(null),
    children: hist ? (
      <Historico
        entradas={historico.linhas ?? []}
        carregando={historico.linhas === null && !historico.erro}
        erro={historico.erro}
        escopo={hist.tipo}
        protocoloId={hist.tipo === "protocolo" ? hist.id : null}
        anonimo
        vazio="Nenhuma alteração registrada pelos protocolos incorporados ao PCA."
      />
    ) : null,
  };
  const painelProto: ModalPainel = { id: "protocolo", aberto: protoId != null, largura: LARGURA.protocolo, onClose: () => setProtoId(null), ...conteudoProto() };
  const painelItem: ModalPainel = { id: "item", aberto: itemId != null, largura: LARGURA.item, onClose: () => setItemId(null), ...conteudoItem() };

  let principal: Omit<ModalPainel, "id" | "aberto" | "onClose">;
  let esquerda: ModalPainel[] = [];
  let paineis: ModalPainel[] = [];
  let largura: number = LARGURA.protocolo;
  if (raiz === "protocolo") {
    // [Protocolo* | DFD | Item | Histórico]
    principal = conteudoProto();
    paineis = [
      {
        id: "dfd",
        aberto: dfdId != null,
        largura: LARGURA.dfd,
        onClose: () => {
          setDfdId(null);
          setItemId(null);
        },
        ...conteudoDfd(),
      },
      painelItem,
      painelHist,
    ];
  } else if (raiz === "dfd") {
    // [Protocolo | DFD* | Item | Histórico]
    principal = conteudoDfd();
    largura = LARGURA.dfd;
    esquerda = [painelProto];
    paineis = [painelItem, painelHist];
  } else {
    // [Protocolo | DFD | Item* | Histórico] — o item é a raiz; DFD e protocolo surgem à esquerda dele.
    principal = conteudoItem();
    largura = LARGURA.item;
    esquerda = [
      painelProto,
      {
        id: "dfd",
        aberto: verDfd,
        largura: LARGURA.dfd,
        onClose: () => {
          limparTimer();
          setVerDfd(false);
          setProtoId(null);
        },
        ...conteudoDfd(),
      },
    ];
    paineis = [painelHist];
  }

  return (
    <Modal
      open
      onClose={onFechar}
      larguraPrincipal={largura}
      esquerda={esquerda}
      paineis={paineis}
      titulo={principal.titulo}
      cabecalho={principal.cabecalho}
      acoesCabecalho={principal.acoesCabecalho}
      rodape={principal.rodape}
    >
      {principal.children}
    </Modal>
  );
}

/** A edição do item de planilha (aba Importação do PCA): o PCA, o ano (as opções da previsão) e o que fazer ao gravar. */
export type EdicaoItemPlanilha = { pcaId: number; anoPca: number | null; onSalvo: () => void };

/** O rascunho editável do item de planilha (os campos do `ItemDetalhe` + previsão e prioridade). */
type RascunhoPlanilha = DfdVisualItem & { previsao: string | null; prioridade: string | null };

const PRIORIDADES_PLANILHA = ["ALTA", "MÉDIA", "BAIXA"];

function rascunhoDaLinha(item: ItemRow): RascunhoPlanilha {
  return {
    item: null,
    codigo: item.idProduto,
    descricao: item.nomeProduto,
    unidade: item.unidadeMedida,
    quantidade: item.quantidade,
    valorUnitario: item.valorReferencia,
    valorTotal: item.valorTotal,
    dominio: item.dominio ?? null,
    previsao: previsaoDoItem({ dataDesejada: item.dataDesejada, previsaoGenerica: item.anual ? (item.periodo ?? "ANUAL") : null }),
    prioridade: item.prioridade ?? null,
  };
}

/** O que mudou no rascunho, no formato da rota (`editarItemPlanilhaSchema`). */
function pedidoDoRascunho(orig: RascunhoPlanilha, r: RascunhoPlanilha): Record<string, string | number | null> {
  const p: Record<string, string | number | null> = {};
  const par = [
    ["idProduto", orig.codigo, r.codigo],
    ["nomeProduto", orig.descricao, r.descricao],
    ["unidadeMedida", orig.unidade, r.unidade],
    ["quantidade", orig.quantidade, r.quantidade],
    ["valorReferencia", orig.valorUnitario, r.valorUnitario],
    ["valorTotal", orig.valorTotal, r.valorTotal],
    ["previsao", orig.previsao, r.previsao],
    ["prioridade", orig.prioridade, r.prioridade],
  ] as const;
  for (const [k, de, para] of par) if ((de ?? null) !== (para ?? null)) p[k] = para ?? null;
  return p;
}

/**
 * O BANNER do ITEM DE PLANILHA (sem DFD — PCA de lista pronta): o MESMO `ItemDetalhe` do item de protocolo. Na consulta
 * (pesquisa, Dashboard), os dados da linha congelados (unidade — a sigla —, classificação, previsão, prioridade). Com
 * `edicao` (aba Importação), cada campo com o cadeado e "Salvar alterações" (só o que mudou); o Seq., a unidade e a
 * classificação/domínio do Catálogo ficam congelados.
 */
export function BannerItemPlanilha({
  item,
  onFechar,
  edicao,
  situacao,
}: {
  item: ItemRow | null;
  onFechar: () => void;
  edicao?: EdicaoItemPlanilha | null;
  situacao?: SituacaoItemPlanilha | null;
}) {
  if (!item) return null;
  return <BannerItemPlanilhaAberto key={item.id} item={item} onFechar={onFechar} edicao={edicao ?? null} situacao={situacao ?? null} />;
}

/** A SITUAÇÃO do item no PCA (Importação): cancelado (não excluído — fora dos números) e o Cancelar/Reativar do papel. */
export type SituacaoItemPlanilha = { cancelado: boolean; dica?: string | null; alternar?: () => Promise<boolean> };

function BannerItemPlanilhaAberto({
  item,
  onFechar,
  edicao,
  situacao,
}: {
  item: ItemRow;
  onFechar: () => void;
  edicao: EdicaoItemPlanilha | null;
  situacao: SituacaoItemPlanilha | null;
}) {
  const orig = useMemo(() => rascunhoDaLinha(item), [item]);
  const [r, setR] = useState<RascunhoPlanilha>(orig);
  const [salvando, setSalvando] = useState(false);
  const { confirmar, confirmacao } = useConfirmacao();
  const pedido = useMemo(() => pedidoDoRascunho(orig, r), [orig, r]);
  const sujo = Object.keys(pedido).length > 0;
  useEffect(() => {
    if (!sujo) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [sujo]);

  async function fechar() {
    if (salvando) return;
    if (sujo && !(await confirmar({ titulo: "Descartar as alterações?", texto: "O item tem alterações não salvas.", confirmar: "Descartar", perigo: true }))) return;
    onFechar();
  }
  async function salvar() {
    if (!edicao || !sujo || salvando) return;
    setSalvando(true);
    try {
      const res = await fetch(`/api/pca/${edicao.pcaId}/planilhas/itens/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pedido),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "Não foi possível salvar o item.");
      toast.success(`Item Seq. ${item.sequencial ?? ""} salvo.`);
      edicao.onSalvo();
      onFechar();
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "Sem conexão com o servidor — o item não foi salvo.");
    } finally {
      setSalvando(false);
    }
  }

  const [alternando, setAlternando] = useState(false);
  async function alternarSituacao() {
    if (!situacao?.alternar || alternando) return;
    setAlternando(true);
    try {
      await situacao.alternar();
    } finally {
      setAlternando(false);
    }
  }

  const unidade = item.codigo ?? item.municipio;
  const seq = item.sequencial != null ? String(item.sequencial) : null;
  const previsaoTexto = item.anual ? (item.periodo ?? "Anual") : item.dataDesejada ? dataBR(item.dataDesejada) : null;
  const atualizar = (patch: Partial<RascunhoPlanilha>) =>
    setR((x) => {
      const novo = { ...x, ...patch };
      // Trocar quantidade/valor unitário recalcula o total (q × vu); o total digitado à mão vale.
      const recalcula = ("quantidade" in patch || "valorUnitario" in patch) && !("valorTotal" in patch);
      return recalcula ? { ...novo, valorTotal: totalDoItem(novo.quantidade, novo.valorUnitario, novo.valorTotal) } : novo;
    });

  return (
    <Modal
      open
      onClose={fechar}
      bloqueado={salvando}
      larguraPrincipal={LARGURA.item}
      titulo={item.nomeProduto ?? "Item"}
      cabecalho={
        <div className="min-w-0 space-y-0.5">
          <span className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-muted">
            Item da planilha
            {seq && (
              <span className={`rounded-chip border border-accent/30 bg-accent-soft px-1.5 font-mono normal-case text-accent ${situacao?.cancelado ? "line-through" : ""}`}>
                Seq. {seq}
              </span>
            )}
            {situacao?.cancelado && (
              <Badge tone="red" title={situacao.dica ?? undefined}>
                Cancelado no PCA
              </Badge>
            )}
          </span>
          <span className="block truncate text-base font-bold text-text" title={r.descricao ?? undefined}>
            {r.descricao ?? "Item"}
          </span>
        </div>
      }
      rodape={
        edicao || situacao?.alternar ? (
          <div className="flex flex-nowrap items-center gap-1.5">
            {situacao?.alternar && (
              <BotaoAcao
                texto
                rotulo={situacao.cancelado ? "Reativar no PCA" : "Cancelar no PCA"}
                icon={situacao.cancelado ? <IconUndo className="h-4 w-4" /> : <IconNenhum className="h-4 w-4" />}
                onClick={() => void alternarSituacao()}
                loading={alternando}
                // Rascunho aberto: salve ou descarte antes (cancelar trocaria o banner para a consulta e perderia a edição).
                disabled={salvando || sujo}
              />
            )}
            {edicao && (
              <div className="ml-auto flex items-center">
                <BotaoAcao texto variant="primary" rotulo="Salvar alterações" icon={<IconSave className="h-4 w-4" />} onClick={salvar} loading={salvando} disabled={!sujo || alternando} />
              </div>
            )}
          </div>
        ) : undefined
      }
    >
      {edicao ? (
        <ItemDetalhe
          item={r}
          rotulo={seq ? `Seq. ${seq}` : "Item"}
          editavel={!salvando}
          onChange={atualizar}
          extras={[
            { chave: "unidadeP", label: "Unidade", valor: unidade },
            { chave: "classificacao", label: "Classificação", valor: item.classificacao },
            { chave: "previsao", label: "Previsão", valor: r.previsao, opcoes: opcoesPrevisao(edicao.anoPca, orig.previsao), onChange: (v) => atualizar({ previsao: v || null }) },
            { chave: "prioridade", label: "Prioridade", valor: r.prioridade, opcoes: PRIORIDADES_PLANILHA, onChange: (v) => atualizar({ prioridade: v || null }) },
          ]}
        />
      ) : (
        <ItemDetalhe
          item={orig}
          consulta={{
            campos: [
              ["Unidade", unidade],
              ["Classificação", item.classificacao],
              ["Previsão", previsaoTexto],
              ...(item.prioridade ? [["Prioridade", item.prioridade] as [string, string]] : []),
            ],
          }}
        />
      )}
      {confirmacao}
    </Modal>
  );
}
