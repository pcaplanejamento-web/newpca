"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { dataBR } from "@/lib/format";
import { IconFile, IconSpinner } from "./icons";

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
      <div className="flex justify-center py-12 text-slate-400">
        <IconSpinner className="h-6 w-6" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {tabelas.map((t) => (
        <Link
          key={t.id}
          href={`/painel/ferramentas/tabelas/${t.id}`}
          className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-emerald-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-emerald-500/40"
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300">
            <IconFile className="h-6 w-6" />
          </div>
          <h3 className="mt-4 font-semibold text-slate-800 group-hover:text-emerald-700 dark:text-slate-100 dark:group-hover:text-emerald-300">
            {t.nome}
          </h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {t.linhas} linha(s) · {t.colunas} coluna(s)
          </p>
          {t.atualizadoEm && (
            <p className="mt-2 text-[11px] text-slate-400">
              atualizada em {dataBR(t.atualizadoEm)}
            </p>
          )}
        </Link>
      ))}

      {podeEditar && (
        <button
          type="button"
          onClick={novaTabela}
          disabled={criando}
          className="flex min-h-[168px] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 p-5 text-slate-500 transition hover:border-emerald-400 hover:text-emerald-600 disabled:opacity-60 dark:border-slate-700 dark:text-slate-400"
        >
          {criando ? <IconSpinner className="h-6 w-6" /> : <span className="text-3xl leading-none">+</span>}
          <span className="text-sm font-semibold">Nova tabela</span>
        </button>
      )}

      {tabelas.length === 0 && !podeEditar && (
        <p className="text-sm text-slate-400">Nenhuma tabela disponível.</p>
      )}
    </div>
  );
}
