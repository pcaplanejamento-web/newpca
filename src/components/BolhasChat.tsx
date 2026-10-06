"use client";

import { type CSSProperties, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  type AmostraArrasto,
  arrumarBolhas,
  type Conversa,
  esquerdaDoLado,
  type LugarBolha,
  type PosicaoBolha,
  type PosicoesBolhas,
  pousarBolha,
  projetarArremesso,
  VAO_BOLHAS,
  velocidadeArrasto,
} from "@/lib/chat-core";
import { Avatar } from "./Avatar";
import { IconTrash, IconUsers } from "./icons";
import { duracaoMotionMs } from "./Modal";
import { segurar } from "./segurar";

/** Uma bolha: a foto da pessoa (ou o mosaico de até 2 numa conversa em grupo), o ponto de presença e as não lidas. */
export type Bolha = {
  conversa: Conversa;
  rotulo: string;
  fotos: { nome: string; foto?: string | null }[];
  /** A conversa do GRUPO ATIVO (ícone de pessoas em vez de foto). */
  grupoAtivo?: boolean;
  presenca?: "online" | "ausente";
  naoLidas: number;
  /** Chegou agora: a bolha QUICA. */
  nova?: boolean;
};

/** Medidas (px): a bolha, a margem da borda e as áreas que as bolhas não cobrem (o cabeçalho e, no celular, a navegação
 * inferior). */
const TAM = { celular: 48, desktop: 56 };
const MARGEM = 12;
const LIMIAR = 6;
const JANELA = { largura: 340, altura: 480 };
/** A LIXEIRA: o tamanho, a distância da base da área livre e o raio em que a bolha é ATRAÍDA para dentro dela. */
const LIXEIRA = { tam: 64, base: 28, ima: 72 };

function tela() {
  const largura = window.innerWidth;
  const altura = window.innerHeight;
  const desktop = largura >= 1024;
  return { largura, altura, desktop, topo: 64, base: desktop ? 16 : 84, tam: desktop ? TAM.desktop : TAM.celular };
}

/** O arrasto em curso: a bolha (a chave — "+" = a das demais), onde ela está, se o dedo está na lixeira e a inclinação pela
 * velocidade. SÓ ela se mexe: as outras ficam onde estão. */
type Arrasto = { chave: string; x: number; y: number; naLixeira: boolean; rot: number };
/** O pouso (FLIP): `ini` = cada bolha parada onde estava · `voo` = voando até o lugar novo (o fator da duração cresce com a
 * distância — um arremesso longo voa mais). */
type Pouso = { fase: "ini" | "voo"; mapa: Map<string, { dx: number; dy: number; fator: number }> };

const escPermitido = (e: KeyboardEvent) => e.key === "Escape" && !e.defaultPrevented && !document.querySelector("[role='dialog'][aria-modal='true']");

/**
 * As BOLHAS DO CHAT (estilo Messenger), por portal no `body`: uma por conversa aberta (acima de 4, "+N"). CADA BOLHA É
 * INDEPENDENTE (v1.17.0): arrastar uma (mouse e toque — limiar de 6px) leva SÓ ela, presa ao dedo e inclinada pela
 * velocidade; ao soltar, ela encosta na borda mais perto naquela altura (um peteleco a ARREMESSA ao outro lado) e voa até
 * lá com mola — as outras ficam onde estão, só abrem espaço se ela pousou em cima. Durante o arrasto surge a LIXEIRA no
 * centro inferior: soltar nela EXCLUI a conversa. Tocar abre a JANELA ao lado da bolha; tocar de novo, Esc ou qualquer toque
 * fora MINIMIZA (com o alfinete `fixada`, só o toque na bolha e o Esc). No celular, a janela ocupa a tela. Teclado: Alt +
 * ↑/↓ sobe/desce a bolha, Alt + ←/→ troca de lado.
 */
