"use client";

import { useRouter } from "next/navigation";
import { problemaSenha } from "@/lib/cadastro-core";
import { type FormEvent, useState } from "react";
import { Button } from "./Button";
import { CartaoAuth, ConcluidoAuth, ErroAuth } from "./CartaoAuth";
import { type ConfigCaptcha, EtapaCodigo, useCaptcha, useCodigoEmail } from "./CodigoEmail";
import { PasswordField, TextField } from "./Field";
import { IconArrowRight, IconMail } from "./icons";

/**
 * "ESQUECI A SENHA" — um dos modos da `TelaAcesso` (e criar a senha de quem só entrava pelo Google), em 2 etapas: (1) o e-mail da conta + a nova senha
 * (+ captcha) → envia o código; (2) o código de 6 dígitos confirma a senha — com a conta ativa, já entra.
 */
export function RecuperarSenhaForm({ onVoltar, turnstile }: { onVoltar: () => void; turnstile?: ConfigCaptcha }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [codigo, setCodigo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [pendente, setPendente] = useState(false);
  const captcha = useCaptcha(turnstile);
  const cod = useCodigoEmail("senha");

  async function enviarCodigo() {
    const falha = await cod.enviar(email.trim().toLowerCase(), captcha.token);
    captcha.renovar();
    setErro(falha);
    if (!falha) setCodigo("");
  }

  async function etapaDados(e: FormEvent) {
    e.preventDefault();
    const ps = problemaSenha(senha);
    if (ps) return setErro(ps);
    if (senha !== confirmar) return setErro("A confirmação não coincide com a senha.");
    if (!captcha.pronto) return setErro("Confirme que você não é um robô.");
    await enviarCodigo();
  }

  async function etapaCodigo(e: FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(codigo)) return setErro("Informe os 6 dígitos do código.");
    setSalvando(true);
    setErro(null);
    try {
      const res = await fetch("/api/auth/senha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: cod.destino, senha, codigo }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; pendente?: boolean };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "Não foi possível salvar a senha.");
      if (j.pendente) return setPendente(true);
      router.push("/painel");
      router.refresh();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível salvar a senha.");
    } finally {
      setSalvando(false);
    }
  }

  if (pendente)
    return (
      <ConcluidoAuth titulo="Senha salva!" onVoltar={onVoltar}>
        A nova senha já vale. Sua conta ainda está <strong className="text-text-2">pendente de aprovação</strong> — você poderá entrar assim que
        for liberada.
      </ConcluidoAuth>
    );

  if (cod.destino)
    return (
      <CartaoAuth titulo="Confirme a nova senha" etapa="Etapa 2 de 2" subtitulo="Digite o código de 6 dígitos que enviamos." onSubmit={etapaCodigo}>
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
          disabled={salvando}
        />
        <p className="mt-3 text-[12px] text-faint">Se o e-mail não for de uma conta cadastrada, nenhum código é enviado.</p>
        {erro && <ErroAuth onFechar={() => setErro(null)}>{erro}</ErroAuth>}
        <Button type="submit" variant="accent" loading={salvando} disabled={codigo.length !== 6} className="mt-6 h-[52px] w-full text-[15px]">
          Confirmar e salvar a senha
        </Button>
      </CartaoAuth>
    );

  return (
    <CartaoAuth
      titulo="Redefinir a senha"
      etapa="Etapa 1 de 2"
      subtitulo="Informe o e-mail da conta e a nova senha — um código de confirmação vai para o seu e-mail."
      onSubmit={etapaDados}
    >
      <div className="space-y-[var(--gap-block)]">
        <TextField
          label="E-mail da conta"
          icon={<IconMail className="h-5 w-5" />}
          type="email"
          inputMode="email"
          placeholder="voce@rioverde.go.gov.br"
          value={email}
          onChange={(e) => setEmail(e.target.value.replace(/\s/g, ""))}
          autoComplete="username"
          maxLength={160}
          required
        />
        <PasswordField
          label="Nova senha"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          hint="Mínimo de 8 caracteres."
          autoComplete="new-password"
          minLength={8}
          maxLength={128}
          required
        />
        <PasswordField label="Confirmar a nova senha" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} autoComplete="new-password" minLength={8} maxLength={128} required />
        {captcha.widget}
      </div>
      {erro && <ErroAuth onFechar={() => setErro(null)}>{erro}</ErroAuth>}
      <Button
        type="submit"
        variant="accent"
        loading={cod.enviando}
        icon={!cod.enviando && <IconArrowRight className="h-4 w-4" />}
        className="mt-6 h-[52px] w-full text-[15px]"
      >
        Enviar código de confirmação
      </Button>
      <div className="mt-4 text-center">
        <button type="button" onClick={onVoltar} className="inline-flex min-h-11 items-center text-sm font-semibold text-accent hover:underline lg:min-h-0">
          Voltar para entrar
        </button>
      </div>
    </CartaoAuth>
  );
}
