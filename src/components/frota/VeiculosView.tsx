"use client";

import { useMemo, useState } from "react";
import { brl, brlCompact, dataBR, dec, num } from "@/lib/format";
import type { LimitesAlertas } from "@/lib/frota-config-core";
import {
  type AlteracaoVeiculo,
  aplicarTravaOrigem,
  alteracoesDaPlanilha,
  type Classificacao,
  consumoDosAbastecimentos,
  ROTULO_ORIGEM,
  ROTULO_SITUACAO,
  ROTULO_TIPO_VEICULO,
  type Transacao,
  type Veiculo,
} from "@/lib/frota-core";
import { useAbrirDaUrl } from "../AbrirDaUrl";
import { Ajuda } from "../Ajuda";
import { Badge } from "../Badge";
import { AcoesCadastro } from "../AcoesCadastro";
import { BannerCadastro } from "../BannerCadastro";
import { BarraEdicaoMassaVeiculos } from "../BarraEdicaoMassa";
import { BarraSelecao } from "../BarraSelecao";
import { BotaoAcao } from "../BotaoAcao";
import { Button } from "../Button";
import { ColorField } from "../ColorField";
import { useConfirmacao } from "../Confirmacao";
import { type Column, DataTable } from "../DataTable";
import { Dropzone } from "../Dropzone";
import { ErroCarga } from "../ErroCarga";
import { TextField } from "../Field";
import { IconEtiqueta, IconPlus, IconSave, IconUpload } from "../icons";
import { type EdicoesFrota, type ImportacaoFrotaKpi, IndicadoresFrota, useTabelaFrota } from "./FrotaView";
import { DadosCompletos } from "../DadosCompletos";
import { useSemUnidade } from "../UnidadeUnica";
import { Modal } from "../Modal";
import { EsqueletoFrota } from "../FrotaEsqueleto";
import { toast } from "../Toast";
import { type ContratoFrota, type UnidadeFrota, useDadosFrota } from "./dados-frota";
import { FichaVeiculoBanner } from "./FichaVeiculoBanner";
import { TransacaoFrotaDetalhe } from "./TransacaoFrotaDetalhe";
import { CelulaTexto } from "../CelulaLista";

type Linha = Veiculo & { gasto: number; registros: number; ultimo: string | null };

async function gravar(alteracoes: AlteracaoVeiculo[]): Promise<number> {
  let feitas = 0;
  for (let i = 0; i < alteracoes.length; i += 500) {
    const r = await fetch("/api/frota/veiculos", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ alteracoes: alteracoes.slice(i, i + 500) }) });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; alterados?: number };
    if (!r.ok || !j.ok) throw new Error(j.error || "Não foi possível salvar os veículos.");
    feitas += j.alterados ?? 0;
  }
  return feitas;
}

/**
 * O CADASTRO DA FROTA: os veículos (as placas entram sozinhas pelas transações da Vólus) com o que só o município sabe —
 * tipo, classificação, situação, origem (próprio = FIPE; contrato = locação), tanque e a unidade de lotação. Edição um a
 * um, em massa (a seleção) e pela planilha; as classificações; a ficha de cada veículo com o gasto do ano.
 */