export function BolhasChat({
  bolhas,
  extras,
  ativa,
  fixada,
  posicoes,
  onPosicoes,
  onTocar,
  onMinimizar,
  onExcluir,
  onExtras,
  janela,
}: {
  bolhas: Bolha[];
  /** Quantas conversas abertas ficaram fora das bolhas ("+N" abre a lista). */
  extras: number;
  /** A conversa com a janela aberta. */
  ativa: Conversa | null;
  /** A janela fica aberta mesmo tocando fora (o alfinete). */
  fixada: boolean;
  /** A posição de cada bolha (a chave é a conversa; "+" = a das demais). */
  posicoes: PosicoesBolhas;
  /** Posições novas de uma ou mais bolhas (as demais ficam como estão). */
  onPosicoes: (novas: PosicoesBolhas) => void;
  onTocar: (c: Conversa) => void;
  onMinimizar: () => void;
  onExcluir: (c: Conversa) => void;
  onExtras: () => void;
  /** O conteúdo da janela de uma conversa (a aberta, ou a que está fechando — a animação de saída). */
  janela: (c: Conversa) => ReactNode;
}) {
  const [t, setT] = useState<ReturnType<typeof tela> | null>(null);
  useEffect(() => {
    const medir = () => setT(tela());
    medir();
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, []);
  const [arrasto, setArrasto] = useState<Arrasto | null>(null);
  /** A bolha que está SUMINDO na lixeira (a animação antes de excluir). */
  const [sumindo, setSumindo] = useState<Conversa | null>(null);
  const engolirClique = useRef(false);
  /** O POUSO (FLIP): ao soltar, a bolha sai do ponto em que foi solta (e as que abriram espaço, de onde estavam) e voa até o
   * lugar novo — sem o "pulo". `null` = sem pouso em curso. */
  const [pouso, setPouso] = useState<Pouso | null>(null);
  const ativaRef = useRef(ativa);
  ativaRef.current = ativa;
  const pilhaRef = useRef<HTMLUListElement>(null);
  const janelaRef = useRef<HTMLElement>(null);

  // A janela EXIBIDA: a ativa — e, ao minimizar, a que está saindo até o fim da animação (o MESMO elemento: nada remonta).
  const [exibida, setExibida] = useState<Conversa | null>(ativa);
  const [fechando, setFechando] = useState(false);
  useEffect(() => {
    if (ativa) {
      setExibida(ativa);
      setFechando(false);
      return;
    }
    setFechando(true);
    // O fechamento é BEM RÁPIDO (0,06 s — `animate-janela-sai`); sai da tela logo ao terminar.
    const x = window.setTimeout(() => {
      setExibida(null);
      setFechando(false);
    }, 70);
    return () => window.clearTimeout(x);
  }, [ativa]);

  // MINIMIZAR: o Esc sempre; qualquer toque FORA da janela e das bolhas, menos com o alfinete (ou num aviso/diálogo por cima).
  useEffect(() => {
    if (!ativa) return;
    const fora = (e: PointerEvent) => {
      if (fixada) return;
      const alvo = e.target as Element | null;
      if (!alvo || janelaRef.current?.contains(alvo) || pilhaRef.current?.contains(alvo)) return;
      if (alvo.closest?.(".avisos-flutuantes, [role='dialog'], [data-sobre-dropdown]")) return;
      onMinimizar();
    };
    const tecla = (e: KeyboardEvent) => escPermitido(e) && onMinimizar();
    document.addEventListener("pointerdown", fora, true);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("pointerdown", fora, true);
      document.removeEventListener("keydown", tecla);
    };
  }, [ativa, fixada, onMinimizar]);

  // As chaves das bolhas à vista (as conversas e o "+N").
  const chaves = useMemo(() => [...bolhas.map((b) => b.conversa as string), ...(extras > 0 ? ["+"] : [])], [bolhas, extras]);
  /** O lugar (px) de cada bolha — cada uma onde foi deixada, sem nenhuma sobre a outra. */
  const lugares = useMemo(() => (t ? arrumarBolhas(posicoes, chaves, t) : {}), [posicoes, chaves, t]);
  const lixeira = t ? { x: t.largura / 2, y: t.altura - t.base - LIXEIRA.base - LIXEIRA.tam / 2 } : { x: 0, y: 0 };

  // A bolha que ainda não tem posição guardada (acabou de abrir) FICA no lugar em que apareceu — assim nada se mexe quando
  // outra bolha aparece ou some.
  useEffect(() => {
    if (!t) return;
    const novas: PosicoesBolhas = {};
    for (const k of chaves) {
      const l = lugares[k];
      if (!posicoes[k] && l) novas[k] = { ...pousarBolha(esquerdaDoLado(l.lado, t, MARGEM) + t.tam / 2, l.top, t, 0), lado: l.lado };
    }
    if (Object.keys(novas).length) onPosicoes(novas);
  }, [t, chaves, lugares, posicoes, onPosicoes]);

  /** Pousa: cada bolha do mapa parte de onde estava e voa até o lugar novo; limpa depois do voo. */
  const pousar = useCallback((mapa: Pouso["mapa"]) => {
    if (!mapa.size) return;
    setPouso({ fase: "ini", mapa });
    requestAnimationFrame(() => requestAnimationFrame(() => setPouso({ fase: "voo", mapa })));
    const maior = Math.max(1, ...[...mapa.values()].map((v) => v.fator));
    window.setTimeout(() => setPouso((p) => (p?.mapa === mapa ? null : p)), duracaoMotionMs() * maior + 400);
  }, []);

  /** Grava a posição NOVA de uma bolha e anima o pouso: ela parte de `de` (px) e as que abriram espaço, de onde estavam. */
  const mudar = useCallback(
    (chave: string, nova: PosicaoBolha, de: { x: number; y: number }) => {
      if (!t) return;
      const depois = arrumarBolhas({ ...posicoes, [chave]: nova }, chaves, t);
      const mapa: Pouso["mapa"] = new Map();
      for (const k of chaves) {
        const antes = k === chave ? de : lugares[k] ? { x: esquerdaDoLado(lugares[k].lado, t, MARGEM), y: lugares[k].top } : null;
        const l = depois[k];
        if (!antes || !l) continue;
        const dx = antes.x - esquerdaDoLado(l.lado, t, MARGEM);
        const dy = antes.y - l.top;
        if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) mapa.set(k, { dx, dy, fator: 1.8 + Math.min(2.6, Math.hypot(dx, dy) / 380) });
      }
      onPosicoes({ [chave]: nova });
      pousar(mapa);
    },
    [t, posicoes, chaves, lugares, onPosicoes, pousar],
  );

  const pegar = useCallback(
    (e: React.PointerEvent, chave: string) => {
      const l = lugares[chave];
      if (!t || !l || e.button > 0) return;
      // Segura JÁ na pressão (antes do limiar): o navegador não começa a selecionar texto nem a arrastar a foto.
      if (e.pointerType === "mouse") e.preventDefault();
      const x0 = e.clientX;
      const y0 = e.clientY;
      const xBolha = esquerdaDoLado(l.lado, t, MARGEM);
      // Onde o dedo pegou a bolha (ela segue presa nesse ponto).
      const dx0 = x0 - xBolha;
      const dy0 = y0 - l.top;
      // A bolha "+N" não vai para a lixeira (não é uma conversa).
      const excluivel = chave !== "+";
      let ativo = false;
      let assentar = 0;
      let soltar: (() => void) | null = null;
      const amostras: AmostraArrasto[] = [{ x: x0, y: y0, t: performance.now() }];
      let ultimo: Arrasto = { chave, x: xBolha, y: l.top, naLixeira: false, rot: 0 };
      const mover = (ev: PointerEvent) => {
        if (!ativo) {
          if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < LIMIAR) return;
          ativo = true;
          soltar = segurar("grabbing");
          // Arrastar uma bolha MINIMIZA a conversa aberta (a janela não fica solta enquanto a bolha muda de lugar).
          if (ativaRef.current) onMinimizar();
        }
        ev.preventDefault();
        const agora = performance.now();
        amostras.push({ x: ev.clientX, y: ev.clientY, t: agora });
        while (amostras.length > 2 && agora - amostras[0].t > 120) amostras.shift();
        // A inclinação acompanha a velocidade de lado (o "peso" da bolha).
        const { vx } = velocidadeArrasto(amostras.slice(-4));
        const rot = Math.max(-14, Math.min(14, vx * 9));
        const naLixeira = excluivel && Math.hypot(ev.clientX - lixeira.x, ev.clientY - lixeira.y) < LIXEIRA.ima;
        if (naLixeira && !ultimo.naLixeira) navigator.vibrate?.(10);
        // Perto da lixeira, a bolha é ATRAÍDA para o centro dela (ímã).
        ultimo = naLixeira
          ? { chave, x: lixeira.x - t.tam / 2, y: lixeira.y - t.tam / 2, naLixeira, rot: 0 }
          : { chave, x: ev.clientX - dx0, y: ev.clientY - dy0, naLixeira, rot };
        setArrasto(ultimo);
        // Parou de mexer = a bolha "assenta" (a inclinação volta a zero).
        window.clearTimeout(assentar);
        assentar = window.setTimeout(() => {
          if (!ultimo.rot) return;
          ultimo = { ...ultimo, rot: 0 };
          setArrasto(ultimo);
        }, 90);
      };
      const fim = () => {
        window.clearTimeout(assentar);
        window.removeEventListener("pointermove", mover);
        window.removeEventListener("pointerup", fim);
        window.removeEventListener("pointercancel", fim);
        soltar?.();
        if (!ativo) return;
        engolirClique.current = true;
        window.setTimeout(() => {
          engolirClique.current = false;
        }, 0);
        if (ultimo.naLixeira) {
          // Some DENTRO da lixeira (a animação) e então é excluída.
          setSumindo(chave as Conversa);
          window.setTimeout(() => {
            setSumindo(null);
            setArrasto(null);
            onExcluir(chave as Conversa);
          }, duracaoMotionMs() * 0.6 + 20);
          return;
        }
        // ARREMESSO: a bolha vai para onde CAIRIA com a inércia — um peteleco a leva ao outro lado da tela. Parado antes de
        // soltar = sem arremesso (a velocidade conta até o instante de soltar).
        const ult = amostras[amostras.length - 1];
        amostras.push({ x: ult.x, y: ult.y, t: performance.now() });
        const p = projetarArremesso(ultimo.x, ultimo.y, velocidadeArrasto(amostras));
        setArrasto(null);
        mudar(chave, pousarBolha(p.x + t.tam / 2, p.y, t, Date.now()), { x: ultimo.x, y: ultimo.y });
      };
      window.addEventListener("pointermove", mover, { passive: false });
      window.addEventListener("pointerup", fim);
      window.addEventListener("pointercancel", fim);
    },
    [t, lugares, lixeira.x, lixeira.y, onExcluir, onMinimizar, mudar],
  );

  /** Teclado: Alt + ↑/↓ sobe/desce a bolha um lugar, Alt + ←/→ a leva ao outro lado. */
  const tecla = (e: React.KeyboardEvent, chave: string) => {
    const l = lugares[chave];
    if (!e.altKey || !t || !l) return;
    const x = esquerdaDoLado(l.lado, t, MARGEM);
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const top = l.top + (e.key === "ArrowUp" ? -1 : 1) * (t.tam + VAO_BOLHAS);
      mudar(chave, { ...pousarBolha(x + t.tam / 2, top, t, Date.now()), lado: l.lado }, { x, y: l.top });
    } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const lado = e.key === "ArrowLeft" ? "esq" : "dir";
      mudar(chave, { ...pousarBolha(x + t.tam / 2, l.top, t, Date.now()), lado }, { x, y: l.top });
    }
  };

  if (!t || (!bolhas.length && !extras && !exibida)) return null;
  // A janela AO LADO da bolha ativa (do lado de dentro da tela), alinhada a ela e presa na área livre; cresce A PARTIR da
  // bolha (a origem da animação é o centro dela).
  const lAtiva: LugarBolha = (exibida && lugares[exibida]) || lugares[chaves[0]] || { lado: "dir", top: t.altura - t.base - t.tam };
  const yAtiva = lAtiva.top;
  const altJanela = Math.min(JANELA.altura, t.altura - t.topo - t.base);
  const jTopo = Math.min(Math.max(t.topo, yAtiva), Math.max(t.topo, t.altura - t.base - altJanela));
  const jLado = lAtiva.lado === "dir" ? { right: MARGEM + t.tam + 14 } : { left: MARGEM + t.tam + 14 };
  const telaCheia = t.largura < 640;
  const arrastando = arrasto != null && sumindo == null;
  /** O estilo de uma bolha: no lugar dela, presa ao dedo quando arrastada, ou no pouso. */
  const estilo = (chave: string): CSSProperties => {
    const l = lugares[chave] ?? { lado: "dir" as const, top: t.altura - t.base - t.tam };
    const left = esquerdaDoLado(l.lado, t, MARGEM);
    const presa = arrasto?.chave === chave ? arrasto : null;
    return {
      left,
      top: l.top,
      ...estiloDaBolha(presa ? { dx: presa.x - left, dy: presa.y - l.top, ima: presa.naLixeira, rot: presa.rot } : null, pouso, chave),
    };
  };

  return createPortal(
    <>
      {exibida && (
        <section
          ref={janelaRef}
          aria-label="Conversa"
          className={`fixed z-[61] flex flex-col overflow-hidden bg-surface ${fechando ? "animate-janela-sai" : "animate-janela-cresce"} ${
            telaCheia ? "inset-0" : "rounded-card border border-border shadow-flutuante"
          }`}
          style={
            telaCheia
              ? undefined
              : {
                  ...jLado,
                  top: jTopo,
                  width: JANELA.largura,
                  height: altJanela,
                  transformOrigin: `${lAtiva.lado === "dir" ? "right" : "left"} ${Math.max(0, yAtiva - jTopo + t.tam / 2)}px`,
                }
          }
        >
          {janela(exibida)}
        </section>
      )}
      <ul
        ref={pilhaRef}
        aria-label="Conversas abertas"
        // Nada de arrasto/seleção NATIVOS (a imagem da foto "saía" com o mouse) nem o menu de salvar imagem no toque longo:
        // o arrasto é o da bolha.
        onDragStart={(e) => e.preventDefault()}
        className={`m-0 list-none p-0 select-none [-webkit-touch-callout:none] [&_img]:pointer-events-none [&_img]:[-webkit-user-drag:none] ${telaCheia && ativa ? "hidden" : ""}`}
      >
        {bolhas.map((b) => {
          const presa = arrasto?.chave === b.conversa ? arrasto : null;
          const sai = sumindo === b.conversa;
          return (
            <li
              key={b.conversa}
              className={`fixed ${presa ? "z-[61]" : "z-[60]"} ${b.nova && !presa ? "animate-cabeca-entra" : ""}`}
              style={{ ...estilo(b.conversa), touchAction: "none" }}
            >
              <button
                type="button"
                draggable={false}
                onPointerDown={(e) => pegar(e, b.conversa)}
                onClick={() => !engolirClique.current && onTocar(b.conversa)}
                onKeyDown={(e) => tecla(e, b.conversa)}
                aria-label={`${b.rotulo}${b.naoLidas ? ` — ${b.naoLidas} não lida${b.naoLidas === 1 ? "" : "s"}` : ""}`}
                aria-expanded={ativa === b.conversa}
                title={`${b.rotulo} — tocar abre ou minimiza; arraste para levar a qualquer lugar (ou arremesse), ou até a lixeira para fechar`}
                className={`relative flex h-12 w-12 cursor-grab items-center justify-center rounded-full transition-[transform,box-shadow,opacity] duration-[var(--motion-duration)] ease-[cubic-bezier(0.34,1.56,0.64,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 active:cursor-grabbing lg:h-14 lg:w-14 ${
                  sai ? "!scale-0 opacity-0 !duration-[calc(var(--motion-duration)*0.6)] !ease-in" : presa ? (presa.naLixeira ? "!scale-[0.82] shadow-erguida" : "!scale-[1.08] shadow-erguida") : "shadow-flutuante hover:scale-105"
                } ${ativa === b.conversa ? "ring-2 ring-accent ring-offset-2 ring-offset-surface" : ""}`}
              >
                <FotoBolha b={b} />
                {b.naoLidas > 0 && (
                  <span key={b.naoLidas} className="animate-selo-pop absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--danger)] px-1 text-[11px] font-bold text-white ring-2 ring-surface">
                    {b.naoLidas > 99 ? "99+" : b.naoLidas}
                  </span>
                )}
              </button>
            </li>
          );
        })}
        {extras > 0 && (
          <li className={`fixed ${arrasto?.chave === "+" ? "z-[61]" : "z-[60]"}`} style={{ ...estilo("+"), touchAction: "none" }}>
            <button
              type="button"
              draggable={false}
              onPointerDown={(e) => pegar(e, "+")}
              onClick={() => !engolirClique.current && onExtras()}
              onKeyDown={(e) => tecla(e, "+")}
              aria-label={`Mais ${extras} conversa${extras === 1 ? "" : "s"}`}
              title={`Mais ${extras} conversa${extras === 1 ? "" : "s"}`}
              className={`flex cursor-grab items-center justify-center rounded-full bg-surface text-[14px] font-semibold text-text-2 transition-transform duration-[var(--motion-duration)] ${
                arrasto?.chave === "+" ? "!scale-[1.08] shadow-erguida" : "shadow-flutuante hover:scale-105"
              }`}
              style={{ width: t.tam, height: t.tam }}
            >
              +{extras}
            </button>
          </li>
        )}
      </ul>
      {arrasto && arrasto.chave !== "+" && (
        <div
          aria-hidden="true"
          className={`pointer-events-none fixed z-[59] ${arrastando ? "animate-lixeira-entra" : "animate-lixeira-sai"}`}
          style={{ width: LIXEIRA.tam, height: LIXEIRA.tam, left: lixeira.x - LIXEIRA.tam / 2, top: lixeira.y - LIXEIRA.tam / 2 }}
        >
          <span
            className={`flex h-full w-full items-center justify-center rounded-full text-white shadow-flutuante transition-[background-color,transform] duration-[var(--motion-duration)] ${
              arrasto.naLixeira ? "scale-[1.18] bg-[var(--danger)]" : "bg-[color-mix(in_oklab,var(--text)_70%,transparent)]"
            }`}
          >
            <IconTrash className={`h-6 w-6 transition-transform duration-[var(--motion-duration)] ${arrasto.naLixeira ? "-rotate-12 scale-110" : ""}`} />
          </span>
        </div>
      )}
      {arrastando && arrasto.chave !== "+" && (
        <p aria-live="polite" className="sr-only">
          {arrasto.naLixeira ? "Solte para excluir a conversa" : "Arraste até a lixeira para excluir"}
        </p>
      )}
    </>,
    document.body,
  );
}

