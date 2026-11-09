"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { brl, brlCompact, dataBR, num } from "@/lib/format";
import type { ItemUpload, UploadPca } from "@/lib/pca-uploads";
import { type ConfigSubunidades, subunidadeEmMassa } from "@/lib/subunidades-core";
import { useGuardadoNoDesenho } from "@/lib/dados-cliente";
import { linhasDoTexto } from "@/lib/itens-dash-texto";
import { COLUNAS_ESPACOS } from "./CartaoEspacoEsqueleto";
import { EsqueletoTabela } from "./DataTableEsqueleto";
import { CelulaCopiavel } from "./BotaoCopiar";
import { CelulaTexto } from "./CelulaLista";
import { colunaSituacaoNoPca } from "./ColunasItensMesa";
import { CelulaSubunidade, SUB_EM_BRANCO, SUB_NAO_DEFINIDA } from "./EstadoCelula";
import { SelectField } from "./Field";
import { SUBUNIDADE_NO_TOPO } from "./PlanilhaDfds";
import { BarraSelecao, ResumoSelecao } from "./BarraSelecao";
import { type Column, DataTable } from "./DataTable";
import { FilterChip } from "./FilterChip";
import { CartaoEspaco } from "./QuadroCard";
import { Segmented } from "./Segmented";
import { type LeituraPlanilhas, type PlanilhaParseada, parsePlanilhas } from "@/lib/parse-xlsx";
import type { ItemRow } from "@/lib/queries";
import { AvisoFlutuante } from "./AvisoFlutuante";
import { BannerItemPlanilha } from "./BannersConsulta";
import { Button } from "./Button";
import { useConfirmacao } from "./Confirmacao";
import { Dropzone } from "./Dropzone";
import { IconFile, IconNenhum, IconTrash, IconUndo, IconUpload } from "./icons";
import { Progress } from "./Progress";

/** A prévia completa só é baixada quando um arquivo é lido. */
const PreviaPlanilha = dynamic(() => import("./PreviaPlanilha").then((m) => m.PreviaPlanilha), { ssr: false });

/** Linhas por requisição — cada requisição pequena (limites do Worker/D1). */
const CHUNK = 200;

type RespostaUpload = { ok?: boolean; error?: string; uploadId?: number; unidadeId?: number };

