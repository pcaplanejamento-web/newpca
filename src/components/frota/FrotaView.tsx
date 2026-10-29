"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import type { EdicaoTabela } from "@/lib/edicoes-tabela-core";
import { brl, brlCompact, dataBR, dataIsoBrasilia, dec, num } from "@/lib/format";
import { COR_PADRAO_FROTA, type CoresFrota, cssCoresFrota, type LimitesAlertas } from "@/lib/frota-config-core";
import {
  agruparFrota,
  alertasFrota,
  consumoDosAbastecimentos,
  DIMS_FROTA,
  type DimFrota,
  filtrarFrota,
  type FiltrosFrota,
  kpisFrota,
  nomesDim,
  opcoesDim,
  serieFrota,
  type PontoFrota,
  ROTULO_DIM,
  ROTULO_TIPO_VEICULO,
  rotuloMes,
  SEM_ORGAO,
  SEM_UNIDADE,
  TIPOS_ALERTA,
  type Transacao,
} from "@/lib/frota-core";
import { intervaloDoPeriodo, PERIODO_TODO, type Periodo } from "@/lib/periodo";
import { deslocarJanela, MIN_DIAS_ZOOM, zoomJanela } from "@/lib/execucao-dash-core";
import type { TipoTransacao } from "@/lib/volus-core";
import { type ContratoFrota as ContratoImportacao, importarFrota } from "@/lib/importar-frota-cliente";
import { AtualizadoHa, ImportarAgora, type MetaImportacao } from "../AtualizacaoKpi";
import { toast } from "../Toast";
import { useAbrirDaUrl } from "../AbrirDaUrl";
import { AteOFim } from "../AlturaCheia";
import { Ajuda } from "../Ajuda";
import { Badge } from "../Badge";
import { CelulaTexto } from "../CelulaLista";
import { BotaoDadosCompletos, DadosCompletos } from "../DadosCompletos";
import { useSemUnidade } from "../UnidadeUnica";
import { ChartCard } from "../ChartCard";
import { BarrasH } from "../charts/Barras";
import { GraficoTemporal } from "../charts/GraficoTemporal";
import type { LinhaDica, PontoTemporal } from "../charts/SerieTemporal";
import { OrigemDados } from "../OrigemDados";
import { type Column, DataTable } from "../DataTable";
import { ErroCarga } from "../ErroCarga";
import { SelectField } from "../Field";
import { Segmented } from "../Segmented";
import { FiltrosDashboard } from "../FiltrosDashboard";
import { type CartaoKpi, IndicadoresKpi } from "../IndicadoresKpi";
import { PeriodoPicker } from "../PeriodoPicker";
import { EsqueletoFrota } from "../FrotaEsqueleto";
import { type ContratoFrota, useDadosFrota } from "./dados-frota";
import { FichaVeiculoBanner } from "./FichaVeiculoBanner";
import { TransacaoFrotaDetalhe } from "./TransacaoFrotaDetalhe";

export type ModoFrota = "painel" | "combustivel" | "manutencao";

const TITULO: Record<ModoFrota, string> = { painel: "Frotas", combustivel: "Combustível", manutencao: "Manutenção" };

/** As dimensões À VISTA na linha de filtros (as demais em "Mais filtros"). */
// As cores dos dados: as escolhidas pelo ADM (Importações → Frotas — `--frota-*`), senão as do tema.
const COR_COMB = `var(--frota-combustivel, ${COR_PADRAO_FROTA.combustivel})`;
const COR_MANU = `var(--frota-manutencao, ${COR_PADRAO_FROTA.manutencao})`;

/** As EDIÇÕES SALVAS das tabelas da Frota (`carregarEdicoes(…, "frotas:")` na página). */
export type EdicoesFrota = { lista: EdicaoTabela[]; padroes: Record<string, unknown> };

const PREF_DADOS_COMPLETOS = "frotas:dados-completos";

/**
 * Uma TABELA DA FROTA no padrão das tabelas da Mesa: as EDIÇÕES SALVAS (colunas, ordem e filtros — o seletor de colunas,
 * o lápis e o painel de filtros no rodapé) pela chave `frotas:<tela>:<tabela>` e os DADOS COMPLETOS (o texto inteiro nas
 * células — a escolha fica neste aparelho).
 */
