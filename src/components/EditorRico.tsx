"use client";

import { type KeyboardEvent, type ReactNode, type Ref, useCallback, useEffect, useId, useImperativeHandle, useRef, useState } from "react";
import { num } from "@/lib/format";
import { nomeExibicao, type Pessoa } from "@/lib/pessoa";
import { predicadoBusca } from "@/lib/tabela-filtros";
import type { Alinhamento } from "@/lib/texto-formatado";
import { ESTILOS_BLOCO, type EstiloBloco, estiloDoBloco, escaparHtml, htmlDoTexto, organizarColado, textoDoHtml } from "@/lib/texto-rico-core";
import { Avatar } from "./Avatar";
import { Button } from "./Button";
import { Dropdown } from "./Dropdown";
import { TextField } from "./Field";
import {
  IconAlinharCentro,
  IconAlinharDireita,
  IconAlinharEsquerda,
  IconBold,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconCode,
  IconFormatacao,
  IconItalic,
  IconJustificar,
  IconLimparFormato,
  IconLink,
  IconList,
  IconListOrdered,
  IconMenos,
  IconQuote,
  IconRedo,
  IconUndo,
} from "./icons";
import { SetaDropdown } from "./SetaDropdown";

/** As classes do CONTEÚDO (a mesma aparência no editor e na folha) — títulos, listas, citação, código, links. */
const ESTRUTURA =
  "text-text [&_h1]:font-bold [&_h1]:leading-tight [&_h2]:font-bold [&_h3]:font-semibold [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-0.5 [&_blockquote]:my-3 [&_blockquote]:border-l-[3px] [&_blockquote]:border-border-2 [&_blockquote]:pl-4 [&_blockquote]:text-muted [&_hr]:my-5 [&_hr]:border-border [&_code]:rounded [&_code]:bg-surface-2 [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.9em] [&_a]:text-accent [&_a]:underline [&_strong]:font-bold [&_>*:first-child]:mt-0";
const CONTEUDO = `${ESTRUTURA} text-[15px] leading-[1.7] [&_h1]:mb-2 [&_h1]:mt-5 [&_h1]:text-[22px] [&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:text-[18px] [&_h3]:mb-1.5 [&_h3]:mt-4 [&_h3]:text-[16px] [&_p]:my-2`;
/** O mesmo conteúdo num CAMPO (descrição, nota, comentário): fonte e respiros menores. */
const CONTEUDO_COMPACTO = `${ESTRUTURA} text-[13.5px] leading-relaxed [&_h1]:mb-1 [&_h1]:mt-3 [&_h1]:text-[17px] [&_h2]:mb-1 [&_h2]:mt-3 [&_h2]:text-[15.5px] [&_h3]:mb-1 [&_h3]:mt-2.5 [&_h3]:text-[14px] [&_p]:my-1.5`;

/** O termo de @menção logo antes do cursor (as mesmas letras de `mencoesDoTexto`). */
/** O "@termo" logo antes do cursor (no começo ou depois de um espaço — "email@x" não é menção). */
const RE_MENCAO = /(?:^|\s)@([\p{L}\p{N}._-]{0,40})$/u;
type Mencao = { no: Text; ini: number; fim: number; termo: string };

type Estado = { negrito: boolean; italico: boolean; lista: boolean; numerada: boolean; bloco: EstiloBloco; al: Alinhamento };
const ESTADO_INICIAL: Estado = { negrito: false, italico: false, lista: false, numerada: false, bloco: "p", al: "esquerda" };

/** O ALINHAMENTO do parágrafo: o comando do navegador e o ícone de cada um. */
const OPCOES_ALINHAMENTO: { al: Alinhamento; rotulo: string; atalho: string; cmd: string; Icone: typeof IconAlinharEsquerda }[] = [
  { al: "esquerda", rotulo: "Alinhar à esquerda", atalho: "Ctrl+Shift+L", cmd: "justifyLeft", Icone: IconAlinharEsquerda },
  { al: "centro", rotulo: "Centralizar", atalho: "Ctrl+Shift+E", cmd: "justifyCenter", Icone: IconAlinharCentro },
  { al: "direita", rotulo: "Alinhar à direita", atalho: "Ctrl+Shift+R", cmd: "justifyRight", Icone: IconAlinharDireita },
  { al: "justificado", rotulo: "Justificar", atalho: "Ctrl+Shift+J", cmd: "justifyFull", Icone: IconJustificar },
];
const alinhamentoAtual = (): Alinhamento =>
  document.queryCommandState("justifyCenter") ? "centro" : document.queryCommandState("justifyRight") ? "direita" : document.queryCommandState("justifyFull") ? "justificado" : "esquerda";

