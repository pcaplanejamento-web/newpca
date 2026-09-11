"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { dataBR } from "@/lib/format";
import { IconFile, IconPlus, IconSpinner } from "./icons";
import { Skeleton } from "./Skeleton";

type Tabela = {
  id: number;
  nome: string;
  descricao: string | null;
  linhas: number;
  colunas: number;
  atualizadoEm: string | null;
};

export function TabelasIndex({ podeEditar }: { podeEditar: boolean }) {
  const router = useRouter();
  const [tabelas, setTabelas] = useState<Tabela[] | null>(null);
  const [criando, setCriando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/tabelas");
      const j = await r.json();
      if (j.ok) setTabelas(j.tabelas);
      else setTabelas([]);
    } catch {
      setTabelas([]);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function novaTabela() {
    const nome = window.prompt("Nome da nova tabela:")?.trim();
    if (!nome) return;
    setCriando(true);
    try {
      const r = await fetch("/api/tabelas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Erro ao criar.");
      router.push(`/painel/ferramentas/tabelas/${j.id}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro ao criar tabela.");
    } finally {
      setCriando(false);
    }
  }

  if (tabelas === null) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[168px] rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {tabelas.map((t) => (
        <Link
          key={t.id}
          href={`/painel/ferramentas/tabelas/${t.id}`}
          className="group rounded-card border border-border bg-surface p-5 shadow-ring transition hover:border-accent/40 hover:shadow-soft"
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <IconFile className="h-6 w-6" />
          </div>
          <h3 className="mt-4 font-semibold text-text transition-colors group-hover:text-accent">
            {t.nome}
          </h3>
          <p className="mt-1 text-sm text-muted">
            {t.linhas} linha(s) · {t.colunas} coluna(s)
          </p>
          {t.atualizadoEm && (
            <p className="mt-2 text-[11px] text-faint">atualizada em {dataBR(t.atualizadoEm)}</p>
          )}
        </Link>
      ))}

      {podeEditar && (
        <button
          type="button"
          onClick={novaTabela}
          disabled={criando}
          className="flex min-h-[168px] flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed border-border-2 p-5 text-muted transition hover:border-accent hover:text-accent disabled:opacity-60"
        >
          {criando ? <IconSpinner className="h-6 w-6" /> : <IconPlus className="h-6 w-6" />}
          <span className="text-sm font-semibold">Nova tabela</span>
        </button>
      )}

      {tabelas.length === 0 && !podeEditar && (
        <p className="text-sm text-faint">Nenhuma tabela disponível.</p>
      )}
    </div>
  );
}
