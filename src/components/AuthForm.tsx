"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { Button } from "./Button";
import { CartaoAuth, ErroAuth } from "./CartaoAuth";
import { type ConfigCaptcha, useCaptcha } from "./CodigoEmail";
import { PasswordField, TextField } from "./Field";
import { IconArrowRight, IconGoogle, IconMail } from "./icons";

// Tela de LOGIN — e-mail + senha (com o captcha do ADM) ou a conta Google vinculada. O cadastro e o "Esqueci a senha"
// têm telas próprias (`CadastroForm`/`RecuperarSenhaForm`), na MESMA moldura (`CartaoAuth`).
export function AuthForm({
  turnstile,
  google = false,
  googleConta = null,
  erroInicial = null,
}: {
  /** Captcha do ADM — só renderiza/exige quando ativo E configurado. */
  turnstile?: ConfigCaptcha;
  /** Login com Google ativo (Integrações) → botão "Entrar com Google". */
  google?: boolean;
  /** A conta Google LEMBRADA neste aparelho → "Continuar como …" entra direto nela (sem escolher a conta). */
  googleConta?: string | null;
  /** A mensagem da volta do Google (`/login?erro=`). */
  erroInicial?: string | null;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(erroInicial);
  const captcha = useCaptcha(turnstile);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!captcha.pronto) {
      setErro("Confirme que você não é um robô.");
      return;
    }
    setLoading(true);
    setErro(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, senha, ...(captcha.token ? { token: captcha.token } : {}) }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "Ocorreu um erro.");
      router.push("/painel");
      router.refresh();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Ocorreu um erro.");
      if (captcha.usa) captcha.renovar();
    } finally {
      setLoading(false);
    }
  }

  return (
    <CartaoAuth titulo="Entrar na plataforma" onSubmit={submit}>
      <div className="space-y-[var(--gap-block)]">
        <TextField
          label="E-mail"
          icon={<IconMail className="h-5 w-5" />}
          type="email"
          inputMode="email"
          placeholder="voce@rioverde.go.gov.br"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="username"
          required
        />
        <PasswordField value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="current-password" required />
        <div className="-mt-1 flex justify-end">
          <Link href="/recuperar-senha" className="inline-flex min-h-11 items-center text-[13px] font-semibold text-accent hover:underline lg:min-h-0">
            Esqueci a senha
          </Link>
        </div>
        {captcha.widget}
      </div>

      {erro && <ErroAuth>{erro}</ErroAuth>}

      <Button
        type="submit"
        variant="accent"
        loading={loading}
        icon={!loading && <IconArrowRight className="h-4 w-4" />}
        className="mt-6 h-[52px] w-full text-[15px]"
      >
        Entrar
      </Button>

      {google && (
        <>
          <div className="my-4 flex items-center gap-3 text-[12px] text-faint" aria-hidden="true">
            <span className="h-px flex-1 bg-border" />
            ou
            <span className="h-px flex-1 bg-border" />
          </div>
          <a
            href="/api/auth/google"
            className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-control border border-border-2 bg-surface px-3 text-[15px] font-semibold text-text transition hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <IconGoogle className="h-5 w-5 shrink-0" />
            {googleConta ? (
              <span className="min-w-0 truncate">
                Continuar como <span className="font-normal text-text-2">{googleConta}</span>
              </span>
            ) : (
              "Entrar com Google"
            )}
          </a>
          {googleConta && (
            <a
              href="/api/auth/google?trocar=1"
              className="mx-auto mt-1 flex min-h-11 w-fit items-center px-2 text-[13px] font-semibold text-accent hover:underline"
            >
              Usar outra conta Google
            </a>
          )}
        </>
      )}

      <div className="mt-5 text-center">
        <p className="text-sm text-muted">
          Primeiro acesso?{" "}
          <Link href="/cadastro" className="font-semibold text-accent hover:underline">
            Criar conta
          </Link>
        </p>
        <p className="mt-2 text-xs text-faint">Acesso restrito aos servidores da Prefeitura. O cadastro passa pela aprovação do administrador.</p>
      </div>
    </CartaoAuth>
  );
}