export function VeiculosView({
  anoInicial,
  versao,
  contratos,
  alertas,
  importacao,
  pode,
  edicoes,
  podePublicar = false,
}: {
  anoInicial: number | null;
  versao: string;
  contratos: ContratoFrota[];
  alertas: LimitesAlertas;
  /** O canto das KPIs (há quanto tempo a Vólus foi lida; o "Importar agora" do ADM). */
  importacao?: ImportacaoFrotaKpi;
  pode: { manipular: boolean; importar: boolean; configurar: boolean; exportar: boolean };
  edicoes?: EdicoesFrota;
  podePublicar?: boolean;
}) {
  const { transacoes, ctx, cadastro } = useDadosFrota({ ano: anoInicial, versao, contratos });
  const { veiculos, classificacoes, unidades, erro, recarregar } = cadastro;
  const consumo = useMemo(() => consumoDosAbastecimentos(transacoes ?? []), [transacoes]);
  const [selecao, setSelecao] = useState<Set<string | number>>(new Set());
  const [editando, setEditando] = useState<Veiculo | null>(null);
  const [ficha, setFicha] = useState<string | null>(null);
  // A PESQUISA abre a ficha do veículo (`?abrir=<placa>`).
  useAbrirDaUrl((p) => setFicha(p.toUpperCase()), veiculos != null);
  const [aberta, setAberta] = useState<number | null>(null);
  const [classifAberto, setClassifAberto] = useState(false);
  const [planilhaAberta, setPlanilhaAberta] = useState(false);
  const [reserva, setReserva] = useState(0);
  const [aplicandoMassa, setAplicandoMassa] = useState(false);
  const { confirmar, confirmacao } = useConfirmacao();
  const linhas: Linha[] = useMemo(() => {
    const gastos = new Map<string, { gasto: number; registros: number; ultimo: string | null }>();
    for (const t of transacoes ?? []) {
      if (!t.placa) continue;
      const g = gastos.get(t.placa) ?? { gasto: 0, registros: 0, ultimo: null };
      g.gasto += t.valor;
      g.registros++;
      if (!g.ultimo || t.dia > g.ultimo) g.ultimo = t.dia;
      gastos.set(t.placa, g);
    }
    return (veiculos ?? []).map((v) => ({ ...v, ...(gastos.get(v.placa) ?? { gasto: 0, registros: 0, ultimo: null }) }));
  }, [veiculos, transacoes]);
  const nomeClassif = (id: number | null) => (id == null ? "" : (classificacoes.find((c) => c.id === id)?.nome ?? ""));
  const unidade = (id: number | null) => (id == null ? undefined : unidades.find((u) => u.id === id));
  const nomeUnidade = (id: number | null) => unidade(id)?.codigo ?? "";
  const tabela = useTabelaFrota("frotas:veiculos:tabela", edicoes, podePublicar);
  // Com UMA unidade no cabeçalho e todos os veículos dela, Unidade e Órgão saem (a interface enxuta).
  const semUnidade = useSemUnidade(() => (veiculos ?? []).map((v) => nomeUnidade(v.reparticaoId) || null), "frotas");
  const celulaSigla = (sigla: string | null | undefined, nome: string | null | undefined, vazio: string) =>
    sigla ? <span title={nome && nome !== sigla ? `${sigla} — ${nome}` : sigla}>{sigla}</span> : <span className="text-faint">{vazio}</span>;

  const colunas: Column<Linha>[] = [
    { key: "placa", header: "Placa", value: (v) => v.placa, render: (v) => <strong className="font-mono text-[13px]">{v.placa}</strong>, nowrap: true },
    { key: "veiculo", header: "Marca / modelo", value: (v) => [v.marca, v.modelo].filter(Boolean).join(" ") || "—", render: (v) => <CelulaTexto texto={[v.marca, v.modelo].filter(Boolean).join(" ") || "—"} />, align: "left", minWidth: 160 },
    { key: "ano", header: "Ano", value: (v) => (v.ano ? String(v.ano) : "—"), render: (v) => (v.ano ? String(v.ano) : "—"), nowrap: true },
    { key: "tipo", header: "Tipo", value: (v) => ROTULO_TIPO_VEICULO[v.tipo] ?? v.tipo, render: (v) => ROTULO_TIPO_VEICULO[v.tipo] ?? v.tipo, nowrap: true },
    {
      key: "classif",
      header: "Classificação",
      value: (v) => nomeClassif(v.classificacaoId) || "—",
      render: (v) => {
        const c = classificacoes.find((x) => x.id === v.classificacaoId);
        return c ? (
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: c.cor }} />
            {c.nome}
          </span>
        ) : (
          <span className="text-faint">—</span>
        );
      },
      nowrap: true,
    },
    {
      key: "situacao",
      header: "Situação",
      value: (v) => ROTULO_SITUACAO[v.situacao] ?? v.situacao,
      render: (v) => (
        <Badge tone={v.situacao === "ativo" ? "emerald" : "slate"} dot>
          {ROTULO_SITUACAO[v.situacao]}
        </Badge>
      ),
      nowrap: true,
    },
    { key: "origem", header: "Origem", value: (v) => (v.origem ? ROTULO_ORIGEM[v.origem] : "—"), render: (v) => (v.origem ? ROTULO_ORIGEM[v.origem] : "—"), nowrap: true },
    { key: "fipe", header: "FIPE", filter: "range", align: "right", numero: (v) => v.fipe, render: (v) => (v.fipe == null ? "—" : brl(v.fipe)), total: false },
    { key: "locacao", header: "Locação", filter: "range", align: "right", numero: (v) => v.locacao, render: (v) => (v.locacao == null ? "—" : brl(v.locacao)) },
    { key: "tanque", header: "Tanque (l)", filter: "range", numero: (v) => v.capacidadeTanque, value: (v) => (v.capacidadeTanque == null ? "—" : dec(v.capacidadeTanque)), render: (v) => (v.capacidadeTanque == null ? "—" : dec(v.capacidadeTanque)), formatarFaixa: dec, total: false },
    ...(semUnidade
      ? []
      : ([
          {
            key: "orgao",
            header: "Órgão",
            value: (v) => unidade(v.reparticaoId)?.orgao ?? "Sem órgão",
            render: (v) => celulaSigla(unidade(v.reparticaoId)?.orgao, unidade(v.reparticaoId)?.orgaoNome, "Sem órgão"),
            nowrap: true,
          },
          {
            key: "unidade",
            header: "Unidade",
            value: (v) => nomeUnidade(v.reparticaoId) || "Sem unidade",
            render: (v) => celulaSigla(nomeUnidade(v.reparticaoId), unidade(v.reparticaoId)?.nome, "Sem unidade"),
            nowrap: true,
          },
        ] as Column<Linha>[])),
    { key: "gasto", header: `Gasto ${anoInicial ?? ""}`.trim(), filter: "range", align: "right", numero: (v) => v.gasto, render: (v) => brl(v.gasto) },
    { key: "registros", header: "Registros", filter: "range", numero: (v) => v.registros, value: (v) => num(v.registros), render: (v) => num(v.registros), formatarFaixa: num },
    { key: "ultimo", header: "Último registro", filter: "date", value: (v) => v.ultimo ?? "", render: (v) => (v.ultimo ? dataBR(v.ultimo) : "—"), nowrap: true },
    { key: "contrato", header: "Contrato", value: (v) => v.contrato ?? "—", render: (v) => v.contrato ?? "—", nowrap: true },
  ];

  async function aplicar(alteracoes: AlteracaoVeiculo[], msg: string) {
    try {
      const n = await gravar(alteracoes);
      toast.success(`${msg} (${num(n)} ${n === 1 ? "veículo" : "veículos"}).`);
      await recarregar();
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    }
  }

  return (
    <div className="space-y-[var(--gap-block)]">
      {/* Sem linha de título (o padrão das telas de dados): os indicadores abrem a tela. */}
      <h1 className="sr-only">Veículos</h1>
      {veiculos != null && <IndicadoresVeiculos linhas={linhas} importacao={importacao} />}
      {erro && <ErroCarga msg={erro} onTentar={() => void recarregar()} />}
      {veiculos == null ? (
        <EsqueletoFrota tipo="veiculos" />
      ) : (
        <DadosCompletos value={tabela.completo}>
        <DataTable
          scrollInterno
          density="compact"
          edicoes={tabela.edicoes}
          rows={linhas}
          getKey={(v) => v.placa}
          columns={colunas}
          selectable={pode.manipular}
          selected={selecao}
          onSelected={setSelecao}
          onRowClick={(v) => setFicha(v.placa)}
          activeKey={ficha}
          reservaInferior={reserva}
          ocultasPadrao={["contrato", "tanque", "registros"]}
          exportar={pode.exportar ? { nome: "Veículos da frota" } : false}
          resumo={(ls) => `${num(ls.length)} veículos · ${brl(ls.reduce((s, v) => s + v.gasto, 0))}`}
          vazio="Nenhum veículo — as placas entram com as transações da Vólus."
          acoesRodape={
            <span className="flex items-center gap-1.5">
              {tabela.botao}
              {pode.configurar && (
                <BotaoAcao rotulo="Classificações" icon={<IconEtiqueta className="h-4 w-4" />} onClick={() => setClassifAberto(true)} />
              )}
              {pode.manipular && pode.importar && (
                <BotaoAcao rotulo="Atualizar pela planilha" icon={<IconUpload className="h-4 w-4" />} onClick={() => setPlanilhaAberta(true)} />
              )}
              <Ajuda titulo="Veículos" botao="sm">
                <p>
                  As placas entram <strong>sozinhas</strong> pelas transações da Vólus (com a marca, o modelo e o ano que ela informa). Aqui fica o que
                  só o município sabe: tipo, classificação, situação, origem, tanque e a unidade de lotação.
                </p>
                <p>
                  A <strong>origem</strong> manda: o veículo próprio tem o valor FIPE; o de contrato, o valor da locação e o contrato. A capacidade do
                  tanque liga o alerta de “litros acima do tanque”; o veículo inativo com gasto também vira alerta.
                </p>
                <p>
                  Tocar numa linha abre a <strong>ficha do veículo</strong>; a seleção edita vários de uma vez; a <strong>planilha</strong> (colunas
                  Placa, Tipo, Classificação, Ano, Situação, Origem, FIPE, Locação, Contrato, Tanque, Unidade, Observação) atualiza o cadastro em
                  lote.
                </p>
              </Ajuda>
            </span>
          }
        />
        </DadosCompletos>
      )}
      {pode.manipular && selecao.size > 0 && (
        <BarraSelecao
          fixa
          onAltura={setReserva}
          registros={[...selecao].map((p) => ({ key: p, rotulo: String(p) }))}
          onRemover={(k) => setSelecao((s) => new Set([...s].filter((x) => x !== k)))}
          onLimpar={() => setSelecao(new Set())}
          resumo={`${num(selecao.size)} ${selecao.size === 1 ? "veículo" : "veículos"}`}
        >
          <BarraEdicaoMassaVeiculos
            classificacoes={classificacoes}
            unidades={unidades}
            aplicando={aplicandoMassa}
            onAplicar={async (acao) => {
              setAplicandoMassa(true);
              const ok = await aplicar(
                [...selecao].map((placa) => ({ placa: String(placa), [acao.campo]: acao.valor })),
                "Veículos atualizados",
              );
              setAplicandoMassa(false);
              if (ok) setSelecao(new Set());
            }}
          />
        </BarraSelecao>
      )}
      <EditorVeiculo
        veiculo={editando}
        classificacoes={classificacoes}
        unidades={unidades}
        onClose={() => setEditando(null)}
        confirmarDescarte={() => confirmar({ titulo: "Descartar as alterações?", texto: "O que você mudou neste veículo não foi salvo.", confirmar: "Descartar", cancelar: "Continuar editando" })}
        onSalvar={async (a) => {
          const ok = await aplicar([a], "Veículo salvo");
          if (ok) setEditando(null);
          return ok;
        }}
      />
      {confirmacao}
      <FichaVeiculoBanner
        placa={ficha}
        onClose={() => setFicha(null)}
        trs={transacoes ?? ([] as Transacao[])}
        ctx={ctx}
        consumo={consumo}
        ano={anoInicial}
        limites={alertas}
        onAbrir={setAberta}
        acaoExtra={
          pode.manipular && ficha
            ? () => {
                const v = veiculos?.find((x) => x.placa === ficha);
                if (v) {
                  setFicha(null);
                  setEditando(v);
                }
              }
            : undefined
        }
      />
      <TransacaoFrotaDetalhe id={aberta} onClose={() => setAberta(null)} consumo={aberta != null ? consumo.get(aberta) : undefined} resumo={transacoes?.find((x) => x.id === aberta)} />
      {classifAberto && <Classificacoes inicial={classificacoes} onClose={() => setClassifAberto(false)} onSalvo={() => void recarregar()} />}
      {planilhaAberta && (
        <PlanilhaVeiculos
          placas={new Set((veiculos ?? []).map((v) => v.placa))}
          classificacoes={classificacoes}
          unidades={unidades}
          onClose={() => setPlanilhaAberta(false)}
          onAplicar={async (a) => {
            if (await aplicar(a, "Planilha aplicada")) setPlanilhaAberta(false);
          }}
        />
      )}
    </div>
  );
}

