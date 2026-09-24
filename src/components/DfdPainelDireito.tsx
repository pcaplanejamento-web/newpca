"use client";

import { type ReactNode, useMemo } from "react";
import { comportamentoNo, type RegrasAvaliacao, regrasPadrao } from "@/lib/avaliacao-core";
import type { ConferenciaItem } from "@/lib/catalogo-conferencia";
import type { ComparacaoDfd } from "@/lib/comparar-protocolo";
import { indiceAposRemover, mapaItensDuplicados, type MensagemDfd } from "@/lib/dfd-tratamento";
import { type DfdParseado, tipoCurtoDfd } from "@/lib/parse-dfd-comum";
import { Button } from "./Button";
import { ComparacaoDfdView, type EscolhaSobrescritaProps } from "./ComparacaoReenvio";
import type { PainelDfd } from "./DfdConferir";
import { Historico, useHistorico } from "./Historico";
import { ItemDetalhe } from "./ItemDetalhe";
import { MensagensDfd } from "./MensagensDfd";
import { IconFile, IconLayers } from "./icons";

/** Título do painel da direita do DFD (mensagens / item / histórico / diferenças / duplicados). */
export function tituloPainelDfd(painel: PainelDfd | null, dfd: DfdParseado | null, numero: string): string {
  if (painel?.tipo === "historico") return `Histórico — DFD ${numero}`;
  if (painel?.tipo === "diferencas") return `Diferenças — DFD ${numero}`;
  if (painel?.tipo === "duplicados") return `Duplicados — DFD ${numero}`;
  if (painel?.tipo === "item") return `Item ${dfd?.itens[painel.idx]?.item ?? painel.idx + 1} — DFD ${numero}`;
  return `Mensagens — DFD ${numero}`;
}

/**
 * Rodapé de um banner de ITEM — o do painel da direita do DFD e o do banner SÓ do item (lista "Itens" da
 * Mesa): "Ver DFD" (no painel da direita fecha o item e volta ao DFD — no celular só um painel aparece
 * por vez; no banner do item, o DFD surge à ESQUERDA dele), "Ver protocolo" (sobe ao processo de origem,
 * à esquerda do DFD — Protocolo | DFD | Item) e, no banner do item, Fechar + a ação principal.
 */
export function RodapePainelItem({
  onVerDfd,
  onVerProtocolo,
  onFechar,
  principal,
  bloqueado = false,
}: {
  onVerDfd?: () => void;
  onVerProtocolo?: () => void;
  onFechar?: () => void;
  principal?: ReactNode;
  bloqueado?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {onVerDfd && (
        <Button variant="secondary" onClick={onVerDfd} disabled={bloqueado}>
          <IconFile className="h-4 w-4" /> Ver DFD
        </Button>
      )}
      {onVerProtocolo && (
        <Button variant="secondary" onClick={onVerProtocolo} disabled={bloqueado}>
          <IconLayers className="h-4 w-4" /> Ver protocolo
        </Button>
      )}
      {(onFechar || principal) && (
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {onFechar && (
            <Button variant="secondary" onClick={onFechar} disabled={bloqueado}>
              Fechar
            </Button>
          )}
          {principal}
        </div>
      )}
    </div>
  );
}

/** Os OUTROS itens iguais (mesmo código, descrição e unidade) ao item `idx` — vazio quando não se repete ou o ADM
 * pôs o ponto `item.duplicado` em "ignorar". Linear (o mapa sai de uma passada pelos itens). */
export function useRepetidosDoItem(
  dfd: DfdParseado | null,
  idx: number | null,
  regras: RegrasAvaliacao = regrasPadrao(),
  categoria: string | null = null,
): { idx: number; item: DfdParseado["itens"][number] }[] {
  const itens = dfd?.itens;
  const ativo = comportamentoNo(regras, "item.duplicado", { dfdTipo: tipoCurtoDfd(dfd?.tipo ?? null), categoria }) !== "ignora";
  const mapa = useMemo(() => (itens && ativo ? mapaItensDuplicados(itens) : null), [itens, ativo]);
  if (!itens || idx == null || !mapa) return [];
  return (mapa.get(idx) ?? []).map((j) => ({ idx: j, item: itens[j] }));
}

