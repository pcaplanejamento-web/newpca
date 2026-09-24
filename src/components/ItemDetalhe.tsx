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
  motivoNaoUnificar,
  veredictoLinhaCatalogo,
} from "@/lib/dfd-tratamento";
import { brl, num } from "@/lib/format";
import { normalizarCodigo } from "@/lib/parse-catalogo-comum";
import { tipoCurtoDfd } from "@/lib/parse-dfd-comum";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { CampoCongelado, CampoNumero, CampoTexto } from "./CampoCadeado";
import { Callout } from "./Callout";
import type { DfdVisualItem } from "./DfdView";
import { HistoricoDoItem } from "./Historico";
import { IconAlert, IconArrowRight, IconMerge, IconTrash } from "./icons";
import { toast } from "./Toast";

/** Campos do item que têm cadeado próprio. */
type CampoK = "codigo" | "unidade" | "descricao" | "quantidade" | "valorUnitario" | "valorTotal";
/** Iguais listados no bloco "Item repetido" (o resto é contado — a lista não cresce com o grupo). */
const MAX_REPETIDOS_LISTA = 20;

/**
 * Painel LATERAL de detalhe de UM item da Seção 4 do DFD — abre à direita ao clicar
 * numa linha da tabela de itens (mestre-detalhe), no MESMO lugar do painel de mensagens.
 * Mostra todas as infos do item + estado + CONFORMIDADE com o catálogo. Quando `editavel`,
 * cada campo tem um **cadeado próprio**: destravar para editar; um campo **igual ao catálogo**
 * (Código/Descrição/Unidade não divergentes) fica **bloqueado** (erro ao tentar). No DFD GRAVADO
 * (`historicoDfdId`), a seção recolhível "Histórico do item" mostra o que mudou nele. Item REPETIDO
 * (`repetidos`: mesmo código, descrição e unidade de outro item do DFD) ganha o bloco de conferência — os iguais
 * lado a lado (qtd./unidade/valores), "Ver item" e o tratamento: remover este ou UNIFICAR as quantidades nele.
 * Só tokens/componentes do design-system.
 */
