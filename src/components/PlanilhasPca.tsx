"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { brlCompact, dataBR, num } from "@/lib/format";
import type { UploadPca } from "@/lib/pca-uploads";
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

/**
 * Aba IMPORTAÇÃO do PCA: soltar/escolher UMA OU VÁRIAS planilhas (.xlsx — por unidade ou a CONSOLIDADA com a coluna LOCAL)
 * com a PRÉVIA COMPLETA antes de gravar + UM card por UPLOAD (arquivo · unidades · itens · Σ). O SEQUENCIAL é sagrado: o
 * informado sobrescreve o item que já o tinha; sem ele, segue a sequência. Importar e excluir seguem o papel.
 */
export function PlanilhasPca({
  pcaId,
  uploads,
  podeImportar,
  podeExcluir,
}: {
  pcaId: number;
  uploads: UploadPca[];
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

  return (
    <div className="space-y-[var(--gap-block)]">
      {podeImportar &&
        (fila ? (
          <div className="rounded-card border-2 border-dashed border-accent/50 bg-accent-soft/40 p-8">
            <Progress
              value={fila.progresso}
              label={`Importando ${fila.nome} (${fila.atual} de ${fila.total})… ${fila.progresso}%`}
            />
          </div>
        ) : (
          <Dropzone
            accept=".xlsx,.xls"
            onFiles={importar}
            className="min-h-[200px]"
            icon={<IconUpload className="h-7 w-7" />}
            titulo="Arraste a planilha do PCA ou clique para escolher"
            dica=".xlsx · por unidade OU a consolidada com a coluna LOCAL · sequencial já usado sobrescreve; sem sequencial, segue a sequência"
          />
        ))}

      {aviso && (
        <AvisoFlutuante kind={aviso.kind} titulo={aviso.kind === "ok" ? "Importação concluída" : "Atenção"} onClose={() => setAviso(null)} duracao={aviso.kind === "ok" ? 6000 : undefined}>
          {aviso.texto}
        </AvisoFlutuante>
      )}

      <section className="space-y-3">
        <h2 className="text-base font-bold text-text">Uploads deste PCA ({uploads.length})</h2>
        {uploads.length === 0 ? (
          <p className="rounded-card border border-border bg-surface p-[var(--pad-card)] text-center text-sm text-muted">Nenhuma planilha importada ainda.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {uploads.map((p) => (
              <div key={p.id} className="flex flex-col rounded-card border border-border bg-surface p-[var(--pad-card)] shadow-ring">
                <div className="flex items-start gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                    <IconFile className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-bold text-text" title={p.nomeArquivo ?? undefined}>
                      {p.nomeArquivo ?? "Planilha"}
                    </h3>
                    <p className="line-clamp-2 text-sm text-muted" title={p.unidades.join(", ")}>
                      {p.unidades.length === 1 ? p.unidades[0] : `${num(p.unidades.length)} unidades · ${p.unidades.join(", ")}`}
                    </p>
                  </div>
                  {podeExcluir && (
                    <Button
                      variant="ghost"
                      aria-label={`Excluir ${p.nomeArquivo ?? "upload"}`}
                      icon={<IconTrash className="h-4 w-4" style={{ color: "var(--danger)" }} />}
                      onClick={() => excluir(p)}
                    />
                  )}
                </div>
                <div className="mt-4 flex items-center justify-between gap-2 border-t border-border pt-3 text-sm">
                  <span className="truncate text-muted">
                    {num(p.totalItens)} itens{p.criadoEm ? ` · ${dataBR(p.criadoEm)}` : ""}
                    {p.criadoPor ? ` · ${p.criadoPor}` : ""}
                  </span>
                  <span className="font-bold text-text">{brlCompact(p.valorTotal)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      {confirmacao}
      {previa && <PreviaPlanilha nomeArquivo={previa.nome} leitura={previa.leitura} onCancelar={() => decidir(false)} onImportar={() => decidir(true)} />}
    </div>
  );
}
