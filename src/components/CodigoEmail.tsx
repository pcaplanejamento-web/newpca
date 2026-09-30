"use client";

import { type ReactNode, useCallback, useEffect, useState } from "react";
import type { FinalidadeCodigo } from "@/lib/codigo-email-core";
import { Button } from "./Button";
import { TextField } from "./Field";
import { IconChevronLeft, IconMailCheck, IconRefresh } from "./icons";
import { Turnstile } from "./Turnstile";
import { VerificacaoRobo } from "./VerificacaoRobo";

// CONFIRMAÇÃO POR CÓDIGO de 6 dígitos enviado ao e-mail — as peças usadas no cadastro, no "Esqueci a senha" e na troca de
// senha do Perfil: o captcha ANTES de cada envio (`useCaptcha`), o envio com o cronômetro para reenviar
// (`useCodigoEmail`), o campo do código (`CampoCodigo`) e a etapa inteira (`EtapaCodigo`). Tudo por token.

export type ConfigCaptcha = { enabled: boolean; siteKey: string } | undefined;

/**
 * O CAPTCHA — SEMPRE presente: o Turnstile quando o ADM o configurou, senão a verificação anti-robô própria
 * (`VerificacaoRobo`). `renovar` remonta o widget (o token vale uma vez); a própria já volta verificando sozinha.
 */
export function useCaptcha(turnstile: ConfigCaptcha) {
  const usaTurnstile = !!turnstile?.enabled && !!turnstile.siteKey;
  const [token, setToken] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const renovar = useCallback(() => {
    setToken(null);
    setNonce((n) => n + 1);
  }, []);
  const widget =
    usaTurnstile && turnstile ? (
      <Turnstile key={nonce} siteKey={turnstile.siteKey} onToken={setToken} />
    ) : (
      <VerificacaoRobo key={nonce} onToken={setToken} automatico={nonce > 0} />
    );
  return { token, pronto: !!token, widget, renovar };
}

/** Segundos até um instante (0 quando passou), atualizado a cada segundo. */
function useContagem(ate: number | null): number {
  const calc = useCallback(() => (ate ? Math.max(0, Math.ceil((ate - Date.now()) / 1000)) : 0), [ate]);
  const [restante, setRestante] = useState(calc);
  useEffect(() => {
    setRestante(calc());
    if (!ate) return;
    const t = setInterval(() => {
      const r = calc();
      setRestante(r);
      if (r <= 0) clearInterval(t);
    }, 1000);
    return () => clearInterval(t);
  }, [ate, calc]);
  return restante;
}

/**
 * Pedir o código (`POST /api/auth/codigo`) e o cronômetro do reenvio. `enviar` devolve a mensagem de erro (ou `null`);
 * `destino` = o e-mail para onde foi enviado (a etapa do código aparece a partir daí).
 */
export function useCodigoEmail(finalidade: FinalidadeCodigo) {
  const [destino, setDestino] = useState<string | null>(null);
  const [reenviarEm, setReenviarEm] = useState<number | null>(null);
  const [enviando, setEnviando] = useState(false);
  const restante = useContagem(reenviarEm);

  const enviar = useCallback(
    async (email: string, token: string | null, extra?: { matricula?: string }): Promise<string | null> => {
      setEnviando(true);
      try {
        const res = await fetch("/api/auth/codigo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, finalidade, ...extra, ...(token ? { token } : {}) }),
        });
        const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; reenviarS?: number; esperarS?: number };
        if (j.esperarS) setReenviarEm(Date.now() + j.esperarS * 1000);
        if (!res.ok || !j.ok) return j.error ?? "Não foi possível enviar o código.";
        setDestino(email);
        setReenviarEm(Date.now() + (j.reenviarS ?? 60) * 1000);
        return null;
      } catch {
        return "Sem conexão. Tente de novo.";
      } finally {
        setEnviando(false);
      }
    },
    [finalidade],
  );

  /** Volta à etapa anterior (corrigir os dados) — o cronômetro continua valendo. */
  const voltar = useCallback(() => setDestino(null), []);
  return { destino, restante, enviando, enviar, voltar };
}

/** O campo do código: 6 dígitos, teclado numérico no celular e o preenchimento automático do SMS/e-mail. */
export function CampoCodigo({ value, onChange, disabled, autoFocus }: { value: string; onChange: (v: string) => void; disabled?: boolean; autoFocus?: boolean }) {
  return (
    <TextField
      label="Código de confirmação"
      icon={<IconMailCheck className="h-5 w-5" />}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="\d{6}"
      maxLength={6}
      placeholder="000000"
      disabled={disabled}
      autoFocus={autoFocus}
      required
      style={{ letterSpacing: "0.4em", fontVariantNumeric: "tabular-nums", fontFamily: "var(--font-mono)", fontSize: 18 }}
    />
  );
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/**
 * A ETAPA do código: para onde foi enviado, o campo e o REENVIO cronometrado (com o captcha antes de reenviar, quando o
 * ADM o ativou). `onVoltar` = corrigir os dados da etapa anterior.
 */
export function EtapaCodigo({
  destino,
  codigo,
  onCodigo,
  restante,
  reenviando,
  onReenviar,
  captcha,
  podeReenviar = true,
  onVoltar,
  disabled,
}: {
  destino: string;
  codigo: string;
  onCodigo: (v: string) => void;
  restante: number;
  reenviando: boolean;
  onReenviar: () => void;
  /** O widget do captcha — aparece quando já dá para reenviar. */
  captcha?: ReactNode;
  /** O captcha já foi resolvido. */
  podeReenviar?: boolean;
  onVoltar?: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-[var(--gap-block)]">
      <p className="text-sm text-text-2">
        Enviamos um código de 6 dígitos para <strong className="break-all text-text">{destino}</strong>. Confira também a caixa de spam.
      </p>
      <CampoCodigo value={codigo} onChange={onCodigo} disabled={disabled} autoFocus />
      {restante > 0 ? (
        <p className="text-[13px] text-muted" aria-live="polite">
          Reenviar outro código em <span className="font-mono font-semibold tabular-nums text-text-2">{fmt(restante)}</span>
        </p>
      ) : (
        <div className="space-y-3">
          {captcha}
          <Button
            variant="secondary"
            size="sm"
            onClick={onReenviar}
            loading={reenviando}
            disabled={disabled || !podeReenviar}
            icon={<IconRefresh className="h-4 w-4" />}
          >
            Reenviar código
          </Button>
        </div>
      )}
      {onVoltar && (
        <button
          type="button"
          onClick={onVoltar}
          disabled={disabled}
          className="inline-flex min-h-11 items-center gap-1.5 text-[13px] font-semibold text-accent hover:underline disabled:opacity-60 lg:min-h-0"
        >
          <IconChevronLeft className="h-4 w-4" /> Corrigir os dados
        </button>
      )}
    </div>
  );
}
