"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RegrasAvaliacao } from "@/lib/avaliacao-core";
import type { Responsaveis } from "@/lib/reparticao-responsaveis";
import { type ItemRef, useDfdGravado } from "./DfdGravado";
import { duracaoMotionMs, Modal, type ModalPainel } from "./Modal";
import type { PcaOpcao } from "./PcaPicker";
import { useProtocoloGravado } from "./ProtocoloGravado";

type Rep = {
  id: number;
  codigo: string;
  nome: string;
  orgaoId?: number | null;
  orgaoProprio?: boolean | null;
  setorRequisitante?: string | null;
  numeroInteressado?: string | null;
  oculto?: boolean | null;
  responsaveis: Responsaveis;
};
type Orgao = { id: number; sigla: string; nome: string; orgaoEntidade: string | null; assinaturaUnica?: boolean | null };

/** O que abrir na Mesa (a RAIZ da pilha de banners): um protocolo, um DFD ou um item (linha da visão Itens). */
export type AberturaMesa = { tipo: "protocolo"; id: number } | { tipo: "dfd"; id: number } | { tipo: "item"; dfdId: number; itemId: number; item: ItemRef };

/** Larguras preferidas (rem) de cada banner na pilha (também o peso quando dividem a tela). */
const LARGURA = { item: 34, dfd: 52, protocolo: 50 } as const;

/**
 * PILHA DE BANNERS da Mesa — um único `Modal` em que cada "Ver …" ENTRA PELA DIREITA (a animação
 * padrão dos painéis laterais), mantendo o anterior à esquerda:
 * - linha de PROTOCOLO → [Protocolo] (+ DFD ao lado + mensagens/item/histórico, como sempre);
 * - linha de DFD → [DFD]; "Ver protocolo" → [DFD | Protocolo];
 * - linha de ITEM → só o banner do ITEM; "Ver DFD" → [Item | DFD]; "Ver protocolo" → o DFD entra e, em
 *   seguida, o protocolo ([Item | DFD | Protocolo]).
 * No protocolo empilhado, clicar numa linha TROCA o DFD da pilha. X fecha o banner (e os que vieram
 * depois dele); Esc fecha da direita para a esquerda. Os banners são os MESMOS da análise (hooks
 * `useDfdGravado`/`useProtocoloGravado`); gravar num avisa o outro para recarregar (sem perder rascunho).
 */
