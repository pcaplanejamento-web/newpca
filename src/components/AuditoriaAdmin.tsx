"use client";

import { useCallback, useEffect, useState } from "react";
import type { LinhaAuditoria } from "@/lib/auditoria";
import { ROTULO_ACAO, ROTULO_ENTIDADE } from "@/lib/auditoria-core";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { selectCls } from "./formStyles";
import { Historico } from "./Historico";
import { IconClock, IconRefresh } from "./icons";
import { SkeletonLinhas } from "./Skeleton";

const ACOES = Object.entries(ROTULO_ACAO);
const ENTIDADES = Object.entries(ROTULO_ENTIDADE);
const PAGE_SIZE = 50;

/**
 * Tela GLOBAL de auditoria (só ADM): o histórico de alterações de TODO o sistema —
 * quem, o quê (com diff antes→depois) e quando — com filtros por entidade/ação e paginação.
 * Reutiliza o componente `Historico`. Só componentes do design-system.
 */
export function AuditoriaAdmin() {
  const [linhas, setLinhas] = useState<LinhaAuditoria[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [entidade, setEntidade] = useState("");
  const [acao, setAcao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  const carregar = useCallback(async () => {
    setErro(null);
    setCarregando(true);
    try {
      const q = new URLSearchParams();
      if (entidade) q.set("entidade", entidade);
      if (acao) q.set("acao", acao);
      q.set("page", String(page));
      const r = await fetch(`/api/admin/auditoria?${q}`);
      const j = (await r.json()) as { ok?: boolean; error?: string; linhas?: LinhaAuditoria[]; total?: number };
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Erro ao carregar a auditoria.");
      setLinhas(j.linhas ?? []);
      setTotal(j.total ?? 0);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar a auditoria.");
      setLinhas([]);
    } finally {
      setCarregando(false);
    }
  }, [entidade, acao, page]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-[var(--gap-block)]">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-text">
            <IconClock className="h-5 w-5" /> Auditoria
          </h1>
          <p className="text-sm text-muted">Histórico de alterações de todo o sistema — quem, o quê e quando.</p>
        </div>
        <Button variant="secondary" onClick={carregar} loading={carregando}>
          <IconRefresh className="h-4 w-4" /> Recarregar
        </Button>
      </header>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Entidade
          <select
            className={selectCls}
            value={entidade}
            onChange={(e) => {
              setPage(1);
              setEntidade(e.target.value);
            }}
          >
            <option value="">Todas</option>
            {ENTIDADES.map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Ação
          <select
            className={selectCls}
            value={acao}
            onChange={(e) => {
              setPage(1);
              setAcao(e.target.value);
            }}
          >
            <option value="">Todas</option>
            {ACOES.map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <span className="pb-2 text-xs text-muted">
          {total} registro{total === 1 ? "" : "s"}
        </span>
      </div>

      {erro && <Callout kind="danger">{erro}</Callout>}

      {linhas === null ? (
        <SkeletonLinhas linhas={6} />
      ) : (
        <>
          <Historico entradas={linhas} vazio="Nenhuma alteração registrada ainda." />
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3">
              <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                Anterior
              </Button>
              <span className="text-sm text-muted">
                Página {page} de {totalPages}
              </span>
              <Button variant="secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Próxima
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
