"use client";

import { type KeyboardEvent, type ReactNode, useEffect, useId, useMemo, useRef, useState } from "react";
import { type CampoDado, camposEmOrdem, filtrarCampos, gruposDeCampos, textoDoCampo } from "@/lib/campos-dados-core";
import { Dropdown } from "./Dropdown";
import { SearchField } from "./Field";
import { IconVariavel } from "./icons";

/**
 * A LISTA dos CAMPOS DE DADOS (`campos-dados-core.ts`) — o "teclado de emojis" dos dados consolidados: por grupo, cada um
 * com o nome, a descrição, o valor de agora e a chave. Duas formas: `ListaCampos` (a lista, com ou sem busca — o painel do
 * botão e as sugestões ao digitar "{{") e `BotaoCampos` (o botão "Inserir dado" que abre a lista com a busca). Escolher
 * chama `onEscolher(campo)`; quem usa insere o chip.
 */
export function ListaCampos({
  campos,
  termo,
  ativa,
  onAtiva,
  onEscolher,
  id,
}: {
  campos: readonly CampoDado[];
  termo: string;
  /** O índice destacado (↑/↓ — controlado por quem tem o teclado). */
  ativa: number;
  onAtiva?: (i: number) => void;
  onEscolher: (c: CampoDado) => void;
  id?: string;
}) {
  const lista = useMemo(() => filtrarCampos(campos, termo), [campos, termo]);
  const grupos = useMemo(() => gruposDeCampos(lista), [lista]);
  const ref = useRef<HTMLDivElement>(null);
  // O destacado fica à vista (↑/↓ numa lista longa).
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>(`[data-indice="${ativa}"]`)?.scrollIntoView({ block: "nearest" });
  }, [ativa]);
  if (!lista.length) return <p className="px-3 py-3 text-[13px] text-muted">Nenhum dado com “{termo}”.</p>;
  let k = -1;
  return (
    <div ref={ref} id={id} role="listbox" aria-label="Dados disponíveis" className="max-h-[min(22rem,50dvh)] overflow-y-auto overscroll-contain py-1">
      {grupos.map((g) => (
        // biome-ignore lint/a11y/useSemanticElements: grupo de opções de um listbox (fieldset não cabe aqui).
        <div key={g.grupo} role="group" aria-label={g.grupo}>
          <p className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-faint">{g.grupo}</p>
          {g.campos.map((c) => {
            k++;
            const i = k;
            return (
              <button
                key={c.chave}
                type="button"
                role="option"
                aria-selected={i === ativa}
                data-indice={i}
                tabIndex={-1}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => onAtiva?.(i)}
                onClick={() => onEscolher(c)}
                title={c.descricao}
                className={`flex min-h-11 w-full items-center gap-3 px-3 py-1.5 text-left desktop:min-h-9 ${i === ativa ? "bg-accent-soft" : "hover:bg-surface-2"}`}
              >
                <span className="campo-dado shrink-0">{c.rotulo}</span>
                <span className="min-w-0 flex-1">
                  {c.descricao && <span className="block truncate text-[12px] text-muted">{c.descricao}</span>}
                  {c.exemplo && <span className="block truncate text-[12px] font-medium text-text tabular-nums">{c.exemplo}</span>}
                </span>
                <code className="hidden shrink-0 font-mono text-[11px] text-faint sm:inline">{textoDoCampo(c.chave)}</code>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** O botão "Inserir dado" (a lista com a busca num painel preso a ele). `trigger` = o desenho do botão (padrão: o ícone). */
export function BotaoCampos({
  campos,
  onEscolher,
  disabled = false,
  triggerClassName,
  trigger,
}: {
  campos: readonly CampoDado[];
  onEscolher: (c: CampoDado) => void;
  disabled?: boolean;
  triggerClassName?: string;
  trigger?: ReactNode;
}) {
  return (
    <Dropdown
      ariaLabel="Inserir dado"
      title="Inserir dado (ou digite {{ no texto)"
      papel="dialog"
      width={380}
      bloqueado={disabled}
      gatilho={{ onMouseDown: (e) => e.preventDefault() }}
      triggerClassName={
        triggerClassName ??
        "inline-flex h-11 shrink-0 items-center gap-1.5 rounded-control px-2 text-[13px] font-medium text-text-2 hover:bg-surface-2 hover:text-text desktop:h-8"
      }
      trigger={
        trigger ?? (
          <>
            <IconVariavel className="h-4 w-4" />
            <span>Dado</span>
          </>
        )
      }
    >
      {(fechar, { teclado }) => (
        <PainelCampos
          campos={campos}
          focar={teclado}
          onEscolher={(c) => {
            fechar();
            onEscolher(c);
          }}
        />
      )}
    </Dropdown>
  );
}

function PainelCampos({ campos, onEscolher, focar }: { campos: readonly CampoDado[]; onEscolher: (c: CampoDado) => void; focar: boolean }) {
  const [termo, setTermo] = useState("");
  const [ativa, setAtiva] = useState(0);
  const lista = useMemo(() => camposEmOrdem(campos, termo), [campos, termo]);
  const idLista = useId();
  const teclas = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (lista.length) setAtiva((a) => (a + (e.key === "ArrowDown" ? 1 : lista.length - 1)) % lista.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const c = lista[Math.min(ativa, lista.length - 1)];
      if (c) onEscolher(c);
    }
  };
  return (
    <div className="w-full">
      <div className="border-b border-border p-2">
        <SearchField
          compacto
          value={termo}
          autoFocus={focar || undefined}
          onChange={(e) => {
            setTermo(e.target.value);
            setAtiva(0);
          }}
          onClear={() => setTermo("")}
          onKeyDown={teclas}
          placeholder="Procurar um dado…"
          aria-label="Procurar um dado"
          aria-controls={idLista}
        />
      </div>
      <ListaCampos id={idLista} campos={campos} termo={termo} ativa={ativa} onAtiva={setAtiva} onEscolher={onEscolher} />
    </div>
  );
}