export function BannersMesa({
  abrir,
  onFechar,
  podeEditar,
  reparticoes,
  reparticaoAtivaId,
  regras,
  orgaos,
  onAlterado,
  pcas = [],
  dfdsExistentes = [],
}: {
  abrir: AberturaMesa | null;
  onFechar: () => void;
  podeEditar: boolean;
  reparticoes: Rep[];
  reparticaoAtivaId: number | null;
  regras: RegrasAvaliacao;
  orgaos: Orgao[];
  /** Algo foi gravado — a Mesa recarrega as listas. */
  onAlterado: () => void;
  /** PCAs e DFDs cadastrados — usados pelo REENVIO do protocolo (mesmo fluxo da protocolação). */
  pcas?: PcaOpcao[];
  dfdsExistentes?: { numero: string; protocoloNumero: string | null; valorTotal?: number | null; totalItens?: number | null }[];
}) {
  // Estado da pilha (a raiz vem de `abrir`; os banners empilhados são internos).
  const [raiz, setRaiz] = useState<AberturaMesa["tipo"] | null>(null);
  const [dfdId, setDfdId] = useState<number | null>(null);
  const [itemRef, setItemRef] = useState<ItemRef | null>(null);
  const [verDfd, setVerDfd] = useState(false); // raiz ITEM: o DFD entrou na pilha
  const [protoId, setProtoId] = useState<number | null>(null);
  const [sinalDfd, setSinalDfd] = useState(0);
  const [sinalProto, setSinalProto] = useState(0);
  // Entrada SEQUENCIAL (item → DFD → protocolo): o protocolo espera o DFD terminar de entrar.
  const timer = useRef<number | null>(null);
  const limparTimer = useCallback(() => {
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = null;
  }, []);

  // Nova abertura (linha clicada na Mesa) → nova pilha.
  useEffect(() => {
    limparTimer();
    setRaiz(abrir?.tipo ?? null);
    setVerDfd(false);
    setProtoId(abrir?.tipo === "protocolo" ? abrir.id : null);
    setDfdId(abrir?.tipo === "dfd" ? abrir.id : abrir?.tipo === "item" ? abrir.dfdId : null);
    setItemRef(abrir?.tipo === "item" ? abrir.item : null);
  }, [abrir, limparTimer]);
  useEffect(() => limparTimer, [limparTimer]);

  /** Fecha a pilha toda (pergunta pelos rascunhos que ainda não confirmaram o descarte). */
  function fecharTudo(jaConfirmado: "dfd" | "proto" | null = null) {
    if (dfd.bloqueado || proto.bloqueado) return;
    const pendentes = [jaConfirmado !== "dfd" && dfd.sujo ? "no DFD" : null, jaConfirmado !== "proto" && proto.sujo ? "no protocolo" : null].filter(Boolean);
    if (pendentes.length > 0 && !confirm(`Há alterações não salvas ${pendentes.join(" e ")}. Fechar e descartá-las?`)) return;
    limparTimer();
    onFechar();
  }
  /** "Ver protocolo": o protocolo entra pela direita (a partir do ITEM, o DFD entra antes). */
  function verProtocolo(pid: number) {
    limparTimer();
    if (raiz === "item" && !verDfd) {
      setVerDfd(true);
      timer.current = window.setTimeout(() => setProtoId(pid), duracaoMotionMs());
    } else setProtoId(pid);
  }
  /** Protocolo empilhado: clicar numa linha TROCA o DFD da pilha (o item, de outro DFD, sai). */
  function trocarDfd(id: number) {
    if (id === dfdId) return;
    if (!dfd.podeDescartar("Há alterações não salvas neste DFD. Trocar de DFD e descartá-las?")) return;
    if (raiz === "item") {
      setRaiz("dfd");
      setItemRef(null);
      setVerDfd(false);
    }
    setDfdId(id);
  }

  const dfd = useDfdGravado({
    dfdId: raiz === "dfd" || raiz === "item" ? dfdId : null,
    item: raiz === "item" ? itemRef : null,
    modoItem: raiz === "item",
    // Raiz DFD: fecha a pilha. Raiz ITEM: tira o DFD (e o que veio depois) da pilha.
    onFechar:
      raiz === "item"
        ? () => {
            // O protocolo (depois do DFD na pilha) sai junto — pergunta pelo rascunho dele.
            if (protoId != null && !proto.podeDescartar("Há alterações não salvas no protocolo. Fechar e descartá-las?")) return;
            limparTimer();
            setVerDfd(false);
            setProtoId(null);
          }
        : () => fecharTudo("dfd"),
    onVerProtocolo: verProtocolo,
    podeEditar,
    reparticoes,
    reparticaoAtivaId,
    regras,
    orgaos,
    onAlterado: () => {
      onAlterado();
      setSinalProto((n) => n + 1);
    },
    sinal: sinalDfd,
  });
  const proto = useProtocoloGravado({
    protocoloId: protoId,
    onFechar: raiz === "protocolo" ? () => fecharTudo("proto") : () => setProtoId(null),
    empilhado: raiz === "protocolo" ? null : { dfdAtivo: dfdId, onVerDfd: trocarDfd },
    podeEditar,
    reparticoes,
    reparticaoAtivaId,
    regras,
    orgaos,
    onAlterado: () => {
      onAlterado();
      setSinalDfd((n) => n + 1);
    },
    sinal: sinalProto,
    pcas,
    dfdsExistentes,
  });

  const bloqueado = dfd.bloqueado || proto.bloqueado;
  const painelProto: ModalPainel = { id: "protocolo", aberto: protoId != null, largura: LARGURA.protocolo, onClose: proto.fechar, ...proto.principal };

  let modal = null;
  if (raiz === "protocolo") {
    modal = (
      <Modal open onClose={proto.fechar} fecharNoBackdrop={false} bloqueado={bloqueado} paineis={proto.paineis} {...proto.principal} />
    );
  } else if (raiz === "dfd") {
    modal = (
      <Modal
        open
        onClose={dfd.fechar}
        fecharNoBackdrop={false}
        bloqueado={bloqueado}
        paineis={[dfd.direito, painelProto]}
        {...dfd.dfdPainel}
      />
    );
  } else if (raiz === "item") {
    const item = dfd.itemPainel({
      onVerDfd: verDfd ? undefined : () => setVerDfd(true),
      onVerProtocolo: () => dfd.orig?.protocoloId != null && verProtocolo(dfd.orig.protocoloId),
      onFechar: () => fecharTudo(),
    });
    modal = (
      <Modal
        open
        onClose={() => fecharTudo()}
        fecharNoBackdrop={false}
        bloqueado={bloqueado}
        larguraPrincipal={LARGURA.item}
        paineis={[
          {
            id: "dfd",
            aberto: verDfd,
            largura: LARGURA.dfd,
            onClose: () => {
              dfd.fecharDireito();
              dfd.fechar();
            },
            ...dfd.dfdPainel,
          },
          { ...dfd.direito, aberto: verDfd && dfd.direito.aberto },
          painelProto,
        ]}
        {...item}
      />
    );
  }

  return (
    <>
      {modal}
      {proto.extra}
    </>
  );
}
