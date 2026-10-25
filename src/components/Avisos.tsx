"use client";

import type { ReactNode } from "react";
import { Dropdown } from "./Dropdown";
import { IconAvisos } from "./icons";

/** Um aviso: o texto e o tom (`warn` = atenção, `danger` = erro, `info` = informação). */
export type Aviso = { id: string; texto: ReactNode; tom?: "info" | "warn" | "danger" };

const COR: Record<NonNullable<Aviso["tom"]>, string> = { info: "var(--info)", warn: "var(--warn)", danger: "var(--danger)" };
const PESO: Record<NonNullable<Aviso["tom"]>, number> = { info: 0, warn: 1, danger: 2 };

/**
 * AVISOS (!) — o irmão do (?) (`Ajuda`): um botão só-ícone, no MESMO desenho dos botões da barra (`Button variant="icon"`,
 * `--h-control-sm`; 44px no toque), que guarda TODAS as mensagens da tela num painel flutuante — nada de faixas que empurram
 * a tela. O ícone toma a cor do aviso mais grave e leva a contagem quando há atenção ou erro; só informação, fica neutro.
 * Sem avisos, não aparece (quem usa o põe na barra de ferramentas, onde não desloca nada).
 */
export function Avisos({ avisos, titulo = "Avisos" }: { avisos: readonly Aviso[]; titulo?: string }) {
  if (!avisos.length) return null;
  const pior = avisos.reduce<NonNullable<Aviso["tom"]>>((p, a) => (PESO[a.tom ?? "info"] > PESO[p] ? (a.tom ?? "info") : p), "info");
  const alerta = avisos.filter((a) => (a.tom ?? "info") !== "info").length;
  const rotulo = alerta ? `${titulo} (${alerta})` : titulo;
  return (
    <Dropdown
      papel="dialog"
      align="end"
      width={360}
      ariaLabel={rotulo}
      title={rotulo}
      triggerClassName="relative h-11 w-11 shrink-0 justify-center !rounded-control border border-border-2 bg-surface transition-colors hover:bg-surface-2 lg:h-[var(--h-control-sm)] lg:w-[var(--h-control-sm)]"
      trigger={
        <>
          <IconAvisos className="h-4 w-4" style={{ color: pior === "info" ? "var(--text-2)" : COR[pior] }} />
          {alerta > 0 && (
            <span
              aria-hidden
              className="absolute -right-1.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] font-bold leading-none text-white tabular-nums"
              style={{ background: COR[pior] }}
            >
              {alerta}
            </span>
          )}
        </>
      }
    >
      <div className="space-y-2.5 p-1.5 text-[13px] leading-relaxed">
        <p className="text-[14px] font-semibold text-text">{titulo}</p>
        <ul className="space-y-2">
          {avisos.map((a) => (
            <li key={a.id} className="flex gap-2.5">
              <span aria-hidden className="mt-[7px] h-2 w-2 shrink-0 rounded-full" style={{ background: COR[a.tom ?? "info"] }} />
              <div className="min-w-0 text-text-2">{a.texto}</div>
            </li>
          ))}
        </ul>
      </div>
    </Dropdown>
  );
}
