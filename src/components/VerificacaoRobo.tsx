"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { procurarSolucao, tokenDesafio } from "@/lib/desafio-core";
import { IconAlert, IconCheck, IconShield, IconSpinner } from "./icons";

// VERIFICAÇÃO ANTI-ROBÔ PRÓPRIA — o captcha do sistema quando o Turnstile não está configurado (Integrações). Marcar
// "Não sou um robô" pede um desafio ao servidor e o navegador o resolve (prova de trabalho, ~1 s, em fatias — a tela não
// trava); o token vale UMA vez. `automatico` = já começa resolvendo (a renovação depois de um envio). 100% por token.

type Estado = "livre" | "verificando" | "ok" | "erro";

/** Quantos números por fatia (≈ 10 ms) antes de devolver a vez à tela. */
const FATIA = 4000;

export function VerificacaoRobo({ onToken, automatico = false }: { onToken: (t: string | null) => void; automatico?: boolean }) {
  const [estado, setEstado] = useState<Estado>("livre");
  const [msg, setMsg] = useState<string | null>(null);
  const vivo = useRef(true);
  useEffect(() => {
    vivo.current = true;
    return () => {
      vivo.current = false;
    };
  }, []);

  const verificar = useCallback(async () => {
    setEstado("verificando");
    setMsg(null);
    onToken(null);
    try {
      const r = await fetch("/api/auth/desafio", { method: "POST" });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; desafio?: string; bits?: number };
      if (!r.ok || !j.ok || !j.desafio) throw new Error(j.error ?? "Não foi possível iniciar a verificação.");
      const desafio = j.desafio;
      const bits = j.bits;
      let de = 0;
      for (;;) {
        if (!vivo.current) return;
        const n = procurarSolucao(desafio, de, FATIA, bits);
        if (n !== null) {
          setEstado("ok");
          onToken(tokenDesafio(desafio, n));
          return;
        }
        de += FATIA;
        await new Promise((ok) => setTimeout(ok, 0));
      }
    } catch (e) {
      if (!vivo.current) return;
      setEstado("erro");
      setMsg(e instanceof Error ? e.message : "Falha na verificação.");
    }
  }, [onToken]);

  // A renovação (depois de um envio) já começa verificando — a pessoa não marca de novo.
  // biome-ignore lint/correctness/useExhaustiveDependencies: só na montagem.
  useEffect(() => {
    if (automatico) void verificar();
  }, []);

  const marcado = estado === "ok";
  return (
    <div
      className={`flex h-11 items-center gap-3 rounded-control border px-3 transition-colors duration-[var(--motion-duration)] ${
        estado === "erro" ? "border-[var(--danger)]" : "border-border-2"
      } bg-surface-2`}
    >
      <label className="flex h-full min-w-0 flex-1 cursor-pointer items-center gap-2.5">
        <input
          type="checkbox"
          className="peer sr-only"
          checked={marcado}
          aria-busy={estado === "verificando"}
          disabled={estado === "verificando" || marcado}
          onChange={() => void verificar()}
        />
        <span
          className={`grid h-5 w-5 shrink-0 place-items-center rounded-chip border transition-colors duration-[var(--motion-duration)] peer-focus-visible:ring-2 peer-focus-visible:ring-accent/40 ${
            marcado ? "border-[var(--ok)] bg-[var(--ok)] text-white" : "border-border-2 bg-surface"
          }`}
        >
          {marcado && <IconCheck className="h-3.5 w-3.5" />}
          {estado === "verificando" && <IconSpinner className="h-3.5 w-3.5 text-accent" />}
        </span>
        <span className="min-w-0 truncate text-[14px] text-text-2">
          {estado === "verificando" ? "Verificando…" : marcado ? "Verificado" : "Não sou um robô"}
        </span>
      </label>
      {estado === "erro" ? (
        <span role="alert" className="flex min-w-0 items-center gap-1 text-[12px] text-[var(--danger)]" title={msg ?? undefined}>
          <IconAlert className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">Tente de novo</span>
        </span>
      ) : (
        <span className="flex shrink-0 items-center gap-1 text-[11px] text-faint" title="Verificação anti-robô do sistema">
          <IconShield className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Anti-robô</span>
        </span>
      )}
    </div>
  );
}
