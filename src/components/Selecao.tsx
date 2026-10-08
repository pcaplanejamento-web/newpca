"use client";

import { Children, type FocusEvent, Fragment, isValidElement, type KeyboardEvent, type ReactNode, type SelectHTMLAttributes, useId, useLayoutEffect, useRef, useState } from "react";
import { filtrarOpcoes, MIN_BUSCA_SELECAO, type OpcaoSelecao, opcoesIguais, proximaHabilitada, typeahead } from "@/lib/selecao-core";
import { Dropdown } from "./Dropdown";
import { SearchField } from "./Field";
import { IconCheck } from "./icons";

/** Lê as opções do `<select>` nativo (inclusive as que um componente filho renderiza — `OpcoesUnidades`, `OpcoesCargo`). */
function lerOpcoes(sel: HTMLSelectElement): OpcaoSelecao[] {
  return Array.from(sel.options, (o) => {
    const pai = o.parentElement;
    return {
      valor: o.value,
      texto: o.text,
      grupo: pai instanceof HTMLOptGroupElement ? pai.label : undefined,
      desabilitada: o.disabled || (pai instanceof HTMLOptGroupElement && pai.disabled) || undefined,
      dica: o.title || undefined,
    };
  });
}

/** O texto de um nó (o conteúdo de um `<option>`). */
function textoDoNo(n: ReactNode): string {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(textoDoNo).join("");
  return "";
}

/**
 * O texto da opção escolhida lido dos FILHOS — só para o 1º desenho (no servidor e antes do efeito ler o select): o gatilho
 * já nasce com o texto, sem piscar. Opções vindas de um componente (`OpcoesUnidades`) só aparecem depois da leitura.
 */
function textoInicial(children: ReactNode, valor: unknown): string {
  let primeiro: string | undefined;
  let achado: string | undefined;
  const alvo = valor == null ? undefined : String(valor);
  const andar = (nos: ReactNode) => {
    for (const n of Children.toArray(nos)) {
      if (achado !== undefined || !isValidElement<{ value?: unknown; children?: ReactNode }>(n)) continue;
      if (n.type === "option") {
        const t = textoDoNo(n.props.children);
        const v = n.props.value == null ? t : String(n.props.value);
        primeiro ??= t;
        if (alvo !== undefined && v === alvo) achado = t;
      } else if (typeof n.type === "string" || n.type === Fragment) andar(n.props.children);
    }
  };
  andar(children);
  return achado ?? (alvo === undefined ? (primeiro ?? "") : "");
}

/** Troca o valor do select escondido e dispara o `change` real: o `onChange` de quem usa recebe `e.target.value`. */
function escolherNoSelect(sel: HTMLSelectElement, valor: string) {
  if (sel.value === valor) return;
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(sel, valor);
  sel.dispatchEvent(new Event("change", { bubbles: true }));
}

/**
 * SELEÇÃO do sistema — o *drop-in* do `<select>`: as MESMAS props (`value`, `onChange(e)` com `e.target.value`, `disabled`,
 * `id`, `aria-*`, `onBlur`) e os MESMOS filhos (`<option>`/`<optgroup>`), mas a lista aberta é a do sistema — o `Dropdown`
 * preso ao gatilho, a escolhida em accent com o check, grupos, desabilitadas esmaecidas (o `title` da opção na dica), BUSCA
 * acima de 12 opções, 44px no toque. Teclado: ↑/↓/Home/End movem, Enter/Espaço escolhem, Esc fecha, digitar salta para a
 * opção; ↑/↓ no gatilho abrem. O `<select>` nativo fica ESCONDIDO e é a fonte das opções e do valor (formulários, `name`,
 * `required`). `className` = a CAIXA do gatilho (a mesma classe que o select usava — a seta é a do sistema); `texto` = o
 * texto à vista no lugar do da opção; `linhas` = até 2 linhas no gatilho (nomes longos).
 */
