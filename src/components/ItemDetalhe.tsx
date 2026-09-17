"use client";

import { type RegrasAvaliacao, regrasPadrao } from "@/lib/avaliacao-core";
import { type ConferenciaItem, ROTULO_FALTA_CATALOGO } from "@/lib/catalogo-conferencia";
import {
  corVeredictoCatalogo,
  ESTADO_ITEM_ROTULO,
  estadoItem,
  estadoItemCor,
  faltasDoItem,
  veredictoLinhaCatalogo,
} from "@/lib/dfd-tratamento";
import { brl, num } from "@/lib/format";
import { normalizarCodigo } from "@/lib/parse-catalogo-comum";
import { tipoCurtoDfd } from "@/lib/parse-dfd-comum";
import { Callout } from "./Callout";
import type { DfdVisualItem } from "./DfdView";
import { IconAlert } from "./icons";

/** Descrição textual do problema de conformidade (o que diverge). */
function textoProblemaCatalogo(c: ConferenciaItem, falta: string): string {
  if (falta === "naoCatalogado") return "Código não encontrado no catálogo de referência.";
  if (falta === "tipoIncompativel") return "O código existe no catálogo, mas não permite este tipo de DFD.";
  const partes: string[] = [];
  if (c.divergDescricao) partes.push("a descrição");
  if (c.divergUnidade) partes.push("a unidade de medida");
  return partes.length > 0
    ? `Diverge do catálogo em ${partes.join(" e ")}.`
    : "Diverge do catálogo de referência.";
}

/**
 * Painel LATERAL de detalhe de UM item da Seção 4 do DFD — abre à direita ao clicar
 * numa linha da tabela de itens (mestre-detalhe), no MESMO lugar do painel de mensagens.
 * Mostra TODAS as informações do item + o estado (com erro/regular) + a CONFORMIDADE com
 * o catálogo (status e sugestão de padronização, display-only — o DFD não é alterado).
 * Corpo de um `Modal` (não abre modal próprio). Só tokens/componentes do design-system.
 */
export function ItemDetalhe({
  item,
  conformidade,
  regras = regrasPadrao(),
  tipo = null,
}: {
  item: DfdVisualItem;
  /** Conformidade dos itens com o catálogo (veredito por código). Ausente = sem o bloco. */
  conformidade?: Map<string, ConferenciaItem>;
  regras?: RegrasAvaliacao;
  /** Tipo do DFD (texto) — para resolver a compatibilidade de tipo do item. */
  tipo?: string | null;
}) {
  const est = estadoItem(item);
  const faltas = faltasDoItem(item);
  const cor = estadoItemCor(est);

  // Conformidade com o catálogo (só quando o veredito foi carregado e o item tem código).
  const conf = conformidade?.get(normalizarCodigo(item.codigo));
  const veredicto = veredictoLinhaCatalogo(conf, regras, tipoCurtoDfd(tipo));
  const corCat = veredicto ? corVeredictoCatalogo(veredicto.nivel) : "";

  return (
    <div className="space-y-4">
      {/* Cabeçalho: nº do item + estado */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-base font-bold text-text">Item {item.item ?? "—"}</span>
        <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: cor }}>
          <span className="h-2 w-2 rounded-full" style={{ background: cor }} />
          {ESTADO_ITEM_ROTULO[est]}
        </span>
      </div>

      {faltas.length > 0 && (
        <Callout kind="danger" icon={<IconAlert className="h-4 w-4" />}>
          Falta {faltas.join(" e ")} — corrija na tabela da Seção 4.
        </Callout>
      )}

      {/* Todos os campos do item */}
      <dl className="grid gap-x-6 gap-y-3.5 sm:grid-cols-2">
        <Campo label="Código" valor={item.codigo ?? "—"} mono />
        <Campo label="Unidade" valor={item.unidade ?? "—"} />
        <Campo label="Descrição" valor={item.descricao ?? "—"} span />
        <Campo label="Quantidade" valor={item.quantidade != null ? num(item.quantidade) : "—"} />
        <Campo label="Valor unitário" valor={item.valorUnitario != null ? brl(item.valorUnitario) : "—"} />
        <Campo label="Valor total" valor={item.valorTotal != null ? brl(item.valorTotal) : "—"} span forte />
      </dl>

      {/* Conformidade com o catálogo (referência) — status + sugestão (display-only) */}
      {veredicto && (
        <section className="rounded-card border border-border bg-surface p-4 shadow-ring" data-ancora="catalogo">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h4 className="text-[13px] font-bold text-text">Conformidade com o catálogo</h4>
            <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: corCat }}>
              <span className="h-2 w-2 rounded-full" style={{ background: corCat }} />
              {veredicto.falta ? ROTULO_FALTA_CATALOGO[veredicto.falta] : "Conforme"}
            </span>
          </div>
          {veredicto.falta && conf && (
            <p className="text-xs text-muted">{textoProblemaCatalogo(conf, veredicto.falta)}</p>
          )}
          {conf?.sugestao && (
            <div className="mt-2 rounded-card border border-border-2 bg-surface-2 p-3">
              <div className="mb-2 text-xs font-semibold text-muted">
                {conf.sugestao.score >= 1
                  ? "Padrão do catálogo"
                  : `Item semelhante no catálogo (${Math.round(conf.sugestao.score * 100)}%)`}
                {` · ${conf.sugestao.catalogoNome}`}
              </div>
              <dl className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
                <Campo label="Código" valor={conf.sugestao.codigoRaw ?? conf.sugestao.codigo} mono />
                <Campo label="Unidade" valor={conf.sugestao.unidade ?? "—"} />
                <Campo label="Descrição" valor={conf.sugestao.descricao} span />
              </dl>
              <p className="mt-2 text-xs text-muted">
                Sugestão de padronização (referência). O DFD oficial não é alterado — corrija na origem ou no catálogo.
              </p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function Campo({
  label,
  valor,
  span,
  mono,
  forte,
}: {
  label: string;
  valor: string;
  span?: boolean;
  mono?: boolean;
  forte?: boolean;
}) {
  return (
    <div className={span ? "sm:col-span-2" : ""}>
      <dt className="text-xs text-muted">{label}</dt>
      <dd
        className={`mt-0.5 break-words leading-snug text-text ${mono ? "font-mono text-[13px]" : ""} ${
          forte ? "text-base font-bold" : "font-semibold"
        }`}
      >
        {valor}
      </dd>
    </div>
  );
}