function exec(cmd: string, arg?: string) {
  // O `execCommand` segue o único jeito de editar com o desfazer nativo do navegador (Ctrl+Z) em todos os navegadores.
  document.execCommand(cmd, false, arg);
}

/** Um botão da barra (o clique NÃO tira a seleção do texto — `onMouseDown` evita o foco). */
function BotaoBarra({ rotulo, atalho, ativo = false, onClick, children, disabled }: { rotulo: string; atalho?: string; ativo?: boolean; onClick: () => void; children: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-label={rotulo}
      aria-pressed={ativo}
      title={atalho ? `${rotulo} (${atalho})` : rotulo}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`grid h-11 w-11 shrink-0 snap-start place-items-center rounded-control transition-colors lg:h-8 lg:w-8 disabled:opacity-40 ${ativo ? "bg-accent-soft text-accent" : "text-text-2 hover:bg-surface-2 hover:text-text"}`}
    >
      {children}
    </button>
  );
}

const Divisor = () => <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-border" />;

/** A seta de uma ponta da linha de ferramentas: aparece quando há mais ferramentas daquele lado e rola a linha. */
function SetaBarra({ lado, onClick }: { lado: "inicio" | "fim"; onClick: () => void }) {
  const fim = lado === "fim";
  return (
    <button
      type="button"
      aria-label={fim ? "Mais ferramentas" : "Ferramentas anteriores"}
      title={fim ? "Mais ferramentas" : "Ferramentas anteriores"}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`absolute top-1/2 z-[1] grid h-11 w-9 -translate-y-1/2 place-items-center rounded-control bg-surface text-muted shadow-soft hover:text-text lg:h-8 lg:w-7 ${fim ? "right-0.5" : "left-0.5"}`}
    >
      {fim ? <IconChevronRight className="h-4 w-4" /> : <IconChevronLeft className="h-4 w-4" />}
    </button>
  );
}

/**
 * EDITOR VISUAL de texto (como num editor de documentos): escreve-se e vê-se o resultado na hora — títulos, negrito,
 * itálico, listas, citação, código, links, separador, desfazer/refazer e limpar formatação, com os atalhos de sempre
 * (Ctrl+B, Ctrl+I, Ctrl+K, Ctrl+Z, Ctrl+Y, Ctrl+Alt+1/2/3, Ctrl+Shift+7/8). Controlado (`valor`/`onChange`): grava o
 * TEXTO FORMATADO de sempre (`texto-rico-core.ts`) — o colado de outros programas fica só com o que o formato conhece.
 * É o MESMO editor em todo o sistema: `compacto` = um campo (descrição e notas da tarefa, comentários), sem a folha;
 * `menciona` = digitar "@" sugere as pessoas (↑/↓, Enter insere "@apelido"); `onTecla` = o host trata a tecla antes
 * (true = tratada — ex.: Ctrl+Enter envia o comentário). `mensagem` = o campo do CHAT: uma linha que cresce, a barra
 * escondida atrás do "Aa" e as sugestões de @menção ACIMA (o campo fica no pé da janela); `controle.focar()` põe o
 * cursor no fim (trocar de conversa, responder, o texto pronto do "Conversar sobre…").
 */
export type ControleEditor = { focar: () => void };

