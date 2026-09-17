"use client";

import { Fragment, useState } from "react";
import type { LinhaAuditoria } from "@/lib/auditoria";
import { type AcaoAuditoria, type EntidadeAuditoria, ROTULO_ACAO, ROTULO_ENTIDADE } from "@/lib/auditoria-core";
import { IconClock } from "./icons";

/** Cor (token) por ação — verde = criar/importar, azul = editar, vermelho = excluir. */
const COR_ACAO: Record<string, string> = {
  criar: "var(--ok)",
  importar: "var(--ok)",
  protocolar: "var(--ok)",
  cadastro: "var(--ok)",
  aprovar: "var(--ok)",
  editar: "var(--info)",
  login: "var(--muted)",
  logout: "var(--muted)",
  excluir: "var(--danger)",
};

function fmtData(iso: string | null): string {
  if (!iso) return "—";
  // CURRENT_TIMESTAMP do SQLite é UTC sem fuso ("YYYY-MM-DD HH:MM:SS") → marca como Z.
  const d = new Date(`${iso.replace(" ", "T")}Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function parse(json: string | null): Record<string, unknown> {
  if (!json) return {};
  try {
    const v: unknown = JSON.parse(json);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : { valor: v };
  } catch {
    return {};
  }
}
function fmtV(v: unknown): string {
  if (v == null || v === "") return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/**
 * Timeline de auditoria de UMA entidade (ou de uma busca) — cada entrada tem a ação
 * (cor por tipo), o resumo legível, o ator + data, e um "detalhes" com o diff antes→depois.
 * Só tokens/componentes do design-system.
 */
export function Historico({ entradas, vazio = "Sem histórico de alterações." }: { entradas: LinhaAuditoria[]; vazio?: string }) {
  if (entradas.length === 0) return <p className="text-sm text-muted">{vazio}</p>;
  return (
    <ul className="space-y-2">
      {entradas.map((e) => (
        <EntradaHistorico key={e.id} e={e} />
      ))}
    </ul>
  );
}

function EntradaHistorico({ e }: { e: LinhaAuditoria }) {
  const [aberto, setAberto] = useState(false);
  const cor = COR_ACAO[e.acao] ?? "var(--muted)";
  const acao = ROTULO_ACAO[e.acao as AcaoAuditoria] ?? e.acao;
  const entidade = ROTULO_ENTIDADE[e.entidade as EntidadeAuditoria] ?? e.entidade;
  const antes = parse(e.antes);
  const depois = parse(e.depois);
  const chaves = [...new Set([...Object.keys(antes), ...Object.keys(depois)])];
  const temDetalhe = chaves.length > 0;
  return (
    <li className="rounded-card border border-border bg-surface p-3 shadow-ring">
      <div className="flex items-start gap-2">
        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: cor }} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 text-[13px]">
            <span className="font-bold" style={{ color: cor }}>
              {acao}
            </span>
            <span className="text-muted">· {entidade}</span>
            {e.entidadeId != null && <span className="text-faint">#{e.entidadeId}</span>}
          </div>
          {e.resumo && <p className="mt-0.5 break-words text-sm text-text-2">{e.resumo}</p>}
          <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[12px] text-muted">
            <IconClock className="h-3.5 w-3.5 shrink-0" />
            {/* Data/hora local (fuso do navegador) — servidor renderiza em UTC; suprime o aviso
                de hidratação (mismatch esperado p/ timestamp, padrão do React p/ data/hora). */}
            <span suppressHydrationWarning>{fmtData(e.criadoEm)}</span>
            <span>· {e.usuarioNome ?? "sistema"}</span>
            {temDetalhe && (
              <button type="button" className="font-medium text-accent hover:underline" onClick={() => setAberto((v) => !v)}>
                {aberto ? "ocultar" : "detalhes"}
              </button>
            )}
          </div>
          {aberto && temDetalhe && (
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-[8px] border border-border-2 bg-surface-2 p-2 text-[12px]">
              {chaves.map((k) => (
                <Fragment key={k}>
                  <dt className="font-semibold text-muted">{k}</dt>
                  <dd className="min-w-0 break-words text-text-2">
                    {k in antes && <span className="text-faint line-through">{fmtV(antes[k])}</span>}
                    {k in antes && k in depois && <span className="text-muted"> → </span>}
                    {k in depois && <span>{fmtV(depois[k])}</span>}
                  </dd>
                </Fragment>
              ))}
            </dl>
          )}
        </div>
      </div>
    </li>
  );
}
