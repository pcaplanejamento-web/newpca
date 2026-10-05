"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { dataVersao, linkInterno, linkNovidades, ROTULO_MUDANCA, type TipoMudanca, type Versao, VERSAO_ATUAL, VERSOES } from "@/lib/versoes";
import { Badge, type Tone } from "./Badge";
import { Button } from "./Button";
import { IconChevronRight, IconNovidades } from "./icons";

const TOM_MUDANCA: Record<TipoMudanca, Tone> = { novo: "blue", melhoria: "emerald", correcao: "amber" };

/** UMA versão: número, data, título e cada mudança com a área, o tipo e o botão que leva ATÉ ONDE mudou. */
export function CartaoVersao({ v, atual = false, destaque = false }: { v: Versao; atual?: boolean; destaque?: boolean }) {
  return (
    <article
      id={`versao-${v.versao}`}
      aria-labelledby={`versao-${v.versao}-titulo`}
      className={`scroll-mt-4 rounded-card border bg-surface p-[var(--pad-card)] shadow-ring transition-shadow duration-[var(--motion-duration)] ${
        destaque ? "border-accent ring-2 ring-accent/30" : "border-border"
      }`}
    >
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="rounded-control bg-accent-soft px-2 py-0.5 font-mono text-[13px] font-semibold text-accent">v{v.versao}</span>
        <h2 id={`versao-${v.versao}-titulo`} className="text-[15px] font-semibold text-text">
          {v.titulo}
        </h2>
        {atual && <Badge tone="emerald">Atual</Badge>}
        <time dateTime={v.data} className="ml-auto text-[12px] text-muted">
          {dataVersao(v.data)}
        </time>
      </header>
      <ul className="mt-2 divide-y divide-border">
        {v.mudancas.map((m) => (
          <li key={`${m.area}:${m.texto}`} className="flex items-center gap-3 py-2">
            <Badge tone={TOM_MUDANCA[m.tipo]}>{ROTULO_MUDANCA[m.tipo]}</Badge>
            <p className="min-w-0 flex-1 text-[13.5px] leading-snug text-text-2">
              <span className="font-medium text-text">{m.area}:</span> {m.texto}
            </p>
            {m.link && linkInterno(m.link) && (
              <Button href={m.link} size="sm" variant="secondary" title={`Ir até onde mudou (${m.area})`}>
                <span className="hidden sm:inline">Ver onde mudou</span>
                <IconChevronRight className="h-4 w-4" />
              </Button>
            )}
          </li>
        ))}
      </ul>
    </article>
  );
}

/** A versão já vista NESTE aparelho (conveniência: o ponto de "novo" no menu some depois de abrir as Novidades). */
const CHAVE_VISTA = "sistema:versao-vista";
const lerVista = () => {
  try {
    return localStorage.getItem(CHAVE_VISTA);
  } catch {
    return null;
  }
};
const marcarVista = () => {
  try {
    localStorage.setItem(CHAVE_VISTA, VERSAO_ATUAL);
  } catch {
    /* sem armazenamento: o ponto só não some */
  }
  window.dispatchEvent(new Event(CHAVE_VISTA));
};

/** O NÚMERO DA VERSÃO no fim do menu lateral: leva às Novidades; o ponto marca a versão ainda não vista aqui. */
export function VersaoSistema({ onNavigate }: { onNavigate?: () => void }) {
  const [nova, setNova] = useState(false);
  useEffect(() => {
    const ler = () => setNova(lerVista() !== VERSAO_ATUAL);
    ler();
    window.addEventListener(CHAVE_VISTA, ler);
    return () => window.removeEventListener(CHAVE_VISTA, ler);
  }, []);
  return (
    <Link
      href={linkNovidades()}
      onClick={onNavigate}
      title={nova ? `Versão ${VERSAO_ATUAL} — veja o que mudou` : `Versão ${VERSAO_ATUAL} — novidades`}
      className="group/versao flex min-h-11 items-center justify-center gap-1.5 rounded-control px-2 text-[12px] text-faint transition-colors hover:bg-surface-2 hover:text-text-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 lg:min-h-8"
    >
      <IconNovidades className={`h-3.5 w-3.5 ${nova ? "text-accent" : ""}`} />
      <span className="font-mono">v{VERSAO_ATUAL}</span>
      {nova && (
        <>
          <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
          <span className="sr-only">(novidades não vistas)</span>
        </>
      )}
    </Link>
  );
}

/** A página de NOVIDADES: o histórico de versões, a mais recente primeiro; `versao` = a destacada (o aviso do sino). */
export function Novidades({ versao }: { versao?: string | null }) {
  const alvo = useRef<string | null>(versao ?? null);
  useEffect(() => {
    marcarVista();
    if (!alvo.current) return;
    document.getElementById(`versao-${alvo.current}`)?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, []);
  return (
    <div className="mx-auto w-full max-w-4xl space-y-[var(--gap-block)]">
      <div className="flex items-center gap-2">
        <IconNovidades className="h-5 w-5 text-accent" />
        <h1 className="text-xl font-bold text-text">Novidades</h1>
        <span className="ml-auto font-mono text-[13px] text-muted">Versão atual: v{VERSAO_ATUAL}</span>
      </div>
      {VERSOES.map((v) => (
        <CartaoVersao key={v.versao} v={v} atual={v.versao === VERSAO_ATUAL} destaque={v.versao === versao} />
      ))}
    </div>
  );
}
