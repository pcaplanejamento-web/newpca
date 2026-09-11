"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Avatar } from "./Avatar";
import { ThemeToggle } from "./ThemeToggle";
import { IconLogout, IconSpinner } from "./icons";
import type { UsuarioSessao } from "@/lib/auth";

const ROLE_LABEL: Record<UsuarioSessao["role"], string> = {
  admin: "Administrador",
  gestor: "Gestor",
  membro: "Membro",
};

/** Tela de Perfil: conta, preferências e sair. A navegação completa fica no menu
 *  hambúrguer (mobile) e na sidebar (desktop). */
export function PerfilView({ usuario }: { usuario: UsuarioSessao }) {
  const router = useRouter();
  const [saindo, setSaindo] = useState(false);

  async function sair() {
    setSaindo(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      /* ignora */
    }
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Conta */}
      <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <Avatar nome={usuario.nome} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-bold text-slate-800 dark:text-white">
            {usuario.nome}
          </div>
          <div className="truncate text-sm text-slate-500 dark:text-slate-400">
            {usuario.email}
          </div>
          <span className="mt-1 inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
            {ROLE_LABEL[usuario.role]}
          </span>
        </div>
      </div>

      {/* Preferências */}
      <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div>
          <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Aparência
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Alternar tema claro / escuro
          </div>
        </div>
        <ThemeToggle />
      </div>

      {/* Sair */}
      <button
        type="button"
        onClick={sair}
        disabled={saindo}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-60 dark:border-slate-800 dark:bg-slate-900 dark:text-red-400 dark:hover:bg-red-500/10"
      >
        {saindo ? <IconSpinner className="h-4 w-4" /> : <IconLogout className="h-4 w-4" />}
        Sair da conta
      </button>
    </div>
  );
}