export function Selecao({
  className = "",
  texto,
  linhas = 1,
  id,
  children,
  disabled,
  onBlur,
  onFocus,
  title,
  style,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledby,
  "aria-describedby": ariaDescribedby,
  "aria-invalid": ariaInvalid,
  "aria-busy": ariaBusy,
  ...nativo
}: Omit<SelectHTMLAttributes<HTMLSelectElement>, "multiple" | "size"> & { texto?: string; linhas?: 1 | 2 }) {
  const auto = useId();
  const gid = id ?? auto;
  const listaId = `${gid}-lista`;
  const selRef = useRef<HTMLSelectElement>(null);
  const [opcoes, setOpcoes] = useState<OpcaoSelecao[]>([]);
  const [indice, setIndice] = useState(-1);
  const [aberto, setAberto] = useState(false);

  // As opções e a escolhida vêm do select (a cada render — troca o estado só quando algo mudou).
  useLayoutEffect(() => {
    const sel = selRef.current;
    if (!sel) return;
    const lidas = lerOpcoes(sel);
    setOpcoes((a) => (opcoesIguais(a, lidas) ? a : lidas));
    setIndice(sel.selectedIndex);
  });

  const escolhida = indice >= 0 ? opcoes[indice] : undefined;
  const textoGatilho = texto ?? (escolhida ? escolhida.texto : indice < 0 ? textoInicial(children, nativo.value ?? nativo.defaultValue) : "");

  function abrirPeloTeclado(e: KeyboardEvent<HTMLButtonElement>) {
    if (aberto || disabled) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setAberto(true);
    }
  }

  return (
    <>
      <Dropdown
        papel="listbox"
        className="contents"
        id={gid}
        title={title}
        triggerClassName={`seletor-sistema flex cursor-pointer items-center disabled:cursor-default ${className}`}
        aberto={aberto}
        onAberto={setAberto}
        gatilho={{
          role: "combobox",
          disabled,
          style,
          "aria-label": ariaLabel,
          "aria-labelledby": ariaLabelledby,
          "aria-describedby": ariaDescribedby,
          "aria-invalid": ariaInvalid,
          "aria-busy": ariaBusy,
          "aria-controls": aberto ? listaId : undefined,
          onKeyDown: abrirPeloTeclado,
          onFocus: onFocus as unknown as (e: FocusEvent<HTMLButtonElement>) => void,
          // Ir para a lista aberta não é sair do campo (o "tocado" de um formulário só vale ao sair de verdade).
          onBlur: (e) => {
            if ((e.relatedTarget as Element | null)?.closest?.("[data-selecao-lista]")) return;
            (onBlur as unknown as ((e: FocusEvent<HTMLButtonElement>) => void) | undefined)?.(e);
          },
        }}
        trigger={<span className={`min-w-0 flex-1 ${linhas === 2 ? "line-clamp-2 break-words leading-[1.15]" : "truncate"}`}>{textoGatilho}</span>}
      >
        {(fechar) => (
          <ListaOpcoes
            id={listaId}
            opcoes={opcoes}
            valor={escolhida?.valor}
            rotulo={ariaLabel}
            onEscolher={(v) => {
              const sel = selRef.current;
              if (sel) {
                escolherNoSelect(sel, v);
                // Sem `value` controlado (só `defaultValue`), ninguém re-renderiza: o gatilho lê a escolha aqui.
                setIndice(sel.selectedIndex);
              }
              fechar();
            }}
          />
        )}
      </Dropdown>
      {/* DEPOIS do gatilho: num `<label>` que envolve o campo, o controle rotulado é o 1º — o gatilho. */}
      <select ref={selRef} id={`${gid}-nativo`} tabIndex={-1} aria-hidden="true" className="sr-only" disabled={disabled} {...nativo}>
        {children}
      </select>
    </>
  );
}

