"use client";

import { useCallback, useEffect, useState } from "react";
import { dataBR } from "@/lib/format";
import { IconAlert, IconCheck, IconSpinner } from "./icons";

type Role = "admin" | "gestor" | "membro";
type Status = "ativo" | "pendente" | "inativo";
type U = {
  id: number;
  nome: string;
  email: string;
  role: Role;
  status: Status;
  criadoEm: string | null;
};

const STATUS_STYLE: Record<Status, string> = {
  ativo:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  pendente:
    "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  inativo: "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
};
const STATUS_LABEL: Record<Status, string> = {
  ativo: "Ativo",
  pendente: "Pendente",
  inativo: "Inativo",
};

const btn =
  "rounded-lg px-2.5 py-1.5 text-xs font-semibold transition disabled:opacity-50";

export function UsuariosAdmin({ meuId }: { meuId: number }) {
  const [lista, setLista] = useState<U[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const r = await fetch("/api/admin/usuarios");
      const j = (await r.json()) as { ok?: boolean; error?: string; usuarios?: U[] };
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Erro ao carregar usuários.");
      setLista(j.usuarios ?? []);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar.");
      setLista([]);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function acao(id: number, init: RequestInit) {
    setBusyId(id);
    setErro(null);
    try {
      const r = await fetch(`/api/admin/usuarios/${id}`, init);
      const j = (await r.json()) as { ok?: boolean; error?: string };
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Erro na operação.");
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro na operação.");
    } finally {
      setBusyId(null);
    }
  }

  const patch = (id: number, dados: { role?: Role; status?: Status }) =>
    acao(id, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dados),
    });

  const excluir = (id: number) => {
    if (confirm("Excluir este usuário? Esta ação não pode ser desfeita.")) {
      acao(id, { method: "DELETE" });
    }
  };

  if (lista === null) {
    return (
      <div className="flex justify-center py-12 text-slate-400">
        <IconSpinner className="h-6 w-6" />
      </div>
    );
  }

  const pendentes = lista.filter((u) => u.status === "pendente").length;

  return (
    <div className="space-y-4">
      {pendentes > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          <IconAlert className="h-4 w-4 shrink-0" />
          {pendentes} cadastro(s) aguardando sua aprovação.
        </div>
      )}
      {erro && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          {erro}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
              <th className="px-3 py-2.5 font-semibold">Usuário</th>
              <th className="px-3 py-2.5 font-semibold">Papel</th>
              <th className="px-3 py-2.5 font-semibold">Status</th>
              <th className="px-3 py-2.5 text-right font-semibold">Ações</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((u) => {
              const souEu = u.id === meuId;
              const busy = busyId === u.id;
              return (
                <tr
                  key={u.id}
                  className="border-b border-slate-100 last:border-0 dark:border-slate-800/60"
                >
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-slate-800 dark:text-slate-100">
                      {u.nome} {souEu && <span className="text-slate-400">(você)</span>}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {u.email}
                    </div>
                    {u.criadoEm && (
                      <div className="text-[11px] text-slate-400">
                        desde {dataBR(u.criadoEm)}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <select
                      value={u.role}
                      disabled={souEu || busy}
                      onChange={(e) => patch(u.id, { role: e.target.value as Role })}
                      className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                    >
                      <option value="admin">Administrador</option>
                      <option value="gestor">Gestor</option>
                      <option value="membro">Membro</option>
                    </select>
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[u.status]}`}
                    >
                      {STATUS_LABEL[u.status]}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      {busy && <IconSpinner className="h-4 w-4 text-slate-400" />}
                      {u.status === "pendente" && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => patch(u.id, { status: "ativo" })}
                          className={`${btn} inline-flex items-center gap-1 bg-emerald-600 text-white hover:bg-emerald-700`}
                        >
                          <IconCheck className="h-3.5 w-3.5" /> Aprovar
                        </button>
                      )}
                      {u.status === "ativo" && !souEu && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => patch(u.id, { status: "inativo" })}
                          className={`${btn} border border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800`}
                        >
                          Desativar
                        </button>
                      )}
                      {u.status === "inativo" && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => patch(u.id, { status: "ativo" })}
                          className={`${btn} border border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800`}
                        >
                          Reativar
                        </button>
                      )}
                      {!souEu && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => excluir(u.id)}
                          className={`${btn} text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10`}
                        >
                          Excluir
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