/**
 * Conteúdo do painel da DIREITA do banner do DFD — o MESMO na análise e no gravado: as MENSAGENS da
 * conferência (clicar rola/destaca no DFD), o detalhe do ITEM selecionado (cadeado por campo, remover
 * item; item REPETIDO: os iguais lado a lado, "Ver item" e unificar), o HISTÓRICO de alterações (só DFD
 * gravado — `dfdId`; carregado sob demanda), as DIFERENÇAS (reenvio/sobrescrita) ou os DUPLICADOS do processo.
 */
export function DfdPainelDireito({
  painel,
  dfd,
  numero,
  mensagens,
  onIrPara,
  conformidade,
  regras,
  editavel = false,
  onEditarItem,
  onRemoverItem,
  onUnificarItens,
  onPainel,
  categoria = null,
  dfdId = null,
  comparacao = null,
  herdados,
  escolha = null,
  duplicados = null,
}: {
  painel: PainelDfd | null;
  dfd: DfdParseado | null;
  numero: string;
  mensagens: MensagemDfd[];
  onIrPara: (m: MensagemDfd) => void;
  conformidade?: Map<string, ConferenciaItem>;
  regras?: RegrasAvaliacao;
  editavel?: boolean;
  onEditarItem?: (idx: number, patch: Partial<DfdParseado["itens"][number]>) => void;
  onRemoverItem?: (idx: number) => void;
  /** Unifica itens REPETIDOS: o item `manter` recebe as quantidades dos `outros`, que saem do DFD. */
  onUnificarItens?: (manter: number, outros: number[]) => void;
  /** Troca o conteúdo do painel (ex.: "Ver item" de um repetido; o item unificado após a unificação). */
  onPainel?: (p: PainelDfd) => void;
  /** Categoria do protocolo (exceções do ADM por categoria — ex.: o ponto `item.duplicado`). */
  categoria?: string | null;
  /** DFD gravado (id) — habilita o histórico (do DFD e o do item). */
  dfdId?: number | null;
  /** (reenvio) diferenças deste DFD em relação ao gravado — painel "Diferenças". */
  comparacao?: ComparacaoDfd | null;
  /** (reenvio) tratamentos herdados do gravado (o PDF não trazia). */
  herdados?: string[];
  /** (sobrescrita) ESCOLHA por dado — manter o gravado × usar o novo — no painel "Diferenças". */
  escolha?: EscolhaSobrescritaProps | null;
  /** (protocolação) DFDs DUPLICADOS do processo — a comparação lado a lado e a escolha de qual fica. */
  duplicados?: ReactNode;
}) {
  const verHistorico = painel?.tipo === "historico" && dfdId != null;
  const historico = useHistorico(verHistorico ? `/api/dfd/${dfdId}/historico` : null);
  const repetidos = useRepetidosDoItem(dfd, painel?.tipo === "item" ? painel.idx : null, regras, categoria);

  if (painel?.tipo === "diferencas") return <ComparacaoDfdView comparacao={comparacao} herdados={herdados} escolha={escolha} />;
  if (painel?.tipo === "duplicados") return <>{duplicados}</>;
  if (verHistorico) {
    return (
      <Historico
        entradas={historico.linhas ?? []}
        carregando={historico.linhas === null && !historico.erro}
        erro={historico.erro}
        escopo="dfd"
        vazio="Nenhuma alteração registrada neste DFD."
      />
    );
  }
  const item = painel?.tipo === "item" ? dfd?.itens[painel.idx] : undefined;
  if (painel?.tipo === "item" && item) {
    const idx = painel.idx;
    return (
      <ItemDetalhe
        key={idx}
        item={item}
        conformidade={conformidade}
        regras={regras}
        tipo={dfd?.tipo ?? null}
        editavel={editavel}
        onChange={editavel && onEditarItem ? (patch) => onEditarItem(idx, patch) : undefined}
        onRemover={editavel && onRemoverItem ? () => onRemoverItem(idx) : undefined}
        repetidos={repetidos}
        onVerItem={onPainel ? (j) => onPainel({ tipo: "item", idx: j }) : undefined}
        onUnificar={
          editavel && onUnificarItens
            ? () => {
                const outros = repetidos.map((r) => r.idx);
                onUnificarItens(idx, outros);
                onPainel?.({ tipo: "item", idx: indiceAposRemover(idx, outros) });
              }
            : undefined
        }
        historicoDfdId={dfdId}
      />
    );
  }
  return <MensagensDfd mensagens={mensagens} numero={numero} tipo={dfd?.tipo} onIrPara={onIrPara} />;
}