/** Os INDICADORES do cadastro (sobre todos os veículos do escopo; o gasto é o do ano mais recente). */
function IndicadoresVeiculos({ linhas, importacao }: { linhas: Linha[]; importacao?: ImportacaoFrotaKpi }) {
  const ativos = linhas.filter((l) => l.situacao === "ativo").length;
  const proprios = linhas.filter((l) => l.origem === "proprio");
  const contrato = linhas.filter((l) => l.origem === "contrato");
  const semClassif = linhas.filter((l) => l.classificacaoId == null).length;
  const semUnidade = linhas.filter((l) => l.reparticaoId == null).length;
  const comGasto = linhas.filter((l) => l.registros > 0).length;
  const comTanque = linhas.filter((l) => l.capacidadeTanque != null).length;
  const gasto = linhas.reduce((s, l) => s + l.gasto, 0);
  const maior = linhas.reduce<Linha | null>((m, l) => (l.gasto > (m?.gasto ?? 0) ? l : m), null);
  const pct = (n: number) => (linhas.length ? `${((n / linhas.length) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "—");
  // Dois detalhes por cartão principal, curtos e sem repetir dado entre os cartões (o padrão de `IndicadoresFrota`).
  return (
    <IndicadoresFrota
      chave="frota:veiculos:mais-indicadores"
      importacao={importacao}
      cartoes={[
        {
          label: "Veículos",
          value: num(linhas.length),
          hint: "no cadastro",
          detalhes: [
            { rotulo: "Veículos", valor: num(linhas.filter((l) => l.tipo !== "maquina").length) },
            { rotulo: "Máquinas", valor: num(linhas.filter((l) => l.tipo === "maquina").length) },
          ],
        },
        {
          label: "Ativos",
          value: num(ativos),
          hint: "em uso",
          cor: "var(--ok)",
          detalhes: [
            { rotulo: "Inativos", valor: num(linhas.length - ativos) },
            { rotulo: "Da frota", valor: pct(ativos) },
          ],
        },
        {
          label: "Gasto no ano",
          value: brl(gasto),
          hint: "combustível + manutenção",
          detalhes: [
            { rotulo: "Por veículo", valor: linhas.length ? brlCompact(gasto / linhas.length) : "—" },
            { rotulo: "Maior gasto", valor: maior?.placa ?? "—" },
          ],
        },
        {
          label: "Próprios",
          value: num(proprios.length),
          hint: `FIPE ${brlCompact(proprios.reduce((s, l) => s + (l.fipe ?? 0), 0))}`,
          detalhes: [
            { rotulo: "De contrato", valor: num(contrato.length) },
            { rotulo: "Locação por mês", valor: brlCompact(contrato.reduce((s, l) => s + (l.locacao ?? 0), 0)) },
          ],
        },
        {
          label: "Sem classificação",
          value: num(semClassif),
          hint: semClassif ? "classifique na tabela" : "todos classificados",
          cor: semClassif ? "var(--warn)" : undefined,
          detalhes: [
            { rotulo: "Classificados", valor: num(linhas.length - semClassif) },
            { rotulo: "Da frota", valor: pct(semClassif) },
          ],
        },
        {
          label: "Sem unidade",
          value: num(semUnidade),
          hint: semUnidade ? "sem unidade de lotação" : "todos lotados",
          cor: semUnidade ? "var(--warn)" : undefined,
          detalhes: [
            { rotulo: "Lotados", valor: num(linhas.length - semUnidade) },
            { rotulo: "Da frota", valor: pct(semUnidade) },
          ],
        },
        {
          label: "Com gasto no ano",
          value: num(comGasto),
          hint: "abastecimento ou manutenção",
          detalhes: [
            { rotulo: "Sem gasto", valor: num(linhas.length - comGasto) },
            { rotulo: "Registros", valor: num(linhas.reduce((s, l) => s + l.registros, 0)) },
          ],
        },
        {
          label: "Tanque cadastrado",
          value: num(comTanque),
          hint: "liga o alerta de litros",
          detalhes: [
            { rotulo: "Sem tanque", valor: num(linhas.length - comTanque) },
            { rotulo: "Da frota", valor: pct(comTanque) },
          ],
        },
      ]}
    />
  );
}

const TIPOS = Object.entries(ROTULO_TIPO_VEICULO).map(([valor, rotulo]) => ({ valor, rotulo }));
const SITUACOES = Object.entries(ROTULO_SITUACAO).map(([valor, rotulo]) => ({ valor, rotulo }));
const ORIGENS = [{ valor: "", rotulo: "Não informada" }, ...Object.entries(ROTULO_ORIGEM).map(([valor, rotulo]) => ({ valor, rotulo }))];
const camposAlterados = (a: object) =>
  Object.keys(a)
    .filter((k) => k !== "placa")
    .join(", ");
const decimal = (v: string) => v.replace(/[^\d,]/g, "");
const paraNumero = (v: string) => (v.trim() ? Number(v.replace(/\./g, "").replace(",", ".")) : null);
const paraTexto = (n: number | null | undefined) => (n == null ? "" : String(n).replace(".", ","));

/**
 * O EDITOR de um veículo — o `BannerCadastro` do sistema (os dados por cadeado; "Salvar alterações" só com o que mudou). A
 * ORIGEM manda: o próprio não tem locação nem contrato; o de contrato não tem FIPE (o servidor grava vazio).
 */
function EditorVeiculo({
  veiculo,
  classificacoes,
  unidades,
  onClose,
  confirmarDescarte,
  onSalvar,
}: {
  veiculo: Veiculo | null;
  classificacoes: Classificacao[];
  unidades: UnidadeFrota[];
  onClose: () => void;
  confirmarDescarte: () => Promise<boolean>;
  onSalvar: (a: AlteracaoVeiculo) => Promise<boolean>;
}) {
  const [ocupado, setOcupado] = useState(false);
  const v = veiculo;
  const inicial: Record<string, string> = v
    ? {
        tipo: v.tipo,
        classificacaoId: v.classificacaoId == null ? "" : String(v.classificacaoId),
        situacao: v.situacao,
        ano: v.ano == null ? "" : String(v.ano),
        origem: v.origem ?? "",
        fipe: paraTexto(v.fipe),
        locacao: paraTexto(v.locacao),
        contrato: v.contrato ?? "",
        capacidadeTanque: paraTexto(v.capacidadeTanque),
        reparticaoId: v.reparticaoId == null ? "" : String(v.reparticaoId),
        observacao: v.observacao ?? "",
      }
    : {};
  return (
    <BannerCadastro
      aberto={v != null}
      novo={false}
      titulo={`Veículo ${v?.placa ?? ""}`}
      ocupado={ocupado}
      inicial={inicial}
      confirmarDescarte={confirmarDescarte}
      onFechar={onClose}
      rodapeEsquerda={v?.atualizadoPor ? <span className="text-[12px] text-muted">Alterado por {v.atualizadoPor}{v.atualizadoEm ? ` em ${dataBR(v.atualizadoEm.slice(0, 10))}` : ""}</span> : undefined}
      campos={[
        { chave: "tipo", label: "Tipo", opcoes: TIPOS },
        { chave: "classificacaoId", label: "Classificação", opcoes: [{ valor: "", rotulo: "Sem classificação" }, ...classificacoes.map((c) => ({ valor: String(c.id), rotulo: c.nome }))] },
        { chave: "situacao", label: "Situação", opcoes: SITUACOES },
        { chave: "ano", label: "Ano de fabricação", inputMode: "numeric", max: 4, filtro: (x) => x.replace(/\D/g, "") },
        { chave: "origem", label: "Origem", opcoes: ORIGENS, dica: "Próprio = valor FIPE; contrato = locação e contrato." },
        { chave: "fipe", label: "Valor FIPE (R$)", inputMode: "text", filtro: decimal, dica: "Só no veículo próprio." },
        { chave: "locacao", label: "Locação mensal (R$)", inputMode: "text", filtro: decimal, dica: "Só no veículo de contrato." },
        { chave: "contrato", label: "Contrato de locação", max: 120, dica: "Só no veículo de contrato." },
        { chave: "capacidadeTanque", label: "Capacidade do tanque (l)", inputMode: "text", filtro: decimal },
        { chave: "reparticaoId", label: "Unidade de lotação", opcoes: [{ valor: "", rotulo: "Sem unidade" }, ...unidades.map((u) => ({ valor: String(u.id), rotulo: `${u.codigo} — ${u.nome}` }))] },
        { chave: "observacao", label: "Observação", span: true, max: 1000 },
      ]}
      onSalvar={async (patch) => {
        if (!v) return false;
        const a: AlteracaoVeiculo = { placa: v.placa };
        for (const [k, x] of Object.entries(patch)) {
          if (k === "classificacaoId" || k === "reparticaoId") a[k] = x ? Number(x) : null;
          else if (k === "ano") a.ano = x ? Number(x) : null;
          else if (k === "fipe" || k === "locacao" || k === "capacidadeTanque") a[k] = paraNumero(x);
          else if (k === "origem" || k === "contrato" || k === "observacao") a[k] = x || null;
          else if (k === "tipo" || k === "situacao") a[k] = x;
        }
        setOcupado(true);
        const ok = await onSalvar(aplicarTravaOrigem({ ...{ origem: v.origem, fipe: v.fipe, locacao: v.locacao, contrato: v.contrato }, ...a }) as AlteracaoVeiculo);
        setOcupado(false);
        return ok;
      }}
    />
  );
}

/**
 * As CLASSIFICAÇÕES (a lista inteira, na ordem): a tabela do sistema com ↑/↓, editar e excluir (`AcoesCadastro`) e o editor
 * nome + cor; excluir deixa os veículos sem classificação. Grava a lista toda num pedido.
 */
function Classificacoes({ inicial, onClose, onSalvo }: { inicial: Classificacao[]; onClose: () => void; onSalvo: () => void }) {
  type Item = { id?: number; nome: string; cor: string; chave: string };
  const [lista, setLista] = useState<Item[]>(() => inicial.map((c) => ({ ...c, chave: `c${c.id}` })));
  const [editando, setEditando] = useState<Item | null>(null);
  const [salvando, setSalvando] = useState(false);
  const { confirmar, confirmacao } = useConfirmacao();
  const nomeRepetido = (it: Item) => lista.some((x) => x.chave !== it.chave && x.nome.trim().toLocaleLowerCase("pt-BR") === it.nome.trim().toLocaleLowerCase("pt-BR"));
  const mudou = JSON.stringify(lista.map(({ id, nome, cor }) => [id, nome, cor])) !== JSON.stringify(inicial.map(({ id, nome, cor }) => [id, nome, cor]));
  async function salvar() {
    setSalvando(true);
    const r = await fetch("/api/frota/classificacoes", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ classificacoes: lista.map(({ id, nome, cor }) => ({ ...(id ? { id } : {}), nome: nome.trim(), cor })) }),
    });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    setSalvando(false);
    if (!r.ok || !j.ok) return toast.error(j.error || "Não foi possível salvar.");
    toast.success("Classificações salvas.");
    onSalvo();
    onClose();
  }
  return (
    <Modal
      open
      onClose={async () => {
        if (mudou && !(await confirmar({ titulo: "Descartar as alterações?", confirmar: "Descartar", cancelar: "Continuar" }))) return;
        onClose();
      }}
      titulo="Classificações dos veículos"
      size="md"
      rodape={
        <div className="flex w-full items-center justify-between gap-2">
          <Button size="sm" variant="secondary" icon={<IconPlus className="h-4 w-4" />} onClick={() => setEditando({ nome: "", cor: "#2563eb", chave: `n${Date.now()}` })}>
            Nova classificação
          </Button>
          <Button size="sm" loading={salvando} disabled={!mudou} icon={<IconSave className="h-4 w-4" />} onClick={() => void salvar()}>
            Salvar
          </Button>
        </div>
      }
    >
      <DataTable
        density="compact"
        rows={lista}
        getKey={(c) => c.chave}
        exportar={false}
        vazio="Nenhuma classificação — crie a primeira (ex.: Leve, Pesado, Ambulância, Ônibus)."
        columns={[
          {
            key: "nome",
            header: "Classificação",
            filter: "none",
            align: "left",
            render: (c) => (
              <span className="inline-flex items-center gap-2">
                <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.cor }} />
                {c.nome}
              </span>
            ),
          },
          {
            key: "acoes",
            header: "",
            filter: "none",
            render: (c) => {
              const i = lista.findIndex((x) => x.chave === c.chave);
              return (
                <AcoesCadastro
                  nome={c.nome}
                  primeira={i === 0}
                  ultima={i === lista.length - 1}
                  onMover={(d) =>
                    setLista((l) => {
                      const n = [...l];
                      [n[i], n[i + d]] = [n[i + d], n[i]];
                      return n;
                    })
                  }
                  onEditar={() => setEditando(c)}
                  onExcluir={async () => {
                    if (c.id && !(await confirmar({ titulo: `Excluir “${c.nome}”?`, texto: "Os veículos dela ficam sem classificação (ao salvar).", confirmar: "Excluir", perigo: true }))) return;
                    setLista((l) => l.filter((x) => x.chave !== c.chave));
                  }}
                />
              );
            },
          },
        ]}
      />
      <Modal
        open={editando != null}
        onClose={() => setEditando(null)}
        titulo={editando?.id || lista.some((x) => x.chave === editando?.chave) ? "Editar classificação" : "Nova classificação"}
        size="md"
        rodape={
          <div className="flex w-full justify-end">
            <Button
              size="sm"
              disabled={!editando?.nome.trim() || (editando ? nomeRepetido(editando) : false)}
              onClick={() => {
                if (!editando) return;
                setLista((l) => (l.some((x) => x.chave === editando.chave) ? l.map((x) => (x.chave === editando.chave ? editando : x)) : [...l, editando]));
                setEditando(null);
              }}
            >
              Aplicar
            </Button>
          </div>
        }
      >
        {editando && (
          <div className="space-y-3">
            <TextField
              label="Nome"
              value={editando.nome}
              maxLength={60}
              error={nomeRepetido(editando) ? "Já existe uma classificação com este nome." : undefined}
              onChange={(e) => setEditando({ ...editando, nome: e.target.value })}
            />
            <ColorField value={editando.cor} onChange={(cor) => setEditando({ ...editando, cor })} />
          </div>
        )}
      </Modal>
      {confirmacao}
    </Modal>
  );
}

/** A PLANILHA do cadastro: ler (.xlsx/.csv), ver o que muda e os avisos, aplicar. */
function PlanilhaVeiculos({
  placas,
  classificacoes,
  unidades,
  onClose,
  onAplicar,
}: {
  placas: ReadonlySet<string>;
  classificacoes: Classificacao[];
  unidades: UnidadeFrota[];
  onClose: () => void;
  onAplicar: (a: AlteracaoVeiculo[]) => Promise<void>;
}) {
  const [lido, setLido] = useState<{ nome: string; alteracoes: AlteracaoVeiculo[]; avisos: string[] } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aplicando, setAplicando] = useState(false);
  async function ler(f: File) {
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const matriz = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: "" });
      setErro(null);
      setLido({ nome: f.name, ...alteracoesDaPlanilha(matriz, { placas, classificacoes, unidades }) });
    } catch {
      setErro("Não foi possível ler a planilha (use .xlsx ou .csv).");
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      titulo="Atualizar veículos pela planilha"
      size="lg"
      rodape={
        <div className="flex w-full items-center justify-between gap-2">
          <span className="text-[12.5px] text-muted">{lido ? `${num(lido.alteracoes.length)} veículos a atualizar` : "Escolha a planilha"}</span>
          <Button
            loading={aplicando}
            disabled={!lido?.alteracoes.length}
            onClick={async () => {
              if (!lido) return;
              setAplicando(true);
              await onAplicar(lido.alteracoes);
              setAplicando(false);
            }}
          >
            Aplicar
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <Dropzone accept=".xlsx,.xls,.csv" onFile={(f) => void ler(f)} titulo={lido ? lido.nome : "Solte a planilha ou toque para escolher"} dica="A 1ª linha é o cabeçalho; a coluna Placa é obrigatória. Célula vazia limpa o campo." icon={<IconUpload className="h-5 w-5" />} />
        {erro && <ErroCarga msg={erro} onTentar={() => setErro(null)} />}
        {lido && lido.avisos.length > 0 && (
          <div className="rounded-card border border-border p-[var(--pad-card)]">
            <p className="mb-1.5 text-[13px] font-semibold text-warn">
              {num(lido.avisos.length)} {lido.avisos.length === 1 ? "aviso" : "avisos"}
            </p>
            <ul className="max-h-48 space-y-0.5 overflow-y-auto text-[12.5px] text-text-2">
              {lido.avisos.slice(0, 200).map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </div>
        )}
        {lido && lido.alteracoes.length > 0 && (
          <DataTable
            density="compact"
            rows={lido.alteracoes}
            getKey={(a) => a.placa}
            exportar={false}
            columns={[
              { key: "placa", header: "Placa", value: (a) => a.placa, render: (a) => a.placa, nowrap: true },
              {
                key: "campos",
                header: "Campos",
                value: (a) => camposAlterados(a),
                render: (a) => <CelulaTexto texto={camposAlterados(a)} />,
                align: "left",
              },
            ]}
          />
        )}
      </div>
    </Modal>
  );
}