/** O MOVIMENTO de uma bolha: PRESA ao dedo (sem atraso, inclinada pela velocidade; na lixeira, o ímã com mola), no início
 * do POUSO (parada onde estava) ou VOANDO até o lugar com mola. */
function estiloDaBolha(presa: { dx: number; dy: number; ima: boolean; rot: number } | null, pouso: Pouso | null, chave: string): CSSProperties {
  if (presa)
    return {
      transform: `translate3d(${presa.dx}px, ${presa.dy}px, 0) rotate(${presa.rot}deg)`,
      transition: presa.ima ? "transform calc(var(--motion-duration) * 1.2) cubic-bezier(0.34, 1.56, 0.64, 1)" : "transform 70ms linear",
    };
  const voo = pouso?.mapa.get(chave);
  if (voo && pouso?.fase === "ini") return { transform: `translate3d(${voo.dx}px, ${voo.dy}px, 0)`, transition: "none" };
  return {
    transform: "translate3d(0, 0, 0)",
    transition: `transform calc(var(--motion-duration) * ${voo?.fator ?? 2.4}) cubic-bezier(0.34, 1.3, 0.64, 1)`,
  };
}

/** A foto da bolha: a pessoa (com o ponto de presença), o mosaico da conversa em grupo ou o ícone do grupo ativo — sempre
 * um CÍRCULO perfeito do tamanho da bolha. */
export function FotoBolha({ b }: { b: Pick<Bolha, "fotos" | "grupoAtivo" | "presenca" | "rotulo"> }) {
  if (b.grupoAtivo)
    return (
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-white lg:h-14 lg:w-14">
        <IconUsers className="h-6 w-6" />
      </span>
    );
  if (b.fotos.length > 1)
    return (
      <span className="relative flex h-12 w-12 rounded-full bg-surface lg:h-14 lg:w-14">
        {b.fotos.slice(0, 2).map((f, i) => (
          <span key={`${f.nome}-${i}`} className={`absolute flex rounded-full ring-2 ring-surface ${i ? "right-0 bottom-0" : "top-0 left-0"}`}>
            <Avatar nome={f.nome} foto={f.foto} size="md" />
          </span>
        ))}
        {b.fotos.length > 2 && (
          <span className="absolute -bottom-0.5 -left-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-surface-2 px-1 text-[10px] font-semibold text-text-2 ring-2 ring-surface">
            +{b.fotos.length - 2}
          </span>
        )}
      </span>
    );
  const f = b.fotos[0] ?? { nome: b.rotulo };
  return <Avatar nome={f.nome} foto={f.foto} size="bolha" presenca={b.presenca} pulsar={b.presenca === "online"} />;
}
