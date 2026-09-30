"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { problemaSenha } from "@/lib/cadastro-core";
import { Button } from "./Button";
import { CartaoAuth, ErroAuth } from "./CartaoAuth";
import { type ConfigCaptcha, EtapaCodigo, useCaptcha, useCodigoEmail } from "./CodigoEmail";
import { PasswordField } from "./Field";
import { IconArrowRight, IconKey, IconLogout } from "./icons";
import { type Identidade, MarcaSistema } from "./MarcaSistema";

/**
 * TROCA DE SENHA OBRIGATÓRIA (o ADM exigiu — Usuários → o banner do usuário → "Exigir nova senha"): antes de qualquer tela
 * do painel, a pessoa cria uma senha NOVA — a MESMA régua do Perfil (letras e números, mínimo de 8) e confirmada pelo
 * código de 6 dígitos enviado ao e-mail da conta (captcha antes do envio). Concluída, o sistema abre normalmente.
 */
export function NovaSenhaObrigatoria({ email, identidade, turnstile }: { email: string; identidade?: Identidade; turnstile?: ConfigCaptcha }) {
  const router = useRouter();
  const [senha, setSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [codigo, setCodigo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);
  const [saindo, setSaindo] = useState(false);
  const captcha = useCaptcha(turnstile);
  const cod = useCodigoEmail("senha");

  async function enviarCodigo() {
    const falha = await cod.enviar(email, captcha.token);
    captcha.renovar(); // o token do captcha vale uma vez
    setErro(falha);
    if (!falha) setCodigo("");
  }

  async function concluir(e: FormEvent) {
    e.preventDefault();
    if (!cod.destino) {
      const ps = problemaSenha(senha);
      if (ps) return setErro(ps);
      if (senha !== confirmar) return setErro("A confirmação não coincide com a senha.");
      if (!captcha.pronto) return setErro("Confirme que você não é um robô.");
      return enviarCodigo();
    }
    if (!/^\d{6}$/.test(codigo)) return setErro("Informe os 6 dígitos do código.");
    setGravando(true);
    setErro(null);
    try {
      const r = await fetch("/api/perfil/senha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ novaSenha: senha, codigo }),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Não foi possível salvar a senha.");
      router.replace("/painel");
      router.refresh();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível salvar a senha.");
      setGravando(false);
    }
  }

  async function sair() {
    setSaindo(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <main className="flex min-h-dvh items-start justify-center bg-bg px-[var(--pad-canvas)] py-10 sm:items-center">
      <div className="w-full max-w-[440px] space-y-8">
        <MarcaSistema identidade={identidade} tamanho="lg" />
        <CartaoAuth
          titulo="Crie uma nova senha"
          etapa={cod.destino ? "Etapa 2 de 2" : "Etapa 1 de 2"}
          subtitulo={
            cod.destino
              ? "Digite o código de 6 dígitos que enviamos."
              : "O administrador pediu que você troque a senha antes de continuar. Use letras e números, com no mínimo 8 caracteres."
          }
          onSubmit={concluir}
        >
          {cod.destino ? (
            <EtapaCodigo
              destino={cod.destino}
              codigo={codigo}
              onCodigo={setCodigo}
              restante={cod.restante}
              reenviando={cod.enviando}
              onReenviar={enviarCodigo}
              captcha={captcha.widget}
              podeReenviar={captcha.pronto}
              onVoltar={() => {
                setErro(null);
                cod.voltar();
              }}
              disabled={gravando}
            />
          ) : (
            <div className="space-y-4">
              <PasswordField label="Nova senha" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="new-password" minLength={8} maxLength={128} />
              <PasswordField label="Confirmar senha" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} autoComplete="new-password" minLength={8} maxLength={128} />
              <div className="flex justify-center [&>*]:w-full [&>*]:max-w-[300px]">{captcha.widget}</div>
            </div>
          )}
          {erro && <ErroAuth onFechar={() => setErro(null)}>{erro}</ErroAuth>}
          <Button
            type="submit"
            variant="accent"
            loading={cod.destino ? gravando : cod.enviando}
            disabled={!!cod.destino && codigo.length !== 6}
            icon={cod.destino ? <IconKey className="h-4 w-4" /> : <IconArrowRight className="h-4 w-4" />}
            className="mt-6 h-[52px] w-full text-[15px] lg:h-[52px]"
          >
            {cod.destino ? "Salvar a nova senha" : "Enviar código de confirmação"}
          </Button>
          <p className="mt-4 text-center text-[13px] text-muted">
            O código vai para <strong className="font-semibold text-text-2">{email}</strong>.
          </p>
        </CartaoAuth>
        <div className="flex justify-center">
          <Button variant="ghost" size="sm" loading={saindo} onClick={sair} icon={<IconLogout className="h-4 w-4" />}>
            Sair
          </Button>
        </div>
      </div>
    </main>
  );
}
