"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ConciliacaoCapa } from "@/lib/dfd-tratamento";
import type { DfdConsulta } from "@/lib/pca-publico-core";
import type { ProtocoloConsulta } from "@/lib/pca-espaco";
import { type AberturaMesa, LARGURA } from "./BannersMesa";
import { Button } from "./Button";
import { CampoCongelado } from "./CampoCadeado";
import { Callout } from "./Callout";
import { RodapePainelItem } from "./DfdPainelDireito";
import { DfdCabecalho, DfdView, ItemCabecalho } from "./DfdView";
import { Historico, useHistorico } from "./Historico";
import { IconAlert, IconClock, IconLayers } from "./icons";
import { ItemDetalhe } from "./ItemDetalhe";
import { duracaoMotionMs, Modal, type ModalPainel } from "./Modal";
import { ProtocoloCabecalho, ProtocoloView } from "./ProtocoloView";
import { SkeletonLinhas } from "./Skeleton";

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

/** Rodapé enxuto da consulta: Histórico · Ver protocolo · Fechar. */
function RodapeConsulta({ onHistorico, onVerProtocolo, onFechar }: { onHistorico?: () => void; onVerProtocolo?: () => void; onFechar: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {onHistorico && (
        <Button variant="secondary" onClick={onHistorico}>
          <IconClock className="h-4 w-4" /> Histórico
        </Button>
      )}
      {onVerProtocolo && (
        <Button variant="secondary" onClick={onVerProtocolo}>
          <IconLayers className="h-4 w-4" /> Ver protocolo
        </Button>
      )}
      <Button variant="secondary" onClick={onFechar} className="ml-auto">
        Fechar
      </Button>
    </div>
  );
}

/**
 * PILHA DE BANNERS da CONSULTA do PCA (Dashboard — tela inicial e painel): a MESMA ordem fixa da Mesa **Protocolo |
 * DFD | Item** (`Modal` com `esquerda`/`paineis`, mesmas larguras), só LEITURA e DISCRETA — os dados vêm da rota
 * PÚBLICA já higienizada (sem CPF, matrícula, e-mail, telefone e assinaturas) e os componentes em modo `consulta`
 * (campos congelados, sem estado/erros/avisos). Rodapés: Histórico (só protocolos incorporados, sem autor) · Ver
 * DFD/protocolo · Fechar.
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
      rodape: (
        <RodapeConsulta
          onHistorico={p ? () => setHist({ tipo: "protocolo", id: p.id }) : undefined}
          onFechar={raiz === "protocolo" ? onFechar : () => setProtoId(null)}
        />
      ),
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
      rodape: (
        <RodapeConsulta
          onHistorico={d ? () => setHist({ tipo: "dfd", id: d.id }) : undefined}
          onVerProtocolo={d?.protocoloId != null && protoId == null ? () => verProtocolo(d.protocoloId as number) : undefined}
          onFechar={
            raiz === "dfd"
              ? onFechar
              : raiz === "item"
                ? () => {
                    limparTimer();
                    setVerDfd(false);
                    setProtoId(null);
                  }
                : () => {
                    setDfdId(null);
                    setItemId(null);
                  }
          }
        />
      ),
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
          onFechar={raiz === "item" ? onFechar : () => setItemId(null)}
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
    rodape: (
      <div className="flex justify-end">
        <Button variant="secondary" onClick={() => setHist(null)}>
          Fechar
        </Button>
      </div>
    ),
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
      rodape={principal.rodape}
    >
      {principal.children}
    </Modal>
  );
}
