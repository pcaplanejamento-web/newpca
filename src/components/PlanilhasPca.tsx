"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { brlCompact, dataBR, num } from "@/lib/format";
import { normalizarLinha } from "@/lib/normalize";
import { type LeituraPlanilhas, type PlanilhaParseada, parsePlanilhas } from "@/lib/parse-xlsx";
import { AvisoFlutuante } from "./AvisoFlutuante";
import { Button } from "./Button";
import { useConfirmacao } from "./Confirmacao";
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

/** Envia UMA planilha (já lida) para o PCA em lotes (`/api/upload`: start + append). */
async function enviarPlanilha(parsed: PlanilhaParseada, pcaId: number, onProgresso: (p: number) => void): Promise<{ codigo: string; itens: number }> {
  if (parsed.rows.length === 0) throw new Error("A planilha não tem itens.");
  const total = parsed.rows.map(normalizarLinha).reduce((s, r) => s + (r.valorTotal ?? 0), 0);
  let unidadeId: number | null = null;
  for (let i = 0; i < parsed.rows.length; i += CHUNK) {
    const rows = parsed.rows.slice(i, i + CHUNK);
    // Os lotes seguintes precisam do id devolvido pelo 1º (sem ele, não há onde acrescentar).
    if (i > 0 && unidadeId == null) throw new Error("A importação não devolveu a planilha criada. Tente de novo.");
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

/** A prévia da leitura (o texto da confirmação): unidades, itens, Σ e o que foi apontado. */
function PreviaLeitura({ leitura }: { leitura: LeituraPlanilhas }) {
  const itens = leitura.planilhas.reduce((s, p) => s + p.rows.length, 0);
  const total = leitura.planilhas.reduce((s, p) => s + p.rows.map(normalizarLinha).reduce((t, r) => t + (r.valorTotal ?? 0), 0), 0);
  return (
    <div className="space-y-2 text-sm">
      <p>
        {leitura.formato === "consolidado" ? `Planilha consolidada: ${num(leitura.planilhas.length)} unidade(s)` : "1 planilha"} ·{" "}
        {num(itens)} itens · {brlCompact(total)}. Reenviar uma unidade substitui a planilha dela.
      </p>
      {leitura.problemas.length > 0 && (
        <ul className="max-h-48 space-y-1 overflow-y-auto">
          {leitura.problemas.map((p) => (
            <li key={p.tipo} title={p.exemplos.join("\n")}>
              <span className="font-semibold" style={{ color: "var(--warn)" }}>
                {num(p.quantidade)}
              </span>{" "}
              {p.tipo}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Aba IMPORTAÇÃO do PCA de lista pronta: soltar/escolher UMA OU VÁRIAS planilhas (.xlsx — uma por
 * unidade, ou a CONSOLIDADA com a coluna LOCAL, que vira uma planilha por unidade — com a prévia antes de gravar; os itens entram direto neste PCA; reenviar o mesmo código substitui) + os cards das
 * planilhas deste PCA (itens · data · Σ); importar e excluir seguem o papel.
 */
export function PlanilhasPca({
  pcaId,
  planilhas,
  podeImportar,
  podeExcluir,
}: {
  pcaId: number;
  planilhas: PlanilhaPca[];
  /** O papel importa planilhas no PCA. */
  podeImportar: boolean;
  /** O papel exclui planilhas do PCA. */
  podeExcluir: boolean;
}) {
  const router = useRouter();
  const [fila, setFila] = useState<{ nome: string; atual: number; total: number; progresso: number } | null>(null);
  const [aviso, setAviso] = useState<{ kind: "ok" | "danger"; texto: string } | null>(null);
  const { confirmar, confirmacao } = useConfirmacao();

  async function importar(files: File[]) {
    const xs = files.filter((f) => /\.xlsx?$/i.test(f.name));
    if (xs.length === 0) {
      setAviso({ kind: "danger", texto: "Envie arquivos .xlsx (planilha do PCA)." });
      return;
    }
    setAviso(null);
    const ok: string[] = [];
    const falhas: string[] = [];
    // Lê TODOS os arquivos antes; uma planilha consolidada vira várias (uma por LOCAL).
    const lidas: PlanilhaParseada[] = [];
    for (const f of xs) {
      try {
        const leitura = await parsePlanilhas(f);
        // A prévia SEMPRE na consolidada (muitas unidades) e quando há apontamentos — nada entra sem ser visto.
        if (leitura.formato === "consolidado" || leitura.problemas.length > 0) {
          const sim = await confirmar({
            titulo: `Importar ${f.name}?`,
            texto: <PreviaLeitura leitura={leitura} />,
            confirmar: `Importar ${num(leitura.planilhas.length)} planilha(s)`,
          });
          if (!sim) continue;
        }
        lidas.push(...leitura.planilhas);
      } catch (e) {
        falhas.push(`${f.name}: ${e instanceof Error ? e.message : "falha"}`);
      }
    }
    for (let i = 0; i < lidas.length; i++) {
      setFila({ nome: lidas[i].codigo, atual: i + 1, total: lidas.length, progresso: 0 });
      try {
        const r = await enviarPlanilha(lidas[i], pcaId, (p) => setFila((f) => (f ? { ...f, progresso: p } : f)));
        ok.push(`${r.codigo} (${num(r.itens)} itens)`);
      } catch (e) {
        falhas.push(`${lidas[i].codigo}: ${e instanceof Error ? e.message : "falha"}`);
      }
    }
    if (ok.length === 0 && falhas.length === 0) {
      setFila(null);
      return;
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
    const sim = await confirmar({
      titulo: `Excluir a planilha ${p.codigo}?`,
      texto: `Os ${num(p.totalItens ?? 0)} itens saem deste PCA. Não pode ser desfeito.`,
      confirmar: "Excluir planilha",
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
            dica=".xlsx · uma planilha por unidade OU a consolidada com a coluna LOCAL · reenviar a mesma unidade substitui"
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
          <p className="rounded-card border border-border bg-surface p-[var(--pad-card)] text-center text-sm text-muted">Nenhuma planilha importada ainda.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {planilhas.map((p) => (
              <div key={p.id} className="flex flex-col rounded-card border border-border bg-surface p-[var(--pad-card)] shadow-ring">
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
                  {podeExcluir && (
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
      {confirmacao}
    </div>
  );
}
