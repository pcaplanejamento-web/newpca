"use client";

import { useUnidadeUnica } from "./UnidadeUnica";
import { type ComponentProps, useEffect, useMemo, useState } from "react";
import { brl, brlCompact, dataIsoBrasilia, num } from "@/lib/format";
import { blocosRelatorioOrcamento, recortarRelatorio, type RelatorioOrcamento } from "@/lib/orcamento-relatorio";
import {
  comparativoPorOrgao,
  comparativoPorUnidade,
  type FaixaComprometimento,
  type LinhaComparativo,
  type LinhaOrgao,
  linhaAcima,
  type OrgaoRef,
  origemDaLinha,
  origemDoOrgao,
  rotuloUnidadeComparativo,
  SEM_VINCULO,
  type UnidadeRef,
  totaisComparativo,
} from "@/lib/orcamento-comparativo";
import { type AusentesVisao, contarAusentes, type VisaoOrcamento } from "@/lib/orcamento-visao";
import { unidadesDoOrcamento, type VinculoOrcamento, vinculosDaVisao } from "@/lib/orcamento-vinculo";
import { semVinculoPorAlvo, vinculosDaLinha } from "@/lib/vinculos-unidade";
import type { LancamentoOrcamentoPca, PlanejadoOrcamentoPca } from "@/lib/pca-espaco";
import { BannersConsulta } from "./BannersConsulta";
import type { AberturaMesa } from "./BannersMesa";
import { AjudaVisoes } from "./AjudaVisoes";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { useComponente } from "./ComponentesPapel";
import { EditorVisaoOrcamento } from "./EditorVisaoOrcamento";
import { Callout } from "./Callout";
import { useQuemExporta } from "./ConfigTabelas";
import { type Column, DataTable } from "./DataTable";
import { IconFile, IconLink, IconSettings } from "./icons";
import { ItemTable } from "./ItemTable";
import { OrcamentoComparativo } from "./OrcamentoComparativo";
import { OrigemDados } from "./OrigemDados";
import { Modal } from "./Modal";
import { Segmented } from "./Segmented";
import { SeletorMultiplo } from "./SeletorMultiplo";
import { SkeletonLinhas } from "./Skeleton";
import { Switch } from "./Switch";
import { KpiStat } from "./KpiStat";
import { StatMini } from "./StatMini";
import { toast } from "./Toast";
import { useGravacaoVinculos } from "./OrcamentoVinculosAba";
import { DicaFlutuante } from "./DicaFlutuante";
import { ResumoSemVinculo, type UnidadeDaLinha, VinculosDaUnidade } from "./VinculosDaUnidade";
import { SeletorVisaoPca, VisaoOrcamentoPca } from "./VisaoOrcamentoPca";

type Filtro = "todas" | "acima" | "dentro";
type Vista = "comparativo" | "unidade";
type Nivel = "unidade" | "orgao";

/** A linha da tabela "PCA × Orçamento": uma UNIDADE (o micro) ou um ÓRGÃO (a soma das unidades dele). */
type LinhaTabela = (LinhaComparativo & { nivel: "unidade"; chave: string }) | (LinhaOrgao & { nivel: "orgao" });

/** Os dados do Comparativo (tabela cruzada) do orçamento do ano — os MESMOS da tela do orçamento. */
export type ComparativoPca = Omit<ComponentProps<typeof OrcamentoComparativo>, "inicio" | "onMudarEdicoes">;

const SEM_VINCULOS: VinculoOrcamento[] = [];

const COR_FAIXA: Record<FaixaComprometimento, string> = {
  ok: "var(--ok)",
  atencao: "var(--warn)",
  acima: "var(--danger)",
  "sem-orcamento": "var(--danger)",
};

export type DadosOrcamentoPca = {
  /** O PCA (fonte protocolo: o item da origem abre o banner da consulta). */
  pcaId: number;
  ano: number | null;
  orcamento: { id: number; nome: string; ano: number } | null;
  visaoNome: string | null;
  bruto: number;
  filtrado: number;
  linhas: LancamentoOrcamentoPca[];
  planejado: PlanejadoOrcamentoPca[];
  unidades: UnidadeRef[];
  /** Os órgãos (a visão "por órgão" = a soma das unidades de cada um). */
  orgaos: OrgaoRef[];
  /** PRÉVIA ligada (Configuração do PCA, só em Preview): os DFDs/protocolos ainda NÃO incorporados no planejado. */
  previa?: { dfds: number; protocolos: number } | null;
  /** A visão gravada no PCA (`null` = orçamento inteiro). */
  visaoId?: number | null;
  /** Os valores da visão que o orçamento atual não traz (QDD reenviado). */
  ausentes?: AusentesVisao;
};

type Planilha = NonNullable<PlanejadoOrcamentoPca["planilha"]> & { itens: number; valor: number };

