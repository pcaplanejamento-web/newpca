"use client";

import { useEffect, useMemo, useState } from "react";
import type { CatalogoResumo } from "@/lib/catalogo";
import { brl, brlCompact, dataBR, num } from "@/lib/format";
import {
  type CompraHistorico,
  type ContratoHistorico,
  type PrecoContrato,
  type ProdutoHistorico,
  produtosDoHistorico,
  resumoHistorico,
  rotuloVariacao,
} from "@/lib/historico-compra-core";
import { COR_VARIACAO, desvioDaMedia, desvioTexto, nivelVariacao } from "@/lib/itens-consolidados";
import { Badge } from "./Badge";
import { CelulaCopiavel } from "./BotaoCopiar";
import { CelulaTexto } from "./CelulaLista";
import { CelulaVariacao } from "./ComposicaoItem";
import { EstadoPonto } from "./EstadoCelula";
import { type Column, DataTable } from "./DataTable";
import { ErroCarga } from "./ErroCarga";
import { Modal } from "./Modal";
import { decimalHistorico, ProdutoHistoricoDetalhe } from "./ProdutoHistorico";
import { Segmented } from "./Segmented";
import { SkeletonLinhas } from "./Skeleton";
import { StatMini } from "./StatMini";

type Vista = "produtos" | "porContrato" | "itens" | "contratos";
/** Uma linha da visão "Por contrato": o produto num contrato. */
type ProdutoNoContrato = { p: ProdutoHistorico; pc: PrecoContrato };
type Dados = { contratos: ContratoHistorico[]; itens: CompraHistorico[] };
type Detalhe = { tipo: "produto"; codigo: string } | { tipo: "contrato"; id: string } | null;

const dec = decimalHistorico;

const dinheiro = (n: number | null) => (n == null ? <span className="text-faint">—</span> : <span className="tabular-nums">{brl(n)}</span>);
const quantidade = (n: number | null) => (n == null ? <span className="text-faint">—</span> : <span className="tabular-nums">{dec(n)}</span>);
/** A composição do valor atual: "R$ 8,75 + aditivo R$ 0,80" (ou só o preço), o credor e a assinatura. */
const textoValorAtual = (pc: PrecoContrato) =>
  [pc.aditivo != null ? `${brl(pc.base)} + aditivo ${brl(pc.aditivo)}` : null, pc.credor, pc.data ? `Assinatura ${dataBR(pc.data)}` : null].filter(Boolean).join(" · ");

/**
 * O HISTÓRICO DE COMPRA de um catálogo (tipo 'historico') num banner de tela cheia: os números do topo (valor contratado
 * e empenhado, contratos, produtos, os com VARIAÇÃO ALTA, período) e três visões — **Produtos** (um por código: contratos,
 * quantidade, valor atual e menor/médio/maior ENTRE contratos — a base da comparação futura com os DFDs), **Itens**
 * (cada item contratado) e **Contratos**. Tocar num produto ou contrato abre o detalhe ao lado. Carregado só ao abrir.
 */
