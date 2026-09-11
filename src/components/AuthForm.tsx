"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { Button } from "./Button";
import { Checkbox, PasswordField, TextField } from "./Field";
import { IconAlert, IconArrowRight, IconCheck, IconMail, IconUser } from "./icons";

// Tela de acesso (login/cadastro) — referência dos componentes de entrada do
// design system (prints do usuário): TextField/PasswordField com ícone e anel
// de foco, Checkbox e Button "accent" com glow. 100% por token.
export function AuthForm({ mode }: { mode: "login" | "cadastro" }) {
  const router = useRouter();
  const isCad = mode === "cadastro";
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [lembrar, setLembrar] = useState(true);
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
      const j = (await res.json()) as { ok?: boolean; error?: string; pendente?: boolean };
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
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 text-center shadow-soft">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-accent-soft text-accent">
          <IconCheck className="h-6 w-6" />
        </div>
        <h2 className="mt-4 text-lg font-bold text-text">Conta criada!</h2>
        <p className="mt-2 text-sm text-muted">
          Seu acesso está <strong className="text-text-2">pendente de aprovação</strong> por um
          administrador. Você poderá entrar assim que for liberado.
        </p>
        <Link href="/login" className="mt-5 inline-block text-sm font-semibold text-accent hover:underline">
          Voltar para o login
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-soft sm:p-8">
      <div className="mb-6 flex flex-col items-center text-center">
        <div className="grid h-12 w-12 place-items-center rounded-xl bg-text text-base font-black text-surface">
          RV
        </div>
        <h1 className="mt-3 text-lg font-bold text-text">
          {isCad ? "Criar conta" : "Entrar na plataforma"}
        </h1>
        <p className="text-xs text-muted">PCA — Prefeitura de Rio Verde</p>
      </div>

      <div className="space-y-4">
        {isCad && (
          <TextField
            label="Nome completo"
            icon={<IconUser className="h-5 w-5" />}
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            autoComplete="name"
            required
          />
        )}
        <TextField
          label="Email ou usuário"
          icon={<IconMail className="h-5 w-5" />}
          type="email"
          inputMode="email"
          placeholder="voce@empresa.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete={isCad ? "email" : "username"}
          required
        />
        <PasswordField
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          autoComplete={isCad ? "new-password" : "current-password"}
          required
          minLength={isCad ? 8 : undefined}
          hint={isCad ? "Mínimo de 8 caracteres." : undefined}
        />
        {!isCad && (
          <Checkbox label="Manter-me conectado" checked={lembrar} onChange={(e) => setLembrar(e.target.checked)} />
        )}
      </div>

      {erro && (
        <div
          className="mt-4 flex items-start gap-2 rounded-control p-3 text-sm"
          style={{
            color: "var(--sit-devolvido)",
            background: "color-mix(in srgb, var(--sit-devolvido) 10%, transparent)",
            border: "1px solid color-mix(in srgb, var(--sit-devolvido) 30%, transparent)",
          }}
        >
          <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{erro}</span>
        </div>
      )}

      <Button
        type="submit"
        variant="accent"
        loading={loading}
        icon={!loading && <IconArrowRight className="h-4 w-4" />}
        className="mt-6 h-[52px] w-full text-[15px]"
      >
        {isCad ? "Criar conta" : "Entrar"}
      </Button>

      <div className="mt-5 text-center">
        <Link
          href={isCad ? "/login" : "/cadastro"}
          className="text-sm font-semibold text-accent hover:underline"
        >
          {isCad ? "Já tenho conta — entrar" : "Primeiro acesso ou esqueci a senha"}
        </Link>
        {!isCad && (
          <p className="mt-3 text-xs text-muted">Acesso restrito. Solicite cadastro ao administrador PCA.</p>
        )}
      </div>
    </form>
  );
}