/** A LISTA aberta: busca (acima de 12), grupos, a escolhida com o check, teclado e "digitar para saltar". */
function ListaOpcoes({
  id,
  opcoes,
  valor,
  rotulo,
  onEscolher,
}: {
  id: string;
  opcoes: OpcaoSelecao[];
  valor?: string;
  rotulo?: string;
  onEscolher: (valor: string) => void;
}) {
  const [busca, setBusca] = useState("");
  const comBusca = opcoes.length > MIN_BUSCA_SELECAO;
  const visiveis = comBusca ? filtrarOpcoes(opcoes, busca) : opcoes;
  const [ativo, setAtivo] = useState(() => {
    const i = opcoes.findIndex((o) => o.valor === valor);
    return i >= 0 ? i : proximaHabilitada(opcoes, -1, 1);
  });
  const listaRef = useRef<HTMLDivElement>(null);
  const buscaRef = useRef<HTMLDivElement>(null);
  const digitado = useRef({ texto: "", ate: 0 });
  const atual = ativo >= 0 && ativo < visiveis.length ? ativo : -1;

  // Ao abrir: a busca ganha o foco com ponteiro fino (no toque, abrir o teclado sozinho atrapalha); senão, a lista. A
  // escolhida aparece à vista.
  useLayoutEffect(() => {
    const fino = window.matchMedia("(pointer: fine)").matches;
    if (comBusca && fino) buscaRef.current?.querySelector("input")?.focus({ preventScroll: true });
    else listaRef.current?.focus({ preventScroll: true });
    listaRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [comBusca]);

  function mover(i: number) {
    if (i < 0) return;
    setAtivo(i);
    document.getElementById(`${id}-${i}`)?.scrollIntoView({ block: "nearest" });
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const naBusca = (e.target as HTMLElement).tagName === "INPUT";
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      mover(proximaHabilitada(visiveis, atual, e.key === "ArrowDown" ? 1 : -1));
    } else if ((e.key === "Home" || e.key === "End") && !naBusca) {
      e.preventDefault();
      mover(e.key === "Home" ? proximaHabilitada(visiveis, -1, 1) : proximaHabilitada(visiveis, visiveis.length, -1));
    } else if (e.key === "Enter" || (e.key === " " && !naBusca)) {
      e.preventDefault();
      const o = atual >= 0 ? visiveis[atual] : visiveis.length === 1 ? visiveis[0] : undefined;
      if (o && !o.desabilitada) onEscolher(o.valor);
    } else if (!naBusca && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const agora = Date.now();
      const d = digitado.current;
      d.texto = agora < d.ate ? d.texto + e.key : e.key;
      d.ate = agora + 600;
      mover(typeahead(visiveis, d.texto, atual));
    }
  }

  let grupoAnterior: string | undefined;
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: o invólucro só recebe o teclado da busca e da lista (os dois são focáveis)
    <div data-selecao-lista="" className="animate-fade-in-up space-y-2" onKeyDown={onKeyDown}>
      {comBusca && (
        <div ref={buscaRef}>
          <SearchField
            compacto
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value);
              setAtivo(-1);
            }}
            onClear={() => setBusca("")}
            aria-label={rotulo ? `Pesquisar em ${rotulo}` : "Pesquisar opções"}
            aria-controls={id}
            aria-activedescendant={atual >= 0 ? `${id}-${atual}` : undefined}
          />
        </div>
      )}
      <div
        ref={listaRef}
        id={id}
        role="listbox"
        tabIndex={-1}
        aria-label={rotulo}
        aria-activedescendant={atual >= 0 ? `${id}-${atual}` : undefined}
        className="space-y-px outline-none"
      >
        {visiveis.map((o, i) => {
          const marcada = o.valor === valor;
          const cabecalho = o.grupo && o.grupo !== grupoAnterior ? o.grupo : null;
          grupoAnterior = o.grupo;
          return (
            <div key={`${o.grupo ?? ""}|${o.valor}|${i}`}>
              {cabecalho && (
                <p role="presentation" className="px-2.5 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-faint">
                  {cabecalho}
                </p>
              )}
              {/* biome-ignore lint/a11y/useKeyWithClickEvents: a opção não recebe o foco — o teclado é da lista (aria-activedescendant) */}
              <div
                id={`${id}-${i}`}
                role="option"
                tabIndex={-1}
                aria-selected={marcada}
                aria-disabled={o.desabilitada || undefined}
                title={o.dica}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => !o.desabilitada && setAtivo(i)}
                onClick={() => !o.desabilitada && onEscolher(o.valor)}
                className={`flex min-h-9 items-center gap-2 rounded-chip px-2.5 py-1.5 text-[13.5px] pointer-coarse:min-h-11 ${
                  o.desabilitada
                    ? "cursor-not-allowed text-faint opacity-60"
                    : `cursor-pointer ${marcada ? "bg-accent-soft font-semibold text-accent" : "text-text"} ${i === atual && !marcada ? "bg-surface-2" : ""}`
                }`}
              >
                <span className="min-w-0 flex-1 break-words">{o.texto || " "}</span>
                {marcada && <IconCheck className="h-4 w-4 shrink-0" aria-hidden />}
              </div>
            </div>
          );
        })}
        {visiveis.length === 0 && <p className="px-3 py-4 text-center text-xs text-faint">Nada encontrado</p>}
      </div>
    </div>
  );
}
