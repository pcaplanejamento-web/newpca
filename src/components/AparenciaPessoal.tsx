"use client";

import { useTheme } from "next-themes";
import type { ReactNode } from "react";
import { HORARIO_DIA, horaTexto, horaValida, type ModoTema, TEMA_DO_SITE, type TomEscuro } from "@/lib/tema-pessoal-core";
import { IconClock, IconMoon, IconSun, IconTemaHorario, IconTemaSistema, IconTemaSite } from "./icons";
import { useTemaPessoal } from "./TemaPessoal";

const TONS: { id: TomEscuro; rotulo: string; fundo: string; superficie: string; linha: string }[] = [
  { id: "carvao", rotulo: "Carvão", fundo: "#0a0c11", superficie: "#141821", linha: "#2c3340" },
  { id: "azul", rotulo: "Azul-marinho", fundo: "#0b1220", superficie: "#111a2e", linha: "#27365a" },
  { id: "preto", rotulo: "Preto (OLED)", fundo: "#000000", superficie: "#0a0a0a", linha: "#2a2a2a" },
];

const campoHora =
  "h-11 w-full rounded-control border border-border-2 bg-surface px-3 text-[14px] tabular-nums text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 lg:h-[var(--h-control-sm)]";

/** Aparência da PESSOA neste navegador: o modo claro/escuro (6 opções) e a tonalidade do escuro. Grava na hora; vale antes
 * da 1ª pintura nas próximas visitas. */
export function AparenciaPessoal() {
  const { prefs, mudar } = useTemaPessoal();
  const { resolvedTheme } = useTheme();
  if (!prefs) return <div className="h-[420px]" aria-hidden="true" />;
  const agora = resolvedTheme === "dark" ? "escuro" : "claro";

  const modos: { id: ModoTema; icone: ReactNode; titulo: string; descricao: string }[] = [
    { id: "site", icone: <IconTemaSite className="h-[18px] w-[18px]" />, titulo: "Padrão do site", descricao: `Segue o modo definido pelo site (agora: ${TEMA_DO_SITE === "light" ? "claro" : "escuro"})` },
    { id: "claro", icone: <IconSun className="h-[18px] w-[18px]" />, titulo: "Claro", descricao: "Sempre no modo claro" },
    { id: "escuro", icone: <IconMoon className="h-[18px] w-[18px]" />, titulo: "Escuro", descricao: "Sempre no modo escuro" },
    { id: "sistema", icone: <IconTemaSistema className="h-[18px] w-[18px]" />, titulo: "Seguir o sistema", descricao: "Acompanha o claro/escuro do seu aparelho" },
    { id: "horario", icone: <IconTemaHorario className="h-[18px] w-[18px]" />, titulo: "Pelo horário do dia", descricao: `Claro de dia, escuro das ${horaTexto(HORARIO_DIA.inicio)} às ${horaTexto(HORARIO_DIA.fim)}` },
    { id: "personalizado", icone: <IconClock className="h-[18px] w-[18px]" />, titulo: "Horário personalizado", descricao: `Escuro das ${horaTexto(prefs.inicio)} às ${horaTexto(prefs.fim)}` },
  ];

  return (
    <div className="space-y-5">
      <fieldset>
        <legend className="mb-2 text-[13px] font-semibold text-text-2">Modo claro/escuro</legend>
        <div className="divide-y divide-border overflow-hidden rounded-card border border-border">
          {modos.map((m) => {
            const marcado = prefs.modo === m.id;
            return (
              <label
                key={m.id}
                className={`flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors hover:bg-surface-2 ${marcado ? "bg-surface-2" : ""}`}
              >
                <span className={marcado ? "text-accent" : "text-muted"}>{m.icone}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-semibold text-text">{m.titulo}</span>
                  <span className="block text-[12.5px] leading-snug text-muted">{m.descricao}</span>
                </span>
                <input
                  type="radio"
                  name="modo-tema"
                  checked={marcado}
                  onChange={() => mudar({ modo: m.id })}
                  className="h-5 w-5 shrink-0 accent-[var(--accent)]"
                />
              </label>
            );
          })}
        </div>
        {prefs.modo === "personalizado" && (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="text-[12.5px] font-semibold text-text-2">
              Escuro a partir de
              <input
                type="time"
                value={prefs.inicio}
                onChange={(e) => horaValida(e.target.value) && mudar({ inicio: e.target.value })}
                className={`${campoHora} mt-1`}
              />
            </label>
            <label className="text-[12.5px] font-semibold text-text-2">
              Claro a partir de
              <input
                type="time"
                value={prefs.fim}
                onChange={(e) => horaValida(e.target.value) && mudar({ fim: e.target.value })}
                className={`${campoHora} mt-1`}
              />
            </label>
            {prefs.inicio === prefs.fim && (
              <p className="col-span-2 text-[12px] text-[color:var(--warn)]">Início e fim iguais: fica sempre claro.</p>
            )}
          </div>
        )}
        <p className="mt-2 text-[12px] text-muted">Agora: modo {agora}. Vale neste navegador; o botão lua/sol do topo também alterna.</p>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-[13px] font-semibold text-text-2">Tonalidade do modo escuro</legend>
        <div className="grid grid-cols-3 gap-2">
          {TONS.map((t) => {
            const marcado = prefs.tom === t.id;
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={marcado}
                onClick={() => mudar({ tom: t.id })}
                className={`group rounded-card p-1.5 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${marcado ? "ring-2 ring-accent" : "ring-1 ring-border hover:ring-border-2"}`}
              >
                <span className="block rounded-control p-2" style={{ background: t.fundo }} aria-hidden="true">
                  <span className="flex items-center gap-1.5 rounded-control px-2 py-2" style={{ background: t.superficie }}>
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: t.linha }} />
                    <span className="h-1 flex-1 rounded-full" style={{ background: t.linha }} />
                  </span>
                </span>
                <span className={`mt-1.5 block text-[12.5px] ${marcado ? "font-bold text-text" : "text-muted"}`}>{t.rotulo}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[12px] text-muted">Vale sempre que o modo escuro estiver ativo.</p>
      </fieldset>
    </div>
  );
}