export function useTabelaFrota(chave: string, edicoes: EdicoesFrota | undefined, podePublicar: boolean) {
  const [eds, setEds] = useState<EdicoesFrota>(edicoes ?? { lista: [], padroes: {} });
  const [completo, setCompleto] = useState(false);
  useEffect(() => {
    try {
      setCompleto(localStorage.getItem(PREF_DADOS_COMPLETOS) === "1");
    } catch {
      /* sem armazenamento: o resumo em uma linha */
    }
  }, []);
  const alternar = (v: boolean) => {
    setCompleto(v);
    try {
      localStorage.setItem(PREF_DADOS_COMPLETOS, v ? "1" : "0");
    } catch {
      /* vale só nesta visita */
    }
  };
  return {
    completo,
    botao: <BotaoDadosCompletos ligado={completo} onChange={alternar} />,
    edicoes: edicoes ? { chave, lista: eds.lista, padroes: eds.padroes, podePublicar, onMudar: (lista: EdicaoTabela[], padroes: Record<string, unknown>) => setEds({ lista, padroes }) } : undefined,
  };
}

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
  cores,
  importacao,
  configurar,
  edicoes,
  podePublicar = false,
}: {
  modo: ModoFrota;
  anos: number[];
  anoInicial: number | null;
  versao: string;
  contratos: ContratoFrota[];
  alertas: LimitesAlertas;
  /** As cores dos dados escolhidas pelo ADM (`null` = a do tema). */
  cores: CoresFrota;
  /** O canto das KPIs (o MESMO da Execução): há quanto tempo a Vólus foi lida e, para o ADM, "Importar agora". */
  importacao?: ImportacaoFrotaKpi;
  /** O endereço da configuração da Vólus (só o ADM). */
  configurar?: string;
  /** As EDIÇÕES SALVAS das tabelas da Frota (as colunas, a ordem e os filtros — as mesmas das tabelas da Mesa). */
  edicoes?: EdicoesFrota;
  /** Configurar na tela: publicar edições para todos. */
  podePublicar?: boolean;
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
  // Com UMA unidade no cabeçalho e todos os registros dela, Unidade e Órgão do sistema saem (a interface enxuta).
  const semUnidade = useSemUnidade(() => todas.map((t) => t.unidadeSistema), "frotas");
  const dimsDoModo = DIMS_FROTA.filter((d) => (!("so" in d) || !tipo || d.so === tipo) && !(semUnidade && (d.chave === "orgao" || d.chave === "unidadeSistema"))).map(
    (d) => d.chave as DimFrota,
  );
  const campos = dimsDoModo.map((d) => {
    // As opções CONECTADAS: as que existem com os demais filtros.
    const semEsta = filtrarFrota(todas, { ...filtros, dims: { ...dims, [d]: [] } }, ctx);
    // Unidade e Órgão do sistema: a sigla em cima e o NOME embaixo (o padrão dos filtros de unidade).
    const nomes = nomesDim(todas, d);
    return {
      dim: d,
      rotulo: ROTULO_DIM[d],
      opcoes: opcoesDim(semEsta, d, ctx, dims[d]).map((o) => ({ chave: o.valor, rotulo: o.valor, count: o.n, detalhe: nomes.get(o.valor) })),
      selecionados: dims[d] ?? [],
    };
  });
  const alternar = (d: DimFrota, v: string) => setDims((x) => ({ ...x, [d]: (x[d] ?? []).includes(v) ? (x[d] ?? []).filter((y) => y !== v) : [v] }));
  const titulo = TITULO[modo];
  const filtrado = periodo.preset !== "todo" || Object.values(dims).some((v) => v?.length);

  return (
    <div className="space-y-[var(--gap-block)]">
      {/* As cores dos dados (só hex validado — `cssCoresFrota`): valem também nos banners abertos por portal. */}
      {cssCoresFrota(cores) && <style>{cssCoresFrota(cores)}</style>}
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
        <EsqueletoFrota tipo={modo === "painel" ? "painel" : "tabela"} />
      ) : (
        <AteOFim className={`transition-opacity ${carregando ? "opacity-60" : ""}`}>
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
                    <p>
                      Você vê só a frota das unidades do seu acesso (a unidade escolhida no cabeçalho). <strong>Unidade</strong> e <strong>Órgão</strong>{" "}
                      são os do sistema (a unidade da Vólus ligada ao cadastro; o órgão da unidade, senão o do contrato) — o registro sem ligação aparece
                      como “Sem unidade”/“Sem órgão” (no acesso a todas as unidades) e pode ser filtrado.
                    </p>
                  </Ajuda>
                </div>,
                <PeriodoPicker key="periodo" value={periodo} onChange={setPeriodo} anos={ano ? [ano] : []} meses={meses} className="w-full" />,
              ]}
            />
          </section>
          {modo === "painel" ? (
            <Painel
              trs={filtradas}
              intervalo={intervalo}
              cores={cores}
              ctx={ctx}
              consumo={consumo}
              limites={alertas}
              dims={dims}
              onAlternar={alternar}
              onAbrir={setAberta}
              onFicha={setPlacaFicha}
              semUnidade={semUnidade}
              edicoes={edicoes}
              podePublicar={podePublicar}
            />
          ) : (
            <TabelaTransacoes
              modo={modo}
              trs={filtradas}
              ctx={ctx}
              consumo={consumo}
              ativa={aberta}
              onAbrir={setAberta}
              semUnidade={semUnidade}
              edicoes={edicoes}
              podePublicar={podePublicar}
            />
          )}
        </AteOFim>
      )}
      <TransacaoFrotaDetalhe
        id={aberta}
        onClose={() => setAberta(null)}
        veiculo={(() => {
          const t = todas.find((x) => x.id === aberta);
          return t?.placa ? ctx.veiculos.get(t.placa) : undefined;
        })()}
        consumo={aberta != null ? consumo.get(aberta) : undefined}
        resumo={todas.find((x) => x.id === aberta)}
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
  const gastoModo = modo === "combustivel" ? k.combustivel : modo === "manutencao" ? k.manutencao : k.total;
  // "Sem unidade": os registros da Vólus sem a unidade do sistema (a ligação em Configurações → Importações → Frotas).
  const semUnidade: CartaoFrota = {
    label: "Sem unidade",
    value: num(k.semUnidade),
    hint: "unidade da Vólus sem ligação",
    cor: k.semUnidade ? "var(--warn)" : undefined,
    detalhes: [
      { rotulo: "Valor", valor: brlCompact(k.valorSemUnidade) },
      { rotulo: "Participação", valor: pct(k.valorSemUnidade, gastoModo) },
    ],
  };
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
          {
            label: "Consumo médio",
            value: kml,
            hint: "pelo hodômetro",
            detalhes: [
              { rotulo: "Km rodados", valor: num(Math.round(k.kmRodados)) },
              { rotulo: "Abastecimentos", valor: num(k.abastecimentos) },
            ],
          },
          {
            label: "Custo por km",
            value: porKm,
            hint: "combustível + manutenção",
            detalhes: [
              { rotulo: "Combustível/km", valor: k.kmRodados ? brl(k.combustivel / k.kmRodados) : "—" },
              { rotulo: "Manutenção/km", valor: k.kmRodados ? brl(k.manutencao / k.kmRodados) : "—" },
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
          semUnidade,
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
            {
              label: "Veículos",
              value: num(k.veiculos),
              hint: "com abastecimento no recorte",
              detalhes: [{ rotulo: "Por veículo", valor: porN(k.combustivel, k.veiculos) }, maiorPlaca],
            },
            {
              label: "Postos",
              value: num(k.fornecedores),
              hint: "onde a frota abasteceu",
              detalhes: [
                { rotulo: "Por posto", valor: porN(k.combustivel, k.fornecedores) },
                { rotulo: "Motoristas", valor: num(k.motoristas) },
              ],
            },
            semUnidade,
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
            {
              label: "Oficinas",
              value: num(k.fornecedores),
              hint: "onde a frota fez manutenção",
              detalhes: [
                { rotulo: "Por oficina", valor: porN(k.manutencao, k.fornecedores) },
                { rotulo: "Operadores", valor: num(k.motoristas) },
              ],
            },
            semUnidade,
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

export type CartaoFrota = CartaoKpi;

/** Os indicadores das telas da Frota — o `IndicadoresKpi` com o canto da Vólus. */
export function IndicadoresFrota({ chave, cartoes, importacao, todos = false }: { chave: string; cartoes: CartaoFrota[]; importacao?: ImportacaoFrotaKpi; todos?: boolean }) {
  return <IndicadoresKpi chave={chave} cartoes={cartoes} canto={importacao ? cantoFrota(importacao) : undefined} todos={todos} />;
}

/** O corpo dos gráficos de barras lado a lado: a MESMA altura fixa (proporcional à tela), a rolagem por dentro. */
const CORPO_FIXO = "h-[18rem] overflow-y-auto pr-1 sm:h-[22rem]";


const DIMS_GRAFICO: DimFrota[] = ["orgao", "unidadeSistema", "classificacao", "contrato", "unidade", "tipoVeiculo", "produto", "tipoManutencao", "estabelecimento", "cidade", "motorista", "marca"];

function Painel({
  trs,
  intervalo,
  cores,
  ctx,
  consumo,
  limites,
  dims,
  onAlternar,
  onAbrir,
  onFicha,
  semUnidade,
  edicoes,
  podePublicar,
}: {
  trs: Transacao[];
  intervalo: { de?: string | null; ate?: string | null };
  cores: CoresFrota;
  ctx: ReturnType<typeof useDadosFrota>["ctx"];
  consumo: ReturnType<typeof consumoDosAbastecimentos>;
  limites: LimitesAlertas;
  dims: Partial<Record<DimFrota, string[]>>;
  onAlternar: (d: DimFrota, v: string) => void;
  onAbrir: (id: number) => void;
  onFicha: (placa: string) => void;
  semUnidade: boolean;
  edicoes?: EdicoesFrota;
  podePublicar: boolean;
}) {
  const tabela = useTabelaFrota("frotas:frotas:demonstrativo", edicoes, podePublicar);
  const tabelaAlertas = useTabelaFrota("frotas:frotas:alertas", edicoes, podePublicar);
  const dimsGrafico = DIMS_GRAFICO.filter((d) => !(semUnidade && (d === "orgao" || d === "unidadeSistema")));
  const [dimGrafico, setDimGrafico] = useState<DimFrota>("classificacao");
  const [dimTabela, setDimTabela] = useState<DimFrota>("placa");
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
  const [aba, setAba] = useState<"alertas" | "demonstrativo">("demonstrativo");
  const seletorDim = (valor: DimFrota, set: (d: DimFrota) => void, opcoes: DimFrota[]) => (
    <SelectField compacto label="Por" value={valor} onChange={(e) => set(e.target.value as DimFrota)}>
      {opcoes.map((d) => (
        <option key={d} value={d}>
          {ROTULO_DIM[d]}
        </option>
      ))}
    </SelectField>
  );
  return (
    <div className="space-y-[var(--gap-block)]">
      {/* O GASTO NO TEMPO: o MESMO gráfico da Execução (`GraficoTemporal`). */}
      <ChartCard className="min-w-0">
        <GastoNoTempo trs={trs} intervalo={intervalo} cores={cores} onAbrir={onAbrir} />
      </ChartCard>
      {/* Lado a lado, com a MESMA altura fixa (mais dados = rolagem por dentro, nunca um cartão maior). */}
      <div className="grid gap-[var(--gap-block)] lg:grid-cols-2">
        <ChartCard className="min-w-0" title="Maiores gastos por veículo" action={legenda}>
          <div className={CORPO_FIXO}>
            <BarrasH ariaLabel="Maiores gastos por veículo" linhas={linhasBarra(porPlaca, 50)} onEscolher={(k) => onFicha(String(k))} acao="abrir a ficha do veículo" />
          </div>
        </ChartCard>
        <ChartCard className="min-w-0" title={`Gasto por ${ROTULO_DIM[dimGrafico].toLocaleLowerCase("pt-BR")}`} action={seletorDim(dimGrafico, setDimGrafico, dimsGrafico)}>
          <div className={CORPO_FIXO}>
            <BarrasH
              ariaLabel={`Gasto por ${ROTULO_DIM[dimGrafico]}`}
              linhas={linhasBarra(porDim, 50)}
              ativa={(dims[dimGrafico] ?? []).length === 1 ? (dims[dimGrafico] ?? [])[0] : null}
              onEscolher={(k) => onAlternar(dimGrafico, String(k))}
              acao="filtrar a tela"
            />
          </div>
        </ChartCard>
      </div>
      {/* DEMONSTRATIVO | ALERTAS em abas (só a aberta é montada). */}
      <ChartCard className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <Segmented
            ariaLabel="Demonstrativo ou alertas"
            value={aba}
            onChange={setAba}
            options={[
              { value: "demonstrativo", label: "Demonstrativo" },
              { value: "alertas", label: `Alertas (${num(alertas.length)})` },
            ]}
          />
          {aba === "demonstrativo" &&
            seletorDim(
              dimTabela,
              setDimTabela,
              [...dimsGrafico.filter((d) => d !== "placa"), "placa" as DimFrota, "mes" as DimFrota].sort((a, b) => ROTULO_DIM[a].localeCompare(ROTULO_DIM[b], "pt-BR")),
            )}
        </div>
        {aba === "alertas" ? (
          alertas.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">Nenhum alerta no recorte.</p>
          ) : (
            <DadosCompletos value={tabelaAlertas.completo}>
              <DataTable
                density="compact"
                rows={alertas}
                getKey={(a) => `${a.id}:${a.tipo}`}
                onRowClick={(a) => onAbrir(a.id)}
                edicoes={tabelaAlertas.edicoes}
                acoesRodape={tabelaAlertas.botao}
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
            </DadosCompletos>
          )
        ) : (
          <DadosCompletos value={tabela.completo}>
            <DataTable
              density="compact"
              visao={dimTabela}
              edicoes={tabela.edicoes}
              acoesRodape={tabela.botao}
              rows={demonstrativo}
              getKey={(g) => g.chave}
              columns={colunasDemo}
              onRowClick={(g) => (dimTabela === "placa" ? onFicha(g.chave) : dimTabela !== "mes" && onAlternar(dimTabela, g.chave))}
              exportar={{ nome: `Frota por ${ROTULO_DIM[dimTabela]}` }}
              linhasSalvas="frota-demonstrativo"
              resumo={(ls) => `${num(ls.length)} linhas · ${brl(ls.reduce((s, g) => s + g.total, 0))}`}
            />
          </DadosCompletos>
        )}
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
  semUnidade,
  edicoes,
  podePublicar,
}: {
  modo: "combustivel" | "manutencao";
  trs: Transacao[];
  ctx: ReturnType<typeof useDadosFrota>["ctx"];
  consumo: ReturnType<typeof consumoDosAbastecimentos>;
  ativa: number | null;
  onAbrir: (id: number) => void;
  semUnidade: boolean;
  edicoes?: EdicoesFrota;
  podePublicar: boolean;
}) {
  const ab = modo === "combustivel";
  const tabela = useTabelaFrota(`frotas:${modo}:tabela`, edicoes, podePublicar);
  const v = (t: Transacao) => (t.placa ? ctx.veiculos.get(t.placa) : undefined);
  const classif = (t: Transacao) => {
    const c = v(t)?.classificacaoId;
    return c != null ? (ctx.classificacoes.get(c)?.nome ?? "") : "";
  };
  const colunas: Column<Transacao>[] = [
    { key: "dia", header: "Data", filter: "date", value: (t) => t.dia, render: (t) => `${dataBR(t.dia)}${t.hora ? ` ${t.hora}` : ""}`, nowrap: true },
    ...(semUnidade ? [] : colunasOrgaoUnidade<Transacao>((t) => t)),
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
    { key: "unidade", header: "Setor (Vólus)", value: (t) => t.unidade ?? "—", render: (t) => <CelulaTexto texto={t.unidade ?? "—"} />, align: "left", minWidth: 140 },
    { key: "empenho", header: "Empenho", value: (t) => t.empenho ?? "—", render: (t) => t.empenho ?? "—", nowrap: true },
  ];
  return (
    <DadosCompletos value={tabela.completo}>
    <DataTable
      scrollInterno
      density="compact"
      rows={trs}
      getKey={(t) => t.id}
      columns={colunas}
      onRowClick={(t) => onAbrir(t.id)}
      activeKey={ativa}
      ocultasPadrao={["tipoV", "unidade", "empenho", "cidade"]}
      edicoes={tabela.edicoes}
      acoesRodape={tabela.botao}
      exportar={{ nome: ab ? "Abastecimentos" : "Manutenções" }}
      resumo={(ls) =>
        `${num(ls.length)} ${ab ? "abastecimentos" : "manutenções"} · ${brl(ls.reduce((s, t) => s + t.valor, 0))}${
          ab ? ` · ${dec(ls.reduce((s, t) => s + (t.litros ?? 0), 0))} l` : ""
        }`
      }
      vazio="Nenhum registro no recorte."
    />
    </DadosCompletos>
  );
}

/**
 * As colunas ÓRGÃO e UNIDADE do SISTEMA (a sigla; o nome na dica e no filtro — `useDetalheSigla` do DataTable pelo título):
 * o registro sem ligação = "Sem órgão"/"Sem unidade", filtrável. As MESMAS na tabela de combustível, de manutenção e no
 * demonstrativo.
 */
export function colunasOrgaoUnidade<T>(de: (x: T) => Pick<Transacao, "orgao" | "orgaoNome" | "unidadeSistema" | "unidadeSistemaNome">): Column<T>[] {
  const celula = (sigla: string | null, nome: string | null, vazio: string) =>
    sigla ? (
      <span title={nome && nome !== sigla ? `${sigla} — ${nome}` : sigla}>{sigla}</span>
    ) : (
      <span className="text-faint">{vazio}</span>
    );
  return [
    { key: "orgao", header: "Órgão", value: (x) => de(x).orgao ?? SEM_ORGAO, render: (x) => celula(de(x).orgao, de(x).orgaoNome, SEM_ORGAO), nowrap: true },
    { key: "unidadeSis", header: "Unidade", value: (x) => de(x).unidadeSistema ?? SEM_UNIDADE, render: (x) => celula(de(x).unidadeSistema, de(x).unidadeSistemaNome, SEM_UNIDADE), nowrap: true },
  ];
}



const ORDEM_GRAN = { auto: 0, dia: 1, semana: 2, mes: 3, ano: 4 } as const;
const ROTULO_GRAN = { dia: "dia", semana: "semana", mes: "mês", ano: "ano" } as const;
const diaNum = (iso: string) => Math.round(Date.parse(iso) / 86_400_000);
const pct = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "—");
const qtd = (n: number, um: string, varios: string) => `${num(n)} ${n === 1 ? um : varios}`;

