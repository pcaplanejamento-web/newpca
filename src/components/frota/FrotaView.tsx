"use client";

import Link from "next/link";
import { type ReactNode, useMemo, useState } from "react";
import { brl, brlCompact, dataBR, dec, num } from "@/lib/format";
import type { LimitesAlertas } from "@/lib/frota-config-core";
import {
  agruparFrota,
  alertasFrota,
  consumoDosAbastecimentos,
  DIMS_FROTA,
  type DimFrota,
  filtrarFrota,
  type FiltrosFrota,
  kpisFrota,
  opcoesDim,
  porMesFrota,
  ROTULO_DIM,
  ROTULO_TIPO_VEICULO,
  rotuloMes,
  TIPOS_ALERTA,
  type Transacao,
} from "@/lib/frota-core";
import { intervaloDoPeriodo, PERIODO_TODO, type Periodo } from "@/lib/periodo";
import type { TipoTransacao } from "@/lib/volus-core";
import { type ContratoFrota as ContratoImportacao, importarFrota } from "@/lib/importar-frota-cliente";
import { AtualizadoHa, ImportarAgora, type MetaImportacao } from "../AtualizacaoKpi";
import { toast } from "../Toast";
import { useAbrirDaUrl } from "../AbrirDaUrl";
import { Ajuda } from "../Ajuda";
import { Badge } from "../Badge";
import { CelulaTexto } from "../CelulaLista";
import { ChartCard } from "../ChartCard";
import { BarrasH, Colunas } from "../charts/Barras";
import { type Column, DataTable } from "../DataTable";
import { ErroCarga } from "../ErroCarga";
import { SelectField } from "../Field";
import { FiltrosDashboard } from "../FiltrosDashboard";
import { KpiStat } from "../KpiStat";
import { MaisIndicadores } from "../MaisIndicadores";
import { PeriodoPicker } from "../PeriodoPicker";
import { SkeletonCartao } from "../Skeleton";
import { type ContratoFrota, useDadosFrota } from "./dados-frota";
import { FichaVeiculoBanner } from "./FichaVeiculoBanner";
import { TransacaoFrotaDetalhe } from "./TransacaoFrotaDetalhe";

export type ModoFrota = "painel" | "combustivel" | "manutencao";

const TITULO: Record<ModoFrota, string> = { painel: "Frotas", combustivel: "Combustível", manutencao: "Manutenção" };

/** As dimensões À VISTA na linha de filtros (as demais em "Mais filtros"). */
const COR_COMB = "var(--accent)";
const COR_MANU = "var(--serie-2)";

/**
 * As telas da FROTA (dados da Vólus): o PAINEL (indicadores, gráficos, alertas e o demonstrativo) e as tabelas de
 * COMBUSTÍVEL e MANUTENÇÃO. Os dados vêm no navegador (o pacote do ano); filtros, gráficos e alertas são calculados pelo
 * núcleo `frota-core.ts` — tocar numa barra filtra; tocar numa linha abre o registro; a placa abre a ficha do veículo.
 */
