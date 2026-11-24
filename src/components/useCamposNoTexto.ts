"use client";

import { type KeyboardEvent, type RefObject, useCallback, useMemo, useState } from "react";
import { type CampoDado, camposEmOrdem, htmlChipCampo, mapaCampos, RE_CAMPO_DIGITADO, RE_GATILHO_CAMPO } from "@/lib/campos-dados-core";

type Gatilho = { no: Text; ini: number; fim: number; termo: string };

/**
 * Os CAMPOS DE DADOS num texto editável (`contentEditable`) — a MESMA lógica no `EditorRico` e no `CampoLinhaComDados`:
 * digitar "{{" abre as sugestões (↑/↓, Enter/Tab insere, Esc fecha), o `{{chave}}` digitado inteiro vira chip na hora e
 * `inserir` põe o chip onde o cursor estava (o botão "Dado"). O chip entra pelo `insertHTML` — o desfazer do navegador vale.
 */
export function useCamposNoTexto({
  ref,
  campos,
  disabled,
  restaurar,
  aoMudar,
}: {
  ref: RefObject<HTMLElement | null>;
  campos: readonly CampoDado[] | undefined;
  disabled: boolean;
  /** Põe o foco e a seleção de volta no texto (o botão levou o foco). */
  restaurar: () => void;
  /** Depois de inserir: grava e atualiza o estado do host. */
  aoMudar: () => void;
}) {
  const mapa = useMemo(() => mapaCampos(campos), [campos]);
  const [gatilho, setGatilho] = useState<Gatilho | null>(null);
  const [fechado, setFechado] = useState(false);
  const [ativa, setAtiva] = useState(0);
  const sugestoes = gatilho && campos && !fechado ? camposEmOrdem(campos, gatilho.termo) : [];

  /** A seleção mudou: há um "{{termo" logo antes do cursor? */
  const aoSelecionar = useCallback(
    (sel: Selection) => {
      if (!mapa.size) return;
      const no = sel.anchorNode;
      const m = sel.isCollapsed && no?.nodeType === 3 ? RE_GATILHO_CAMPO.exec((no as Text).data.slice(0, sel.anchorOffset)) : null;
      setGatilho(m && no ? { no: no as Text, ini: sel.anchorOffset - m[0].length, fim: sel.anchorOffset, termo: m[1] } : null);
    },
    [mapa],
  );

  /** Seleciona um trecho de um nó de texto. */
  const selecionar = (no: Text, ini: number, fim: number) => {
    const r = document.createRange();
    r.setStart(no, Math.max(0, Math.min(ini, no.length)));
    r.setEnd(no, Math.max(0, Math.min(fim, no.length)));
    const sel = document.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(r);
  };
  // O espaço de largura zero depois do chip dá ao cursor onde ficar (some ao gravar).
  const colar = (c: CampoDado) => document.execCommand("insertHTML", false, `${htmlChipCampo(c)}&#8203;`);

  const inserir = (c: CampoDado) => {
    const el = ref.current;
    const def = mapa.get(c.chave);
    if (disabled || !el || !def) return;
    if (gatilho && el.contains(gatilho.no)) {
      el.focus();
      selecionar(gatilho.no, gatilho.ini, gatilho.fim);
    } else restaurar();
    colar(def);
    setGatilho(null);
    aoMudar();
  };

  /** Depois de cada digitação: o `{{chave}}` inteiro de um campo conhecido vira chip; reabre as sugestões fechadas. */
  const aoDigitar = () => {
    setFechado(false);
    setAtiva(0);
    const el = ref.current;
    const sel = document.getSelection();
    const no = sel?.anchorNode;
    if (!mapa.size || !el || !sel?.isCollapsed || !no || no.nodeType !== 3 || !el.contains(no)) return;
    const m = RE_CAMPO_DIGITADO.exec((no as Text).data.slice(0, sel.anchorOffset));
    const def = m ? mapa.get(m[1]) : undefined;
    if (!m || !def) return;
    selecionar(no as Text, sel.anchorOffset - m[0].length, sel.anchorOffset);
    colar(def);
  };

  /** As teclas das sugestões — `true` = tratada (quem chama não segue). */
  const tecla = (e: KeyboardEvent<HTMLElement>): boolean => {
    if (!sugestoes.length) return false;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setAtiva((a) => (a + (e.key === "ArrowDown" ? 1 : sugestoes.length - 1)) % sugestoes.length);
      return true;
    }
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      inserir(sugestoes[Math.min(ativa, sugestoes.length - 1)]);
      return true;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setFechado(true);
      return true;
    }
    return false;
  };

  return { mapa, termo: gatilho?.termo ?? "", sugestoes, ativa, setAtiva, inserir, aoSelecionar, aoDigitar, tecla };
}