/**
 * O GASTO DA FROTA NO TEMPO: o `GraficoTemporal` (o MESMO da Execução) — acumulado ou por período, agrupado por dia/semana/
 * mês, a legenda, o zoom, a dica, a marca, o trecho e a ORIGEM (os registros do ponto ou do trecho, que abrem o detalhe).
 */
function GastoNoTempo({ trs, intervalo, cores, onAbrir }: { trs: Transacao[]; intervalo: { de?: string | null; ate?: string | null }; cores: CoresFrota; onAbrir: (id: number) => void }) {
  // As séries (as cores escolhidas pelo ADM; sem escolha, as do tema — as mesmas dos indicadores e das barras).
  const series = useMemo(
    () => [
      { chave: "combustivel", rotulo: "Combustível", cor: 0, hex: cores.combustivel },
      { chave: "manutencao", rotulo: "Manutenção", cor: 1, hex: cores.manutencao },
    ],
    [cores.combustivel, cores.manutencao],
  );
  // O dia de hoje em Brasília (o gráfico vai só até hoje).
  const hoje = useMemo(() => dataIsoBrasilia(new Date().toISOString()), []);
  const [modo, setModo] = useState<"acumulado" | "periodo">("acumulado");
  const [gran, setGran] = useState<"dia" | "semana" | "mes">("mes");
  const sTodo = useMemo(() => serieFrota(trs, intervalo, gran, hoje), [trs, intervalo, gran, hoje]);
  const todo = sTodo.de && sTodo.ate ? { de: sTodo.de, ate: sTodo.ate } : null;
  const [janela, setJanela] = useState<{ de: string; ate: string } | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: o zoom volta ao todo quando o período do gráfico muda.
  useEffect(() => setJanela(null), [sTodo.de, sTodo.ate]);
  const s = useMemo(() => {
    if (!janela) return sTodo;
    // Na janela, a granularidade pedida ou uma MAIS FINA quando a janela é curta (a régua da Execução).
    const opc = { acumularDesde: sTodo.pontos[0]?.de };
    const auto = serieFrota(trs, janela, "auto", hoje, opc);
    return ORDEM_GRAN[auto.granularidade] <= ORDEM_GRAN[gran] ? auto : serieFrota(trs, janela, gran, hoje, opc);
  }, [janela, trs, hoje, sTodo, gran]);
  const rotuloGran = ROTULO_GRAN[s.granularidade];
  const porChave = useMemo(() => new Map(s.pontos.map((p) => [p.chave, p])), [s.pontos]);
  const acumulado = modo === "acumulado";
  const pontos: PontoTemporal[] = useMemo(
    () =>
      s.pontos.map((p) => ({
        chave: p.chave,
        rotulo: p.rotulo,
        titulo: p.titulo,
        atual: p.atual,
        hoje: p.de === hoje && p.ate === hoje,
        t: (diaNum(p.de) + diaNum(p.ate)) / 2,
        valores: acumulado ? { combustivel: p.acCombustivel, manutencao: p.acManutencao } : { combustivel: p.combustivel, manutencao: p.manutencao },
      })),
    [s.pontos, acumulado, hoje],
  );
  const diasJanela = janela ? diaNum(janela.ate) - diaNum(janela.de) + 1 : Number.POSITIVE_INFINITY;
  const janelaVista = janela ? (() => {
    const fim = [janela.ate, hoje, s.pontos.at(-1)?.ate ?? janela.ate].sort()[0];
    return { de: janela.de, ate: fim, dias: diaNum(fim) - diaNum(janela.de) + 1 };
  })() : null;
  const total = (p: PontoFrota) => p.acCombustivel + p.acManutencao;
  const ultimo = sTodo.pontos.at(-1);
  const dica = (p: PontoFrota): LinhaDica[] => [
    acumulado
      ? { secao: `Neste ${rotuloGran}`, rotulo: "Combustível", valor: `${brl(p.combustivel)} · ${qtd(p.qComb, "abastecimento", "abastecimentos")}` }
      : { secao: "Acumulado até aqui", rotulo: "Combustível", valor: brl(p.acCombustivel) },
    acumulado
      ? { rotulo: "Manutenção", valor: `${brl(p.manutencao)} · ${qtd(p.qMan, "manutenção", "manutenções")}` }
      : { rotulo: "Manutenção", valor: brl(p.acManutencao) },
    { secao: "Gasto acumulado", rotulo: "Total", valor: brl(total(p)) },
    { rotulo: "Combustível no total", valor: pct(p.acCombustivel, total(p)) },
    { rotulo: "Do gasto no gráfico", valor: pct(total(p), ultimo ? total(ultimo) : 0) },
  ];
  const dicaTrecho = (a: PontoFrota, b: PontoFrota): LinhaDica[] => {
    const lista = s.pontos.slice(s.pontos.indexOf(a), s.pontos.indexOf(b) + 1);
    const c = lista.reduce((t, p) => t + p.combustivel, 0);
    const m = lista.reduce((t, p) => t + p.manutencao, 0);
    return [
      { secao: "No trecho", rotulo: "Combustível", valor: brl(c) },
      { rotulo: "Manutenção", valor: brl(m) },
      { rotulo: "Total", valor: brl(c + m) },
      { rotulo: `Média por ${rotuloGran}`, valor: brl((c + m) / Math.max(1, lista.length)) },
    ];
  };
  const [origem, setOrigem] = useState<{ titulo: string; recorte: string; de: string; ate: string } | null>(null);
  const abrir = (titulo: string, de: string, ate: string, recorte: string) => setOrigem({ titulo, recorte, de, ate });
  return (
    <>
      <GraficoTemporal
        pontos={pontos}
        series={series}
        controles={[
          <Segmented<"acumulado" | "periodo">
            key="tipo"
            value={modo}
            onChange={setModo}
            ariaLabel="Tipo do gráfico"
            options={[
              { value: "acumulado", label: "Acumulado", dica: "O gráfico soma desde o início do período" },
              { value: "periodo", label: "Por período", curto: "Período", dica: "O gráfico mostra o gasto de cada dia, semana ou mês" },
            ]}
          />,
          <Segmented<"dia" | "semana" | "mes">
            key="gran"
            value={s.granularidade === "ano" ? "mes" : s.granularidade}
            onChange={setGran}
            ariaLabel="Agrupar o gráfico por"
            options={[
              { value: "dia", label: "Dia", dica: "Agrupar o gráfico por dia (períodos longos demais sobem para mês)" },
              { value: "semana", label: "Semana", dica: "Agrupar o gráfico por semana" },
              { value: "mes", label: "Mês", dica: "Agrupar o gráfico por mês" },
            ]}
          />,
        ]}
        gran={rotuloGran}
        janela={
          janela && todo && janelaVista
            ? {
                ...janelaVista,
                podeVoltar: janela.de > todo.de,
                podeAvancar: janela.ate < todo.ate,
                onVoltar: () => setJanela(deslocarJanela(janela, todo, -1)),
                onAvancar: () => setJanela(deslocarJanela(janela, todo, 1)),
              }
            : null
        }
        podeAproximar={!!todo && diasJanela > MIN_DIAS_ZOOM}
        onZoom={(f) => todo && setJanela((j) => zoomJanela(j, todo, f))}
        onRestaurar={() => setJanela(null)}
        tabela={
          <DataTable
            rows={[...s.pontos].reverse()}
            getKey={(p) => p.chave}
            density="compact"
            linhasSalvas="frota-grafico"
            exportar={{ nome: `Gasto da frota por ${rotuloGran}` }}
            onRowClick={(p) => abrir(`Gasto por ${rotuloGran}`, p.de, p.ate, p.titulo)}
            vazio="Nenhum gasto no período escolhido."
            columns={[
              { key: "p", header: "Período", value: (p) => p.titulo, render: (p) => p.titulo, filter: "none", nowrap: true },
              { key: "c", header: "Combustível", align: "right", filter: "range", numero: (p) => p.combustivel, value: (p) => brl(p.combustivel), render: (p) => brl(p.combustivel), nowrap: true },
              { key: "m", header: "Manutenção", align: "right", filter: "range", numero: (p) => p.manutencao, value: (p) => brl(p.manutencao), render: (p) => brl(p.manutencao), nowrap: true },
              { key: "t", header: "Total", align: "right", filter: "range", numero: (p) => p.combustivel + p.manutencao, value: (p) => brl(p.combustivel + p.manutencao), render: (p) => <strong>{brl(p.combustivel + p.manutencao)}</strong>, nowrap: true },
              { key: "a", header: "Acumulado", align: "right", filter: "range", total: false, numero: (p) => total(p), value: (p) => brl(total(p)), render: (p) => brl(total(p)), nowrap: true },
            ]}
          />
        }
        ajustarY={!!janela && acumulado}
        ariaLabel={acumulado ? "Gasto acumulado da frota: combustível e manutenção" : `Gasto da frota por ${rotuloGran}: combustível e manutenção`}
        onEscolher={(p) => {
          const pt = porChave.get(p.chave);
          const ini = sTodo.pontos[0]?.de;
          if (pt && ini) abrir(acumulado ? "Gasto acumulado" : `Gasto por ${rotuloGran}`, acumulado ? ini : pt.de, pt.ate, acumulado ? `Até ${pt.titulo}` : pt.titulo);
        }}
        extraDica={(p) => {
          const pt = porChave.get(p.chave);
          return pt ? dica(pt) : [];
        }}
        onTrecho={(a, b) => {
          const pa = porChave.get(a.chave);
          const pb = porChave.get(b.chave);
          if (pa && pb) abrir("Trecho do gráfico", pa.de, pb.ate, `${pa.titulo} a ${pb.titulo}`);
        }}
        dicaTrecho={(a, b) => {
          const pa = porChave.get(a.chave);
          const pb = porChave.get(b.chave);
          return pa && pb ? dicaTrecho(pa, pb) : [];
        }}
      />
      {origem && <OrigemGasto origem={origem} trs={trs} onAbrir={onAbrir} onClose={() => setOrigem(null)} />}
    </>
  );
}

