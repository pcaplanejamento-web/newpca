"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { brlCompact, dataBR, num } from "@/lib/format";
import { normalizarLinha } from "@/lib/normalize";
import { parsePlanilha } from "@/lib/parse-xlsx";
import { AvisoFlutuante } from "./AvisoFlutuante";
import { Button } from "./Button";
import { Dropzone } from "./Dropzone";
import { IconFile, IconTrash, IconUpload } from "./icons";
import { Progress } from "./Progress";

/** Linhas por requisição — cada requisição pequena (limites do Worker/D1). */
const CHUNK = 200;

export type PlanilhaPca = {
  id: number;
  codigo: string;
  municipio: string;
  nomeArquivo: string | null;
  totalItens: number | null;
  valorTotal: number | null;
  atualizadoEm: string | null;
};

/** Envia UMA planilha (.xlsx) para o PCA em lotes (`/api/upload`: start + append). */
async function enviarPlanilha(file: File, pcaId: number, onProgresso: (p: number) => void): Promise<{ codigo: string; itens: number }> {
  const parsed = await parsePlanilha(file);
  if (parsed.rows.length === 0) throw new Error("A planilha não tem itens.");
  const total = parsed.rows.map(normalizarLinha).reduce((s, r) => s + (r.valorTotal ?? 0), 0);
  let unidadeId: number | null = null;
  for (let i = 0; i < parsed.rows.length; i += CHUNK) {
    const rows = parsed.rows.slice(i, i + CHUNK);
    const body =
      i === 0
        ? {
            mode: "start" as const,
            pcaId,
            codigo: parsed.codigo,
            municipio: parsed.municipio,
            nomeArquivo: parsed.nomeArquivo,
            totalItens: parsed.rows.length,
            valorTotal: total,
            rows,
          }
        : { mode: "append" as const, unidadeId, rows };
    const res = await fetch("/api/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; unidadeId?: number };
    if (!res.ok || !j.ok) throw new Error(j.error ?? "Erro ao importar.");
    if (i === 0) unidadeId = j.unidadeId ?? null;
    onProgresso(Math.round(((i + rows.length) / parsed.rows.length) * 100));
  }
  return { codigo: parsed.codigo, itens: parsed.rows.length };
}

/**
 * Aba IMPORTAÇÃO do PCA de lista pronta: soltar/escolher UMA OU VÁRIAS planilhas (.xlsx — uma por
 * unidade; os itens entram direto neste PCA; reenviar o mesmo código substitui) + os cards das
 * planilhas deste PCA (itens · data · Σ), com exclusão para editores.
 */
export function PlanilhasPca({ pcaId, planilhas, podeEditar }: { pcaId: number; planilhas: PlanilhaPca[]; podeEditar: boolean }) {
  const router = useRouter();
  const [fila, setFila] = useState<{ nome: string; atual: number; total: number; progresso: number } | null>(null);
  const [aviso, setAviso] = useState<{ kind: "ok" | "danger"; texto: string } | null>(null);

  async function importar(files: File[]) {
    const xs = files.filter((f) => /\.xlsx?$/i.test(f.name));
    if (xs.length === 0) {
      setAviso({ kind: "danger", texto: "Envie arquivos .xlsx (planilha do PCA)." });
      return;
    }
    setAviso(null);
    const ok: string[] = [];
    const falhas: string[] = [];
    for (let i = 0; i < xs.length; i++) {
      setFila({ nome: xs[i].name, atual: i + 1, total: xs.length, progresso: 0 });
      try {
        const r = await enviarPlanilha(xs[i], pcaId, (p) => setFila((f) => (f ? { ...f, progresso: p } : f)));
        ok.push(`${r.codigo} (${num(r.itens)} itens)`);
      } catch (e) {
        falhas.push(`${xs[i].name}: ${e instanceof Error ? e.message : "falha"}`);
      }
    }
    setFila(null);
    setAviso(
      falhas.length
        ? { kind: "danger", texto: `${ok.length ? `Importadas: ${ok.join(", ")}. ` : ""}Falhas — ${falhas.join(" · ")}` }
        : { kind: "ok", texto: `Importada(s): ${ok.join(", ")}` },
    );
    router.refresh();
  }

  async function excluir(p: PlanilhaPca) {
    if (!confirm(`Excluir a planilha ${p.codigo} deste PCA? Os ${num(p.totalItens ?? 0)} itens saem do PCA.`)) return;
    const r = await fetch(`/api/pca/${pcaId}/planilhas/${p.id}`, { method: "DELETE" });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!r.ok || !j.ok) setAviso({ kind: "danger", texto: j.error ?? "Não foi possível excluir." });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {podeEditar &&
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
            dica=".xlsx · uma planilha por unidade · os itens entram direto neste PCA (reenviar a mesma unidade substitui)"
          />
        ))}

      {aviso && (
        <AvisoFlutuante kind={aviso.kind} titulo={aviso.kind === "ok" ? "Importação concluída" : "Atenção"} onClose={() => setAviso(null)} duracao={aviso.kind === "ok" ? 6000 : undefined}>
          {aviso.texto}
        </AvisoFlutuante>
      )}

      <section className="space-y-3">
        <h2 className="text-base font-bold text-text">Planilhas deste PCA ({planilhas.length})</h2>
        {planilhas.length === 0 ? (
          <p className="rounded-card border border-border bg-surface p-6 text-center text-sm text-muted">Nenhuma planilha importada ainda.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {planilhas.map((p) => (
              <div key={p.id} className="flex flex-col rounded-card border border-border bg-surface p-4 shadow-ring">
                <div className="flex items-start gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                    <IconFile className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-bold text-text">{p.codigo}</h3>
                    <p className="truncate text-sm text-muted" title={p.nomeArquivo ?? p.municipio}>
                      {p.nomeArquivo ?? p.municipio}
                    </p>
                  </div>
                  {podeEditar && (
                    <Button
                      variant="ghost"
                      aria-label={`Excluir ${p.codigo}`}
                      icon={<IconTrash className="h-4 w-4" style={{ color: "var(--danger)" }} />}
                      onClick={() => excluir(p)}
                    />
                  )}
                </div>
                <div className="mt-4 flex items-center justify-between gap-2 border-t border-border pt-3 text-sm">
                  <span className="text-muted">
                    {num(p.totalItens ?? 0)} itens{p.atualizadoEm ? ` · ${dataBR(p.atualizadoEm)}` : ""}
                  </span>
                  <span className="font-bold text-text">{brlCompact(p.valorTotal ?? 0)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
