"use client";

import {
  Children,
  type FocusEvent,
  Fragment,
  isValidElement,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  type SelectHTMLAttributes,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  corSegura,
  dicaDaOpcao,
  filtrarOpcoes,
  MIN_BUSCA_SELECAO,
  MIN_FOLHA_SELECAO,
  type OpcaoSelecao,
  opcoesIguais,
  proximaHabilitada,
  typeahead,
} from "@/lib/selecao-core";
import { Dropdown } from "./Dropdown";
import { ehDesktop } from "./espacamento";
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
      detalhe: o.dataset.detalhe || undefined,
      aviso: o.dataset.aviso || undefined,
      cor: corSegura(o.dataset.cor),
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

/** Uma AÇÃO no rodapé da lista (ex.: "Editar esta visão", "+ Nova visão"): fecha a lista e roda. */
export type AcaoSelecao = { rotulo: string; icone?: ReactNode; onClick: () => void; disabled?: boolean };

/** O "digitar para saltar": junta as teclas digitadas em até 600 ms. */
function useDigitado() {
  const r = useRef({ texto: "", ate: 0 });
  return (tecla: string) => {
    const agora = Date.now();
    r.current.texto = agora < r.current.ate ? r.current.texto + tecla : tecla;
    r.current.ate = agora + 600;
    return r.current.texto;
  };
}

const ehTecla = (e: KeyboardEvent) => e.key.length === 1 && e.key !== " " && !e.ctrlKey && !e.metaKey && !e.altKey;

/** O ponto colorido de uma opção (`data-cor`) ou o âmbar do aviso (`data-aviso`). */
function Ponto({ cor }: { cor: string }) {
  return <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ background: cor }} />;
}

/**
 * SELEÇÃO do sistema — o *drop-in* do `<select>`: as MESMAS props (`value`, `onChange(e)` com `e.target.value`, `disabled`,
 * `id`, `aria-*`, `onBlur`, `style`) e os MESMOS filhos (`<option>`/`<optgroup>`), mas a lista aberta é a do sistema — o
 * `Dropdown` alinhado à caixa (`ancora`; sem ela, o próprio gatilho), a escolhida em accent com o check, grupos com divisor,
 * desabilitadas esmaecidas com o `title` na dica, BUSCA fixa no topo acima de 12 opções, linhas compactas no desktop e 44px
 * no toque. Extras por `data-*` na `<option>`: `data-detalhe` (2ª linha), `data-aviso` (ponto âmbar + o motivo) e
 * `data-cor` (o ponto na cor — também no gatilho). `acoes` = os botões no rodapé da lista. Numa tela estreita com mais de 8
 * opções a lista SOBE DE BAIXO (folha). Teclado: ↑/↓/Home/End movem, Enter/Espaço escolhem, Esc fecha, digitar salta;
 * com a lista FECHADA, ↑/↓ abrem e digitar já troca a opção (como o select do aparelho). O `<select>` nativo fica
 * ESCONDIDO e é a fonte das opções e do valor (formulários, `name`, `required`). `className` = a CAIXA do gatilho; `texto` =
 * o texto à vista no lugar do da opção; `linhas` = até 2 linhas no gatilho; `titulo` = o nome da lista (o rótulo do campo).
 */
