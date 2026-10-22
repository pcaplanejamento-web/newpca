"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { brl, brlCompact, dataBR, num } from "@/lib/format";
import type { ItemUpload, UploadPca } from "@/lib/pca-uploads";
import { COLUNAS_ESPACOS } from "./CartaoEspacoEsqueleto";
import { CelulaCopiavel } from "./BotaoCopiar";
import { CelulaTexto } from "./CelulaLista";
import { type Column, DataTable } from "./DataTable";
import { FilterChip } from "./FilterChip";
import { CartaoEspaco } from "./QuadroCard";
import { Segmented } from "./Segmented";
import { type LeituraPlanilhas, type PlanilhaParseada, parsePlanilhas } from "@/lib/parse-xlsx";
import { AvisoFlutuante } from "./AvisoFlutuante";
import { Button } from "./Button";
import { useConfirmacao } from "./Confirmacao";
import { Dropzone } from "./Dropzone";
import { IconFile, IconTrash, IconUpload } from "./icons";
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
  { key: "seq", header: "Seq.", nowrap: true, numero: (r) => r.sequencial, value: (r) => String(r.sequencial ?? ""), render: (r) => r.sequencial ?? "—", total: false },
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

/**
 * Aba IMPORTAÇÃO do PCA: soltar/escolher UMA OU VÁRIAS planilhas (.xlsx — por unidade ou a CONSOLIDADA com a coluna LOCAL)
 * com a PRÉVIA COMPLETA antes de gravar + UM card por UPLOAD (arquivo · unidades · itens · Σ). O SEQUENCIAL é sagrado: o
 * informado sobrescreve o item que já o tinha; sem ele, segue a sequência. Importar e excluir seguem o papel.
 */
export function PlanilhasPca({
  pcaId,
  uploads,
  itens,
  podeImportar,
  podeExcluir,
}: {
  pcaId: number;
  uploads: UploadPca[];
  /** Os itens das planilhas (a visão Itens), do sequencial maior ao menor. */
  itens: ItemUpload[];
  /** O papel importa planilhas no PCA. */
  podeImportar: boolean;
  /** O papel exclui planilhas do PCA. */
  podeExcluir: boolean;
}) {
  const router = useRouter();
  const [fila, setFila] = useState<{ nome: string; atual: number; total: number; progresso: number } | null>(null);
  const [aviso, setAviso] = useState<{ kind: "ok" | "danger"; texto: string } | null>(null);
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

  async function excluir(p: UploadPca) {
    const sim = await confirmar({
      titulo: `Excluir o upload ${p.nomeArquivo ?? ""}?`,
      texto: `Os ${num(p.totalItens)} itens dele saem deste PCA. Não pode ser desfeito.`,
      confirmar: "Excluir upload",
      perigo: true,
    });
    if (!sim) return;
    const r = await fetch(`/api/pca/${pcaId}/planilhas/${p.id}`, { method: "DELETE" });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!r.ok || !j.ok) setAviso({ kind: "danger", texto: j.error ?? "Não foi possível excluir." });
    router.refresh();
  }

  const [visao, setVisao] = useState<"cards" | "itens">("cards");
  const [doUpload, setDoUpload] = useState<UploadPca | null>(null);
  const linhas = useMemo(() => (doUpload ? itens.filter((i) => i.uploadId === doUpload.id) : itens), [itens, doUpload]);

  return (
    <div className="space-y-[var(--gap-block)]">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          ariaLabel="Visão da importação"
          value={visao}
          onChange={setVisao}
          options={[
            { value: "cards", label: `Uploads (${uploads.length})` },
            { value: "itens", label: `Itens (${num(itens.length)})` },
          ]}
        />
        {visao === "itens" && doUpload && (
          <FilterChip active label={`${doUpload.nomeArquivo ?? "Upload"} ✕`} onClick={() => setDoUpload(null)} />
        )}
      </div>

      {aviso && (
        <AvisoFlutuante kind={aviso.kind} titulo={aviso.kind === "ok" ? "Importação concluída" : "Atenção"} onClose={() => setAviso(null)} duracao={aviso.kind === "ok" ? 6000 : undefined}>
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
        ) : (
          <DataTable
            columns={COLUNAS_ITENS}
            rows={linhas}
            getKey={(r) => r.id}
            density="compact"
            scrollInterno
            ordemInicial={{ key: "seq", dir: "desc" }}
            exportar={{ nome: doUpload?.nomeArquivo ?? "Itens importados" }}
            vazio="Nenhum item importado."
            resumo={(l) => `${num(l.length)} itens · ${brl(l.reduce((t, r) => t + (r.valorTotal ?? 0), 0))}`}
          />
        )}
      </div>
      {confirmacao}
      {previa && <PreviaPlanilha nomeArquivo={previa.nome} leitura={previa.leitura} onCancelar={() => decidir(false)} onImportar={() => decidir(true)} />}
    </div>
  );
}
