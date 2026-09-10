"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { IconAlert, IconCheck, IconSpinner } from "./icons";

const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-base text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:ring-emerald-500/20";

export function AuthForm({ mode }: { mode: "login" | "cadastro" }) {
  const router = useRouter();
  const isCad = mode === "cadastro";
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, setPendente] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErro(null);
    try {
      const res = await fetch(isCad ? "/api/auth/cadastro" : "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isCad ? { nome, email, senha } : { email, senha }),
      });
      const j = (await res.json()) as {
        ok?: boolean;
        error?: string;
        pendente?: boolean;
      };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "Ocorreu um erro.");
      if (isCad && j.pendente) {
        setPendente(true);
        return;
      }
      router.push("/painel");
      router.refresh();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Ocorreu um erro.");
    } finally {
      setLoading(false);
    }
  }

  if (pendente) {
    return (
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500 text-white">
          <IconCheck className="h-6 w-6" />
        </div>
        <h2 className="mt-4 text-lg font-bold text-slate-800 dark:text-white">
          Conta criada!
        </h2>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Seu acesso está <strong>pendente de aprovação</strong> por um
          administrador. Você poderá entrar assim que for liberado.
        </p>
        <Link
          href="/login"
          className="mt-5 inline-block text-sm font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
        >
          Voltar para o login
        </Link>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8 dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="mb-6 flex flex-col items-center text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-green-700 text-base font-black text-white shadow-sm">
          RV
        </div>
        <h1 className="mt-3 text-lg font-bold text-slate-900 dark:text-white">
          {isCad ? "Criar conta" : "Entrar na plataforma"}
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          PCA — Prefeitura de Rio Verde
        </p>
      </div>

      <div className="space-y-3">
        {isCad && (
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Nome
            </label>
            <input
              className={inputCls}
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              autoComplete="name"
              required
            />
          </div>
        )}
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
            E-mail
          </label>
          <input
            className={inputCls}
            type="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
            Senha
          </label>
          <input
            className={inputCls}
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            autoComplete={isCad ? "new-password" : "current-password"}
            required
            minLength={isCad ? 8 : undefined}
          />
          {isCad && (
            <p className="mt-1 text-xs text-slate-400">Mínimo de 8 caracteres.</p>
          )}
        </div>
      </div>

      {erro && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{erro}</span>
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
      >
        {loading ? (
          <IconSpinner className="h-[18px] w-[18px]" />
        ) : isCad ? (
          "Criar conta"
        ) : (
          "Entrar"
        )}
      </button>

      <p className="mt-5 text-center text-sm text-slate-500 dark:text-slate-400">
        {isCad ? "Já tem conta?" : "Ainda não tem conta?"}{" "}
        <Link
          href={isCad ? "/login" : "/cadastro"}
          className="font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
        >
          {isCad ? "Entrar" : "Criar conta"}
        </Link>
      </p>
    </form>
  );
}