export function FrotaView({
  modo,
  anos,
  anoInicial,
  versao,
  contratos,
  alertas,
  importacao,
  configurar,
}: {
  modo: ModoFrota;
  anos: number[];
  anoInicial: number | null;
  versao: string;
  contratos: ContratoFrota[];
  alertas: LimitesAlertas;
  /** O canto das KPIs (o MESMO da Execução): há quanto tempo a Vólus foi lida e, para o ADM, "Importar agora". */
  importacao?: ImportacaoFrotaKpi;
  /** O endereço da configuração da Vólus (só o ADM). */
  configurar?: string;
}) {
  const tipo: TipoTransacao | undefined = modo === "combustivel" ? "abastecimento" : modo === "manutencao" ? "manutencao" : undefined;
  const [ano, setAno] = useState<number | null>(anoInicial);
  const { transacoes, ctx, erro, carregando, recarregar } = useDadosFrota({ tipo, ano, versao, contratos });
  const [periodo, setPeriodo] = useState<Periodo>(PERIODO_TODO);
  const [dims, setDims] = useState<Partial<Record<DimFrota, string[]>>>({});
  const [aberta, setAberta] = useState<number | null>(null);
  const [placaFicha, setPlacaFicha] = useState<string | null>(null);
  // A PESQUISA abre a ficha do veículo (`?abrir=<placa>`).
  useAbrirDaUrl((p) => setPlacaFicha(p.toUpperCase()), transacoes != null);
  const todas = transacoes ?? [];
  const intervalo = useMemo(() => intervaloDoPeriodo(periodo), [periodo]);
  const filtros: FiltrosFrota = { de: intervalo.de, ate: intervalo.ate, dims };
  // biome-ignore lint/correctness/useExhaustiveDependencies: os filtros são o período e as dimensões
  const filtradas = useMemo(() => filtrarFrota(todas, filtros, ctx), [todas, ctx, intervalo.de, intervalo.ate, dims]);
  // O consumo é do veículo em TODO o ano (o abastecimento anterior pode estar fora do filtro).
  const consumo = useMemo(() => consumoDosAbastecimentos(todas), [todas]);
  // Os meses do Período CONECTADOS: os que têm registro com as dimensões escolhidas (sem o próprio Período).
  const meses = useMemo(() => [...new Set(filtrarFrota(todas, { dims }, ctx).map((t) => t.dia.slice(0, 7)))], [todas, dims, ctx]);
  const dimsDoModo = DIMS_FROTA.filter((d) => !("so" in d) || !tipo || d.so === tipo).map((d) => d.chave as DimFrota);
  const campos = dimsDoModo.map((d) => {
    // As opções CONECTADAS: as que existem com os demais filtros.
    const semEsta = filtrarFrota(todas, { ...filtros, dims: { ...dims, [d]: [] } }, ctx);
    return {
      dim: d,
      rotulo: ROTULO_DIM[d],
      opcoes: opcoesDim(semEsta, d, ctx, dims[d]).map((o) => ({ chave: o.valor, rotulo: o.valor, count: o.n })),
      selecionados: dims[d] ?? [],
    };
  });
  const alternar = (d: DimFrota, v: string) => setDims((x) => ({ ...x, [d]: (x[d] ?? []).includes(v) ? (x[d] ?? []).filter((y) => y !== v) : [v] }));
  const titulo = TITULO[modo];
  const filtrado = periodo.preset !== "todo" || Object.values(dims).some((v) => v?.length);

  return (
    <div className="space-y-[var(--gap-block)]">
      {/* Sem linha de título (o padrão das telas de dados): o nome só para o leitor de tela; os indicadores abrem a tela. */}
      <h1 className="sr-only">{titulo}</h1>
      {erro && <ErroCarga msg={erro} onTentar={() => void recarregar()} />}
      {anos.length === 0 && !erro ? (
        <div className="rounded-card border border-dashed border-border p-10 text-center text-sm text-muted">
          Ainda não há dados da Vólus no seu acesso.
          {configurar && (
            <>
              {" "}
              <Link href={configurar} className="font-medium text-accent hover:underline">
                Configure a credencial e importe em Configurações → Importações → Frotas.
              </Link>
            </>
          )}
        </div>
      ) : transacoes == null ? (
        <SkeletonCartao />
      ) : (
        <div className={`space-y-[var(--gap-block)] transition-opacity ${carregando ? "opacity-60" : ""}`}>
          <Indicadores modo={modo} trs={filtradas} consumo={consumo} importacao={importacao} />
          {/* TODOS os filtros à vista, logo abaixo dos indicadores, no cartão padrão dos filtros (o da Execução): o Período
              primeiro e as dimensões em colunas. */}
          <section
            aria-label={`Filtros de ${titulo}`}
            className={`rounded-card border p-[var(--pad-card)] transition-colors ${filtrado ? "border-accent/30 bg-accent-soft/40" : "border-border bg-surface"}`}
          >
            <FiltrosDashboard
              grade
              campos={campos}
              onMudar={(d, vs) => setDims((x) => ({ ...x, [d]: vs }))}
              antes={[
                <div key="ano" className="flex items-center gap-1.5">
                  <div className="min-w-0 flex-1">
                    <SelectField compacto label="Ano" value={ano ?? ""} onChange={(e) => setAno(Number(e.target.value))}>
                      {anos.map((a) => (
                        <option key={a} value={a}>
                          {a}
                        </option>
                      ))}
                    </SelectField>
                  </div>
                  <Ajuda titulo={titulo} botao="sm">
                    <p>
                      Os dados vêm da <strong>Vólus</strong> (os cartões de abastecimento e de manutenção da frota), lidos automaticamente — cada leitura
                      grava só o que mudou e confere de novo os dias recentes (a Vólus corrige e fatura transações depois).
                    </p>
                    <p>
                      Tocar numa barra dos gráficos <strong>filtra</strong> a tela; tocar numa linha abre o registro; a placa abre a <strong>ficha do
                      veículo</strong>.
                    </p>
                    <p>
                      O <strong>consumo (km/l)</strong> é calculado pelo hodômetro entre dois abastecimentos do mesmo veículo. Os <strong>alertas</strong>
                      apontam hodômetro que voltou, consumo e preço fora do padrão, abastecimentos muito próximos, litros acima do tanque e gastos de
                      veículo inativo.
                    </p>
                    <p>
                      Os números ficam no recorte dos <strong>filtros</strong> (abaixo dos indicadores). No canto do indicador, há quanto tempo a Vólus
                      foi lida.
                    </p>
                    <p>Você vê só a frota das unidades do seu acesso (a unidade escolhida no cabeçalho).</p>
                  </Ajuda>
                </div>,
                <PeriodoPicker key="periodo" value={periodo} onChange={setPeriodo} anos={ano ? [ano] : []} meses={meses} className="w-full" />,
              ]}
            />
          </section>
          {modo === "painel" ? (
            <Painel trs={filtradas} ctx={ctx} consumo={consumo} limites={alertas} dims={dims} onAlternar={alternar} onAbrir={setAberta} onFicha={setPlacaFicha} />
          ) : (
            <TabelaTransacoes modo={modo} trs={filtradas} ctx={ctx} consumo={consumo} ativa={aberta} onAbrir={setAberta} />
          )}
        </div>
      )}
      <TransacaoFrotaDetalhe
        id={aberta}
        onClose={() => setAberta(null)}
        veiculo={(() => {
          const t = todas.find((x) => x.id === aberta);
          return t?.placa ? ctx.veiculos.get(t.placa) : undefined;
        })()}
        consumo={aberta != null ? consumo.get(aberta) : undefined}
        onVerVeiculo={(p) => {
          setAberta(null);
          setPlacaFicha(p);
        }}
      />
      <FichaVeiculoBanner placa={placaFicha} onClose={() => setPlacaFicha(null)} trs={todas} ctx={ctx} consumo={consumo} ano={ano} limites={alertas} onAbrir={(id) => setAberta(id)} />
    </div>
  );
}

