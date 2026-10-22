"use client";

import { useState } from "react";
import { Dropdown } from "./Dropdown";
import { ehDesktop, tokenPx } from "./espacamento";
import { IconBox, IconSpinner } from "./icons";
import { PcaCard, type PcaCardDados } from "./PcaCard";
import { SetaDropdown } from "./SetaDropdown";

/** A largura FIXA de cada cartão no painel (4:5 sólido — nunca esticado). */
const CARTAO_PX = 208;

/**
 * O SELETOR DE PCA — o MESMO no cabeçalho do painel e da tela pública: o gatilho na altura dos controles e, aberto, os
 * CARTÕES 4:5 de cada PCA (`soImagem` = só a capa). O painel tem a largura dos cartões — o espaço entre eles e até a borda
 * = `--gap-block` — e no máximo a borda do display; no celular sobe de baixo (folha, dois por linha).
 * - `href` = cada cartão é um link (tela pública); `onEscolher` = quem usa decide (o filtro do painel).
 * - `todos` = o 1º cartão é "Todos os PCAs" (`null`); com ele, o gatilho fica em destaque enquanto filtra.
 */
export function PcaSeletor({
  pcas,
  atual,
  href,
  onEscolher,
  todos = false,
  trocando = false,
  soImagem = false,
  align = "start",
}: {
  pcas: PcaCardDados[];
  atual: number | null;
  href?: (id: number) => string;
  onEscolher?: (id: number | null) => void;
  todos?: boolean;
  trocando?: boolean;
  soImagem?: boolean;
  align?: "start" | "end";
}) {
  const [aberto, setAberto] = useState(false);
  const [folha, setFolha] = useState(false);
  const [largura, setLargura] = useState(0);
  if (pcas.length === 0) return null;
  const ativo = pcas.find((p) => p.id === atual) ?? (todos ? null : pcas[0]);
  const total = pcas.length + (todos ? 1 : 0);
  return (
    <Dropdown
      papel="dialog"
      className="min-w-0"
      align={align}
      ariaLabel={`Escolher o PCA — ${ativo ? ativo.nome : "todos os PCAs"}`}
      title="Escolher o PCA"
      folha={folha}
      width={largura || undefined}
      aberto={aberto}
      onAberto={(v) => {
        if (v) {
          setFolha(!ehDesktop());
          // Cartões + espaços entre eles e até a borda (+ o p-2 e a borda do painel); o Dropdown limita ao display.
          const gap = tokenPx("--gap-block", 12);
          setLargura(total * CARTAO_PX + (total + 1) * gap + 2);
        }
        setAberto(v);
      }}
      panelClassName={folha ? "animate-folha-sobe" : "animate-selecao-entra"}
      triggerClassName={`flex h-11 min-w-0 max-w-full items-center gap-2 rounded-control border px-3 text-sm lg:h-[var(--h-control-sm)] ${
        todos && ativo ? "border-accent/50 bg-accent-soft text-accent" : "border-border-2 bg-surface text-text hover:bg-surface-2"
      }`}
      trigger={
        <>
          {trocando ? <IconSpinner className="h-4 w-4 shrink-0" /> : <IconBox className="h-[18px] w-[18px] shrink-0 opacity-60" />}
          <span className="hidden shrink-0 opacity-70 sm:inline">PCA:</span>
          <span className="min-w-0 truncate font-medium">{ativo ? ativo.nome : "Todos os PCAs"}</span>
          <SetaDropdown className="h-4 w-4 shrink-0 opacity-60" />
        </>
      }
    >
      {(fechar) => (
        <div
          role="none"
          className={`grid gap-[var(--gap-block)] p-[calc(var(--gap-block)-0.5rem)] ${folha ? "grid-cols-2" : "grid-cols-[repeat(auto-fill,13rem)] justify-center"}`}
          onClickCapture={() => fechar()}
        >
          {todos && (
            <button
              type="button"
              onClick={() => onEscolher?.(null)}
              className={`flex aspect-[4/5] flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed border-border-2 bg-surface text-sm font-semibold text-muted shadow-flutuante transition-[transform,box-shadow] duration-[var(--motion-duration)] hover:-translate-y-0.5 hover:border-accent/50 hover:text-accent hover:shadow-erguida ${ativo == null ? "ring-2 ring-accent" : ""}`}
            >
              <IconBox className="h-7 w-7" />
              Todos os PCAs
            </button>
          )}
          {pcas.map((p) => (
            <PcaCard key={p.id} pca={p} soImagem={soImagem} marcado={p.id === ativo?.id} href={href?.(p.id)} onClick={href ? undefined : () => onEscolher?.(p.id)} />
          ))}
        </div>
      )}
    </Dropdown>
  );
}
