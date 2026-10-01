"use client";

import { useEffect, useMemo, useState } from "react";
import { brl, dataBR, num } from "@/lib/format";
import {
  type CompraHistorico,
  type ContratoDoProduto,
  type ContratoHistorico,
  compararComHistorico,
  type PrecoContrato,
  type ProdutoHistorico,
  produtosDoHistorico,
  type ReferenciaHistorico,
  referenciaDoProduto,
  rotuloComparacaoHistorico,
  textoDivergenciaHistorico,
} from "@/lib/historico-compra-core";
import { desvioTexto } from "@/lib/itens-consolidados";
import { normalizarCodigo } from "@/lib/parse-catalogo-comum";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { COR_VARIACAO, TOM_VARIACAO } from "./ComposicaoItem";
import { EstadoPonto } from "./EstadoCelula";
import { IconCompra } from "./icons";
import { Modal } from "./Modal";
import { StatMini } from "./StatMini";

/** Quantidade como no sistema de compras (até 4 casas, sem zeros sobrando). */
const _qtd = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 });
export const decimalHistorico = (n: number) => _qtd.format(n);
const dec = decimalHistorico;

/** A dica da referência: o valor atual (com a assinatura), o médio entre contratos e a faixa menor–maior. */
function dicaReferencia(ref: ReferenciaHistorico): string {
  return [
    `Valor atual no histórico: ${brl(ref.atual)}${ref.data ? ` (assinatura ${dataBR(ref.data)})` : ""}`,
    ref.medio != null ? `Preço médio entre ${num(ref.contratos)} ${ref.contratos === 1 ? "contrato" : "contratos"}: ${brl(ref.medio)}` : null,
    ref.menor != null && ref.maior != null && ref.menor !== ref.maior ? `Menor ${brl(ref.menor)} · maior ${brl(ref.maior)}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * A célula "Histórico" da Mesa → Itens: o desvio do valor do item em relação ao VALOR ATUAL do histórico de compra, na cor
 * da régua da variação (verde até 25% · âmbar até 50% · vermelho acima) — aponta o item com valor divergente; a referência
 * na dica. Sem histórico do código ou item sem valor = "—".
 */
export function CelulaHistoricoCompra({ valor, referencia }: { valor: number | null; referencia: ReferenciaHistorico | null | undefined }) {
  const c = compararComHistorico(valor, referencia);
  if (!referencia || !c)
    return (
      <span className="text-faint" title={referencia ? `Item sem valor unitário.\n${dicaReferencia(referencia)}` : "Sem histórico de compra para este código."}>
        —
      </span>
    );
  return <EstadoPonto cor={COR_VARIACAO[c.nivel]} rotulo={desvioTexto(c.desvio)} title={`${rotuloComparacaoHistorico(valor, referencia)}\n${dicaReferencia(referencia)}`} />;
}

type DadosProduto = { itens: Pick<CompraHistorico, "ordem" | "idContrato" | "codigo" | "descricao" | "qtdContratada" | "valorContratado" | "valorUnitario">[]; contratos: ContratoDoProduto[] };

/** O histórico de UM código, guardado por 5 min (abrir o mesmo item de novo não refaz a consulta); falha não fica. */
const VALIDADE_MS = 5 * 60 * 1000;
const cache = new Map<string, { em: number; p: Promise<DadosProduto | null> }>();
function carregarProduto(codigo: string): Promise<DadosProduto | null> {
  const c = cache.get(codigo);
  if (c && Date.now() - c.em < VALIDADE_MS) return c.p;
  const p = fetch(`/api/catalogo/historico/produto?codigo=${encodeURIComponent(codigo)}`)
    .then((r) => r.json() as Promise<{ ok?: boolean } & Partial<DadosProduto>>)
    .then((j) => (j.ok && j.itens && j.contratos ? { itens: j.itens, contratos: j.contratos } : null))
    .catch(() => null)
    .then((d) => {
      if (!d) cache.delete(codigo);
      return d;
    });
  cache.set(codigo, { em: Date.now(), p });
  return p;
}

/**
 * O bloco "Histórico de compra" do detalhe do ITEM (`ItemDetalhe`): o valor do item COMPARADO com o histórico — o valor
 * atual (o do contrato assinado por último, com o aditivo), o médio e a faixa menor–maior entre contratos —, o ERRO
 * apontado por extenso quando diverge e o botão que abre o BANNER do produto no histórico (`ProdutoHistoricoDetalhe`) com
 * o valor do item em cima. Carregado só com o item aberto; sem código, sem histórico ou falha = o bloco não aparece
 * (a conferência é auxiliar).
 */
export function ComparacaoHistoricoCompra({ codigo, valor }: { codigo: string | null | undefined; valor: number | null | undefined }) {
  const cod = normalizarCodigo(codigo);
  const [dados, setDados] = useState<{ cod: string; d: DadosProduto | null } | null>(null);
  const [aberto, setAberto] = useState(false);
  useEffect(() => {
    if (!cod) return;
    let vivo = true;
    carregarProduto(cod).then((d) => vivo && setDados({ cod, d }));
    return () => {
      vivo = false;
    };
  }, [cod]);
  const atual = dados?.cod === cod ? dados.d : null;
  const produto = useMemo(() => (atual ? (produtosDoHistorico(atual.itens, atual.contratos)[0] ?? null) : null), [atual]);
  const contratoPorId = useMemo(() => new Map((atual?.contratos ?? []).map((c) => [c.idContrato, c] as const)), [atual]);
  const ref = produto ? referenciaDoProduto(produto) : null;
  if (!produto || !ref) return null;

  const c = compararComHistorico(valor, ref);
  const cor = c ? COR_VARIACAO[c.nivel] : "var(--muted)";
  const rotulo = rotuloComparacaoHistorico(valor, ref);
  const erro = textoDivergenciaHistorico(valor, ref);
  const valorItem = (
    <StatMini
      label="Valor do item"
      value={valor != null && valor > 0 ? brl(valor) : "—"}
      hint={c ? `${desvioTexto(c.desvio)} do valor atual` : "Sem valor unitário"}
      tone={c ? TOM_VARIACAO[c.nivel] : "default"}
    />
  );
  // O rótulo da comparação + o ERRO por extenso (quebram linha — nada cortado no celular).
  const apontamento = (
    <div className="space-y-1">
      <EstadoPonto cor={cor} rotulo={rotulo} />
      {erro && (
        <p className="text-xs font-medium" style={{ color: cor }}>
          {erro}
        </p>
      )}
    </div>
  );
  return (
    <section className="space-y-2 rounded-card border border-border bg-surface p-[var(--pad-card)] shadow-ring" data-ancora="historico">
      <h4 className="text-[13px] font-bold text-text">Histórico de compra</h4>
      {apontamento}
      <div className="grid grid-cols-2 gap-2">
        {valorItem}
        <StatMini label="Valor atual (histórico)" value={brl(ref.atual)} hint={ref.data ? `Assinatura ${dataBR(ref.data)}` : undefined} />
      </div>
      <p className="text-xs text-muted">
        {ref.contratos === 1 ? "Comprado em 1 contrato." : `Entre ${num(ref.contratos)} contratos: médio ${brl(ref.medio ?? 0)} · de ${brl(ref.menor ?? 0)} a ${brl(ref.maior ?? 0)}.`}
      </p>
      <div className="flex justify-end">
        <Button variant="secondary" icon={<IconCompra className="h-4 w-4" />} onClick={() => setAberto(true)}>
          Ver no histórico de compra
        </Button>
      </div>
      <Modal open={aberto} onClose={() => setAberto(false)} titulo="Produto no histórico de compra" size="lg">
        <div className="space-y-[var(--gap-block)]">
          <div className="grid grid-cols-2 items-center gap-2">
            {valorItem}
            {apontamento}
          </div>
          <ProdutoHistoricoDetalhe produto={produto} contratoPorId={contratoPorId} />
        </div>
      </Modal>
    </section>
  );
}

/**
 * O BANNER do PRODUTO no histórico de compra: o valor atual, o médio, o menor e o maior ENTRE contratos (com o contrato de
 * cada um) e os contratos em que foi comprado, do mais recente ao mais antigo (valor atual, "base + aditivo", selos
 * Menor/Maior valor). O MESMO no histórico aberto pelo Catálogo e na comparação com o item de um DFD (a Mesa) — lá sem
 * abrir o contrato (`onAbrirContrato` ausente: os cartões só informam).
 */
export function ProdutoHistoricoDetalhe({
  produto: p,
  contratoPorId,
  onAbrirContrato,
}: {
  produto: ProdutoHistorico;
  contratoPorId: Map<string, Pick<ContratoHistorico, "numeroContrato" | "credor" | "modalidade">>;
  onAbrirContrato?: (idContrato: string) => void;
}) {
  const rotuloContrato = (pc: PrecoContrato | null) => (pc ? `Contrato ${contratoPorId.get(pc.idContrato)?.numeroContrato || pc.idContrato}` : undefined);
  // Só com 2+ contratos o menor e o maior se distinguem.
  const extremos = p.porContrato.length > 1;
  const classe = "flex w-full items-start justify-between gap-3 rounded-card border border-border bg-surface p-2.5 text-left";
  return (
    <div className="space-y-[var(--gap-block)]">
      <div>
        <span className="rounded-chip bg-surface-2 px-2.5 py-1 font-mono text-[13px] font-bold text-text">{p.codigo}</span>
        <p className="mt-2 text-[14px] leading-snug text-text">{p.descricao}</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <StatMini label="Valor atual" value={p.atual ? brl(p.atual.valor) : "—"} hint={p.atual?.data ? `Assinatura ${dataBR(p.atual.data)}` : undefined} />
        <StatMini label="Preço médio" value={p.medio != null ? brl(p.medio) : "—"} hint="Entre contratos" />
        <StatMini label="Menor valor" value={p.menor != null ? brl(p.menor) : "—"} hint={rotuloContrato(p.contratoMenor)} />
        <StatMini label="Maior valor" value={p.maior != null ? brl(p.maior) : "—"} hint={rotuloContrato(p.contratoMaior)} />
      </div>
      <section className="space-y-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-faint">Comprado em {num(p.contratos)} {p.contratos === 1 ? "contrato" : "contratos"}</p>
        {p.porContrato.map((pc) => {
          const c = contratoPorId.get(pc.idContrato);
          const conteudo = (
            <>
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-semibold text-text">{c?.credor ?? `Contrato ${pc.idContrato}`}</span>
                <span className="block text-[12px] text-muted">
                  Contrato {c?.numeroContrato || pc.idContrato}
                  {pc.data ? ` · ${dataBR(pc.data)}` : ""}
                  {c?.modalidade ? ` · ${c.modalidade}` : ""}
                </span>
                {extremos && (pc === p.contratoMenor || pc === p.contratoMaior) && (
                  <span className="mt-1 flex gap-1">
                    {pc === p.contratoMenor && <Badge tone="emerald">Menor valor</Badge>}
                    {pc === p.contratoMaior && <Badge tone="red">Maior valor</Badge>}
                  </span>
                )}
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-[13px] font-bold tabular-nums text-text">{brl(pc.valor)}</span>
                <span className="block text-[11.5px] tabular-nums text-muted">
                  {pc.aditivo != null ? `${brl(pc.base)} + aditivo ${brl(pc.aditivo)}` : pc.quantidade ? `qtd. ${dec(pc.quantidade)}` : ""}
                </span>
              </span>
            </>
          );
          return onAbrirContrato ? (
            <button key={pc.idContrato} type="button" onClick={() => onAbrirContrato(pc.idContrato)} className={`${classe} hover:border-accent/50`}>
              {conteudo}
            </button>
          ) : (
            <div key={pc.idContrato} className={classe}>
              {conteudo}
            </div>
          );
        })}
      </section>
    </div>
  );
}
