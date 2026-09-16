"use client";

import { ESTADO_ITEM_ROTULO, estadoItem, estadoItemCor, faltasDoItem } from "@/lib/dfd-tratamento";
import { brl, num } from "@/lib/format";
import { Callout } from "./Callout";
import type { DfdVisualItem } from "./DfdView";
import { IconAlert } from "./icons";

/**
 * Painel LATERAL de detalhe de UM item da Seção 4 do DFD — abre à direita ao clicar
 * numa linha da tabela de itens (mestre-detalhe), no MESMO lugar do painel de mensagens.
 * Mostra TODAS as informações do item selecionado + o estado (com erro/regular). Corpo
 * de um `Modal` (não abre modal próprio). Só tokens/componentes do design-system.
 */
export function ItemDetalhe({ item }: { item: DfdVisualItem }) {
  const est = estadoItem(item);
  const faltas = faltasDoItem(item);
  const cor = estadoItemCor(est);

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
