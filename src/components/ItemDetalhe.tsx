"use client";

import { useState } from "react";
import { type RegrasAvaliacao, regrasPadrao } from "@/lib/avaliacao-core";
import { type ConferenciaItem, ROTULO_FALTA_CATALOGO, rotulosDivergencia } from "@/lib/catalogo-conferencia";
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
import { parseNumberBR } from "@/lib/normalize";
import { Badge } from "./Badge";
import { Callout } from "./Callout";
import type { DfdVisualItem } from "./DfdView";
import { cellCls } from "./formStyles";
import { IconAlert } from "./icons";

/** Número → string editável em pt-BR (vírgula decimal, sem separador de milhar). */
function fmtNumEdit(v: number | null | undefined): string {
  return v == null ? "" : String(v).replace(".", ",");
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
  editavel = false,
  onChange,
}: {
  item: DfdVisualItem;
  /** Conformidade dos itens com o catálogo (veredito por código). Ausente = sem o bloco. */
  conformidade?: Map<string, ConferenciaItem>;
  regras?: RegrasAvaliacao;
  /** Tipo do DFD (texto) — para resolver a compatibilidade de tipo do item. */
  tipo?: string | null;
  /** Campos do item editáveis (importação, ou gravado com o cadeado aberto). */
  editavel?: boolean;
  /** Grava um patch parcial do item no host (que é dono do estado dos itens). */
  onChange?: (patch: Partial<DfdVisualItem>) => void;
}) {
  const est = estadoItem(item);
  const faltas = faltasDoItem(item);
  const cor = estadoItemCor(est);
  const ed = editavel && onChange; // edição habilitada (só com handler)

  // Conformidade com o catálogo (só quando o veredito foi carregado e o item tem código).
  const conf = conformidade?.get(normalizarCodigo(item.codigo));
  const veredicto = veredictoLinhaCatalogo(conf, regras, tipoCurtoDfd(tipo));
  const corCat = veredicto ? corVeredictoCatalogo(veredicto.nivel) : "";
  // Rótulos ESPECÍFICOS (descrição/unidade/tipo diferentes) — aponta ONDE está o erro.
  const divergencias = conf ? rotulosDivergencia(conf) : [];

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
          Falta {faltas.join(" e ")} — {ed ? "preencha abaixo." : "corrija na tabela da Seção 4."}
        </Callout>
      )}

      {/* Todos os campos do item — editáveis quando `ed`, senão só-leitura */}
      {ed ? (
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <CampoTextoEdit label="Código" valor={item.codigo ?? ""} mono onChange={(v) => onChange?.({ codigo: v || null })} />
          <CampoTextoEdit label="Unidade" valor={item.unidade ?? ""} onChange={(v) => onChange?.({ unidade: v || null })} />
          <CampoTextoEdit
            label="Descrição"
            valor={item.descricao ?? ""}
            span
            multi
            onChange={(v) => onChange?.({ descricao: v || null })}
          />
          <CampoNumEdit label="Quantidade" valor={item.quantidade} onChange={(v) => onChange?.({ quantidade: v })} />
          <CampoNumEdit
            label="Valor unitário"
            valor={item.valorUnitario}
            onChange={(v) => onChange?.({ valorUnitario: v })}
          />
          <CampoNumEdit label="Valor total" valor={item.valorTotal} span onChange={(v) => onChange?.({ valorTotal: v })} />
        </dl>
      ) : (
        <dl className="grid gap-x-6 gap-y-3.5 sm:grid-cols-2">
          <Campo label="Código" valor={item.codigo ?? "—"} mono />
          <Campo label="Unidade" valor={item.unidade ?? "—"} />
          <Campo label="Descrição" valor={item.descricao ?? "—"} span />
          <Campo label="Quantidade" valor={item.quantidade != null ? num(item.quantidade) : "—"} />
          <Campo label="Valor unitário" valor={item.valorUnitario != null ? brl(item.valorUnitario) : "—"} />
          <Campo label="Valor total" valor={item.valorTotal != null ? brl(item.valorTotal) : "—"} span forte />
        </dl>
      )}

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
          {/* Aponta ONDE está o erro (descrição/unidade/tipo diferentes), não só "divergente". */}
          {divergencias.length > 0 && (
            <ul className="mb-1 space-y-1">
              {divergencias.map((r) => (
                <li key={r} className="flex items-center gap-1.5 text-xs font-medium" style={{ color: corCat }}>
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: corCat }} />
                  {r}
                </li>
              ))}
            </ul>
          )}
          {conf?.sugestao && (
            <div className="mt-2 rounded-card border border-border-2 bg-surface-2 p-3">
              <div className="mb-2 text-xs font-semibold text-muted">
                {conf.sugestao.score >= 1
                  ? "Item do catálogo (referência)"
                  : `Item semelhante no catálogo (${Math.round(conf.sugestao.score * 100)}%)`}
                {` · ${conf.sugestao.catalogoNome}`}
              </div>
              {/* Mesma grade e MESMO tamanho de fonte do item importado (comparação lado a lado). */}
              <dl className="grid gap-x-6 gap-y-3.5 sm:grid-cols-2">
                <Campo label="Código" valor={conf.sugestao.codigoRaw ?? conf.sugestao.codigo} mono />
                <Campo label="Unidade" valor={conf.sugestao.unidade ?? "—"} />
                <Campo label="Descrição" valor={conf.sugestao.descricao} span />
                <div className="sm:col-span-2">
                  <dt className="text-xs text-muted">Tipos de DFD</dt>
                  <dd className="mt-1 flex flex-wrap gap-1.5">
                    {conf.sugestao.tipos.length > 0 ? (
                      conf.sugestao.tipos.map((t) => (
                        <Badge key={t} tone="blue">
                          {t}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-sm text-faint">Nenhum tipo definido (sem restrição).</span>
                    )}
                  </dd>
                </div>
              </dl>
              {divergencias.length > 0 && (
                <p className="mt-2 text-xs text-muted">
                  Referência para padronização. O DFD oficial não é alterado — corrija na origem ou no catálogo.
                </p>
              )}
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
        className={`mt-0.5 break-words leading-snug text-text ${
          mono ? "font-mono text-[13px] font-semibold" : forte ? "text-base font-bold" : "text-sm font-semibold"
        }`}
      >
        {valor}
      </dd>
    </div>
  );
}

/** Campo de texto editável (código/descrição/unidade) — controlado pelo item do host. */
function CampoTextoEdit({
  label,
  valor,
  onChange,
  span,
  mono,
  multi,
}: {
  label: string;
  valor: string;
  onChange: (v: string) => void;
  span?: boolean;
  mono?: boolean;
  multi?: boolean;
}) {
  return (
    <div className={span ? "sm:col-span-2" : ""}>
      <label className="mb-0.5 block text-xs text-muted">{label}</label>
      {multi ? (
        <textarea
          className={`${cellCls} min-h-[76px] resize-y leading-snug`}
          value={valor}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          className={`${cellCls} ${mono ? "font-mono" : ""}`}
          value={valor}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

/**
 * Campo numérico editável (quantidade/valores) — mantém um RASCUNHO local do texto
 * digitado (aceita "8.000,50" enquanto se digita) e envia o número parseado ao host.
 * Reinicia quando o host remonta o painel (key por item) ao trocar de item.
 */
function CampoNumEdit({
  label,
  valor,
  onChange,
  span,
}: {
  label: string;
  valor: number | null | undefined;
  onChange: (v: number | null) => void;
  span?: boolean;
}) {
  const [raw, setRaw] = useState(() => fmtNumEdit(valor));
  return (
    <div className={span ? "sm:col-span-2" : ""}>
      <label className="mb-0.5 block text-xs text-muted">{label}</label>
      <input
        className={cellCls}
        inputMode="decimal"
        value={raw}
        onChange={(e) => {
          setRaw(e.target.value);
          onChange(parseNumberBR(e.target.value));
        }}
      />
    </div>
  );
}