const COLS_LANCAMENTO: Column<LancamentoOrcamentoPca>[] = [
  { key: "orgao", header: "Órgão", align: "left", minWidth: 180, value: (l) => l.orgao ?? "—", render: (l) => <span className="line-clamp-2">{l.orgao ?? "—"}</span> },
  { key: "unidade", header: "Unidade no CUBO", align: "left", minWidth: 180, value: (l) => l.unidade ?? "—", render: (l) => <span className="line-clamp-2">{l.unidade ?? "—"}</span> },
  { key: "elemento", header: "Elemento", align: "left", minWidth: 200, value: (l) => l.nomeElemento ?? "—", render: (l) => <span className="line-clamp-2">{l.nomeElemento ?? "—"}</span> },
  { key: "codigo", header: "Código", nowrap: true, value: (l) => l.codigoElemento ?? "—", render: (l) => <span className="font-mono text-[12px]">{l.codigoElemento ?? "—"}</span> },
  { key: "valor", header: "Dotação", align: "right", nowrap: true, filter: "range", numero: (l) => l.valor, render: (l) => <span className="font-semibold tabular-nums">{brl(l.valor)}</span> },
];

const COLS_PLANILHA: Column<Planilha>[] = [
  { key: "codigo", header: "Código", nowrap: true, value: (p) => p.codigo, render: (p) => <span className="font-mono text-[12px] font-semibold">{p.codigo}</span> },
  { key: "nome", header: "Planilha", align: "left", minWidth: 200, value: (p) => p.nome ?? "—", render: (p) => <span className="line-clamp-2">{p.nome ?? "—"}</span> },
  { key: "itens", header: "Itens", nowrap: true, filter: "range", numero: (p) => p.itens, render: (p) => num(p.itens) },
  { key: "valor", header: "Valor", align: "right", nowrap: true, filter: "range", numero: (p) => p.valor, render: (p) => <span className="font-semibold tabular-nums">{brl(p.valor)}</span> },
];

type AbaOrigem = "orcamento" | "pca";

/** ORIGEM de uma linha do comparativo: os lançamentos do CUBO e as contratações do PCA que formam os números. */
function OrigemLinha({ dados, aberta, onClose }: { dados: DadosOrcamentoPca; aberta: LinhaTabela | null; onClose: () => void }) {
  const [aba, setAba] = useState<AbaOrigem>("orcamento");
  const [item, setItem] = useState<AberturaMesa | null>(null);
  // Mantém a última linha enquanto o banner fecha (animação) e volta à aba Orçamento a cada linha nova.
  const [linha, setLinha] = useState<LinhaTabela | null>(aberta);
  useEffect(() => {
    if (!aberta) return;
    setLinha(aberta);
    setAba("orcamento");
  }, [aberta]);
  const origem = useMemo(
    () =>
      !linha
        ? { planejado: [], orcamento: [] }
        : linha.nivel === "orgao"
          ? origemDoOrgao(linha.chave, dados.planejado, dados.linhas, dados.unidades)
          : origemDaLinha(linha.unidadeId, dados.planejado, dados.linhas, dados.unidades),
    [linha, dados],
  );
  const itens = origem.planejado.flatMap((p) => (p.item ? [p.item] : []));
  const planilhas: Planilha[] = origem.planejado.flatMap((p) => (p.planilha ? [{ ...p.planilha, itens: p.itens, valor: p.valor }] : []));
  const sem = linha?.chave === "sem";
  const recorte = !linha
    ? ""
    : linha.nivel === "unidade"
      ? rotuloUnidadeComparativo(linha)
      : sem
        ? linha.sigla
        : `${linha.sigla}${linha.nome && linha.nome !== linha.sigla ? ` — ${linha.nome}` : ""} (soma de ${num(linha.unidades)} unidade(s))`;
  return (
    <>
      <OrigemDados
        aberto={aberta != null}
        onClose={onClose}
        titulo="Comparativo Orçamento × Contratações"
        recorte={recorte}
        resumo={[
          { label: "Orçamento para o PCA", value: brl(linha?.orcamento ?? 0), hint: `${num(origem.orcamento.length)} lançamento(s)` },
          { label: "Contratações do PCA", value: brl(linha?.planejado ?? 0), hint: `${num(linha?.contratacoes ?? 0)} item(ns)` },
          { label: "Diferença", value: brl(linha?.diferenca ?? 0) },
          { label: "Porcentagem", value: linha?.percentual == null ? "—" : `${(linha.percentual * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%` },
        ]}
        fonte={
          <>
            <b>Orçamento:</b>{" "}
            {dados.orcamento ? `${dados.orcamento.nome} (${dados.orcamento.ano})` : `nenhum CUBO de ${dados.ano} importado`}
            {dados.visaoNome ? `, filtrado pela visão "${dados.visaoNome}"` : ", sem visão (orçamento inteiro)"} — os lançamentos chegam à
            unidade pelos Vínculos (Orçamento → Vínculos). <b>Contratações:</b>{" "}
            {dados.planejado.some((p) => p.planilha) ? "as planilhas importadas neste PCA." : "os itens ATIVOS dos DFDs incorporados a este PCA."}
          </>
        }
        avisos={
          sem
            ? [
                `"${SEM_VINCULO}" reúne os lançamentos cuja unidade do CUBO não está vinculada a uma unidade do sistema e as contratações sem unidade — vincule em Orçamento → Vínculos.`,
              ]
            : undefined
        }
      >
        <Segmented<AbaOrigem>
          value={aba}
          onChange={setAba}
          ariaLabel="Origem"
          options={[
            { value: "orcamento", label: `Orçamento (${num(origem.orcamento.length)})` },
            { value: "pca", label: `Contratações do PCA (${num(planilhas.length || itens.length)})` },
          ]}
        />
        <div key={aba} className="animate-cat-morph">
          {aba === "orcamento" ? (
            <DataTable
              columns={COLS_LANCAMENTO}
              rows={origem.orcamento}
              getKey={(l) => l.id}
              pageSize={20}
              density="compact"
              minWidth={860}
              resumo={(ls) => `${num(ls.length)} lançamento(s) · ${brl(ls.reduce((s, l) => s + l.valor, 0))}`}
            />
          ) : planilhas.length ? (
            <DataTable
              columns={COLS_PLANILHA}
              rows={planilhas}
              getKey={(p) => p.id}
              pageSize={20}
              minWidth={560}
              resumo={(ps) => `${num(ps.length)} planilha(s) · ${brl(ps.reduce((s, p) => s + p.valor, 0))}`}
            />
          ) : (
            <ItemTable
              rows={itens}
              showUnidade={sem || linha?.nivel === "orgao"}
              origem
              onRowClick={(r) => r.dfdId != null && setItem({ tipo: "item", dfdId: r.dfdId, itemId: r.id, item: { item: r.itemNumero ?? null, codigo: r.idProduto } })}
              ativo={item?.tipo === "item" ? item.itemId : null}
            />
          )}
        </div>
      </OrigemDados>
      <BannersConsulta pcaId={dados.pcaId} abrir={item} onFechar={() => setItem(null)} />
    </>
  );
}