/** A ORIGEM de um ponto ou trecho do gráfico: os registros do intervalo (a soma = o número), cada um abre o detalhe. */
function OrigemGasto({
  origem,
  trs,
  onAbrir,
  onClose,
}: {
  origem: { titulo: string; recorte: string; de: string; ate: string };
  trs: Transacao[];
  onAbrir: (id: number) => void;
  onClose: () => void;
}) {
  const lista = useMemo(() => trs.filter((t) => t.dia >= origem.de && t.dia <= origem.ate), [trs, origem.de, origem.ate]);
  const c = lista.reduce((s, t) => s + (t.tipo === "abastecimento" ? t.valor : 0), 0);
  const m = lista.reduce((s, t) => s + (t.tipo === "manutencao" ? t.valor : 0), 0);
  return (
    <OrigemDados
      aberto
      onClose={onClose}
      titulo={origem.titulo}
      recorte={origem.recorte}
      resumo={[
        { label: "Total", value: brl(c + m), tone: "accent" },
        { label: "Combustível", value: brl(c) },
        { label: "Manutenção", value: brl(m) },
        { label: "Registros", value: num(lista.length) },
      ]}
      fonte="Extratos da Vólus (abastecimentos e manutenções) com os filtros da tela."
    >
      <DataTable
        rows={lista}
        getKey={(t) => t.id}
        density="compact"
        linhasSalvas="origem-frota"
        exportar={{ nome: "Origem do gasto da frota" }}
        onRowClick={(t) => onAbrir(t.id)}
        vazio="Nenhum registro no intervalo."
        columns={[
          { key: "d", header: "Data", value: (t) => dataBR(t.dia), render: (t) => dataBR(t.dia), nowrap: true },
          { key: "tp", header: "Tipo", value: (t) => (t.tipo === "abastecimento" ? "Combustível" : "Manutenção"), render: (t) => (t.tipo === "abastecimento" ? "Combustível" : "Manutenção"), nowrap: true },
          { key: "pl", header: "Placa", value: (t) => t.placa ?? "—", render: (t) => t.placa ?? "—", nowrap: true },
          { key: "un", header: "Unidade", value: (t) => t.unidadeSistema ?? SEM_UNIDADE, render: (t) => t.unidadeSistema ?? SEM_UNIDADE, nowrap: true },
          { key: "es", header: "Estabelecimento", value: (t) => t.estabelecimento ?? "—", render: (t) => <CelulaTexto texto={t.estabelecimento ?? "—"} />, minWidth: 200 },
          { key: "v", header: "Valor", align: "right", filter: "range", numero: (t) => t.valor, value: (t) => brl(t.valor), render: (t) => brl(t.valor), nowrap: true },
        ]}
      />
    </OrigemDados>
  );
}