export function Selecao({
  className = "",
  texto,
  linhas = 1,
  ancora,
  titulo,
  acoes,
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
}: Omit<SelectHTMLAttributes<HTMLSelectElement>, "multiple" | "size"> & {
  texto?: string;
  linhas?: 1 | 2;
  ancora?: RefObject<HTMLElement | null>;
  titulo?: string;
  acoes?: AcaoSelecao[];
}) {
  const auto = useId();
  const gid = id ?? auto;
  const listaId = `${gid}-lista`;
  const selRef = useRef<HTMLSelectElement>(null);
  const [opcoes, setOpcoes] = useState<OpcaoSelecao[]>([]);
  const [indice, setIndice] = useState(-1);
  const [aberto, setAberto] = useState(false);
  const [folha, setFolha] = useState(false);
  const digitar = useDigitado();

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
  const nome = ariaLabel ?? titulo;

  function escolher(v: string) {
    const sel = selRef.current;
    if (!sel) return;
    escolherNoSelect(sel, v);
    // Sem `value` controlado (só `defaultValue`), ninguém re-renderiza: o gatilho lê a escolha aqui.
    setIndice(sel.selectedIndex);
  }

  // Abrir: a FOLHA (de baixo) só numa tela estreita com lista grande — decidido na hora de abrir.
  function mudarAberto(v: boolean) {
    if (v) setFolha(!ehDesktop() && opcoes.length > MIN_FOLHA_SELECAO);
    setAberto(v);
  }

  function tecladoNoGatilho(e: KeyboardEvent<HTMLButtonElement>) {
    if (aberto || disabled) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      mudarAberto(true);
    } else if (ehTecla(e)) {
      // Fechada, digitar troca a opção (como o select do aparelho).
      e.preventDefault();
      const j = typeahead(opcoes, digitar(e.key), indice);
      if (j >= 0) escolher(opcoes[j].valor);
    }
  }

  return (
    <>
      <Dropdown
        papel="listbox"
        className="contents"
        id={gid}
        title={title}
        ancora={ancora}
        folha={folha}
        panelClassName={folha ? "animate-folha-sobe" : "animate-selecao-entra"}
        triggerClassName={`seletor-sistema flex cursor-pointer items-center gap-2 disabled:cursor-default ${className}`}
        aberto={aberto}
        onAberto={mudarAberto}
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
          onKeyDown: tecladoNoGatilho,
          onFocus: onFocus as unknown as (e: FocusEvent<HTMLButtonElement>) => void,
          // Ir para a lista aberta não é sair do campo (o "tocado" de um formulário só vale ao sair de verdade).
          onBlur: (e) => {
            if ((e.relatedTarget as Element | null)?.closest?.("[data-selecao-lista]")) return;
            (onBlur as unknown as ((e: FocusEvent<HTMLButtonElement>) => void) | undefined)?.(e);
          },
        }}
        trigger={
          <>
            {escolhida?.cor && <Ponto cor={escolhida.cor} />}
            <span className={`min-w-0 flex-1 ${linhas === 2 ? "line-clamp-2 break-words leading-[1.15]" : "truncate"}`}>{textoGatilho}</span>
            {escolhida?.aviso && (
              <span title={escolhida.aviso} className="flex">
                <Ponto cor="var(--warn)" />
              </span>
            )}
          </>
        }
      >
        {(fechar) => (
          <ListaOpcoes
            id={listaId}
            opcoes={opcoes}
            valor={escolhida?.valor}
            rotulo={nome}
            folha={folha}
            acoes={acoes}
            onAcao={(a) => {
              fechar();
              a.onClick();
            }}
            onEscolher={(v) => {
              escolher(v);
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

/** A LISTA aberta: busca fixa (acima de 12), grupos com divisor, detalhe/aviso/cor, a escolhida com o check, teclado,
 * "digitar para saltar" e as ações no rodapé (fixas). Na folha, o nome da lista no topo. */
function ListaOpcoes({
  id,
  opcoes,
  valor,
  rotulo,
  folha,
  acoes,
  onAcao,
  onEscolher,
}: {
  id: string;
  opcoes: OpcaoSelecao[];
  valor?: string;
  rotulo?: string;
  folha: boolean;
  acoes?: AcaoSelecao[];
  onAcao: (a: AcaoSelecao) => void;
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
  const digitar = useDigitado();
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
    const naLista = e.target === listaRef.current;
    const naBusca = (e.target as HTMLElement).tagName === "INPUT";
    if (!naLista && !naBusca) return; // um botão do rodapé trata o próprio Enter/Espaço
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      mover(proximaHabilitada(visiveis, atual, e.key === "ArrowDown" ? 1 : -1));
    } else if ((e.key === "Home" || e.key === "End") && naLista) {
      e.preventDefault();
      mover(e.key === "Home" ? proximaHabilitada(visiveis, -1, 1) : proximaHabilitada(visiveis, visiveis.length, -1));
    } else if (e.key === "Enter" || (e.key === " " && naLista)) {
      e.preventDefault();
      const o = atual >= 0 ? visiveis[atual] : visiveis.length === 1 ? visiveis[0] : undefined;
      if (o && !o.desabilitada) onEscolher(o.valor);
    } else if (naLista && ehTecla(e)) {
      mover(typeahead(visiveis, digitar(e.key), atual));
    }
  }

  // Fixos no topo/rodapé do painel (que rola): presos à BORDA dele (-top-2/-bottom-2 = o respiro `p-2`), nada da lista
  // aparece por cima ou por baixo ao rolar.
  const fixo = "sticky z-10 -mx-2 bg-surface px-2";
  let grupoAnterior: string | undefined;
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: o invólucro só recebe o teclado da busca e da lista (os dois são focáveis)
    <div data-selecao-lista="" onKeyDown={onKeyDown}>
      {(folha || comBusca) && (
        <div className={`${fixo} -top-2 -mt-2 space-y-2 pt-2 pb-2`}>
          {folha && (
            <>
              <span aria-hidden="true" className="mx-auto block h-1 w-10 rounded-full bg-border-2" />
              {rotulo && <p className="px-1 text-[13px] font-bold text-text">{rotulo}</p>}
            </>
          )}
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
                <p
                  role="presentation"
                  className={`px-2.5 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-faint ${i > 0 ? "mt-1 border-t border-border" : ""}`}
                >
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
                title={dicaDaOpcao(o)}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => !o.desabilitada && setAtivo(i)}
                onClick={() => !o.desabilitada && onEscolher(o.valor)}
                className={`flex min-h-11 items-center gap-2 rounded-chip px-2.5 py-1.5 text-[13.5px] lg:pointer-fine:min-h-8 lg:pointer-fine:py-1 ${
                  o.desabilitada
                    ? "cursor-not-allowed text-faint opacity-60"
                    : `cursor-pointer ${marcada ? "bg-accent-soft font-semibold text-accent" : "text-text"} ${i === atual && !marcada ? "bg-surface-2" : ""}`
                }`}
              >
                {o.cor && <Ponto cor={o.cor} />}
                <span className="min-w-0 flex-1">
                  <span className="block break-words">{o.texto || "\u00a0"}</span>
                  {o.detalhe && <span className="block truncate text-[11.5px] font-normal text-muted">{o.detalhe}</span>}
                </span>
                {o.aviso && <Ponto cor="var(--warn)" />}
                {marcada && <IconCheck className="h-4 w-4 shrink-0" aria-hidden />}
              </div>
            </div>
          );
        })}
        {visiveis.length === 0 && <p className="px-3 py-4 text-center text-xs text-faint">Nada encontrado</p>}
      </div>
      {acoes && acoes.length > 0 && (
        <div className={`${fixo} -bottom-2 -mb-2 mt-1 border-t border-border pt-1 pb-2`}>
          {acoes.map((a) => (
            <button
              key={a.rotulo}
              type="button"
              disabled={a.disabled}
              onClick={() => onAcao(a)}
              className="flex min-h-11 w-full items-center gap-2 rounded-chip px-2.5 text-left text-[13px] font-semibold text-accent hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-default disabled:opacity-50 lg:pointer-fine:min-h-8"
            >
              {a.icone && <span className="flex shrink-0">{a.icone}</span>}
              {a.rotulo}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
