"use client";

import type { FocusEventHandler, ReactNode } from "react";
import { DIGITOS_MATRICULA, filtrarMatricula } from "@/lib/cadastro-core";
import { TextField } from "./Field";
import { IconIdCard } from "./icons";

/** O avanço de cada posição: 1 caractere monoespaçado + o espaçamento entre letras (o MESMO do `<input>`). */
const ESPACO = "0.5em";
/** As 6 posições (1ª a 6ª). */
const POSICOES = Array.from({ length: DIGITOS_MATRICULA }, (_, i) => i);

/**
 * MATRÍCULA — o campo com as 6 POSIÇÕES desenhadas no fundo: cada posição ainda vazia mostra um "0" apagado sobre um
 * traço; o que a pessoa digita ocupa a posição (fonte monoespaçada alinhada ao desenho). Só aceita dígitos, no máximo 6
 * (`filtrarMatricula`). Sem `label`, só a caixa (ex.: dentro do campo com cadeado do banner do ADM).
 */
export function CampoMatricula({
  valor,
  onValor,
  label,
  rotuloExtra,
  error,
  onBlur,
  denso = true,
  autoFocus,
  id,
}: {
  valor: string;
  onValor: (digitos: string) => void;
  label?: string;
  rotuloExtra?: ReactNode;
  error?: string;
  onBlur?: FocusEventHandler<HTMLInputElement>;
  denso?: boolean;
  autoFocus?: boolean;
  id?: string;
}) {
  return (
    <TextField
      id={id}
      label={label}
      rotuloExtra={rotuloExtra}
      aria-label={label ? undefined : "Matrícula"}
      icon={<IconIdCard className="h-5 w-5" />}
      fundo={
        <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 flex items-center font-mono text-[15px]">
          {POSICOES.map((i) => (
            <span
              key={i}
              className="relative inline-block text-center"
              style={{ width: `calc(1ch + ${ESPACO})`, paddingRight: ESPACO }}
            >
              <span className={i < valor.length ? "invisible" : "text-faint opacity-60"}>0</span>
              <span className={`absolute bottom-[-5px] left-0 h-px w-[1ch] ${i < valor.length ? "bg-accent" : "bg-border-2"}`} />
            </span>
          ))}
        </span>
      }
      classeEntrada="font-mono"
      style={{ letterSpacing: ESPACO }}
      value={valor}
      onChange={(e) => onValor(filtrarMatricula(e.target.value))}
      onBlur={onBlur}
      error={error}
      inputMode="numeric"
      pattern="[0-9]*"
      autoComplete="off"
      maxLength={DIGITOS_MATRICULA}
      autoFocus={autoFocus}
      denso={denso}
      required
    />
  );
}