export function EditorRico({
  valor,
  onChange,
  rotulo,
  maxLength,
  placeholder = "Comece a escrever…",
  altura,
  disabled = false,
  compacto = false,
  autoFocus = false,
  menciona,
  onTecla,
  mensagem = false,
  controle,
  label,
  hint,
}: {
  valor: string;
  onChange: (v: string) => void;
  rotulo: string;
  maxLength?: number;
  placeholder?: string;
  /** As classes de altura da folha (rola por dentro). */
  altura?: string;
  disabled?: boolean;
  compacto?: boolean;
  /** Foca e põe o cursor no fim ao montar (quem tocou em "editar"). */
  autoFocus?: boolean;
  menciona?: { pessoas: Pessoa[]; texto: (p: Pessoa) => string };
  onTecla?: (e: KeyboardEvent<HTMLDivElement>) => boolean;
  /** O campo de mensagem do chat (implica `compacto`). */
  mensagem?: boolean;
  controle?: Ref<ControleEditor>;
  /** O rótulo VISÍVEL acima do campo (num formulário, como o dos outros campos); sem ele, só o `rotulo` acessível. */
  label?: string;
  /** A dica abaixo do campo. */
  hint?: ReactNode;
}) {
  const idLabel = useId();
  if (mensagem) compacto = true;
  const [barraAberta, setBarraAberta] = useState(!mensagem);
  const ref = useRef<HTMLDivElement>(null);
  const ultimo = useRef<string | null>(null);
  const selecao = useRef<Range | null>(null);
  const [estado, setEstado] = useState<Estado>(ESTADO_INICIAL);
  const [vazio, setVazio] = useState(!valor.trim());
  const [link, setLink] = useState<string | null>(null);
  const [focado, setFocado] = useState(false);
  const [mencao, setMencao] = useState<Mencao | null>(null);
  const [semSugestao, setSemSugestao] = useState(false);
  const [ativa, setAtiva] = useState(0);
  const barra = useRef<HTMLDivElement>(null);
  const [bordas, setBordas] = useState({ inicio: false, fim: false });
  /** Há ferramentas escondidas à esquerda/direita da linha (só quando ela rola — no desktop o documento quebra a linha). */
  const medirBarra = useCallback(() => {
    const el = barra.current;
    if (!el) return;
    const inicio = el.scrollLeft > 2;
    const fim = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
    setBordas((b) => (b.inicio === inicio && b.fim === fim ? b : { inicio, fim }));
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a barra escondida (o "Aa" do chat) volta como outro elemento — medir de novo.
  useEffect(() => {
    const el = barra.current;
    if (!el) return;
    medirBarra();
    const ro = new ResizeObserver(medirBarra);
    ro.observe(el);
    return () => ro.disconnect();
  }, [medirBarra, barraAberta]);
  const rolarBarra = (dir: 1 | -1) => {
    const el = barra.current;
    if (!el) return;
    const suave = !window.matchMedia("(prefers-reduced-motion: reduce)").matches && document.documentElement.dataset.motion !== "reduce";
    el.scrollBy({ left: dir * Math.max(120, el.clientWidth * 0.7), behavior: suave ? "smooth" : "auto" });
  };
  const alturaFolha = altura ?? (mensagem ? "max-h-[140px]" : compacto ? "max-h-[50vh]" : "min-h-[50vh] max-h-[70vh]");

  // O valor de FORA (carga, "voltar ao modelo") redesenha a folha; o que o próprio editor emitiu, não (o cursor fica).
  useEffect(() => {
    const el = ref.current;
    if (!el || valor === ultimo.current) return;
    el.innerHTML = htmlDoTexto(valor);
    ultimo.current = valor;
    setVazio(!valor.trim());
  }, [valor]);

  /** Foca o texto com o cursor no FIM. */
  const focarNoFim = useCallback(() => {
    const el = ref.current;
    if (!el || disabled) return;
    el.focus();
    const r = document.createRange();
    r.selectNodeContents(el);
    r.collapse(false);
    const sel = document.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(r);
  }, [disabled]);
  useImperativeHandle(controle, () => ({ focar: focarNoFim }), [focarNoFim]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: só ao montar.
  useEffect(() => {
    if (autoFocus) focarNoFim();
  }, []);

  const emitir = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const t = textoDoHtml(el);
    setVazio(!t.trim());
    if (t === ultimo.current) return;
    ultimo.current = t;
    onChange(t);
  }, [onChange]);

  const atualizarEstado = useCallback(() => {
    const el = ref.current;
    const sel = document.getSelection();
    if (!el || !sel || sel.rangeCount === 0 || !el.contains(sel.anchorNode)) return;
    selecao.current = sel.getRangeAt(0).cloneRange();
    if (menciona) {
      const no = sel.anchorNode;
      const m = sel.isCollapsed && no?.nodeType === 3 ? RE_MENCAO.exec((no as Text).data.slice(0, sel.anchorOffset)) : null;
      setMencao(m && no ? { no: no as Text, ini: sel.anchorOffset - m[1].length - 1, fim: sel.anchorOffset, termo: m[1] } : null);
    }
    setEstado({
      negrito: document.queryCommandState("bold"),
      italico: document.queryCommandState("italic"),
      lista: document.queryCommandState("insertUnorderedList"),
      numerada: document.queryCommandState("insertOrderedList"),
      bloco: estiloDoBloco(String(document.queryCommandValue("formatBlock") ?? "")),
      al: alinhamentoAtual(),
    });
  }, [menciona]);

  useEffect(() => {
    document.addEventListener("selectionchange", atualizarEstado);
    return () => document.removeEventListener("selectionchange", atualizarEstado);
  }, [atualizarEstado]);

  /** Volta o foco e a seleção ao texto (um seletor ou o campo do link levaram o foco). */
  const restaurar = () => {
    const el = ref.current;
    if (!el) return;
    // Com o cursor JÁ no texto (os botões não tiram o foco), nada a repor — repor apagaria o estilo de digitação (ex.:
    // desligar o itálico antes de continuar escrevendo).
    const atual = document.getSelection();
    if (document.activeElement === el && atual && atual.rangeCount > 0 && el.contains(atual.anchorNode)) return;
    el.focus();
    const r = selecao.current;
    const sel = document.getSelection();
    if (r && sel && el.contains(r.startContainer)) {
      sel.removeAllRanges();
      sel.addRange(r);
    }
  };

  const aplicar = (cmd: string, arg?: string) => {
    if (disabled) return;
    restaurar();
    exec(cmd, arg);
    emitir();
    atualizarEstado();
  };

  const bloco = (v: EstiloBloco) => {
    // Sair de uma lista antes de virar título/citação (o navegador não converte <li> em bloco).
    restaurar();
    if (document.queryCommandState("insertUnorderedList")) exec("insertUnorderedList");
    if (document.queryCommandState("insertOrderedList")) exec("insertOrderedList");
    aplicar("formatBlock", `<${v}>`);
  };

  const codigo = () => {
    restaurar();
    const t = document.getSelection()?.toString() ?? "";
    if (!t) return;
    aplicar("insertHTML", `<code>${escaparHtml(t.replace(/\n/g, " "))}</code>&#8203;`);
  };

  const confirmarLink = () => {
    const url = (link ?? "").trim();
    setLink(null);
    if (!/^https?:\/\/[^\s<>"]+$/i.test(url)) return;
    restaurar();
    const t = document.getSelection()?.toString();
    if (t) aplicar("createLink", url);
    else aplicar("insertHTML", `<a href="${escaparHtml(url)}">${escaparHtml(url)}</a>&#8203;`);
  };

  const limpar = () => {
    restaurar();
    exec("unlink");
    exec("removeFormat");
    aplicar("formatBlock", "<p>");
  };

  const casa = mencao && menciona ? predicadoBusca(mencao.termo) : null;
  const sugestoes = mencao && menciona && !semSugestao ? menciona.pessoas.filter((p) => !mencao.termo || casa?.([nomeExibicao(p), p.nome])).slice(0, 6) : [];

  const mencionar = (p: Pessoa) => {
    const el = ref.current;
    if (!mencao || !menciona || !el?.contains(mencao.no)) return;
    el.focus();
    const r = document.createRange();
    r.setStart(mencao.no, mencao.ini);
    r.setEnd(mencao.no, Math.min(mencao.fim, mencao.no.length));
    const sel = document.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(r);
    exec("insertText", `${menciona.texto(p)} `);
    setMencao(null);
    emitir();
  };

  function teclas(e: KeyboardEvent<HTMLDivElement>) {
    if (sugestoes.length > 0) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setAtiva((a) => (a + (e.key === "ArrowDown" ? 1 : sugestoes.length - 1)) % sugestoes.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        mencionar(sugestoes[Math.min(ativa, sugestoes.length - 1)]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setSemSugestao(true);
        return;
      }
    }
    if (onTecla?.(e)) {
      e.preventDefault();
      return;
    }
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    const k = e.key.toLowerCase();
    if (k === "k") {
      e.preventDefault();
      atualizarEstado();
      setLink("https://");
    } else if (e.altKey && ["1", "2", "3"].includes(e.key)) {
      e.preventDefault();
      bloco(`h${e.key}` as EstiloBloco);
    } else if (e.altKey && e.key === "0") {
      e.preventDefault();
      bloco("p");
    } else if (e.shiftKey && ["KeyL", "KeyE", "KeyR", "KeyJ"].includes(e.code)) {
      e.preventDefault();
      const op = OPCOES_ALINHAMENTO.find((o) => o.atalho.endsWith(e.code.slice(3)));
      if (op) aplicar(op.cmd);
    } else if (e.shiftKey && (e.code === "Digit7" || e.code === "Digit8")) {
      e.preventDefault();
      aplicar(e.code === "Digit7" ? "insertOrderedList" : "insertUnorderedList");
    }
  }

  const rotuloBloco = ESTILOS_BLOCO.find((b) => b.valor === estado.bloco)?.rotulo ?? "Texto normal";
  const tamanho = valor.length;
  const passou = maxLength != null && tamanho > maxLength;
  const contagem = !compacto || (maxLength != null && tamanho >= maxLength * 0.8);

  return (
    <div className="relative">
    {label && (
      <p id={idLabel} className="mb-2 block text-[13.5px] font-bold text-text">
        {label}
      </p>
    )}
    <div className={`overflow-hidden rounded-card border bg-surface transition-shadow ${focado ? "border-accent shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_18%,transparent)]" : "border-border-2"}`}>
      {/* A BARRA: as ferramentas mais usadas primeiro (negrito, itálico, listas, link), depois o estilo do parágrafo e o
          resto. No toque (e no modo compacto) fica numa LINHA que rola de lado — com encaixe por grupo, as bordas esmaecidas
          e as setas quando há mais ferramentas — e o Desfazer/Refazer FIXOS à direita, sempre ao alcance. */}
      {barraAberta && (
      <div role="toolbar" aria-label={`Formatação — ${rotulo}`} className="flex items-center border-b border-border bg-surface">
        <div className="relative min-w-0 flex-1">
          <div
            ref={barra}
            onScroll={medirBarra}
            data-inicio={bordas.inicio || undefined}
            data-fim={bordas.fim || undefined}
            className={`barra-rolavel flex items-center gap-0.5 px-2 py-1 ${compacto ? "flex-nowrap overflow-x-auto" : "max-lg:flex-nowrap max-lg:overflow-x-auto lg:flex-wrap"}`}
          >
            <span className="flex shrink-0 snap-start items-center gap-0.5">
            <BotaoBarra rotulo="Negrito" atalho="Ctrl+B" ativo={estado.negrito} onClick={() => aplicar("bold")} disabled={disabled}>
              <IconBold className="h-4 w-4" />
            </BotaoBarra>
            <BotaoBarra rotulo="Itálico" atalho="Ctrl+I" ativo={estado.italico} onClick={() => aplicar("italic")} disabled={disabled}>
              <IconItalic className="h-4 w-4" />
            </BotaoBarra>
            <BotaoBarra rotulo="Lista com marcadores" atalho="Ctrl+Shift+8" ativo={estado.lista} onClick={() => aplicar("insertUnorderedList")} disabled={disabled}>
              <IconList className="h-4 w-4" />
            </BotaoBarra>
            <BotaoBarra rotulo="Lista numerada" atalho="Ctrl+Shift+7" ativo={estado.numerada} onClick={() => aplicar("insertOrderedList")} disabled={disabled}>
              <IconListOrdered className="h-4 w-4" />
            </BotaoBarra>
            <BotaoBarra
              rotulo="Link"
              atalho="Ctrl+K"
              onClick={() => {
                atualizarEstado();
                setLink("https://");
              }}
              disabled={disabled}
            >
              <IconLink className="h-4 w-4" />
            </BotaoBarra>
            </span>
            <Divisor />
            <Dropdown
              ariaLabel="Estilo do parágrafo"
              title="Estilo do parágrafo (Ctrl+Alt+0/1/2/3)"
              papel="listbox"
              width={200}
              bloqueado={disabled}
              triggerClassName="inline-flex h-11 min-w-[8.5rem] snap-start items-center justify-between gap-2 rounded-control px-2.5 text-[13px] font-medium text-text hover:bg-surface-2 lg:h-8"
              trigger={
                <>
                  <span className="truncate">{rotuloBloco}</span>
                  <SetaDropdown className="h-4 w-4" />
                </>
              }
            >
              {(fechar) => (
                <div className="py-1">
                  {ESTILOS_BLOCO.map((b) => (
                    <button
                      key={b.valor}
                      type="button"
                      role="option"
                      aria-selected={b.valor === estado.bloco}
                      onClick={() => {
                        fechar();
                        bloco(b.valor);
                      }}
                      className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-surface-2 ${b.valor === estado.bloco ? "text-accent" : "text-text"} ${b.valor === "h1" ? "text-[19px] font-bold" : b.valor === "h2" ? "text-[16px] font-bold" : b.valor === "h3" ? "text-[14.5px] font-semibold" : b.valor === "blockquote" ? "text-[13.5px] italic text-muted" : "text-[13.5px]"}`}
                    >
                      {b.rotulo}
                      {b.valor === estado.bloco && <IconCheck className="h-4 w-4 shrink-0" />}
                    </button>
                  ))}
                </div>
              )}
            </Dropdown>
            <Divisor />
            <Dropdown
              ariaLabel="Alinhamento"
              title="Alinhamento do parágrafo"
              papel="dialog"
              bloqueado={disabled}
              triggerClassName="inline-flex h-11 shrink-0 snap-start items-center gap-0.5 rounded-control px-2 text-text hover:bg-surface-2 lg:h-8"
              trigger={
                <>
                  {(() => {
                    const Icone = OPCOES_ALINHAMENTO.find((o) => o.al === estado.al)?.Icone ?? IconAlinharEsquerda;
                    return <Icone className="h-4 w-4" />;
                  })()}
                  <SetaDropdown className="h-3.5 w-3.5" />
                </>
              }
            >
              {(fechar) => (
                <div className="flex gap-0.5 p-1">
                  {OPCOES_ALINHAMENTO.map(({ al, rotulo: r, atalho, cmd, Icone }) => (
                    <BotaoBarra
                      key={al}
                      rotulo={r}
                      atalho={atalho}
                      ativo={estado.al === al}
                      onClick={() => {
                        fechar();
                        aplicar(cmd);
                      }}
                    >
                      <Icone className="h-4 w-4" />
                    </BotaoBarra>
                  ))}
                </div>
              )}
            </Dropdown>
            <Divisor />
            <span className="flex shrink-0 snap-start items-center gap-0.5">
            <BotaoBarra rotulo="Citação" ativo={estado.bloco === "blockquote"} onClick={() => bloco(estado.bloco === "blockquote" ? "p" : "blockquote")} disabled={disabled}>
              <IconQuote className="h-4 w-4" />
            </BotaoBarra>
            <BotaoBarra rotulo="Código" onClick={codigo} disabled={disabled}>
              <IconCode className="h-4 w-4" />
            </BotaoBarra>
            <BotaoBarra rotulo="Linha separadora" onClick={() => aplicar("insertHorizontalRule")} disabled={disabled}>
              <IconMenos className="h-4 w-4" />
            </BotaoBarra>
            <BotaoBarra rotulo="Limpar formatação" onClick={limpar} disabled={disabled}>
              <IconLimparFormato className="h-4 w-4" />
            </BotaoBarra>
            </span>
          </div>
          {bordas.inicio && <SetaBarra lado="inicio" onClick={() => rolarBarra(-1)} />}
          {bordas.fim && <SetaBarra lado="fim" onClick={() => rolarBarra(1)} />}
        </div>
        <span className="flex shrink-0 items-center gap-0.5 border-l border-border px-1 py-1">
            <BotaoBarra rotulo="Desfazer" atalho="Ctrl+Z" onClick={() => aplicar("undo")} disabled={disabled}>
              <IconUndo className="h-4 w-4" />
            </BotaoBarra>
            <BotaoBarra rotulo="Refazer" atalho="Ctrl+Y" onClick={() => aplicar("redo")} disabled={disabled}>
              <IconRedo className="h-4 w-4" />
            </BotaoBarra>
        </span>
      </div>
      )}
      {link != null && (
        <div className="flex flex-wrap items-end gap-2 border-b border-border bg-surface-2 px-3 py-2">
          <div className="min-w-0 flex-1">
            <TextField
              label="Endereço do link"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  confirmarLink();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setLink(null);
                  restaurar();
                }
              }}
            />
          </div>
          <Button size="sm" onClick={confirmarLink} disabled={!/^https?:\/\/\S+\.\S+/i.test(link.trim())}>
            Aplicar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setLink(null)}>
            Cancelar
          </Button>
        </div>
      )}
      {/* A FOLHA: o fundo cinza com a página branca no centro, como num editor de documentos (no compacto, o campo direto). */}
      <div className={`overflow-y-auto ${compacto ? "" : "bg-surface-2 px-2 py-4 sm:px-6"} ${alturaFolha}`}>
        <div className={mensagem ? "relative flex items-end gap-1 py-1 pr-1 pl-3" : compacto ? "relative px-3 py-2" : "relative mx-auto max-w-[52rem] rounded-card bg-surface px-5 py-6 shadow-ring sm:px-10 sm:py-10"}>
          {vazio && !focado && (
            <p className={`pointer-events-none absolute text-faint ${mensagem ? "top-1/2 left-3 -translate-y-1/2 text-[14px] lg:text-[13.5px]" : compacto ? "top-2 right-3 left-3 line-clamp-3 text-[13.5px]" : "left-5 top-6 text-[15px] sm:left-10 sm:top-10"}`}>{placeholder}</p>
          )}
          {/* biome-ignore lint/a11y/useSemanticElements: o editor visual é um contentEditable (um <textarea> não mostra a formatação) */}
          <div
            ref={ref}
            role="textbox"
            aria-multiline="true"
            aria-label={label ? undefined : rotulo}
            aria-labelledby={label ? idLabel : undefined}
            tabIndex={disabled ? -1 : 0}
            contentEditable={!disabled}
            suppressContentEditableWarning
            spellCheck
            lang="pt-BR"
            onFocus={() => {
              setFocado(true);
              document.execCommand("defaultParagraphSeparator", false, "p");
            }}
            onBlur={() => setFocado(false)}
            onInput={() => {
              setSemSugestao(false);
              setAtiva(0);
              emitir();
            }}
            onKeyDown={teclas}
            onKeyUp={atualizarEstado}
            onMouseUp={atualizarEstado}
            onPaste={(e) => {
              // O colado passa pelos dois conversores: fica só o que o formato conhece (sem estilos e scripts de fora).
              e.preventDefault();
              const html = e.clipboardData.getData("text/html");
              // O texto é ORGANIZADO: parágrafos refeitos (o sem formatação), títulos de seção reconhecidos, números mantidos.
              const texto = html
                ? organizarColado(textoDoHtml(new DOMParser().parseFromString(html, "text/html").body), false)
                : organizarColado(e.clipboardData.getData("text/plain"), true);
              if (texto) aplicar("insertHTML", htmlDoTexto(texto));
            }}
            className={`outline-none ${mensagem ? `min-h-9 min-w-0 flex-1 py-1.5 ${CONTEUDO_COMPACTO}` : compacto ? `min-h-[4.5rem] ${CONTEUDO_COMPACTO}` : `min-h-[30vh] ${CONTEUDO}`}`}
          />
          {mensagem && (
            <button
              type="button"
              aria-pressed={barraAberta}
              aria-label={barraAberta ? "Esconder a formatação" : "Mostrar a formatação"}
              title={barraAberta ? "Esconder a formatação" : "Formatação: negrito, itálico, listas, link…"}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setBarraAberta((v) => !v)}
              className={`grid h-11 w-11 shrink-0 place-items-center rounded-control transition-colors lg:h-9 lg:w-9 ${barraAberta ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-2 hover:text-text"}`}
            >
              <IconFormatacao className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      {contagem && (
      <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-1.5 text-[12px] text-muted">
        <span>{compacto ? "" : estado.bloco === "p" ? "Texto normal" : rotuloBloco}</span>
        <span className={passou ? "font-semibold text-[var(--danger)]" : ""}>
          {num(tamanho)}
          {maxLength != null ? ` / ${num(maxLength)}` : ""} caracteres
        </span>
      </div>
      )}
    </div>
      {hint && <p className="mt-1.5 text-[12px] text-muted">{hint}</p>}
      {sugestoes.length > 0 && (
        <ul aria-label="Mencionar pessoa" className={`absolute right-0 left-0 z-20 ${mensagem ? "bottom-full mb-1" : "top-full mt-1"} overflow-hidden rounded-card border border-border bg-surface shadow-soft`}>
          {sugestoes.map((p, i) => (
            <li key={p.id}>
              <button
                type="button"
                tabIndex={-1}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => mencionar(p)}
                className={`flex min-h-11 w-full items-center gap-2 px-3 text-left text-[13px] text-text hover:bg-surface-2 lg:min-h-9 ${i === ativa ? "bg-surface-2" : ""}`}
              >
                <Avatar nome={p.nome} foto={p.foto} size="xs" />
                <span className="truncate">{nomeExibicao(p)}</span>
                <span className="ml-auto truncate text-[11px] text-faint">{menciona?.texto(p)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