export function ItemDetalhe({
  item,
  conformidade,
  regras = regrasPadrao(),
  tipo = null,
  editavel = false,
  onChange,
  onRemover,
  repetidos = [],
  corRepetido = "var(--warn)",
  onVerItem,
  onUnificar,
  historicoDfdId = null,
  consulta = null,
}: {
  item: DfdVisualItem;
  /** Conformidade dos itens com o catálogo (veredito por código). Ausente = sem o bloco. */
  conformidade?: Map<string, ConferenciaItem>;
  regras?: RegrasAvaliacao;
  /** Tipo do DFD (texto) — para resolver a compatibilidade de tipo do item. */
  tipo?: string | null;
  /** Habilita os cadeados por campo (importação, ou gravado com permissão de editor). */
  editavel?: boolean;
  /** Grava um patch parcial do item no host (que é dono do estado dos itens). */
  onChange?: (patch: Partial<DfdVisualItem>) => void;
  /** Remove este item do DFD (tratamento do ITEM DUPLICADO). Ausente = sem o botão. */
  onRemover?: () => void;
  /** Os OUTROS itens do DFD com o mesmo código, descrição e unidade (índice + dados) — vazio = não é repetido. */
  repetidos?: { idx: number; item: DfdVisualItem }[];
  /** Cor da importância do ADM para o item repetido (a MESMA da célula Estado da tabela). */
  corRepetido?: string;
  /** Abre outro item no painel (ex.: o repetido, para conferir). */
  onVerItem?: (idx: number) => void;
  /** Unifica os repetidos NESTE item (soma as quantidades; os outros saem do DFD). Ausente = sem o botão. */
  onUnificar?: () => void;
  /** DFD GRAVADO (id) — habilita a seção "Histórico do item" (carregada só ao abrir). */
  historicoDfdId?: number | null;
  /** CONSULTA (Dashboard do PCA, público): campos CONGELADOS, sem estado/faltas/catálogo; o histórico vem da
   * rota PÚBLICA (`urlHistorico` — só protocolos incorporados, sem autor). */
  consulta?: { urlHistorico: string } | null;
}) {
  const est = estadoItem(item);
  const faltas = faltasDoItem(item);
  const repetido = repetidos.length > 0;
  // Repetido sem erro = ATENÇÃO (âmbar) — nunca bloqueia; erro (valor/quantidade) segue na frente.
  const cor = est === "regular" && repetido ? corRepetido : estadoItemCor(est);
  const rotuloEstado = est === "regular" && repetido ? "Item repetido" : ESTADO_ITEM_ROTULO[est];
  const editavelUI = editavel && !!onChange; // cadeados por campo só com handler
  const semUnificar = repetido ? motivoNaoUnificar([item, ...repetidos.map((r) => r.item)]) : null;

  // Conformidade com o catálogo (só quando o veredito foi carregado e o item tem código).
  const conf = conformidade?.get(normalizarCodigo(item.codigo));
  const veredicto = veredictoLinhaCatalogo(conf, regras, tipoCurtoDfd(tipo));
  const corCat = veredicto ? corVeredictoCatalogo(veredicto.nivel) : "";
  // Rótulos ESPECÍFICOS (descrição/unidade/tipo diferentes) — aponta ONDE está o erro.
  const divergencias = conf ? rotulosDivergencia(conf) : [];

  // Cadeado por campo. Um campo IGUAL ao catálogo não pode ser alterado (bloqueado).
  const [abertos, setAbertos] = useState<Set<CampoK>>(new Set());
  const catalogado = !!conf?.sugestao && conf.sugestao.score >= 1;
  const bloqueado = (campo: CampoK): boolean => {
    if (!catalogado) return false; // sem item casado no catálogo → nada bloqueado
    if (campo === "codigo") return true; // código é a chave do match
    if (campo === "descricao") return !conf?.divergDescricao; // igual ao catálogo
    if (campo === "unidade") return !conf?.divergUnidade;
    return false; // quantidade/valores não têm equivalente no catálogo
  };
  const alternarCadeado = (campo: CampoK) => {
    if (bloqueado(campo)) {
      toast.error("Campo igual ao catálogo — não pode ser alterado.");
      return;
    }
    setAbertos((s) => {
      const n = new Set(s);
      if (n.has(campo)) n.delete(campo);
      else n.add(campo);
      return n;
    });
  };
  const props = (campo: CampoK) => ({
    editavel: editavelUI,
    aberto: abertos.has(campo),
    bloqueado: bloqueado(campo),
    onLock: () => alternarCadeado(campo),
  });

  if (consulta)
    return (
      <div className="space-y-4">
        <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <CampoCongelado label="Código" valor={item.codigo} mono />
          <CampoCongelado label="Unidade" valor={item.unidade} />
          <CampoCongelado label="Descrição" valor={item.descricao} span />
          <CampoCongelado label="Quantidade" valor={item.quantidade != null ? num(item.quantidade) : null} />
          <CampoCongelado label="Valor unitário" valor={item.valorUnitario != null ? brl(item.valorUnitario) : null} />
          <CampoCongelado label="Valor total" valor={item.valorTotal != null ? brl(item.valorTotal) : null} span forte />
        </div>
        <HistoricoDoItem url={consulta.urlHistorico} anonimo item={{ item: item.item ?? null, codigo: item.codigo ?? null }} />
      </div>
    );

  return (
    <div className="space-y-4">
      {/* Cabeçalho: nº do item + estado */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-base font-bold text-text">Item {item.item ?? "—"}</span>
        <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: cor }}>
          <span className="h-2 w-2 rounded-full" style={{ background: cor }} />
          {rotuloEstado}
        </span>
      </div>

      {faltas.length > 0 && (
        <Callout kind="danger" icon={<IconAlert className="h-4 w-4" />}>
          Falta {faltas.join(" e ")} — {editavelUI ? "destrave o campo para corrigir." : "corrija na tabela da Seção 4."}
        </Callout>
      )}

      {/* Campos do item — cada um com cadeado próprio quando editável */}
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <CampoTexto label="Código" valor={item.codigo ?? ""} mono {...props("codigo")} onChange={(v) => onChange?.({ codigo: v || null })} />
        <CampoTexto label="Unidade" valor={item.unidade ?? ""} {...props("unidade")} onChange={(v) => onChange?.({ unidade: v || null })} />
        <CampoTexto
          label="Descrição"
          valor={item.descricao ?? ""}
          span
          multi
          {...props("descricao")}
          onChange={(v) => onChange?.({ descricao: v || null })}
        />
        <CampoNumero label="Quantidade" valor={item.quantidade} {...props("quantidade")} onChange={(v) => onChange?.({ quantidade: v })} />
        <CampoNumero label="Valor unitário" valor={item.valorUnitario} moeda {...props("valorUnitario")} onChange={(v) => onChange?.({ valorUnitario: v })} />
        <CampoNumero label="Valor total" valor={item.valorTotal} moeda span forte {...props("valorTotal")} onChange={(v) => onChange?.({ valorTotal: v })} />
      </dl>

      {/* Item REPETIDO (mesmo código, descrição e unidade): os iguais lado a lado + tratamento. Não bloqueia. */}
      {repetido && (
        <section className="rounded-card border p-4" style={{ borderColor: `color-mix(in srgb, ${corRepetido} 35%, var(--border))` }} data-ancora="repetidos">
          <div className="mb-1 flex items-center justify-between gap-2">
            <h4 className="text-[13px] font-bold text-text">Item repetido</h4>
            <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: corRepetido }}>
              <span className="h-2 w-2 rounded-full" style={{ background: corRepetido }} />
              {repetidos.length + 1} iguais
            </span>
          </div>
          <p className="text-xs text-muted">
            Mesmo código, descrição e unidade de {repetidos.length === 1 ? "outro item" : `${repetidos.length} outros itens`} deste DFD.
            Se for o mesmo pedido lançado de novo, remova o que sobra ou unifique as quantidades num item só. Se for legítimo (ex.:
            entregas separadas), pode manter — não bloqueia.
          </p>
          <ul className="mt-3 space-y-2">
            {[{ idx: -1, item }, ...repetidos.slice(0, MAX_REPETIDOS_LISTA)].map((r) => (
              <li
                key={r.idx}
                className={`flex min-h-[44px] flex-wrap items-center gap-x-3 gap-y-1 rounded-control border px-3 py-2 ${r.idx < 0 ? "border-accent/40 bg-accent-soft" : "border-border bg-surface"}`}
              >
                <span className="text-[13px] font-semibold text-text">
                  Item {r.item.item ?? "—"}
                  {r.idx < 0 && <span className="ml-1 text-xs font-medium text-accent">(este)</span>}
                </span>
                <span className="min-w-0 flex-1 text-xs text-text-2">
                  {r.item.quantidade != null ? num(r.item.quantidade) : "—"} {r.item.unidade ?? ""} ·{" "}
                  {r.item.valorUnitario != null ? brl(r.item.valorUnitario) : "sem valor"} · total{" "}
                  <span className="font-semibold text-text">{r.item.valorTotal != null ? brl(r.item.valorTotal) : "—"}</span>
                </span>
                {r.idx >= 0 && onVerItem && (
                  <Button variant="ghost" onClick={() => onVerItem(r.idx)} icon={<IconArrowRight className="h-4 w-4" />}>
                    Ver item
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {repetidos.length > MAX_REPETIDOS_LISTA && (
            <p className="mt-2 text-xs text-muted">e mais {num(repetidos.length - MAX_REPETIDOS_LISTA)} iguais (a tabela de itens mostra todos).</p>
          )}
          {editavelUI && onUnificar && (
            <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
              {semUnificar && <p className="mr-auto text-xs text-muted">{semUnificar}</p>}
              <Button
                variant="secondary"
                icon={<IconMerge className="h-4 w-4" />}
                disabled={!!semUnificar}
                title={semUnificar ?? undefined}
                onClick={() => {
                  if (
                    confirm(
                      `Unificar no item ${item.item ?? ""}? As quantidades dos ${repetidos.length + 1} itens iguais são somadas nele e os outros saem do DFD (o valor total não muda).`,
                    )
                  )
                    onUnificar();
                }}
              >
                Unificar neste item
              </Button>
            </div>
          )}
        </section>
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

      {/* Histórico do item (DFD gravado): o que mudou nele, por qual canal e por qual protocolo. */}
      {historicoDfdId != null && <HistoricoDoItem url={`/api/dfd/${historicoDfdId}/historico`} item={{ item: item.item ?? null, codigo: item.codigo ?? null }} />}

      {/* Tratamento do item DUPLICADO (ou lançado por engano): remove do DFD e do valor total. */}
      {editavelUI && onRemover && (
        <div className="flex justify-end border-t border-border pt-3">
          <Button
            variant="ghost"
            icon={<IconTrash className="h-4 w-4" />}
            style={{ color: "var(--danger)" }}
            onClick={() => {
              if (confirm(`Remover o item ${item.item ?? ""} deste DFD? Ele sai do valor total.`)) onRemover();
            }}
          >
            Remover item
          </Button>
        </div>
      )}
    </div>
  );
}

/** Célula só-leitura da referência do catálogo (sem cadeado). */
function Campo({ label, valor, span, mono }: { label: string; valor: string; span?: boolean; mono?: boolean }) {
  return (
    <div className={span ? "sm:col-span-2" : ""}>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`mt-0.5 break-words leading-snug font-semibold text-text ${mono ? "font-mono text-[13px]" : "text-sm"}`}>
        {valor}
      </dd>
    </div>
  );
}
