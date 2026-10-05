"use client";

import Link from "next/link";
import { type ComponentProps, useEffect, useMemo, useState } from "react";
import { brl, brlCompact, dataIsoBrasilia, num } from "@/lib/format";
import { blocosRelatorioOrcamento, type RelatorioOrcamento } from "@/lib/orcamento-relatorio";
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
  siglasDivididas,
  type UnidadeRef,
  totaisComparativo,
} from "@/lib/orcamento-comparativo";
import { type AusentesVisao, contarAusentes, type VisaoOrcamento } from "@/lib/orcamento-visao";
import type { LancamentoOrcamentoPca, PlanejadoOrcamentoPca } from "@/lib/pca-espaco";
import { BannersConsulta } from "./BannersConsulta";
import type { AberturaMesa } from "./BannersMesa";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { useQuemExporta } from "./ConfigTabelas";
import { type Column, DataTable } from "./DataTable";
import { IconFile, IconInfo, IconSettings } from "./icons";
import { ItemTable } from "./ItemTable";
import { OrcamentoComparativo } from "./OrcamentoComparativo";
import { OrigemDados } from "./OrigemDados";
import { Segmented } from "./Segmented";
import { StatMini } from "./StatMini";
import { toast } from "./Toast";
import { VisaoOrcamentoPca } from "./VisaoOrcamentoPca";

type Filtro = "todas" | "acima" | "dentro";
type Vista = "comparativo" | "unidade";
type Nivel = "unidade" | "orgao";

/** A linha da tabela "PCA × Orçamento": uma UNIDADE (o micro) ou um ÓRGÃO (a soma das unidades dele). */
type LinhaTabela = (LinhaComparativo & { nivel: "unidade"; chave: string }) | (LinhaOrgao & { nivel: "orgao" });