async function postar(body: unknown): Promise<RespostaUpload> {
  const res = await fetch("/api/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = (await res.json().catch(() => ({}))) as RespostaUpload;
  if (!res.ok || !j.ok) throw new Error(j.error ?? "Erro ao importar.");
  return j;
}

/**
 * Envia UM arquivo (já lido) como UM upload: cada unidade (LOCAL) em lotes (`/api/upload`: start + append) e, no fim,
 * `fim` (avisa os administradores). O servidor dá o SEQUENCIAL: o informado sobrescreve; sem ele, segue a sequência.
 */
async function enviarArquivo(nome: string, planilhas: PlanilhaParseada[], pcaId: number, onProgresso: (p: number) => void): Promise<number> {
  const total = planilhas.reduce((s, p) => s + p.rows.length, 0);
  if (total === 0) throw new Error("A planilha não tem itens.");
  let uploadId: number | undefined;
  let feitos = 0;
  for (const p of planilhas) {
    let unidadeId: number | undefined;
    for (let i = 0; i < p.rows.length; i += CHUNK) {
      const rows = p.rows.slice(i, i + CHUNK);
      const j =
        unidadeId == null
          ? await postar({ mode: "start", pcaId, uploadId, codigo: p.codigo, municipio: p.municipio, nomeArquivo: nome, rows })
          : await postar({ mode: "append", unidadeId, rows });
      uploadId ??= j.uploadId;
      unidadeId ??= j.unidadeId;
      if (unidadeId == null) throw new Error("A importação não devolveu a planilha criada. Tente de novo.");
      feitos += rows.length;
      onProgresso(Math.round((feitos / total) * 100));
    }
  }
  if (uploadId) await postar({ mode: "fim", uploadId }).catch(() => undefined);
  return total;
}

/** A CAPA 16:9 do card do upload: o arquivo e as unidades que ele trouxe. */
function CapaUpload({ upload }: { upload: UploadPca }) {
  return (
    <div className="relative grid aspect-video place-items-center overflow-hidden rounded-[calc(var(--radius-card)-4px)] bg-accent-soft text-accent">
      <IconFile className="h-10 w-10" />
      <span className="absolute bottom-2 left-2 right-2 truncate text-center text-[11px] font-semibold" title={upload.unidades.join(", ")}>
        {upload.unidades.join(" · ")}
      </span>
    </div>
  );
}

/** As colunas da visão ITENS (o sequencial é sagrado — único no PCA). */
const COLUNAS_ITENS: Column<ItemUpload>[] = [
  {
    key: "seq",
    header: "Seq.",
    nowrap: true,
    numero: (r) => r.sequencial,
    value: (r) => String(r.sequencial ?? ""),
    // O CANCELADO: o nº fica inativo (riscado), como o nº cancelado do item de protocolo na Mesa do PCA.
    render: (r) => (r.canceladoEm ? <span className="tabular-nums text-faint line-through">{r.sequencial ?? "—"}</span> : (r.sequencial ?? "—")),
    total: false,
  },
  colunaSituacaoNoPca<ItemUpload>((r) => ({ situacao: r.canceladoEm ? "Cancelado" : "Ativo", dica: r.canceladoEm ? textoCancelamento(r) : null })),
  { key: "unidade", header: "Unidade", nowrap: true, value: (r) => r.unidade, render: (r) => r.unidade },
  { key: "codigo", header: "Código", nowrap: true, value: (r) => r.codigo ?? "", render: (r) => (r.codigo ? <CelulaCopiavel copiar={r.codigo} rotulo="código">{r.codigo}</CelulaCopiavel> : "—") },
  { key: "produto", header: "Produto", minWidth: 260, value: (r) => r.produto ?? "", render: (r) => <CelulaTexto texto={r.produto ?? "—"} /> },
  { key: "um", header: "Medida", nowrap: true, value: (r) => r.unidadeMedida ?? "", render: (r) => r.unidadeMedida ?? "—" },
  { key: "qtd", header: "Qtd.", nowrap: true, filter: "range", numero: (r) => r.quantidade, formatarFaixa: num, value: (r) => String(r.quantidade ?? 0), render: (r) => num(r.quantidade ?? 0) },
  { key: "vu", header: "Vlr. unit.", align: "right", nowrap: true, filter: "range", numero: (r) => r.valorUnitario, total: false, value: (r) => String(r.valorUnitario ?? 0), render: (r) => brl(r.valorUnitario ?? 0) },
  { key: "vt", header: "Vlr. total", align: "right", nowrap: true, filter: "range", numero: (r) => r.valorTotal, value: (r) => String(r.valorTotal ?? 0), render: (r) => brl(r.valorTotal ?? 0) },
  { key: "class", header: "Classificação", nowrap: true, value: (r) => r.classificacao ?? "", render: (r) => r.classificacao ?? "—" },
  { key: "dominio", header: "Domínio", nowrap: true, value: (r) => r.dominio ?? "", render: (r) => r.dominio ?? "—" },
  { key: "arquivo", header: "Upload", minWidth: 180, value: (r) => r.arquivo ?? "", render: (r) => <CelulaTexto texto={r.arquivo ?? "—"} /> },
];

/** A coluna SUBUNIDADE (`0181`) — o padrão da Mesa: o nome; "Não definida" = a unidade tem subunidades e o item nenhuma;
 * "Em branco" = a unidade da planilha não tem subunidades. */
function colunaSubunidadePlanilha(temSubs: (r: ItemUpload) => boolean): Column<ItemUpload> {
  return {
    key: "subunidade",
    header: "Subunidade",
    nowrap: true,
    noTopo: SUBUNIDADE_NO_TOPO,
    value: (r) => r.subunidade ?? (temSubs(r) ? SUB_NAO_DEFINIDA : SUB_EM_BRANCO),
    render: (r) => (
      <CelulaSubunidade
        nome={r.subunidade}
        falta={temSubs(r)}
        dica={r.subunidade ? undefined : temSubs(r) ? "A unidade da planilha tem subunidades — escolha a do item" : "A unidade da planilha não tem subunidades"}
      />
    ),
  };
}

/** Quem e quando cancelou ("Cancelado em 06/11/2026 por Jhone"). */
const textoCancelamento = (r: ItemUpload) => `Cancelado${r.canceladoEm ? ` em ${dataBR(r.canceladoEm)}` : ""}${r.canceladoPorNome ? ` por ${r.canceladoPorNome}` : ""}`;

/** O resumo da tabela: os itens e o Σ dos ATIVOS (o cancelado não compõe o PCA). */
function resumoItens(l: ItemUpload[]): string {
  const ativos = l.filter((r) => !r.canceladoEm);
  const c = l.length - ativos.length;
  return `${num(l.length)} itens${c ? ` (${num(c)} cancelado${c === 1 ? "" : "s"})` : ""} · ${brl(ativos.reduce((t, r) => t + (r.valorTotal ?? 0), 0))}`;
}

/** A linha da Importação no formato do banner do item de planilha (o mesmo do Dashboard). */
function itemRowDoUpload(r: ItemUpload): ItemRow {
  return {
    id: r.id,
    idProduto: r.codigo,
    sequencial: r.sequencial,
    nomeProduto: r.produto,
    unidadeMedida: r.unidadeMedida,
    quantidade: r.quantidade,
    valorReferencia: r.valorUnitario,
    valorTotal: r.valorTotal,
    classificacao: r.classificacao,
    dominio: r.dominio,
    dataDesejada: r.dataDesejada,
    codigo: r.unidade,
    municipio: r.municipio,
    anual: r.previsaoGenerica != null,
    periodo: r.previsaoGenerica,
    prioridade: r.prioridade,
  };
}

/**
 * Aba IMPORTAÇÃO do PCA: soltar/escolher UMA OU VÁRIAS planilhas (.xlsx — por unidade ou a CONSOLIDADA com a coluna LOCAL)
 * com a PRÉVIA COMPLETA antes de gravar + UM card por UPLOAD (arquivo · unidades · itens · Σ). O SEQUENCIAL é sagrado: o
 * informado sobrescreve o item que já o tinha; sem ele, segue a sequência. Importar e excluir seguem o papel.
 */
export function PlanilhasPca({
  pcaId,
  uploads,
  itensTexto,
  totalItens,
  podeImportar,
  podeExcluir,
  podeEditar = false,
  anoPca = null,
  subunidades = {},
}: {
  pcaId: number;
  uploads: UploadPca[];
  /** Os itens das planilhas (a visão Itens), do sequencial maior ao menor, num texto COMPACTO (`linhasParaTexto`) — lido só
   * no navegador: com milhares de itens, montar a tabela no servidor passava do limite do Worker (erro 1102). */
  itensTexto: string;
  totalItens: number;
  /** O papel importa planilhas no PCA. */
  podeImportar: boolean;
  /** O papel exclui planilhas do PCA. */
  podeExcluir: boolean;
  /** O papel edita os itens das planilhas (tocar na linha abre o banner do item com os cadeados). */
  podeEditar?: boolean;
  /** O ano do PCA (as opções da previsão do item). */
  anoPca?: number | null;
  /** O cadastro de subunidades de cada UNIDADE do sistema das planilhas (`reparticaoId` → config) — a subunidade do item. */
  subunidades?: Record<number, ConfigSubunidades>;
}) {
  const router = useRouter();
  const noCliente = useGuardadoNoDesenho();
  const itens = useMemo(() => (noCliente ? linhasDoTexto<ItemUpload>(itensTexto) : []), [noCliente, itensTexto]);
  const [fila, setFila] = useState<{ nome: string; atual: number; total: number; progresso: number } | null>(null);
  const [aviso, setAviso] = useState<{ kind: "ok" | "danger"; texto: string; titulo?: string } | null>(null);
  const { confirmar, confirmacao } = useConfirmacao();
  const [previa, setPrevia] = useState<{ nome: string; leitura: LeituraPlanilhas } | null>(null);
  const respostaPrevia = useRef<((sim: boolean) => void) | null>(null);

  /** Abre a prévia completa e espera a decisão (Importar = true). */
  function verPrevia(nome: string, leitura: LeituraPlanilhas): Promise<boolean> {
    return new Promise((res) => {
      respostaPrevia.current = res;
      setPrevia({ nome, leitura });
    });
  }
  function decidir(sim: boolean) {
    respostaPrevia.current?.(sim);
    respostaPrevia.current = null;
    setPrevia(null);
  }

  async function importar(files: File[]) {
    const xs = files.filter((f) => /\.xlsx?$/i.test(f.name));
    if (xs.length === 0) {
      setAviso({ kind: "danger", texto: "Envie arquivos .xlsx (planilha do PCA)." });
      return;
    }
    setAviso(null);
    const ok: string[] = [];
    const falhas: string[] = [];
    // Lê TODOS os arquivos antes (a prévia de cada um); cada arquivo aprovado vira UM upload.
    const lidos: { nome: string; planilhas: PlanilhaParseada[] }[] = [];
    for (const f of xs) {
      try {
        const leitura = await parsePlanilhas(f);
        // Nada entra sem ser visto: a prévia completa de cada arquivo, antes de gravar.
        if (await verPrevia(f.name, leitura)) lidos.push({ nome: f.name, planilhas: leitura.planilhas });
      } catch (e) {
        falhas.push(`${f.name}: ${e instanceof Error ? e.message : "falha"}`);
      }
    }
    for (let i = 0; i < lidos.length; i++) {
      setFila({ nome: lidos[i].nome, atual: i + 1, total: lidos.length, progresso: 0 });
      try {
        const n = await enviarArquivo(lidos[i].nome, lidos[i].planilhas, pcaId, (p) => setFila((f) => (f ? { ...f, progresso: p } : f)));
        ok.push(`${lidos[i].nome} (${num(n)} itens)`);
      } catch (e) {
        falhas.push(`${lidos[i].nome}: ${e instanceof Error ? e.message : "falha"}`);
      }
    }
    setFila(null);
    if (ok.length === 0 && falhas.length === 0) return;
    setAviso(
      falhas.length
        ? { kind: "danger", texto: `${ok.length ? `Importados: ${ok.join(", ")}. ` : ""}Falhas — ${falhas.join(" · ")}` }
        : { kind: "ok", texto: `Importado(s): ${ok.join(", ")}` },
    );
    router.refresh();
  }

  /** Um excluir por vez (dois toques não mandam dois pedidos). */
  const excluindo = useRef(false);
  async function excluir(p: UploadPca) {
    const sim = await confirmar({
      titulo: `Excluir o upload ${p.nomeArquivo ?? ""}?`,
      texto: `Os ${num(p.totalItens)} itens dele saem deste PCA. Não pode ser desfeito.`,
      confirmar: "Excluir upload",
      perigo: true,
    });
    if (!sim || excluindo.current) return;
    excluindo.current = true;
    try {
      const r = await fetch(`/api/pca/${pcaId}/planilhas/${p.id}`, { method: "DELETE" });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok || !j.ok) setAviso({ kind: "danger", texto: j.error ?? "Não foi possível excluir." });
      else setAviso({ kind: "ok", texto: `Upload ${p.nomeArquivo ?? ""} excluído.` });
    } catch {
      setAviso({ kind: "danger", texto: "Sem conexão com o servidor — o upload não foi excluído." });
    } finally {
      excluindo.current = false;
    }
    router.refresh();
  }

  const [visao, setVisao] = useState<"cards" | "itens">(totalItens > 0 ? "itens" : "cards");
  const [doUpload, setDoUpload] = useState<UploadPca | null>(null);
  const linhas = useMemo(() => (doUpload ? itens.filter((i) => i.uploadId === doUpload.id) : itens), [itens, doUpload]);
  // O item aberto no banner padrão do item (pelo id — a lista nova depois de salvar segue no mesmo item).
  const [abertoId, setAbertoId] = useState<number | null>(null);
  const abertoUp = useMemo(() => (abertoId != null ? (itens.find((i) => i.id === abertoId) ?? null) : null), [itens, abertoId]);
  const aberto = useMemo(() => (abertoUp ? itemRowDoUpload(abertoUp) : null), [abertoUp]);

  // CANCELAR/REATIVAR (Excluir no PCA): o item não é excluído — sai dos números do PCA e o nº fica inativo.
  const [sel, setSel] = useState<Set<string | number>>(new Set());
  const [reservaSel, setReservaSel] = useState(0);
  const [gravandoSit, setGravandoSit] = useState(false);
  // Só os À VISTA: o que foi marcado antes de filtrar por upload (ou de ir aos cards) não recebe a ação escondido.
  const selecionados = useMemo(() => (visao === "itens" ? linhas.filter((i) => sel.has(i.id)) : []), [linhas, sel, visao]);
  async function alterarSituacao(alvo: ItemUpload[], cancelar: boolean): Promise<boolean> {
    const lista = alvo.filter((r) => (cancelar ? !r.canceladoEm : !!r.canceladoEm));
    if (!lista.length || gravandoSit) return false;
    const n = lista.length;
    const sim = await confirmar(
      cancelar
        ? {
            titulo: `Cancelar ${n} item(ns) no PCA?`,
            texto: "O item NÃO é excluído: fica CANCELADO, o sequencial fica inativo (nenhum upload o sobrescreve) e o item sai do Dashboard, do Orçamento, dos totais e das declarações do PCA. Dá para reativar depois.",
            confirmar: "Cancelar no PCA",
            cancelar: "Voltar",
            perigo: true,
          }
        : { titulo: `Reativar ${n} item(ns) no PCA?`, texto: "O item volta a compor o Dashboard, o Orçamento e os totais do PCA.", confirmar: "Reativar" },
    );
    if (!sim) return false;
    setGravandoSit(true);
    try {
      let feitos = 0;
      let pulados = 0;
      for (let i = 0; i < lista.length; i += 100) {
        const r = await fetch(`/api/pca/${pcaId}/planilhas/itens`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ acao: cancelar ? "cancelar" : "reativar", ids: lista.slice(i, i + 100).map((x) => x.id) }),
        });
        const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; alterados?: number; falhas?: number };
        if (!r.ok || !j.ok) throw new Error(`${feitos ? `${num(feitos)} item(ns) já ${cancelar ? "cancelado(s)" : "reativado(s)"}; o resto não: ` : ""}${j.error ?? "Não foi possível concluir."}`);
        feitos += j.alterados ?? 0;
        pulados += j.falhas ?? 0;
      }
      setAviso({
        kind: "ok",
        titulo: cancelar ? "Itens cancelados" : "Itens reativados",
        texto: `${num(feitos)} item(ns) ${cancelar ? "cancelado(s)" : "reativado(s)"} no PCA.${pulados ? ` ${num(pulados)} já estava(m) assim ou mudou(aram) no meio.` : ""}`,
      });
      setSel(new Set());
      router.refresh();
      return true;
    } catch (e) {
      setAviso({ kind: "danger", texto: e instanceof Error ? e.message : "Sem conexão com o servidor — nada foi alterado." });
      router.refresh();
      return false;
    } finally {
      setGravandoSit(false);
    }
  }
  // SUBUNIDADE (`0181`): a planilha não traz centro de custo — a subunidade é ESCOLHIDA entre as da unidade, nos dois modos.
  const cfgDe = (id: number) => subunidades[id];
  const temSubs = (r: ItemUpload) => r.reparticaoId != null && (subunidades[r.reparticaoId]?.subunidades.length ?? 0) > 0;
  const comSubunidade = itens.some(temSubs) || itens.some((r) => r.subunidade);
  const colunas = useMemo(() => {
    if (!comSubunidade) return COLUNAS_ITENS;
    const c = [...COLUNAS_ITENS];
    c.splice(c.findIndex((x) => x.key === "unidade") + 1, 0, colunaSubunidadePlanilha(temSubs));
    return c;
    // biome-ignore lint/correctness/useExhaustiveDependencies: `temSubs` só depende de `subunidades`.
  }, [comSubunidade, subunidades]);
  const siglaDe = (id: number) => itens.find((i) => i.reparticaoId === id)?.unidade ?? null;
  const subMassa = subunidadeEmMassa(
    selecionados.map((r) => ({ id: r.id, reparticaoId: r.reparticaoId, sigla: r.unidade, bloqueio: r.canceladoEm ? "item cancelado no PCA" : null })),
    cfgDe,
    siglaDe,
    { livre: true },
  );
  const [subEscolhida, setSubEscolhida] = useState("");
  async function aplicarSubunidade() {
    if (!subEscolhida || subMassa.sub.motivo || gravandoSit) return;
    const subunidadeId = subEscolhida === "-" ? null : Number(subEscolhida);
    const nome = subMassa.sub.opcoes.find((o) => o.id === subunidadeId)?.nome;
    const n = selecionados.length;
    if (!(await confirmar({ titulo: `${nome ? `Subunidade “${nome}”` : "Tirar a subunidade"} em ${n} item(ns)?`, texto: "Vale para os itens selecionados da planilha.", confirmar: "Aplicar" }))) return;
    setGravandoSit(true);
    try {
      let feitos = 0;
      for (let i = 0; i < n; i += 100) {
        const r = await fetch(`/api/pca/${pcaId}/planilhas/itens/subunidade`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: selecionados.slice(i, i + 100).map((x) => x.id), subunidadeId }),
        });
        const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; alterados?: number };
        if (!r.ok || !j.ok) throw new Error(`${feitos ? `${num(feitos)} item(ns) já gravado(s); o resto não: ` : ""}${j.error ?? "Não foi possível definir a subunidade."}`);
        feitos += j.alterados ?? 0;
      }
      setAviso({ kind: "ok", titulo: "Subunidade definida", texto: `${num(feitos)} item(ns) ${nome ? `com a subunidade “${nome}”` : "sem subunidade"}.` });
      setSubEscolhida("");
      setSel(new Set());
    } catch (e) {
      setAviso({ kind: "danger", texto: e instanceof Error ? e.message : "Sem conexão com o servidor — nada foi alterado." });
    } finally {
      setGravandoSit(false);
      router.refresh();
    }
  }
  const nAtivosSel = selecionados.filter((r) => !r.canceladoEm).length;
  const nCanceladosSel = selecionados.length - nAtivosSel;

  return (
    <div className="space-y-[var(--gap-block)]">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          ariaLabel="Visão da importação"
          value={visao}
          onChange={setVisao}
          options={[
            { value: "itens", label: `Itens (${num(totalItens)})` },
            { value: "cards", label: `Uploads (${uploads.length})` },
          ]}
        />
        {visao === "itens" && doUpload && (
          <FilterChip active label={`${doUpload.nomeArquivo ?? "Upload"} ✕`} onClick={() => setDoUpload(null)} />
        )}
      </div>

      {aviso && (
        <AvisoFlutuante kind={aviso.kind} titulo={aviso.titulo ?? (aviso.kind === "ok" ? "Importação concluída" : "Atenção")} onClose={() => setAviso(null)} duracao={aviso.kind === "ok" ? 6000 : undefined}>
          {aviso.texto}
        </AvisoFlutuante>
      )}

      <div key={visao} className="animate-cat-morph">
        {visao === "cards" ? (
          <div className={`grid gap-[var(--gap-block)] ${COLUNAS_ESPACOS}`}>
            {podeImportar &&
              (fila ? (
                <div className="flex aspect-[4/5] flex-col justify-center rounded-card border-2 border-dashed border-accent/50 bg-accent-soft/40 p-[var(--pad-card)] sm:aspect-auto sm:h-full">
                  <Progress value={fila.progresso} label={`Importando ${fila.nome} (${fila.atual} de ${fila.total})… ${fila.progresso}%`} />
                </div>
              ) : (
                <Dropzone
                  accept=".xlsx,.xls"
                  onFiles={importar}
                  className="min-h-[15rem] !p-[var(--pad-card)]"
                  icon={<IconUpload className="h-7 w-7" />}
                  titulo="Importar planilha"
                  dica=".xlsx · por unidade ou consolidada (LOCAL)"
                />
              ))}
            {uploads.map((p) => (
              <CartaoEspaco
                key={p.id}
                ariaLabel={`Ver os itens de ${p.nomeArquivo ?? "upload"}`}
                onClick={() => {
                  setDoUpload(p);
                  setVisao("itens");
                }}
                capa={<CapaUpload upload={p} />}
                sobretitulo={`${p.criadoEm ? dataBR(p.criadoEm) : "Upload"}${p.criadoPor ? ` · ${p.criadoPor}` : ""}`}
                nome={p.nomeArquivo ?? "Planilha"}
                metricas={[
                  { rotulo: "Unidades", valor: num(p.unidades.length) },
                  { rotulo: "Itens", valor: num(p.totalItens) },
                  { rotulo: "Valor", valor: brlCompact(p.valorTotal), cor: "var(--accent)" },
                ]}
                canto={
                  podeExcluir && (
                    <span className="absolute top-3 right-3">
                      <Button
                        variant="icon"
                        size="sm"
                        aria-label={`Excluir ${p.nomeArquivo ?? "upload"}`}
                        title="Excluir o upload"
                        icon={<IconTrash className="h-4 w-4" style={{ color: "var(--danger)" }} />}
                        onClick={() => excluir(p)}
                      />
                    </span>
                  )
                }
              />
            ))}
            {uploads.length === 0 && !podeImportar && (
              <p className="col-span-full rounded-card border border-border bg-surface p-[var(--pad-card)] text-center text-sm text-muted">Nenhuma planilha importada ainda.</p>
            )}
          </div>
        ) : !noCliente ? (
          <EsqueletoTabela cheia linhas={14} colunas={8} />
        ) : (
          <DataTable
            columns={colunas}
            rows={linhas}
            getKey={(r) => r.id}
            density="compact"
            scrollInterno
            ordemInicial={{ key: "seq", dir: "desc" }}
            onRowClick={(r) => setAbertoId(r.id)}
            activeKey={abertoId ?? undefined}
            selectable={podeExcluir || (podeEditar && comSubunidade)}
            selected={sel}
            onSelected={setSel}
            reservaInferior={reservaSel}
            exportar={{ nome: doUpload?.nomeArquivo ?? "Itens importados" }}
            vazio="Nenhum item importado."
            resumo={resumoItens}
          />
        )}
      </div>
      {visao === "itens" && selecionados.length > 0 && (
        <BarraSelecao
          fixa
          onAltura={setReservaSel}
          bloqueada={gravandoSit}
          registros={selecionados.map((r) => {
            const m = subEscolhida ? subMassa.motivos.get(r.id) : undefined;
            return { key: r.id, rotulo: `Seq. ${r.sequencial ?? "—"}`, tom: r.canceladoEm ? "danger" : m?.tom, dica: r.canceladoEm ? textoCancelamento(r) : m?.dica };
          })}
          onRemover={(k) => setSel((s0) => new Set([...s0].filter((x) => x !== k)))}
          onLimpar={() => setSel(new Set())}
          resumo={<ResumoSelecao qtd={selecionados.length} singular="item" plural="itens" soma={selecionados.reduce((t, r) => t + (r.valorTotal ?? 0), 0)} />}
          acoes={
            <div className="flex flex-wrap items-center gap-2">
              {podeEditar && comSubunidade && (
                <span className="inline-flex items-center gap-1.5">
                  <SelectField
                    compacto
                    label="Subunidade"
                    value={subEscolhida}
                    onChange={(e) => setSubEscolhida(e.target.value)}
                    disabled={gravandoSit}
                    title={subMassa.sub.motivo ?? undefined}
                  >
                    <option value="">Escolher…</option>
                    {!subMassa.sub.motivo && subMassa.sub.opcoes.map((o) => <option key={o.id} value={String(o.id)}>{o.nome}</option>)}
                    {!subMassa.sub.motivo && <option value="-">— Sem subunidade —</option>}
                  </SelectField>
                  <Button size="sm" variant="secondary" disabled={!subEscolhida || !!subMassa.sub.motivo} loading={gravandoSit} onClick={() => void aplicarSubunidade()} title={subMassa.sub.motivo ?? undefined}>
                    Aplicar
                  </Button>
                </span>
              )}
              {podeExcluir && nAtivosSel > 0 && (
                <Button variant="danger" size="sm" icon={<IconNenhum className="h-4 w-4" />} loading={gravandoSit} onClick={() => void alterarSituacao(selecionados, true)}>
                  Cancelar no PCA ({nAtivosSel})
                </Button>
              )}
              {podeExcluir && nCanceladosSel > 0 && (
                <Button variant="secondary" size="sm" icon={<IconUndo className="h-4 w-4" />} loading={gravandoSit} onClick={() => void alterarSituacao(selecionados, false)}>
                  Reativar ({nCanceladosSel})
                </Button>
              )}
            </div>
          }
        />
      )}
      <BannerItemPlanilha
        item={aberto}
        onFechar={() => setAbertoId(null)}
        // O CANCELADO não se edita (reative-o antes); a situação vai no cabeçalho e o Cancelar/Reativar no rodapé.
        edicao={
          podeEditar && abertoUp && !abertoUp.canceladoEm
            ? {
                pcaId,
                anoPca,
                onSalvo: () => router.refresh(),
                subunidade:
                  abertoUp.reparticaoId != null && subunidades[abertoUp.reparticaoId]?.subunidades.length
                    ? { opcoes: subunidades[abertoUp.reparticaoId].subunidades.map(({ id, nome }) => ({ id, nome })), atual: abertoUp.subunidadeId }
                    : null,
              }
            : null
        }
        subunidade={abertoUp?.subunidade ?? null}
        situacao={
          abertoUp
            ? {
                cancelado: !!abertoUp.canceladoEm,
                dica: abertoUp.canceladoEm ? textoCancelamento(abertoUp) : null,
                alternar: podeExcluir ? () => alterarSituacao([abertoUp], !abertoUp.canceladoEm) : undefined,
              }
            : null
        }
      />
      {confirmacao}
      {previa && <PreviaPlanilha nomeArquivo={previa.nome} leitura={previa.leitura} onCancelar={() => decidir(false)} onImportar={() => decidir(true)} />}
    </div>
  );
}
