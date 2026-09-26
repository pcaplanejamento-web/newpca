"use client";

import { useEffect, useRef, useState } from "react";
import { chamarPadronizacao as chamar } from "@/lib/padronizacao-cliente";
import { rotuloTicket } from "@/lib/tarefas-core";
import { SearchField } from "./Field";
import { IconCalendar, IconKanban, IconRepetir } from "./icons";

export type ResultadoBusca = { tipo: "evento" | "tarefa"; chave: string; titulo: string; data: string; hora: string | null; local: string | null; quadroId: number; ticket: number; repete: boolean };

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const dataCurta = (d: string, hoje: string) => `${Number(d.slice(8))} ${MESES[Number(d.slice(5, 7)) - 1]}${d.slice(0, 4) !== hoje.slice(0, 4) ? ` ${d.slice(0, 4)}` : ""}`;

/**
 * BUSCA EM TODOS OS MESES (como a lupa do Google Agenda): eventos (título, local, descrição) e tarefas com prazo (título,
 * #ticket) dos quadros da pessoa — do servidor, com pausa de 300 ms entre as letras. Os de hoje em diante vêm primeiro.
 * Tocar num resultado abre o evento/tarefa no mês dele (`onEscolher`).
 */
export function BuscaCalendario({ hoje, corQuadro, onEscolher }: { hoje: string; corQuadro: (id: number) => string | undefined; onEscolher: (r: ResultadoBusca) => void }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<ResultadoBusca[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const pedido = useRef(0);
  useEffect(() => {
    const termo = q.trim();
    if (termo.length < 2) {
      setRes(null);
      return;
    }
    const n = ++pedido.current;
    const t = window.setTimeout(async () => {
      setBuscando(true);
      try {
        const j = await chamar<{ resultados: ResultadoBusca[] }>(`/api/calendario/busca?q=${encodeURIComponent(termo)}`);
        if (n === pedido.current) setRes(j.resultados);
      } catch {
        if (n === pedido.current) setRes([]);
      } finally {
        if (n === pedido.current) setBuscando(false);
      }
    }, 300);
    return () => window.clearTimeout(t);
  }, [q]);

  return (
    <div className="space-y-1.5">
      <SearchField compacto value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pesquisar em todos os meses" aria-label="Pesquisar eventos e tarefas em todos os meses" />
      {res && (
        <div className="relative max-h-72 overflow-y-auto rounded-card border border-border bg-surface" aria-live="polite">
          {res.length === 0 ? (
            <p className="px-3 py-3 text-[12px] text-muted">{buscando ? "Pesquisando…" : "Nada encontrado."}</p>
          ) : (
            <ul className="divide-y divide-border">
              {res.map((r) => (
                <li key={r.chave}>
                  <button type="button" onClick={() => onEscolher(r)} className="flex min-h-11 w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-surface-2">
                    <span className="w-12 shrink-0 text-[11px] font-semibold uppercase tabular-nums leading-tight text-muted">{dataCurta(r.data, hoje)}</span>
                    <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: corQuadro(r.quadroId) ?? "var(--accent)" }} />
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-[12.5px] ${r.data < hoje ? "text-muted" : "text-text"}`}>{r.titulo}</span>
                      <span className="flex items-center gap-1 text-[10.5px] text-faint">
                        {r.tipo === "tarefa" ? <IconKanban className="h-3 w-3" /> : <IconCalendar className="h-3 w-3" />}
                        {r.tipo === "tarefa" ? `Prazo · ${rotuloTicket(r.ticket)}` : [r.hora, r.local].filter(Boolean).join(" · ") || "Dia todo"}
                        {r.repete && <IconRepetir className="h-3 w-3" aria-label="Repete" />}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
