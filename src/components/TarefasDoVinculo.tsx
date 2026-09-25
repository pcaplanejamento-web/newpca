"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { chamarPadronizacao as chamar } from "@/lib/padronizacao-cliente";
import { COR_ESTADO_PRAZO, estadoPrazo, ROTULO_ESTADO_PRAZO, ROTULO_VINCULO, rotuloData, rotuloTicket, type TipoVinculo } from "@/lib/tarefas-core";
import { dataIsoBrasilia } from "@/lib/format";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { SelectField } from "./Field";
import { IconKanban, IconPlus } from "./icons";
import { Modal } from "./Modal";

type TarefaLigada = {
  id: number;
  ticket: number;
  titulo: string;
  prazo: string | null;
  concluidaEm: string | null;
  arquivada: boolean;
  quadroId: number;
  quadroNome: string;
  quadroCor: string;
  listaNome: string;
};
type QuadroOpcao = { id: number; nome: string; cor: string; grupoNome: string };

/**
 * TAREFAS de um protocolo/DFD (no rodapé dos banners da Mesa): o botão "Tarefas (N)" abre as tarefas LIGADAS a ele (nos
 * quadros que o usuário vê — tocar leva ao cartão no quadro) e "Criar tarefa" num quadro escolhido (abre a tarefa NOVA
 * já vinculada). Sem tarefas nem quadros, o botão não aparece.
 */
export function TarefasDoVinculo({ tipo, id }: { tipo: TipoVinculo; id: number }) {
  const router = useRouter();
  const [dados, setDados] = useState<{ tarefas: TarefaLigada[]; quadros: QuadroOpcao[] } | null>(null);
  const [aberto, setAberto] = useState(false);
  const [quadro, setQuadro] = useState("");

  useEffect(() => {
    let vivo = true;
    setDados(null);
    chamar<{ tarefas: TarefaLigada[]; quadros: QuadroOpcao[] }>(`/api/tarefas/do-vinculo?tipo=${tipo}&id=${id}`)
      .then((j) => {
        if (!vivo) return;
        setDados(j);
        setQuadro(String(j.quadros[0]?.id ?? ""));
      })
      .catch(() => vivo && setDados({ tarefas: [], quadros: [] }));
    return () => {
      vivo = false;
    };
  }, [tipo, id]);

  if (!dados || (!dados.tarefas.length && !dados.quadros.length)) return null;
  const hoje = dataIsoBrasilia(new Date().toISOString());
  const abertas = dados.tarefas.filter((t) => !t.arquivada && !t.concluidaEm).length;
  return (
    <>
      <Button variant="secondary" icon={<IconKanban className="h-4 w-4" />} onClick={() => setAberto(true)}>
        Tarefas{dados.tarefas.length ? ` (${abertas}/${dados.tarefas.length})` : ""}
      </Button>
      <Modal open={aberto} onClose={() => setAberto(false)} titulo={`Tarefas do ${ROTULO_VINCULO[tipo]}`} size="md">
        <div className="space-y-4">
          {dados.tarefas.length === 0 ? (
            <p className="text-[13px] text-muted">Nenhuma tarefa ligada a este {ROTULO_VINCULO[tipo]} ainda.</p>
          ) : (
            <ul className="divide-y divide-border rounded-card border border-border">
              {dados.tarefas.map((t) => {
                const e = estadoPrazo(t.prazo, hoje, t.concluidaEm != null);
                return (
                  <li key={t.id}>
                    <Link
                      href={`/painel/tarefas/${t.quadroId}?tarefa=${t.id}`}
                      className={`flex min-h-11 items-center gap-2 px-3 py-2 text-[13px] hover:bg-surface-2 ${t.arquivada ? "opacity-60" : ""}`}
                    >
                      <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: t.quadroCor }} />
                      <span className="shrink-0 font-mono text-[11.5px] text-faint">{rotuloTicket(t.ticket)}</span>
                      <span className={`min-w-0 flex-1 truncate text-text ${t.concluidaEm ? "line-through decoration-faint" : ""}`}>{t.titulo}</span>
                      <span className="hidden shrink-0 text-[11.5px] text-muted sm:inline">
                        {t.quadroNome} · {t.listaNome}
                      </span>
                      {t.arquivada ? (
                        <Badge>Arquivada</Badge>
                      ) : t.prazo ? (
                        <span className="shrink-0 text-[11.5px] font-semibold tabular-nums" style={{ color: COR_ESTADO_PRAZO[e] }} title={ROTULO_ESTADO_PRAZO[e]}>
                          {rotuloData(t.prazo, hoje)}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          {dados.quadros.length > 0 && (
            <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
              <div className="min-w-[12rem] flex-1">
                <SelectField label="Criar tarefa no quadro" value={quadro} onChange={(e) => setQuadro(e.target.value)}>
                  {dados.quadros.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.nome} — {q.grupoNome}
                    </option>
                  ))}
                </SelectField>
              </div>
              <Button variant="accent" icon={<IconPlus className="h-4 w-4" />} disabled={!quadro} onClick={() => router.push(`/painel/tarefas/${quadro}?nova=${tipo}:${id}`)}>
                Criar tarefa
              </Button>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