/** Barra de porcentagem do comparativo (verde < 90% · âmbar 90–100% · vermelho > 100%). */
/**
 * "Relatório da composição" (PDF, A4): busca no servidor o que a VISÃO considera (igual para todas as unidades), o que
 * cada VÍNCULO atribui a cada unidade (unidade do CUBO + ações) e o que fica de fora, e gera o documento didático
 * (`blocosRelatorioOrcamento` → `baixarDocumentoPdf`). O código do PDF só é carregado no clique.
 */
function BotaoRelatorioComposicao({ pcaId }: { pcaId: number }) {
  const [aberto, setAberto] = useState(false);
  const [rel, setRel] = useState<RelatorioOrcamento | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [modo, setModo] = useState<"todas" | "escolher">("todas");
  const [escolhidas, setEscolhidas] = useState<string[]>([]);
  const [separados, setSeparados] = useState(false);
  const quem = useQuemExporta();

  async function abrir() {
    setAberto(true);
    setCarregando(true);
    try {
      const r = await fetch(`/api/pca/${pcaId}/orcamento/relatorio`);
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; relatorio?: RelatorioOrcamento };
      if (!r.ok || !j.ok || !j.relatorio) throw new Error(j.error ?? "Não foi possível montar o relatório.");
      setRel(j.relatorio);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível montar o relatório.");
      setAberto(false);
    } finally {
      setCarregando(false);
    }
  }

  const opcoes = useMemo(
    () => (rel?.unidades ?? []).map((u) => ({ valor: String(u.id), rotulo: `${u.sigla} — ${u.nome}`, detalhe: `${u.orgao ?? "Sem órgão"} · ${brl(u.orcamento)}` })),
    [rel],
  );
  const ids = modo === "todas" ? [] : escolhidas.map(Number);
  const qtd = modo === "todas" ? 1 : separados ? ids.length : ids.length ? 1 : 0;

  async function gerar() {
    if (!rel || gerando || !qtd) return;
    setGerando(true);
    try {
      const [{ baixarDocumentoPdf }, { nomeArquivoPdf }] = await Promise.all([import("@/lib/documento-pdf"), import("@/lib/exportar-pdf-core")]);
      const dia = dataIsoBrasilia(new Date().toISOString());
      const lotes = modo === "todas" ? [rel] : separados ? ids.map((id) => recortarRelatorio(rel, [id])) : [recortarRelatorio(rel, ids)];
      for (const [i, r] of lotes.entries()) {
        const sufixo = r.recorte ? ` - ${r.recorte.length > 3 ? `${r.recorte.length} unidades` : r.recorte.join(", ")}` : "";
        if (lotes.length > 1) toast.progresso("Gerando os relatórios", i, lotes.length, r.recorte?.join(", "));
        await baixarDocumentoPdf(
          nomeArquivoPdf(`Composição do orçamento - ${r.pca.nome}${sufixo}`, dia),
          { titulo: `Composição do orçamento por unidade · ${r.pca.nome}${sufixo}`, blocos: blocosRelatorioOrcamento(r) },
          { usuario: quem },
        );
      }
      toast.success(lotes.length > 1 ? `${lotes.length} relatórios gerados.` : "Relatório gerado.");
      setAberto(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar o relatório.");
    } finally {
      setGerando(false);
    }
  }

  return (
    <>
      <Button size="sm" variant="secondary" icon={<IconFile className="h-4 w-4" />} loading={carregando} onClick={abrir}>
        Relatório da composição (PDF)
      </Button>
      <Modal
        open={aberto}
        onClose={() => !gerando && setAberto(false)}
        titulo="Relatório da composição do orçamento"
        size="md"
        bloqueado={gerando}
        rodape={
          <div className="flex w-full items-center justify-end gap-2">
            <Button size="sm" variant="secondary" onClick={() => setAberto(false)} disabled={gerando}>
              Cancelar
            </Button>
            <Button size="sm" icon={<IconFile className="h-4 w-4" />} loading={gerando} disabled={!rel || !qtd} onClick={gerar}>
              {qtd > 1 ? `Gerar ${qtd} PDFs` : "Gerar PDF"}
            </Button>
          </div>
        }
      >
        {!rel ? (
          <SkeletonLinhas />
        ) : (
          <div className="space-y-[var(--gap-block)]">
            <Segmented<"todas" | "escolher">
              value={modo}
              onChange={setModo}
              ariaLabel="Unidades do relatório"
              options={[
                { value: "todas", label: `Todas as unidades (${rel.unidades.length})` },
                { value: "escolher", label: "Escolher unidades" },
              ]}
            />
            {modo === "todas" ? (
              <p className="text-[13px] text-muted">O relatório completo: a visão, todas as unidades com vínculo e o que fica de fora do orçamento.</p>
            ) : (
              <>
                <SeletorMultiplo rotulo="Unidades" opcoes={opcoes} selecionados={escolhidas} onChange={setEscolhidas} textoVazio="Nenhuma" suspenso />
                <Switch
                  checked={separados}
                  onChange={setSeparados}
                  label="Um PDF para cada unidade"
                  dica="Ligado: um arquivo por unidade escolhida. Desligado: um arquivo só com as escolhidas."
                />
                <p className="text-[13px] text-muted">
                  {ids.length
                    ? separados
                      ? `${ids.length} arquivo(s), um por unidade.`
                      : `Um arquivo com ${ids.length} unidade(s).`
                    : "Escolha ao menos uma unidade."}
                </p>
              </>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}

/** A cor do TEXTO da linha no comparativo = a da Diferença (negativa = vermelho, senão verde) — a tela e o PDF. */
const corDaDiferenca = (l: Pick<LinhaComparativo, "diferenca">) => (l.diferenca < 0 ? "var(--danger)" : "var(--ok)");

function BarraPct({ l }: { l: Pick<LinhaComparativo, "percentual" | "planejado" | "faixa" | "diferenca"> }) {
  if (l.percentual == null) return <span className="text-xs" style={{ color: corDaDiferenca(l) }}>{l.planejado > 0 ? "sem orçamento" : "—"}</span>;
  const w = Math.min(100, l.percentual * 100);
  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-2">
        <span className="block h-full rounded-full" style={{ width: `${w}%`, background: COR_FAIXA[l.faixa] }} />
      </span>
      <span className="tabular-nums" style={{ color: corDaDiferenca(l) }}>{(l.percentual * 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%</span>
    </span>
  );
}

/**
 * Aba ORÇAMENTO do PCA — enxuta: os KPIs (a dotação do CUBO do MESMO ano, filtrada pela visão da Configuração, × o
 * planejado no PCA — os itens incorporados ativos) e, abaixo, o COMPARATIVO em duas vistas: o **PCA × Orçamento** por
 * unidade (a primeira, aberta) e a tabela cruzada da tela do orçamento (`OrcamentoComparativo`, abrindo na visão do PCA) (os lançamentos chegam à
 * unidade pelos Vínculos do Orçamento; o que não tem vínculo vira "Sem vínculo"). Sem orçamento do ano, só o por unidade.
 */
export function OrcamentoPca({
  dados,
  comparativo = null,
  podeExportar = true,
  podePublicar = false,
  visoes = [],
  podeConfigurarOrcamento = false,
}: {
  dados: DadosOrcamentoPca;
  comparativo?: ComparativoPca | null;
  /** As visões salvas (globais) — a engrenagem escolhe/edita a do PCA. */
  visoes?: VisaoOrcamento[];
  /** Configura o ORÇAMENTO: edita/cria a visão pela engrenagem e os VÍNCULOS pelo lápis da linha (escolher a visão do PCA =
   * `podePublicar`, Configurar no PCA). */
  podeConfigurarOrcamento?: boolean;
  /** O papel exporta no PCA (o XLSX do comparativo). */
  podeExportar?: boolean;
  /** O papel CONFIGURA o PCA: publica edições do layout do comparativo para todos. */
  podePublicar?: boolean;
}) {
  const [vista, setVista] = useState<Vista>("unidade");
  // As edições salvas do Comparativo ficam AQUI (trocar de vista remonta a tabela — ela volta com as edições novas).
  const [edicoesComp, setEdicoesComp] = useState(() => (comparativo ? { lista: comparativo.edicoes, padroes: comparativo.padroes } : null));
  // A tela recarregou (router.refresh) com edições novas do servidor — elas valem.
  const [edicoesServidor, setEdicoesServidor] = useState(comparativo?.edicoes);
  if (comparativo && edicoesServidor !== comparativo.edicoes) {
    setEdicoesServidor(comparativo.edicoes);
    setEdicoesComp({ lista: comparativo.edicoes, padroes: comparativo.padroes });
  }
  const [engrenagem, setEngrenagem] = useState(false);
  // As ações da lista da Visão (na barra) abrem o editor da engrenagem direto.
  const [editorPedido, setEditorPedido] = useState<{ alvo: VisaoOrcamento | "nova"; n: number } | null>(null);
  const libera = useComponente();
  // A visão aberta SÓ PARA CONSULTA (o olho ao lado da Visão): filtros e vínculos travados.
  const [visaoVista, setVisaoVista] = useState<VisaoOrcamento | null>(null);
  const linhasVisao = useMemo(() => comparativo?.itens ?? null, [comparativo]);
  const ausentes = contarAusentes(dados.ausentes ?? []);
  // VÍNCULOS por linha (o lápis): as unidades do CUBO do orçamento do ano + a gravação da aba Vínculos.
  const unidadesCubo = useMemo(() => (comparativo ? unidadesDoOrcamento(comparativo.itens) : []), [comparativo]);
  const gravacao = useGravacaoVinculos(comparativo?.vinculos ?? SEM_VINCULOS, visoes);
  // Os vínculos que VALEM na visão do PCA (os próprios dela; nas demais unidades, o padrão) — editar pergunta onde salvar.
  const visaoPca = gravacao.visoesAtuais.find((v) => v.id === dados.visaoId) ?? null;
  const efetivos = useMemo(() => vinculosDaVisao(gravacao.atuais, visaoPca), [gravacao.atuais, visaoPca]);
  const [vinculosDe, setVinculosDe] = useState<UnidadeDaLinha | null>(null);
  // Os vínculos aparecem para TODOS (consulta); só quem Configura o Orçamento altera.
  const editaVinculos = comparativo != null;
  // Ações do orçamento SEM vínculo (como na aba Vínculos): por unidade cadastrada — as das unidades do orçamento ligadas a
  // ela — e de todo o orçamento (a linha "Sem vínculo"). Recalculadas na hora a cada gravação (a lista já gravada).
  const semVinculoPorLinha = useMemo(() => {
    const porAlvo = semVinculoPorAlvo(unidadesCubo, efetivos);
    const todas = vinculosDaLinha(unidadesCubo, efetivos, null).semVinculo;
    return { porAlvo, todas };
  }, [unidadesCubo, efetivos]);
  const [filtro, setFiltro] = useState<Filtro>("todas");
  // A UNIDADE é o micro (recebe DFDs e orçamento); o ÓRGÃO é a soma das unidades dele.
  const [nivelEscolhido, setNivel] = useState<Nivel>("unidade");
  const [aberta, setAberta] = useState<LinhaTabela | null>(null);
  const porUnidade = useMemo(() => comparativoPorUnidade(dados.planejado, dados.linhas, dados.unidades), [dados]);
  // UMA unidade no cabeçalho: "Por órgão" e a coluna Órgão repetiriam a mesma linha — saem.
  const unica = useUnidadeUnica("pca") != null && porUnidade.filter((l) => l.unidadeId != null).length <= 1;
  const nivel: Nivel = unica ? "unidade" : nivelEscolhido;
  const linhas = useMemo<LinhaTabela[]>(
    () =>
      nivel === "orgao"
        ? comparativoPorOrgao(porUnidade, dados.orgaos ?? []).map((l) => ({ ...l, nivel: "orgao" as const }))
        : porUnidade.map((l) => ({ ...l, nivel: "unidade" as const, chave: l.unidadeId == null ? "sem" : `u${l.unidadeId}` })),
    [nivel, porUnidade, dados.orgaos],
  );
  const t = totaisComparativo(porUnidade);
  // Os detalhes das KPIs, sobre as MESMAS linhas do comparativo (a soma bate com a tabela).
  const ind = useMemo(() => {
    const comUnidade = porUnidade.filter((l) => l.unidadeId != null);
    const semVinculo = porUnidade.filter((l) => l.unidadeId == null).reduce((s, l) => s + l.orcamento, 0);
    const faixas = { ok: 0, atencao: 0, acima: 0 };
    for (const l of comUnidade) {
      if (l.orcamento <= 0 && l.planejado <= 0) continue;
      if (linhaAcima(l)) faixas.acima++;
      else if (l.faixa === "atencao") faixas.atencao++;
      else if (l.faixa === "ok") faixas.ok++;
    }
    const deficits = comUnidade.filter((l) => l.diferenca < 0);
    return {
      semVinculo,
      contratacoes: porUnidade.reduce((s, l) => s + l.contratacoes, 0),
      unidadesComPlanejado: porUnidade.filter((l) => l.planejado > 0).length,
      planejadoSemOrcamento: porUnidade.filter((l) => !(l.orcamento > 0)).reduce((s, l) => s + l.planejado, 0),
      comSaldo: comUnidade.filter((l) => l.orcamento > 0 && l.diferenca >= 0).length,
      comDeficit: deficits.length,
      somaDeficits: deficits.reduce((s, l) => s + l.diferenca, 0),
      faixas,
    };
  }, [porUnidade]);
  const acima = linhas.filter(linhaAcima);
  const vis = filtro === "todas" ? linhas : filtro === "acima" ? acima : linhas.filter((l) => !linhaAcima(l));

  const colNome: Column<LinhaTabela> =
    nivel === "orgao"
      ? {
          key: "orgao",
          header: "Órgão",
          align: "left",
          minWidth: 220,
          value: (l) => (l.nome && l.nome !== l.sigla ? `${l.sigla} — ${l.nome}` : l.sigla),
          render: (l) => (
            <span className="flex min-w-0 flex-col items-start leading-tight" title={l.nome}>
              <span className="font-semibold text-text">{l.sigla}</span>
              {l.nome && l.nome !== l.sigla && <span className="line-clamp-1 text-[12px] text-muted">{l.nome}</span>}
            </span>
          ),
        }
      : {
          key: "unidade",
          header: "Unidade",
          align: "left",
          minWidth: 240,
          value: (l) => (l.nivel === "unidade" ? rotuloUnidadeComparativo(l) : l.sigla),
          corPdf: corDaDiferenca,
          render: (l) => (
            <span
              className="flex min-w-0 flex-col items-start leading-tight"
              style={{ color: corDaDiferenca(l) }}
              title={l.nivel === "unidade" ? rotuloUnidadeComparativo(l) : l.nome}
            >
              <span className="flex items-center gap-1.5">
                <span className="font-semibold">{l.sigla}</span>
                {l.nivel === "unidade" && l.oculta && <Badge tone="slate">Oculta</Badge>}
              </span>
              {l.chave !== "sem" && <span className="line-clamp-1 text-[12px]">{l.nome}</span>}
            </span>
          ),
        };
  const colLado: Column<LinhaTabela> =
    nivel === "orgao"
      ? {
          key: "unidades",
          header: "Unidades",
          nowrap: true,
          filter: "range",
          formatarFaixa: num,
          numero: (l) => (l.nivel === "orgao" ? l.unidades : 1),
          corPdf: corDaDiferenca,
          render: (l) => <span style={{ color: corDaDiferenca(l) }}>{num(l.nivel === "orgao" ? l.unidades : 1)}</span>,
        }
      : { key: "orgaoSigla", header: "Órgão", nowrap: true, value: (l) => l.orgaoSigla ?? "—", render: (l) => <span className="text-text-2">{l.orgaoSigla ?? "—"}</span> };

  const cols: Column<LinhaTabela>[] = [
    colNome,
    ...(unica ? [] : [colLado]),
    // Cores (tela e PDF): o ORÇAMENTO em azul; as demais no tom da Diferença; o Órgão como está.
    {
      key: "contratacoes",
      header: "Contratações",
      nowrap: true,
      filter: "range",
      numero: (l) => l.contratacoes,
      formatarFaixa: num,
      corPdf: corDaDiferenca,
      render: (l) => <span style={{ color: corDaDiferenca(l) }}>{num(l.contratacoes)}</span>,
    },
    {
      key: "planejado",
      header: "Contratações do PCA",
      align: "right",
      nowrap: true,
      filter: "range",
      numero: (l) => l.planejado,
      corPdf: corDaDiferenca,
      render: (l) => <span style={{ color: corDaDiferenca(l) }}>{brl(l.planejado)}</span>,
    },
    {
      key: "orcamento",
      header: "Orçamento para o PCA",
      align: "right",
      nowrap: true,
      filter: "range",
      numero: (l) => l.orcamento,
      corPdf: () => "var(--accent)",
      render: (l) => <span className="text-accent">{brl(l.orcamento)}</span>,
    },
    {
      key: "diferenca",
      header: "Diferença",
      align: "right",
      nowrap: true,
      filter: "range",
      numero: (l) => l.diferenca,
      corPdf: corDaDiferenca,
      render: (l) => <span className="font-semibold" style={{ color: corDaDiferenca(l) }}>{brl(l.diferenca)}</span>,
    },
    {
      key: "pct",
      header: "Porcentagem",
      nowrap: true,
      filter: "range",
      total: false, numero: (l) => l.percentual,
      formatarFaixa: (n) => `${(n * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`,
      corPdf: corDaDiferenca,
      render: (l) => <BarraPct l={l} />,
    },
  ];
  // A coluna VÍNCULOS (por unidade): abre o banner com os vínculos da linha; as ações sem vínculo ficam em destaque.
  if (editaVinculos && nivel === "unidade")
    cols.push({
      key: "vinculos",
      header: "Vínculos",
      filter: "none",
      nowrap: true,
      render: (l) => {
        if (l.nivel !== "unidade") return null;
        const lista = l.unidadeId == null ? semVinculoPorLinha.todas : (semVinculoPorLinha.porAlvo.get(l.unidadeId) ?? []);
        const pend = lista.reduce((s, p) => s + p.acoes.length, 0);
        const rotulo = l.unidadeId == null ? "Vincular as ações sem vínculo" : `Vínculos de ${l.sigla}`;
        const botao = (
          <Button
            size="xs"
            variant={pend > 0 ? "secondary" : "ghost"}
            icon={<IconLink className="h-4 w-4" />}
            aria-label={pend > 0 ? `${rotulo} — ${num(pend)} ação(ões) sem vínculo` : rotulo}
            title={pend > 0 ? undefined : rotulo}
            onClick={(e) => {
              e.stopPropagation();
              setVinculosDe({ id: l.unidadeId, sigla: l.sigla, nome: l.nome });
            }}
          >
            {pend > 0 ? <span style={{ color: "var(--warn)" }}>{num(pend)} sem vínculo</span> : undefined}
          </Button>
        );
        // Com o mouse, a dica LISTA quem está sem vínculo (a unidade do orçamento e as ações, com o valor).
        return pend > 0 ? <DicaFlutuante conteudo={<ResumoSemVinculo titulo={rotulo} lista={lista} />}>{botao}</DicaFlutuante> : botao;
      },
    });

  if (dados.ano == null) return <Callout kind="warn">Defina o ano do PCA (aba Configuração) para cruzar com o orçamento.</Callout>;

  // A troca de vista fica no INÍCIO da linha de controles de cada vista (sem linha a mais).
  const trocaVista = comparativo && (
    <Segmented<Vista>
      value={vista}
      onChange={setVista}
      ariaLabel="Vista do comparativo"
      options={[
        { value: "unidade", label: "PCA × Orçamento", curto: "PCA × Orç." },
        { value: "comparativo", label: "Comparativo" },
      ]}
    />
  );
  const comprometido = t.comprometido;
  // A engrenagem fica no FIM da linha de controles (à direita); o ponto âmbar = a visão tem valores que este orçamento não traz.
  const tituloVisao = ausentes > 0 ? `Visão do orçamento do PCA — ${num(ausentes)} valor(es) da visão fora deste orçamento` : "Visão do orçamento do PCA";
  const botaoVisao = (
    <span className="relative inline-flex">
      <Button size="sm" variant="icon" aria-label={tituloVisao} title={tituloVisao} icon={<IconSettings className="h-4 w-4" />} onClick={() => setEngrenagem(true)} />
      {ausentes > 0 && <span aria-hidden className="pointer-events-none absolute top-1 right-1 h-2 w-2 rounded-full" style={{ background: "var(--warn)" }} />}
    </span>
  );

  return (
    <div className="space-y-[var(--gap-block)]">
      <div className="grid grid-cols-1 gap-[var(--gap-block)] sm:grid-cols-2 xl:grid-cols-4">
        <KpiStat
          realce
          completo
          emLinha
          label={`Dotação ${dados.ano}${dados.visaoNome ? ` · visão ${dados.visaoNome}` : ""}`}
          value={brl(dados.filtrado)}
          detalhes={[
            ...(dados.visaoNome ? [{ rotulo: "Dotação bruta", valor: brl(dados.bruto) }, { rotulo: "Retirado pela visão", valor: brl(dados.bruto - dados.filtrado) }] : []),
            { rotulo: "Sem vínculo", valor: brl(ind.semVinculo), cor: ind.semVinculo > 0 ? "var(--warn)" : undefined },
            { rotulo: "Orçamento", valor: dados.orcamento?.nome ?? "—" },
          ]}
        />
        <KpiStat
          realce
          completo
          emLinha
          label="Planejado no PCA"
          value={brl(t.planejado)}
          cor="var(--sit-finalizado)"
          detalhes={[
            { rotulo: "Contratações", valor: num(ind.contratacoes) },
            { rotulo: "Unidades com contratações", valor: num(ind.unidadesComPlanejado) },
            { rotulo: "Sem orçamento vinculado", valor: brl(ind.planejadoSemOrcamento), cor: ind.planejadoSemOrcamento > 0 ? "var(--danger)" : undefined },
            ...(dados.previa ? [{ rotulo: "Prévia (DFDs)", valor: num(dados.previa.dfds) }] : []),
          ]}
        />
        <KpiStat
          realce
          completo
          emLinha
          label={t.saldo < 0 ? "Déficit" : "Saldo"}
          value={<span style={{ color: t.saldo < 0 ? "var(--danger)" : "var(--ok)" }}>{brl(t.saldo)}</span>}
          cor={t.saldo < 0 ? "var(--danger)" : "var(--ok)"}
          detalhes={[
            { rotulo: "Unidades com saldo", valor: num(ind.comSaldo) },
            { rotulo: "Unidades com déficit", valor: num(ind.comDeficit), cor: ind.comDeficit > 0 ? "var(--danger)" : undefined },
            { rotulo: "Soma dos déficits", valor: brl(ind.somaDeficits), cor: ind.somaDeficits < 0 ? "var(--danger)" : undefined },
          ]}
        />
        <KpiStat
          realce
          completo
          emLinha
          label="Comprometido"
          value={
            <span style={{ color: comprometido == null ? undefined : comprometido > 1 ? "var(--danger)" : comprometido >= 0.9 ? "var(--warn)" : "var(--ok)" }}>
              {comprometido == null ? "—" : `${(comprometido * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`}
            </span>
          }
          cor={comprometido == null ? "var(--muted)" : comprometido > 1 ? "var(--danger)" : comprometido >= 0.9 ? "var(--warn)" : "var(--ok)"}
          detalhes={[
            { rotulo: "Dentro (até 90%)", valor: num(ind.faixas.ok), cor: "var(--ok)" },
            { rotulo: "Atenção (90% a 100%)", valor: num(ind.faixas.atencao), cor: ind.faixas.atencao ? "var(--warn)" : undefined },
            { rotulo: "Acima ou sem orçamento", valor: num(ind.faixas.acima), cor: ind.faixas.acima ? "var(--danger)" : undefined },
          ]}
        />
      </div>

      {comparativo && vista === "comparativo" ? (
        <OrcamentoComparativo
          {...comparativo}
          edicoes={edicoesComp?.lista ?? comparativo.edicoes}
          padroes={edicoesComp?.padroes ?? comparativo.padroes}
          onMudarEdicoes={(lista, padroes) => setEdicoesComp({ lista, padroes })}
          inicio={trocaVista}
          fim={botaoVisao}
          podeExportar={podeExportar}
          podePublicar={podePublicar}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {trocaVista}
            {!unica && <Segmented<Nivel>
              value={nivel}
              onChange={(n) => {
                setNivel(n);
                setAberta(null);
              }}
              ariaLabel="Ver por"
              options={[
                { value: "unidade", label: "Por unidade", curto: "Unidade" },
                { value: "orgao", label: "Por órgão", curto: "Órgão" },
              ]}
            />}
            <Segmented<Filtro>
              value={filtro}
              onChange={setFiltro}
              ariaLabel="Faixa"
              options={[
                { value: "todas", label: `Todas (${linhas.length})` },
                { value: "acima", label: `Acima (${acima.length})` },
                { value: "dentro", label: `Dentro (${linhas.length - acima.length})` },
              ]}
            />
            {visoes.length > 0 && (
              <div className="flex w-full min-w-[12rem] items-center gap-2 sm:w-auto sm:max-w-sm sm:flex-1">
                <div className="min-w-0 flex-1">
                  <SeletorVisaoPca
                    pcaId={dados.pcaId}
                    visaoId={dados.visaoId ?? null}
                    visoes={visoes}
                    podeEscolher
                    itens={linhasVisao}
                    onVer={linhasVisao && libera("pca.visaoDetalhes") ? setVisaoVista : undefined}
                    onEditar={
                      podePublicar && podeConfigurarOrcamento && linhasVisao
                        ? (alvo) => setEditorPedido((p) => ({ alvo, n: (p?.n ?? 0) + 1 }))
                        : undefined
                    }
                  />
                </div>
                <AjudaVisoes botao="sm" />
              </div>
            )}
            <div className="flex items-center gap-2 lg:ml-auto">
              {podeExportar && dados.orcamento && <BotaoRelatorioComposicao pcaId={dados.pcaId} />}
              {botaoVisao}
            </div>
          </div>
          <DataTable
            columns={cols}
            rows={vis}
            getKey={(l) => l.chave}
            scrollInterno
            density="compact"
            minWidth={900}
            exportar={{ nome: `PCA × Orçamento ${dados.ano ?? ""} - por ${nivel === "orgao" ? "órgão" : "unidade"}` }}
            onRowClick={setAberta}
            activeKey={aberta?.chave ?? null}
            vazio={dados.orcamento ? "Nada a comparar nesta visão." : `Nenhum orçamento de ${dados.ano} importado — importe o CUBO em Orçamento para comparar.`}
            resumo={(ls) =>
              `${ls.length} ${nivel === "orgao" ? "órgão(s)" : "unidade(s)"} · PCA ${brl(ls.reduce((s, l) => s + l.planejado, 0))} · orçamento ${brl(ls.reduce((s, l) => s + l.orcamento, 0))}`
            }
          />
        </>
      )}
      <OrigemLinha dados={dados} aberta={aberta} onClose={() => setAberta(null)} />
      {editaVinculos && comparativo && (
        <VinculosDaUnidade
          unidade={vinculosDe}
          unidades={unidadesCubo}
          vinculos={efetivos}
          alvos={comparativo.alvos}
          contexto={{ visoes: gravacao.visoesAtuais, visaoId: visaoPca?.id ?? null }}
          onUsarPadrao={visaoPca ? (chave) => gravacao.usarPadrao(visaoPca.id, chave) : undefined}
          orcamento={dados.orcamento ? `${dados.orcamento.nome} (${dados.orcamento.ano})` : String(dados.ano ?? "")}
          salvando={gravacao.salvando}
          erro={gravacao.erro}
          onCriar={gravacao.criar}
          onEditar={gravacao.editar}
          onExcluir={gravacao.excluir}
          somenteLeitura={!podeConfigurarOrcamento}
          onFechar={() => {
            setVinculosDe(null);
            gravacao.limparErro();
          }}
        />
      )}
      {linhasVisao && (
        <EditorVisaoOrcamento
          aberta={visaoVista}
          itens={linhasVisao}
          podeEditar={false}
          vinculos={comparativo?.vinculos}
          alvos={comparativo?.alvos}
          visoes={gravacao.visoesAtuais}
          onFechar={() => setVisaoVista(null)}
          onSalva={() => setVisaoVista(null)}
        />
      )}
      {(
        <VisaoOrcamentoPca
          pcaId={dados.pcaId}
          aberto={engrenagem}
          onFechar={() => setEngrenagem(false)}
          visaoId={dados.visaoId ?? null}
          visoes={visoes}
          itens={linhasVisao}
          vinculos={comparativo?.vinculos}
          alvos={comparativo?.alvos}
          podeEditarVisao={podeConfigurarOrcamento}
          editorPedido={editorPedido}
        />
      )}
    </div>
  );
}