export function HistoricoCompraModal({ catalogo, onFechar, podeExportar }: { catalogo: CatalogoResumo | null; onFechar: () => void; podeExportar: boolean }) {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const [vista, setVista] = useState<Vista>("produtos");
  const [detalhe, setDetalhe] = useState<Detalhe>(null);
  const id = catalogo?.id ?? null;

  useEffect(() => {
    if (id == null) return;
    let vivo = true;
    setDados(null);
    setErro(null);
    setDetalhe(null);
    void tentativa;
    fetch(`/api/catalogo/${id}/historico`)
      .then((r) => r.json().then((j) => ({ r, j: j as { ok?: boolean; error?: string; contratos: ContratoHistorico[]; itens: CompraHistorico[] } | null })))
      .then(({ r, j }) => {
        if (!vivo) return;
        if (!r.ok || !j?.ok) setErro(j?.error ?? "Não foi possível carregar o histórico.");
        else setDados({ contratos: j.contratos, itens: j.itens });
      })
      .catch(() => vivo && setErro("Sem conexão — não foi possível carregar o histórico."));
    return () => {
      vivo = false;
    };
  }, [id, tentativa]);

  const contratoPorId = useMemo(() => new Map((dados?.contratos ?? []).map((c) => [c.idContrato, c] as const)), [dados]);
  // Os de MAIOR variação primeiro (os que pedem atenção), depois os de um preço só — no empate, o maior valor.
  const produtos = useMemo(
    () => (dados ? produtosDoHistorico(dados.itens, dados.contratos).sort((x, y) => (y.variacao ?? -1) - (x.variacao ?? -1) || y.valorTotal - x.valorTotal) : []),
    [dados],
  );
  const resumo = useMemo(() => (dados ? resumoHistorico(dados.itens, dados.contratos) : null), [dados]);
  const itensPorContrato = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of dados?.itens ?? []) m.set(it.idContrato, (m.get(it.idContrato) ?? 0) + 1);
    return m;
  }, [dados]);

  // O "Δ preço médio" de cada item: o VALOR ATUAL do produto no contrato do item (base + aditivo) × o médio ENTRE
  // contratos — mostra qual contrato puxa a variação.
  const medioPorCodigo = useMemo(() => new Map(produtos.map((p) => [p.codigo, p.medio] as const)), [produtos]);
  const atualNoContrato = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of produtos) for (const pc of p.porContrato) m.set(`${p.codigo}|${pc.idContrato}`, pc.valor);
    return m;
  }, [produtos]);
  const desvio = (it: CompraHistorico) => desvioDaMedia(atualNoContrato.get(`${it.codigo}|${it.idContrato}`) ?? null, medioPorCodigo.get(it.codigo) ?? null);
  // O contrato do menor/maior valor: o nº (o Id quando não há nº), o credor e a assinatura na dica.
  const numeroDoContrato = (pc: PrecoContrato | null) => (pc ? contratoPorId.get(pc.idContrato)?.numeroContrato || pc.idContrato : "");
  const valorDoContrato = (pc: PrecoContrato | null) =>
    pc ? (
      <span className="tabular-nums" title={textoValorAtual(pc)}>
        {brl(pc.valor)}
      </span>
    ) : (
      <span className="text-faint">—</span>
    );
  const celulaContrato = (pc: PrecoContrato | null) =>
    pc ? (
      <span className="tabular-nums" title={textoValorAtual(pc)}>
        {numeroDoContrato(pc)}
      </span>
    ) : (
      <span className="text-faint">—</span>
    );
  const comVariacaoAlta = useMemo(() => produtos.filter((p) => nivelVariacao(p.variacao) === "alerta").length, [produtos]);

  const colProdutos: Column<ProdutoHistorico>[] = [
    {
      key: "codigo",
      header: "Código",
      nowrap: true,
      value: (p) => p.codigo,
      render: (p) => (
        <CelulaCopiavel copiar={p.codigo} rotulo="código do produto">
          <span className="font-mono text-[13px] text-text-2">{p.codigo}</span>
        </CelulaCopiavel>
      ),
    },
    { key: "descricao", header: "Descrição", align: "left", minWidth: 280, value: (p) => p.descricao, render: (p) => <CelulaTexto texto={p.descricao} /> },
    {
      key: "variacao",
      header: "Variação",
      nowrap: true,
      value: (p) => rotuloVariacao(p.variacao),
      render: (p) => <CelulaVariacao cv={p.variacao} min={p.menor} max={p.maior} n={p.porContrato.length} nota="Entre contratos diferentes, pelo valor atual de cada um." />,
    },
    { key: "contratos", header: "Contratos", nowrap: true, filter: "range", numero: (p) => p.contratos, formatarFaixa: num, value: (p) => String(p.contratos), render: (p) => <span className="tabular-nums">{num(p.contratos)}</span> },
    { key: "qtd", header: "Qtd. contratada", nowrap: true, filter: "range", numero: (p) => p.quantidade, formatarFaixa: dec, value: (p) => String(p.quantidade), render: (p) => quantidade(p.quantidade) },
    {
      key: "atual",
      header: "Valor atual",
      align: "right",
      nowrap: true,
      filter: "range",
      numero: (p) => p.atual?.valor ?? null,
      value: (p) => String(p.atual?.valor ?? ""),
      render: (p) =>
        p.atual ? (
          <span className="tabular-nums" title={textoValorAtual(p.atual)}>
            {brl(p.atual.valor)}
          </span>
        ) : (
          <span className="text-faint">—</span>
        ),
    },
    { key: "menor", header: "Menor valor", align: "right", nowrap: true, filter: "range", numero: (p) => p.menor, value: (p) => String(p.menor ?? ""), render: (p) => valorDoContrato(p.contratoMenor) },
    { key: "contratoMenor", header: "Contrato (menor)", nowrap: true, value: (p) => numeroDoContrato(p.contratoMenor), render: (p) => celulaContrato(p.contratoMenor) },
    { key: "medio", header: "Preço médio", align: "right", nowrap: true, filter: "range", numero: (p) => p.medio, value: (p) => String(p.medio ?? ""), render: (p) => dinheiro(p.medio) },
    { key: "maior", header: "Maior valor", align: "right", nowrap: true, filter: "range", numero: (p) => p.maior, value: (p) => String(p.maior ?? ""), render: (p) => valorDoContrato(p.contratoMaior) },
    { key: "contratoMaior", header: "Contrato (maior)", nowrap: true, value: (p) => numeroDoContrato(p.contratoMaior), render: (p) => celulaContrato(p.contratoMaior) },
    { key: "total", header: "Valor contratado", align: "right", nowrap: true, filter: "range", numero: (p) => p.valorTotal, value: (p) => String(p.valorTotal), render: (p) => dinheiro(p.valorTotal) },
  ];

  // Por contrato: cada produto em cada contrato — o MENOR e o MAIOR preço das linhas dele (o menor é o aditivo) e o
  // valor atual (maior + aditivo), comparado ao médio entre contratos. O mais recente é o valor atual do produto.
  const porContrato = useMemo<ProdutoNoContrato[]>(() => produtos.flatMap((p) => p.porContrato.map((pc) => ({ p, pc }))), [produtos]);
  const situacaoNoContrato = ({ p, pc }: ProdutoNoContrato) => (pc === p.atual ? "Mais recente" : "Anterior");
  const desvioNoContrato = ({ p, pc }: ProdutoNoContrato) => desvioDaMedia(pc.valor, p.medio);
  const colPorContrato: Column<ProdutoNoContrato>[] = [
    {
      key: "codigo",
      header: "Código",
      nowrap: true,
      value: (l) => l.p.codigo,
      render: (l) => (
        <CelulaCopiavel copiar={l.p.codigo} rotulo="código do produto">
          <span className="font-mono text-[13px] text-text-2">{l.p.codigo}</span>
        </CelulaCopiavel>
      ),
    },
    { key: "descricao", header: "Descrição", align: "left", minWidth: 260, value: (l) => l.p.descricao, render: (l) => <CelulaTexto texto={l.p.descricao} /> },
    { key: "contrato", header: "Contrato", nowrap: true, value: (l) => numeroDoContrato(l.pc), render: (l) => numeroDoContrato(l.pc) },
    { key: "data", header: "Assinatura", nowrap: true, filter: "date", value: (l) => l.pc.data ?? "", render: (l) => dataBR(l.pc.data) },
    { key: "situacao", header: "Situação", nowrap: true, value: situacaoNoContrato, render: (l) => (l.pc === l.p.atual ? <Badge tone="blue">Mais recente</Badge> : <span className="text-muted">Anterior</span>) },
    { key: "menor", header: "Menor valor", align: "right", nowrap: true, filter: "range", numero: (l) => l.pc.menor, value: (l) => String(l.pc.menor), render: (l) => dinheiro(l.pc.menor) },
    { key: "maior", header: "Maior valor", align: "right", nowrap: true, filter: "range", numero: (l) => l.pc.base, value: (l) => String(l.pc.base), render: (l) => dinheiro(l.pc.base) },
    {
      key: "atual",
      header: "Valor atual",
      align: "right",
      nowrap: true,
      filter: "range",
      numero: (l) => l.pc.valor,
      value: (l) => String(l.pc.valor),
      render: (l) => (
        <span className="tabular-nums font-semibold" title={textoValorAtual(l.pc)}>
          {brl(l.pc.valor)}
        </span>
      ),
    },
    {
      key: "desvio",
      header: "Δ preço médio",
      nowrap: true,
      filter: "range",
      numero: desvioNoContrato,
      formatarFaixa: desvioTexto,
      value: (l) => String(desvioNoContrato(l) ?? ""),
      render: (l) => {
        const d = desvioNoContrato(l);
        const nivel = d == null ? null : nivelVariacao(Math.abs(d));
        return d == null || nivel == null ? (
          <span className="text-faint">—</span>
        ) : (
          <EstadoPonto cor={COR_VARIACAO[nivel]} rotulo={desvioTexto(d)} title={`Valor atual neste contrato × preço médio entre contratos (${brl(l.p.medio ?? 0)}).`} />
        );
      },
    },
    { key: "qtd", header: "Qtd. contratada", nowrap: true, filter: "range", numero: (l) => l.pc.quantidade, formatarFaixa: dec, value: (l) => String(l.pc.quantidade), render: (l) => quantidade(l.pc.quantidade) },
    { key: "linhas", header: "Linhas", nowrap: true, filter: "range", numero: (l) => l.pc.linhas, formatarFaixa: num, value: (l) => String(l.pc.linhas), render: (l) => <span className="tabular-nums">{num(l.pc.linhas)}</span> },
    { key: "credor", header: "Credor", align: "left", minWidth: 200, value: (l) => l.pc.credor ?? "", render: (l) => <CelulaTexto texto={l.pc.credor ?? "—"} /> },
  ];

  const colItens: Column<CompraHistorico>[] = [
    {
      key: "codigo",
      header: "Código",
      nowrap: true,
      value: (it) => it.codigo,
      render: (it) => (
        <CelulaCopiavel copiar={it.codigo} rotulo="código do produto">
          <span className="font-mono text-[13px] text-text-2">{it.codigo}</span>
        </CelulaCopiavel>
      ),
    },
    { key: "descricao", header: "Descrição", align: "left", minWidth: 260, value: (it) => it.descricao, render: (it) => <CelulaTexto texto={it.descricao} /> },
    {
      key: "desvio",
      header: "Δ preço médio",
      nowrap: true,
      filter: "range",
      numero: (it) => desvio(it),
      formatarFaixa: desvioTexto,
      value: (it) => String(desvio(it) ?? ""),
      render: (it) => {
        const d = desvio(it);
        const nivel = d == null ? null : nivelVariacao(Math.abs(d));
        return d == null || nivel == null ? (
          <span className="text-faint">—</span>
        ) : (
          <EstadoPonto cor={COR_VARIACAO[nivel]} rotulo={desvioTexto(d)} title={`Valor atual neste contrato (${brl(atualNoContrato.get(`${it.codigo}|${it.idContrato}`) ?? 0)}) × preço médio entre contratos (${brl(medioPorCodigo.get(it.codigo) ?? 0)}).`} />
        );
      },
    },
    { key: "unit", header: "Valor unitário", align: "right", nowrap: true, filter: "range", numero: (it) => it.valorUnitario, value: (it) => String(it.valorUnitario ?? ""), render: (it) => dinheiro(it.valorUnitario) },
    { key: "qtd", header: "Qtd. contratada", nowrap: true, filter: "range", numero: (it) => it.qtdContratada, formatarFaixa: dec, value: (it) => String(it.qtdContratada ?? ""), render: (it) => quantidade(it.qtdContratada) },
    { key: "contratado", header: "Valor contratado", align: "right", nowrap: true, filter: "range", numero: (it) => it.valorContratado, value: (it) => String(it.valorContratado ?? ""), render: (it) => dinheiro(it.valorContratado) },
    { key: "empenhado", header: "Valor empenhado", align: "right", nowrap: true, filter: "range", numero: (it) => it.valorEmpenhado, value: (it) => String(it.valorEmpenhado ?? ""), render: (it) => dinheiro(it.valorEmpenhado) },

    { key: "contrato", header: "Contrato", nowrap: true, value: (it) => contratoPorId.get(it.idContrato)?.numeroContrato ?? it.idContrato, render: (it) => contratoPorId.get(it.idContrato)?.numeroContrato || it.idContrato },
    { key: "credor", header: "Credor", align: "left", minWidth: 200, value: (it) => contratoPorId.get(it.idContrato)?.credor ?? "", render: (it) => <span className="block max-w-[260px] truncate" title={contratoPorId.get(it.idContrato)?.credor ?? ""}>{contratoPorId.get(it.idContrato)?.credor ?? "—"}</span> },
    { key: "data", header: "Assinatura", nowrap: true, filter: "date", value: (it) => contratoPorId.get(it.idContrato)?.dataAssinatura ?? "", render: (it) => dataBR(contratoPorId.get(it.idContrato)?.dataAssinatura) },
    { key: "modalidade", header: "Modalidade", nowrap: true, value: (it) => contratoPorId.get(it.idContrato)?.modalidade ?? "", render: (it) => contratoPorId.get(it.idContrato)?.modalidade || "—" },
    { key: "seq", header: "Seq.", nowrap: true, value: (it) => String(it.sequencial ?? ""), render: (it) => <span className="tabular-nums text-faint">{it.sequencial ?? "—"}</span> },
  ];

  const colContratos: Column<ContratoHistorico>[] = [
    { key: "numero", header: "Contrato", nowrap: true, value: (c) => c.numeroContrato ?? c.idContrato, render: (c) => c.numeroContrato || c.idContrato },
    { key: "credor", header: "Credor", align: "left", minWidth: 220, value: (c) => c.credor ?? "", render: (c) => <span className="block max-w-[300px] truncate" title={c.credor ?? ""}>{c.credor ?? "—"}</span> },
    { key: "data", header: "Assinatura", nowrap: true, filter: "date", value: (c) => c.dataAssinatura ?? "", render: (c) => dataBR(c.dataAssinatura) },
    { key: "modalidade", header: "Modalidade", nowrap: true, value: (c) => c.modalidade ?? "", render: (c) => c.modalidade || "—" },
    { key: "licitacao", header: "Licitação", nowrap: true, value: (c) => c.numeroLicitacao ?? "", render: (c) => c.numeroLicitacao || "—" },
    { key: "protocolo", header: "Protocolo", nowrap: true, value: (c) => c.protocolo ?? "", render: (c) => c.protocolo || "—" },
    { key: "natureza", header: "Natureza", align: "left", minWidth: 200, value: (c) => c.detalhamento ?? c.natureza ?? "", render: (c) => <span className="block max-w-[260px] truncate" title={c.detalhamento ?? c.natureza ?? ""}>{c.detalhamento ?? c.natureza ?? "—"}</span> },
    { key: "itens", header: "Itens", nowrap: true, filter: "range", numero: (c) => itensPorContrato.get(c.idContrato) ?? 0, formatarFaixa: num, value: (c) => String(itensPorContrato.get(c.idContrato) ?? 0), render: (c) => <span className="tabular-nums">{num(itensPorContrato.get(c.idContrato) ?? 0)}</span> },
    { key: "valor", header: "Valor do contrato", align: "right", nowrap: true, filter: "range", numero: (c) => c.valorContrato, value: (c) => String(c.valorContrato ?? ""), render: (c) => dinheiro(c.valorContrato) },
  ];

  const nomeArquivo = (s: string) => `${catalogo?.nome ?? "Histórico de compra"} — ${s}`;
  const exportar = (s: string) => (podeExportar ? { nome: nomeArquivo(s) } : (false as const));

  return (
    <Modal
      open={catalogo != null}
      onClose={onFechar}
      titulo={catalogo?.nome ?? "Histórico de compra"}
      size="full"
      lateral={{
        aberto: detalhe != null,
        titulo: detalhe?.tipo === "contrato" ? "Contrato" : "Produto",
        onClose: () => setDetalhe(null),
        children: dados && detalhe ? <DetalheHistorico detalhe={detalhe} dados={dados} contratoPorId={contratoPorId} produtos={produtos} onAbrir={setDetalhe} /> : <div />,
      }}
    >
      <div className="space-y-[var(--gap-block)]">
        {erro && <ErroCarga msg={erro} onTentar={() => setTentativa((t) => t + 1)} />}
        {!dados && !erro && <SkeletonLinhas linhas={8} />}
        {dados && resumo && (
          <>
            <div className="grid grid-cols-2 gap-[var(--gap-block)] sm:grid-cols-3 xl:grid-cols-6">
              <StatMini label="Valor contratado" value={brlCompact(resumo.valorContratado)} hint={brl(resumo.valorContratado)} tone="accent" />
              <StatMini label="Valor empenhado" value={brlCompact(resumo.valorEmpenhado)} hint={resumo.valorContratado > 0 ? `${Math.round((resumo.valorEmpenhado / resumo.valorContratado) * 100)}% do contratado` : undefined} />
              <StatMini label="Contratos" value={num(resumo.contratos)} />
              <StatMini label="Produtos" value={num(resumo.produtos)} hint={`${num(resumo.itens)} itens contratados`} />
              <StatMini label="Variação alta" value={num(comVariacaoAlta)} hint="Produtos com preços > 50% de variação" tone={comVariacaoAlta > 0 ? "danger" : "default"} />
              <StatMini label="Período (assinatura)" value={resumo.de ? dataBR(resumo.de) : "—"} hint={resumo.ate ? `até ${dataBR(resumo.ate)}` : undefined} />
            </div>
            <Segmented<Vista>
              value={vista}
              onChange={(v) => {
                setVista(v);
                setDetalhe(null);
              }}
              ariaLabel="Visões do histórico"
              options={[
                { value: "produtos", label: `Produtos (${num(produtos.length)})` },
                { value: "porContrato", label: `Por contrato (${num(porContrato.length)})` },
                { value: "itens", label: `Itens (${num(dados.itens.length)})` },
                { value: "contratos", label: `Contratos (${num(dados.contratos.length)})` },
              ]}
            />
            <div key={vista} className="animate-cat-morph">
              {vista === "produtos" ? (
                <DataTable
                  columns={colProdutos}
                  rows={produtos}
                  getKey={(p) => p.codigo}
                  pageSize={20}
                  minWidth={1200}
                  density="compact"
                  onRowClick={(p) => setDetalhe({ tipo: "produto", codigo: p.codigo })}
                  activeKey={detalhe?.tipo === "produto" ? detalhe.codigo : null}
                  exportar={exportar("produtos")}
                  resumo={(l) => `${num(l.length)} ${l.length === 1 ? "produto" : "produtos"} · ${brl(l.reduce((s, p) => s + p.valorTotal, 0))}`}
                />
              ) : vista === "porContrato" ? (
                <DataTable
                  columns={colPorContrato}
                  rows={porContrato}
                  getKey={(l) => `${l.p.codigo}|${l.pc.idContrato}`}
                  pageSize={20}
                  minWidth={1400}
                  density="compact"
                  onRowClick={(l) => setDetalhe({ tipo: "produto", codigo: l.p.codigo })}
                  exportar={exportar("por contrato")}
                  resumo={(l) => `${num(l.length)} ${l.length === 1 ? "produto em contrato" : "produtos em contratos"} · ${num(l.filter((x) => x.pc.aditivo != null).length)} com aditivo`}
                />
              ) : vista === "itens" ? (
                <DataTable
                  columns={colItens}
                  rows={dados.itens}
                  getKey={(it) => it.ordem}
                  pageSize={20}
                  minWidth={1400}
                  density="compact"
                  onRowClick={(it) => setDetalhe({ tipo: "produto", codigo: it.codigo })}
                  exportar={exportar("itens")}
                  resumo={(l) => `${num(l.length)} ${l.length === 1 ? "item" : "itens"} · ${brl(l.reduce((s, it) => s + (it.valorContratado ?? 0), 0))}`}
                />
              ) : (
                <DataTable
                  columns={colContratos}
                  rows={dados.contratos}
                  getKey={(c) => c.idContrato}
                  pageSize={20}
                  minWidth={1200}
                  density="compact"
                  onRowClick={(c) => setDetalhe({ tipo: "contrato", id: c.idContrato })}
                  activeKey={detalhe?.tipo === "contrato" ? detalhe.id : null}
                  exportar={exportar("contratos")}
                  resumo={(l) => `${num(l.length)} ${l.length === 1 ? "contrato" : "contratos"} · ${brl(l.reduce((s, c) => s + (c.valorContrato ?? 0), 0))}`}
                />
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

function Campo({ rotulo, valor, largo = false }: { rotulo: string; valor: string | null | undefined; largo?: boolean }) {
  return (
    <div className={largo ? "sm:col-span-2" : ""}>
      <dt className="text-xs text-muted">{rotulo}</dt>
      <dd className="mt-0.5 break-words font-semibold leading-snug text-text">{valor || "—"}</dd>
    </div>
  );
}

/** O detalhe ao lado: o PRODUTO (os números + cada contrato em que foi comprado) ou o CONTRATO (os dados + os itens). */
function DetalheHistorico({
  detalhe,
  dados,
  contratoPorId,
  produtos,
  onAbrir,
}: {
  detalhe: NonNullable<Detalhe>;
  dados: Dados;
  contratoPorId: Map<string, ContratoHistorico>;
  produtos: ProdutoHistorico[];
  onAbrir: (d: Detalhe) => void;
}) {
  if (detalhe.tipo === "produto") {
    const p = produtos.find((x) => x.codigo === detalhe.codigo);
    if (!p) return <p className="text-sm text-muted">Produto não encontrado.</p>;
    return <ProdutoHistoricoDetalhe produto={p} contratoPorId={contratoPorId} onAbrirContrato={(id) => onAbrir({ tipo: "contrato", id })} />;
  }
  const c = contratoPorId.get(detalhe.id);
  if (!c) return <p className="text-sm text-muted">Contrato não encontrado.</p>;
  const linhas = dados.itens.filter((it) => it.idContrato === c.idContrato);
  return (
    <div className="space-y-[var(--gap-block)]">
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <Campo rotulo="Credor" valor={c.credor} largo />
        <Campo rotulo="Contrato" valor={c.numeroContrato} />
        <Campo rotulo="Valor do contrato" valor={c.valorContrato != null ? brl(c.valorContrato) : null} />
        <Campo rotulo="Assinatura" valor={c.dataAssinatura ? dataBR(c.dataAssinatura) : null} />
        <Campo rotulo="Publicação" valor={c.dataPublicacao ? dataBR(c.dataPublicacao) : null} />
        <Campo rotulo="Modalidade" valor={c.modalidade} />
        <Campo rotulo="Licitação" valor={c.numeroLicitacao} />
        <Campo rotulo="Protocolo" valor={c.protocolo} />
        <Campo rotulo="Órgão" valor={c.orgao} />
        <Campo rotulo="Natureza" valor={[c.natureza, c.detalhamento].filter(Boolean).join(" — ")} largo />
        <Campo rotulo="Objeto" valor={c.objeto} largo />
      </dl>
      <section className="space-y-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-faint">
          {num(linhas.length)} {linhas.length === 1 ? "item" : "itens"}
        </p>
        {linhas.map((it) => (
          <button
            key={it.ordem}
            type="button"
            onClick={() => onAbrir({ tipo: "produto", codigo: it.codigo })}
            className="flex w-full items-start justify-between gap-3 rounded-card border border-border bg-surface p-2.5 text-left hover:border-accent/50"
          >
            <span className="min-w-0">
              <span className="block font-mono text-[12px] text-muted">
                {it.codigo}
                {it.sequencial != null ? ` · seq. ${it.sequencial}` : ""}
              </span>
              <span className="line-clamp-2 text-[13px] text-text">{it.descricao}</span>
            </span>
            <span className="shrink-0 text-right">
              <span className="block text-[13px] font-bold tabular-nums text-text">{it.valorUnitario != null ? brl(it.valorUnitario) : "—"}</span>
              <span className="block text-[11.5px] tabular-nums text-muted">{it.qtdContratada != null ? `qtd. ${dec(it.qtdContratada)}` : ""}</span>
            </span>
          </button>
        ))}
      </section>
    </div>
  );
}