/** Os dados do Comparativo (tabela cruzada) do orçamento do ano — os MESMOS da tela do orçamento. */
export type ComparativoPca = Omit<ComponentProps<typeof OrcamentoComparativo>, "inicio" | "onMudarEdicoes">;

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
  const [gerando, setGerando] = useState(false);
  const quem = useQuemExporta();
  async function gerar() {
    if (gerando) return;
    setGerando(true);
    try {
      const r = await fetch(`/api/pca/${pcaId}/orcamento/relatorio`);
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; relatorio?: RelatorioOrcamento };
      if (!r.ok || !j.ok || !j.relatorio) throw new Error(j.error ?? "Não foi possível montar o relatório.");
      const rel = j.relatorio;
      const [{ baixarDocumentoPdf }, { nomeArquivoPdf }] = await Promise.all([import("@/lib/documento-pdf"), import("@/lib/exportar-pdf-core")]);
      const titulo = `Composição do orçamento por unidade · ${rel.pca.nome}`;
      await baixarDocumentoPdf(nomeArquivoPdf(`Composição do orçamento - ${rel.pca.nome}`, dataIsoBrasilia(new Date().toISOString())), {
        titulo,
        blocos: blocosRelatorioOrcamento(rel),
      }, { usuario: quem });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar o relatório.");
    } finally {
      setGerando(false);
    }
  }
  return (
    <Button size="sm" variant="secondary" className="ml-auto" icon={<IconFile className="h-4 w-4" />} loading={gerando} onClick={gerar}>
      Relatório da composição (PDF)
    </Button>
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
  podeEditarVisao = false,
}: {
  dados: DadosOrcamentoPca;
  comparativo?: ComparativoPca | null;
  /** As visões salvas (globais) — a engrenagem escolhe/edita a do PCA. */
  visoes?: VisaoOrcamento[];
  /** Configura o ORÇAMENTO: edita/cria a visão pela engrenagem (escolher a do PCA = `podePublicar`, Configurar no PCA). */
  podeEditarVisao?: boolean;
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
  const linhasVisao = useMemo(() => comparativo?.itens ?? null, [comparativo]);
  const ausentes = contarAusentes(dados.ausentes ?? []);
  const [filtro, setFiltro] = useState<Filtro>("todas");
  // A UNIDADE é o micro (recebe DFDs e orçamento); o ÓRGÃO é a soma das unidades dele.
  const [nivel, setNivel] = useState<Nivel>("unidade");
  const [aberta, setAberta] = useState<LinhaTabela | null>(null);
  const porUnidade = useMemo(() => comparativoPorUnidade(dados.planejado, dados.linhas, dados.unidades), [dados]);
  const divididas = useMemo(() => siglasDivididas(porUnidade), [porUnidade]);
  const linhas = useMemo<LinhaTabela[]>(
    () =>
      nivel === "orgao"
        ? comparativoPorOrgao(porUnidade, dados.orgaos ?? []).map((l) => ({ ...l, nivel: "orgao" as const }))
        : porUnidade.map((l) => ({ ...l, nivel: "unidade" as const, chave: l.unidadeId == null ? "sem" : `u${l.unidadeId}` })),
    [nivel, porUnidade, dados.orgaos],
  );
  const t = totaisComparativo(porUnidade);
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
    colLado,
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
  const botaoVisao = podePublicar && (
    <Button
      size="sm"
      variant="icon"
      aria-label="Visão do orçamento do PCA"
      title="Visão do orçamento do PCA"
      icon={<IconSettings className="h-4 w-4" />}
      onClick={() => setEngrenagem(true)}
    />
  );

  return (
    <div className="space-y-[var(--gap-block)]">
      {!dados.orcamento && (
        <Callout kind="warn" icon={<IconInfo className="h-4 w-4" />}>
          Nenhum orçamento de {dados.ano} importado — importe o CUBO em Orçamento para comparar.
        </Callout>
      )}
      {dados.previa && (
        <Callout kind="info" icon={<IconInfo className="h-4 w-4" />}>
          <b>Prévia do PCA</b> — o planejado inclui {num(dados.previa.dfds)} DFD(s) de {num(dados.previa.protocolos)} protocolo(s) ainda NÃO
          incorporados (enviados à Mesa do PCA e marcados na Mesa do sistema). Só no painel, com o PCA em Preview.
        </Callout>
      )}
      {ausentes > 0 && (
        <Callout kind="warn" icon={<IconInfo className="h-4 w-4" />}>
          A visão <b>{dados.visaoNome}</b> tem {num(ausentes)} valor(es) que o orçamento atual não traz (o QDD foi reenviado ou o texto
          mudou) — eles não contam nada:{" "}
          {(dados.ausentes ?? []).map((a) => `${a.rotulo}: ${a.valores.join("; ")}`).join(" · ")}.
          {podePublicar && (
            <>
              {" "}
              <button type="button" className="font-semibold text-accent underline-offset-2 hover:underline" onClick={() => setEngrenagem(true)}>
                Ajustar a visão
              </button>
            </>
          )}
        </Callout>
      )}
      {divididas.length > 0 && (
        <Callout kind="warn" icon={<IconInfo className="h-4 w-4" />}>
          <div className="space-y-1">
            {divididas.map((d) => (
              <p key={d.sigla}>
                <b>{d.sigla}</b> está em {num(d.comPlanejado.length + d.comOrcamento.length)} unidades: as contratações estão em{" "}
                <b>{d.comPlanejado.map(rotuloUnidadeComparativo).join("; ")}</b> e o orçamento está vinculado a{" "}
                <b>{d.comOrcamento.map(rotuloUnidadeComparativo).join("; ")}</b>. A unidade recebe os DFDs e o orçamento — vincule o
                CUBO à unidade que recebe os DFDs.
              </p>
            ))}
            {dados.orcamento && (
              <Link
                href={`/painel/orcamento/${dados.orcamento.id}?aba=vinculos`}
                className="inline-flex min-h-11 items-center font-semibold text-accent underline-offset-2 hover:underline lg:min-h-0"
              >
                Corrigir em Orçamento → Vínculos
              </Link>
            )}
          </div>
        </Callout>
      )}
      <div className="grid grid-cols-2 gap-[var(--gap-block)] lg:grid-cols-4">
        <StatMini
          label={`Dotação ${dados.ano}${dados.visaoNome ? ` · ${dados.visaoNome}` : ""}`}
          value={brlCompact(dados.filtrado)}
          hint={`${dados.orcamento ? `${dados.orcamento.nome} · ` : ""}${dados.visaoNome ? `bruta ${brlCompact(dados.bruto)}` : "orçamento inteiro"}`}
        />
        <StatMini label="Planejado no PCA" value={brlCompact(t.planejado)} tone="accent" hint="itens ativos" />
        <StatMini label="Saldo" value={brlCompact(t.saldo)} tone={t.saldo < 0 ? "danger" : "ok"} hint="dotação − planejado" />
        <StatMini
          label="Comprometido"
          value={comprometido == null ? "—" : `${Math.round(comprometido * 100)}%`}
          tone={comprometido == null ? "default" : comprometido > 1 ? "danger" : comprometido >= 0.9 ? "warn" : "ok"}
          hint="planejado ÷ dotação"
        />
      </div>

      {comparativo && vista === "comparativo" ? (
        <OrcamentoComparativo
          {...comparativo}
          edicoes={edicoesComp?.lista ?? comparativo.edicoes}
          padroes={edicoesComp?.padroes ?? comparativo.padroes}
          onMudarEdicoes={(lista, padroes) => setEdicoesComp({ lista, padroes })}
          inicio={
            <>
              {trocaVista}
              {botaoVisao}
            </>
          }
          podeExportar={podeExportar}
          podePublicar={podePublicar}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {trocaVista}
            {botaoVisao}
            <Segmented<Nivel>
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
            />
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
            {podeExportar && dados.orcamento && <BotaoRelatorioComposicao pcaId={dados.pcaId} />}
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
            vazio="Nada a comparar nesta visão."
            resumo={(ls) =>
              `${ls.length} ${nivel === "orgao" ? "órgão(s)" : "unidade(s)"} · PCA ${brl(ls.reduce((s, l) => s + l.planejado, 0))} · orçamento ${brl(ls.reduce((s, l) => s + l.orcamento, 0))}`
            }
          />
        </>
      )}
      <OrigemLinha dados={dados} aberta={aberta} onClose={() => setAberta(null)} />
      {podePublicar && (
        <VisaoOrcamentoPca
          pcaId={dados.pcaId}
          aberto={engrenagem}
          onFechar={() => setEngrenagem(false)}
          visaoId={dados.visaoId ?? null}
          visoes={visoes}
          itens={linhasVisao}
          podeEditarVisao={podeEditarVisao}
        />
      )}
    </div>
  );
}