function Indicadores({ modo, trs, consumo, importacao }: { modo: ModoFrota; trs: Transacao[]; consumo: ReturnType<typeof consumoDosAbastecimentos>; importacao?: ImportacaoFrotaKpi }) {
  const k = kpisFrota(trs, consumo);
  // Os DETALHES dos cartões principais: dois por cartão, curtos (R$ compacto — nada quebra a linha) e nenhum repetido
  // entre os cartões; os complementares só com o valor e a dica.
  const pct = (parte: number, base: number) => (base > 0 ? `${((parte / base) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "—");
  const porN = (valor: number, n: number) => (n ? brlCompact(valor / n) : "—");
  const kml = k.kmPorLitro ? `${dec(k.kmPorLitro)} km/l` : "—";
  const porKm = k.custoPorKm ? brl(k.custoPorKm) : "—";
  const maiorPlaca = { rotulo: "Maior gasto", valor: k.maiorVeiculo?.placa ?? "—" };
  const cartoes: CartaoFrota[] =
    modo === "painel"
      ? [
          {
            label: "Gasto total",
            value: brl(k.total),
            hint: `${num(k.abastecimentos + k.manutencoes)} registros`,
            detalhes: [
              { rotulo: "Média mensal", valor: porN(k.total, k.meses) },
              { rotulo: "Meses com gasto", valor: num(k.meses) },
            ],
          },
          {
            label: "Combustível",
            value: brl(k.combustivel),
            hint: `${num(k.abastecimentos)} abastecimentos`,
            cor: COR_COMB,
            detalhes: [
              { rotulo: "Participação", valor: pct(k.combustivel, k.total) },
              { rotulo: "Litros", valor: dec(k.litros) },
            ],
          },
          {
            label: "Manutenção",
            value: brl(k.manutencao),
            hint: `${num(k.manutencoes)} manutenções`,
            cor: COR_MANU,
            detalhes: [
              { rotulo: "Participação", valor: pct(k.manutencao, k.total) },
              { rotulo: "Por manutenção", valor: porN(k.manutencao, k.manutencoes) },
            ],
          },
          {
            label: "Veículos",
            value: num(k.veiculos),
            hint: "com gasto no recorte",
            detalhes: [{ rotulo: "Por veículo", valor: porN(k.total, k.veiculos) }, maiorPlaca],
          },
          { label: "Consumo médio", value: kml, hint: `${num(Math.round(k.kmRodados))} km rodados` },
          { label: "Custo por km", value: porKm, hint: "combustível + manutenção" },
          { label: "Preço médio do litro", value: k.precoMedio ? brl(k.precoMedio) : "—", hint: "gasto ÷ litros" },
        ]
      : modo === "combustivel"
        ? [
            {
              label: "Gasto",
              value: brl(k.combustivel),
              hint: `${num(k.abastecimentos)} abastecimentos`,
              detalhes: [
                { rotulo: "Média mensal", valor: porN(k.combustivel, k.meses) },
                { rotulo: "Por abastecimento", valor: porN(k.combustivel, k.abastecimentos) },
              ],
            },
            {
              label: "Litros",
              value: dec(k.litros),
              hint: "abastecidos no recorte",
              detalhes: [
                { rotulo: "Por abastecimento", valor: k.abastecimentos ? `${dec(k.litros / k.abastecimentos)} l` : "—" },
                { rotulo: "Por veículo", valor: k.veiculos ? `${dec(k.litros / k.veiculos)} l` : "—" },
              ],
            },
            {
              label: "Preço médio do litro",
              value: k.precoMedio ? brl(k.precoMedio) : "—",
              hint: "gasto ÷ litros",
              detalhes: [
                { rotulo: "Menor", valor: k.precoMin != null ? brl(k.precoMin) : "—" },
                { rotulo: "Maior", valor: k.precoMax != null ? brl(k.precoMax) : "—" },
              ],
            },
            {
              label: "Consumo médio",
              value: kml,
              hint: "pelo hodômetro",
              detalhes: [
                { rotulo: "Km rodados", valor: num(Math.round(k.kmRodados)) },
                { rotulo: "Custo por km", valor: porKm },
              ],
            },
            { label: "Veículos", value: num(k.veiculos), hint: `maior gasto: ${k.maiorVeiculo?.placa ?? "—"}` },
          ]
        : [
            {
              label: "Gasto",
              value: brl(k.manutencao),
              hint: `${num(k.manutencoes)} manutenções`,
              detalhes: [
                { rotulo: "Média mensal", valor: porN(k.manutencao, k.meses) },
                { rotulo: "Por manutenção", valor: porN(k.manutencao, k.manutencoes) },
              ],
            },
            {
              label: "Maior manutenção",
              value: k.maiorManutencao ? brl(k.maiorManutencao.valor) : "—",
              hint: "a de maior valor",
              detalhes: [
                { rotulo: "Participação", valor: pct(k.maiorManutencao?.valor ?? 0, k.manutencao) },
                { rotulo: "Placa", valor: k.maiorManutencao?.placa ?? "—" },
              ],
            },
            {
              label: "Itens",
              value: num(k.itens),
              hint: "peças e serviços",
              detalhes: [
                { rotulo: "Por manutenção", valor: k.manutencoes ? dec(k.itens / k.manutencoes) : "—" },
                { rotulo: "Por veículo", valor: k.veiculos ? dec(k.itens / k.veiculos) : "—" },
              ],
            },
            {
              label: "Veículos",
              value: num(k.veiculos),
              hint: "com gasto no recorte",
              detalhes: [{ rotulo: "Por veículo", valor: porN(k.manutencao, k.veiculos) }, maiorPlaca],
            },
          ];
  return <IndicadoresFrota chave={`frota:${modo}:mais-indicadores`} cartoes={cartoes} importacao={importacao} todos={modo === "painel"} />;
}

/** O que o canto das KPIs da Frota precisa: o meta da importação, se é ADM e os contratos ativos (o "Importar agora"). */
export type ImportacaoFrotaKpi = { meta: MetaImportacao; admin: boolean; ativos: ContratoImportacao[] };

/** O "Importar agora" da Frota: o ano atual, todos os contratos ativos, pelo MESMO executor da tela de Importação. */
function importarFrotaAgora(ativos: ContratoImportacao[]) {
  return async (confirmar: Parameters<Parameters<typeof ImportarAgora>[0]["executar"]>[0]) => {
    const ano = new Date().getFullYear();
    if (!ativos.length) throw new Error("Nenhum contrato ativo da Vólus — cadastre em Configurações → Importações → Frotas.");
    if (!(await confirmar({ titulo: `Importar agora: frotas (Vólus) ${ano}`, texto: `${ativos.length} contrato(s), mês a mês. Grava só o que mudou. O andamento aparece no canto inferior direito — pode sair desta tela.`, confirmar: "Importar" })))
      return;
    const r = await importarFrota({ ano, contratos: ativos }).fim;
    (r.falhas.length ? toast.warning : toast.success)(`Frotas: ${r.interrompido ? "interrompida" : r.falhas.length ? `${r.falhas.length} falha(s)` : "concluída"} — ${num(r.novos)} novos, ${num(r.alterados)} alterados.`);
  };
}

/** O canto de um indicador: o relógio e, para o ADM, o "Importar agora". */
function cantoFrota(importacao?: ImportacaoFrotaKpi) {
  if (!importacao) return {};
  return {
    canto: <AtualizadoHa meta={importacao.meta} admin={importacao.admin} />,
    acaoCanto: importacao.admin ? <ImportarAgora meta={importacao.meta} executar={importarFrotaAgora(importacao.ativos)} /> : undefined,
  };
}

export type CartaoFrota = { label: string; value: ReactNode; hint?: string; cor?: string; detalhes?: { rotulo: string; valor: ReactNode }[] };

/** Os indicadores das telas da Frota: os QUATRO principais à vista e os demais em "Mais indicadores" (o da Execução). */
export function IndicadoresFrota({ chave, cartoes, importacao, todos = false }: { chave: string; cartoes: CartaoFrota[]; importacao?: ImportacaoFrotaKpi; todos?: boolean }) {
  // A atualização no canto (o MESMO par da Execução): no 1º cartão, ou nos quatro principais (o Painel).
  const canto = cantoFrota(importacao);
  const grade = (cs: CartaoFrota[], principais: boolean) => (
    <div className="grid grid-cols-2 gap-[var(--gap-block)] lg:grid-cols-4">
      {cs.map((c, i) => (
        <KpiStat key={c.label} label={c.label} value={c.value} hint={c.hint} cor={c.cor} detalhes={c.detalhes} realce={!!c.detalhes} completo {...(principais && (todos || i === 0) ? canto : {})} />
      ))}
    </div>
  );
  const extras = cartoes.slice(4);
  return (
    <>
      {grade(cartoes.slice(0, 4), true)}
      {extras.length > 0 && <MaisIndicadores chave={chave} extras={grade(extras, false)} />}
    </>
  );
}

const DIMS_GRAFICO: DimFrota[] = ["classificacao", "contrato", "unidade", "tipoVeiculo", "produto", "tipoManutencao", "estabelecimento", "cidade", "motorista", "marca"];

function Painel({
  trs,
  ctx,
  consumo,
  limites,
  dims,
  onAlternar,
  onAbrir,
  onFicha,
}: {
  trs: Transacao[];
  ctx: ReturnType<typeof useDadosFrota>["ctx"];
  consumo: ReturnType<typeof consumoDosAbastecimentos>;
  limites: LimitesAlertas;
  dims: Partial<Record<DimFrota, string[]>>;
  onAlternar: (d: DimFrota, v: string) => void;
  onAbrir: (id: number) => void;
  onFicha: (placa: string) => void;
}) {
  const [dimGrafico, setDimGrafico] = useState<DimFrota>("classificacao");
  const [dimTabela, setDimTabela] = useState<DimFrota>("placa");
  const mensal = porMesFrota(trs);
  const porPlaca = agruparFrota(trs, "placa", ctx, consumo);
  const porDim = agruparFrota(trs, dimGrafico, ctx, consumo);
  const alertas = useMemo(() => alertasFrota(trs, ctx, consumo, limites), [trs, ctx, consumo, limites]);
  const demonstrativo = agruparFrota(trs, dimTabela, ctx, consumo);
  const linhasBarra = (gs: typeof porPlaca, max = 10) => {
    const topo = gs.slice(0, max).map((g) => ({
      chave: g.chave,
      rotulo: g.chave,
      titulo: `${g.chave}: ${brl(g.total)}`,
      segmentos: [
        { chave: "c", valor: g.combustivel, cor: COR_COMB, rotulo: "Combustível" },
        { chave: "m", valor: g.manutencao, cor: COR_MANU, rotulo: "Manutenção" },
      ],
      valor: brlCompact(g.total),
      detalhe: `${num(g.registros)}`,
    }));
    return topo;
  };
  const legenda = (
    <span className="flex items-center gap-3 text-[11.5px] text-muted">
      <span className="flex items-center gap-1">
        <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: COR_COMB }} /> Combustível
      </span>
      <span className="flex items-center gap-1">
        <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: COR_MANU }} /> Manutenção
      </span>
    </span>
  );
  const colunasDemo: Column<(typeof demonstrativo)[number]>[] = [
    { key: "chave", header: ROTULO_DIM[dimTabela], value: (g) => (dimTabela === "mes" ? rotuloMes(g.chave) : g.chave), render: (g) => <CelulaTexto texto={(dimTabela === "mes" ? rotuloMes(g.chave) : g.chave)} />, align: "left", minWidth: 160 },
    { key: "comb", header: "Combustível", filter: "range", align: "right", numero: (g) => g.combustivel, render: (g) => brl(g.combustivel) },
    { key: "manu", header: "Manutenção", filter: "range", align: "right", numero: (g) => g.manutencao, render: (g) => brl(g.manutencao) },
    { key: "total", header: "Total", filter: "range", align: "right", numero: (g) => g.total, render: (g) => <strong>{brl(g.total)}</strong> },
    { key: "reg", header: "Registros", filter: "range", numero: (g) => g.registros, value: (g) => num(g.registros), render: (g) => num(g.registros), formatarFaixa: num },
    { key: "lit", header: "Litros", filter: "range", numero: (g) => g.litros, value: (g) => dec(g.litros), render: (g) => dec(g.litros), formatarFaixa: dec },
    { key: "kml", header: "Km/l", filter: "range", numero: (g) => (g.km && g.litros ? g.km / g.litros : null), value: (g) => (g.km && g.litros ? dec(g.km / g.litros) : "—"), render: (g) => (g.km && g.litros ? dec(g.km / g.litros) : "—"), formatarFaixa: dec, total: false },
    { key: "pl", header: "Veículos", filter: "range", numero: (g) => g.placas, value: (g) => num(g.placas), render: (g) => num(g.placas), formatarFaixa: num, total: false },
  ];
  return (
    <div className="space-y-[var(--gap-block)]">
      <div className="grid gap-[var(--gap-block)] lg:grid-cols-2">
        <ChartCard className="min-w-0" title="Gasto por mês" action={legenda}>
          <Colunas
            ariaLabel="Gasto por mês"
            colunas={mensal.map((m) => ({
              chave: m.mes,
              rotulo: rotuloMes(m.mes),
              valor: m.total,
              dica: { valor: brl(m.total), rotulo: `${rotuloMes(m.mes)} — combustível ${brl(m.combustivel)}, manutenção ${brl(m.manutencao)}` },
            }))}
            formatar={brlCompact}
            altura={320}
          />
        </ChartCard>
        <ChartCard className="min-w-0" title="Maiores gastos por veículo" action={legenda}>
          <BarrasH ariaLabel="Maiores gastos por veículo" linhas={linhasBarra(porPlaca)} onEscolher={(k) => onFicha(String(k))} acao="abrir a ficha do veículo" />
        </ChartCard>
      </div>
      <div className="grid gap-[var(--gap-block)] lg:grid-cols-2">
        <ChartCard
          className="min-w-0"
          title={`Gasto por ${ROTULO_DIM[dimGrafico].toLocaleLowerCase("pt-BR")}`}
          action={
            <SelectField compacto label="Por" value={dimGrafico} onChange={(e) => setDimGrafico(e.target.value as DimFrota)}>
              {DIMS_GRAFICO.map((d) => (
                <option key={d} value={d}>
                  {ROTULO_DIM[d]}
                </option>
              ))}
            </SelectField>
          }
        >
          <BarrasH
            ariaLabel={`Gasto por ${ROTULO_DIM[dimGrafico]}`}
            linhas={linhasBarra(porDim)}
            ativa={(dims[dimGrafico] ?? []).length === 1 ? (dims[dimGrafico] ?? [])[0] : null}
            onEscolher={(k) => onAlternar(dimGrafico, String(k))}
            acao="filtrar a tela"
          />
        </ChartCard>
        <ChartCard className="min-w-0" title={`Alertas (${num(alertas.length)})`}>
          {alertas.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">Nenhum alerta no recorte.</p>
          ) : (
            <DataTable
              density="compact"
              rows={alertas}
              getKey={(a) => `${a.id}:${a.tipo}`}
              onRowClick={(a) => onAbrir(a.id)}
              exportar={{ nome: "Alertas da frota" }}
              linhasSalvas="frota-alertas"
              columns={[
                {
                  key: "tipo",
                  header: "Alerta",
                  value: (a) => TIPOS_ALERTA[a.tipo].rotulo,
                  render: (a) => (
                    <Badge tone={TIPOS_ALERTA[a.tipo].gravidade === "erro" ? "red" : "amber"} dot>
                      {TIPOS_ALERTA[a.tipo].rotulo}
                    </Badge>
                  ),
                  nowrap: true,
                },
                { key: "placa", header: "Placa", value: (a) => a.placa ?? "—", render: (a) => a.placa ?? "—", nowrap: true },
                { key: "dia", header: "Data", filter: "date", value: (a) => a.dia, render: (a) => dataBR(a.dia), nowrap: true },
                { key: "texto", header: "Por quê", value: (a) => a.texto, render: (a) => <CelulaTexto texto={a.texto} />, align: "left", minWidth: 220 },
                { key: "valor", header: "Valor", filter: "range", align: "right", numero: (a) => a.valor, render: (a) => brl(a.valor), total: false },
              ]}
            />
          )}
        </ChartCard>
      </div>
      <ChartCard
        className="min-w-0"
        title="Demonstrativo"
        action={
          <SelectField compacto label="Por" value={dimTabela} onChange={(e) => setDimTabela(e.target.value as DimFrota)}>
            {[...DIMS_GRAFICO.filter((d) => d !== "placa"), "placa" as DimFrota, "mes" as DimFrota]
              .sort((a, b) => ROTULO_DIM[a].localeCompare(ROTULO_DIM[b], "pt-BR"))
              .map((d) => (
                <option key={d} value={d}>
                  {ROTULO_DIM[d]}
                </option>
              ))}
          </SelectField>
        }
      >
        <DataTable
          density="compact"
          rows={demonstrativo}
          getKey={(g) => g.chave}
          columns={colunasDemo}
          onRowClick={(g) => (dimTabela === "placa" ? onFicha(g.chave) : dimTabela !== "mes" && onAlternar(dimTabela, g.chave))}
          exportar={{ nome: `Frota por ${ROTULO_DIM[dimTabela]}` }}
          linhasSalvas="frota-demonstrativo"
          resumo={(ls) => `${num(ls.length)} linhas · ${brl(ls.reduce((s, g) => s + g.total, 0))}`}
        />
      </ChartCard>
    </div>
  );
}

function TabelaTransacoes({
  modo,
  trs,
  ctx,
  consumo,
  ativa,
  onAbrir,
}: {
  modo: "combustivel" | "manutencao";
  trs: Transacao[];
  ctx: ReturnType<typeof useDadosFrota>["ctx"];
  consumo: ReturnType<typeof consumoDosAbastecimentos>;
  ativa: number | null;
  onAbrir: (id: number) => void;
}) {
  const ab = modo === "combustivel";
  const v = (t: Transacao) => (t.placa ? ctx.veiculos.get(t.placa) : undefined);
  const classif = (t: Transacao) => {
    const c = v(t)?.classificacaoId;
    return c != null ? (ctx.classificacoes.get(c)?.nome ?? "") : "";
  };
  const colunas: Column<Transacao>[] = [
    { key: "dia", header: "Data", filter: "date", value: (t) => t.dia, render: (t) => `${dataBR(t.dia)}${t.hora ? ` ${t.hora}` : ""}`, nowrap: true },
    { key: "empresa", header: "Empresa", value: (t) => ctx.contratos.get(t.contrato) ?? t.contrato, render: (t) => ctx.contratos.get(t.contrato) ?? t.contrato, nowrap: true },
    { key: "placa", header: "Placa", value: (t) => t.placa ?? "—", render: (t) => t.placa ?? "—", nowrap: true },
    { key: "veiculo", header: "Veículo", value: (t) => [v(t)?.marca, v(t)?.modelo].filter(Boolean).join(" ") || "—", render: (t) => <CelulaTexto texto={[v(t)?.marca, v(t)?.modelo].filter(Boolean).join(" ") || "—"} />, align: "left", minWidth: 140 },
    { key: "tipoV", header: "Tipo de veículo", value: (t) => (v(t) ? ROTULO_TIPO_VEICULO[v(t)?.tipo ?? ""] : "—"), render: (t) => (v(t) ? ROTULO_TIPO_VEICULO[v(t)?.tipo ?? ""] : "—"), nowrap: true },
    { key: "classif", header: "Classificação", value: (t) => classif(t) || "—", render: (t) => classif(t) || "—", nowrap: true },
    ...(ab
      ? ([
          { key: "produto", header: "Combustível", value: (t) => t.produto ?? "—", render: (t) => t.produto ?? "—", nowrap: true },
          { key: "litros", header: "Litros", filter: "range", numero: (t) => t.litros, value: (t) => (t.litros == null ? "—" : dec(t.litros)), render: (t) => (t.litros == null ? "—" : dec(t.litros)), formatarFaixa: dec },
          { key: "preco", header: "R$/litro", filter: "range", align: "right", numero: (t) => t.precoLitro, render: (t) => (t.precoLitro == null ? "—" : brl(t.precoLitro)), total: false },
        ] as Column<Transacao>[])
      : ([
          { key: "tipoM", header: "Tipo", value: (t) => t.tipoManutencao ?? "—", render: (t) => t.tipoManutencao ?? "—", nowrap: true },
          { key: "produto", header: "Produto", value: (t) => t.produto ?? "—", render: (t) => <CelulaTexto texto={t.produto ?? "—"} />, align: "left", minWidth: 180 },
          { key: "itens", header: "Qtd. itens", filter: "range", numero: (t) => t.qtdItens, value: (t) => num(t.qtdItens), render: (t) => num(t.qtdItens), formatarFaixa: num },
        ] as Column<Transacao>[])),
    { key: "valor", header: "Valor", filter: "range", align: "right", numero: (t) => t.valor, render: (t) => brl(t.valor) },
    { key: "hodo", header: "Hodômetro", filter: "range", numero: (t) => t.hodometro, value: (t) => (t.hodometro == null ? "—" : num(t.hodometro)), render: (t) => (t.hodometro == null ? "—" : num(t.hodometro)), formatarFaixa: num, total: false },
    ...(ab
      ? ([
          { key: "km", header: "Km", filter: "range", numero: (t) => consumo.get(t.id)?.km ?? null, value: (t) => (consumo.get(t.id)?.km == null ? "—" : num(consumo.get(t.id)?.km)), render: (t) => (consumo.get(t.id)?.km == null ? "—" : num(consumo.get(t.id)?.km)), formatarFaixa: num },
          {
            key: "kml",
            header: "Km/l",
            filter: "range",
            numero: (t) => consumo.get(t.id)?.kmPorLitro ?? null,
            value: (t) => (consumo.get(t.id)?.kmPorLitro == null ? "—" : dec(consumo.get(t.id)?.kmPorLitro)),
            render: (t) => (consumo.get(t.id)?.kmPorLitro == null ? "—" : dec(consumo.get(t.id)?.kmPorLitro)),
            formatarFaixa: dec,
            total: false,
          },
        ] as Column<Transacao>[])
      : []),
    { key: "estab", header: ab ? "Posto" : "Oficina", value: (t) => t.estabelecimento ?? "—", render: (t) => <CelulaTexto texto={t.estabelecimento ?? "—"} />, align: "left", minWidth: 160 },
    { key: "cidade", header: "Cidade", value: (t) => (t.cidade ? `${t.cidade}${t.uf ? `/${t.uf}` : ""}` : "—"), render: (t) => (t.cidade ? `${t.cidade}${t.uf ? `/${t.uf}` : ""}` : "—"), nowrap: true },
    { key: "motorista", header: ab ? "Motorista" : "Operador", value: (t) => t.motorista ?? "—", render: (t) => <CelulaTexto texto={t.motorista ?? "—"} />, align: "left", minWidth: 140 },
    { key: "unidade", header: "Setor", value: (t) => t.unidade ?? "—", render: (t) => <CelulaTexto texto={t.unidade ?? "—"} />, align: "left", minWidth: 140 },
    { key: "empenho", header: "Empenho", value: (t) => t.empenho ?? "—", render: (t) => t.empenho ?? "—", nowrap: true },
  ];
  return (
    <DataTable
      scrollInterno
      density="compact"
      rows={trs}
      getKey={(t) => t.id}
      columns={colunas}
      onRowClick={(t) => onAbrir(t.id)}
      activeKey={ativa}
      ocultasPadrao={["tipoV", "unidade", "empenho", "cidade"]}
      exportar={{ nome: ab ? "Abastecimentos" : "Manutenções" }}
      resumo={(ls) =>
        `${num(ls.length)} ${ab ? "abastecimentos" : "manutenções"} · ${brl(ls.reduce((s, t) => s + t.valor, 0))}${
          ab ? ` · ${dec(ls.reduce((s, t) => s + (t.litros ?? 0), 0))} l` : ""
        }`
      }
      vazio="Nenhum registro no recorte."
    />
  );
}

