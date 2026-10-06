"use client";

import { type CSSProperties, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  type AmostraArrasto,
  type Conversa,
  encostarBolhas,
  moverBolha,
  type PosicaoBolhas,
  projetarArremesso,
  topoDasBolhas,
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

/** Medidas (px): a bolha, o vão entre elas, a margem da borda e as áreas que a pilha não cobre (o cabeçalho e, no celular,
 * a navegação inferior). */
const TAM = { celular: 48, desktop: 56 };
const VAO = 10;
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

/** O arrasto em curso: onde a bolha está, se o dedo está na lixeira, o MODO (`ordem` = dentro da coluna: as outras abrem
 * espaço e soltar REORDENA · `mover` = saiu da coluna: a pilha inteira segue em cadeia e soltar ARREMESSA), o lugar na
 * ordem e a inclinação pela velocidade. */
type Arrasto = { conversa: Conversa; x: number; y: number; naLixeira: boolean; modo: "ordem" | "mover"; alvo: number; rot: number };
/** O pouso (FLIP): `ini` = cada bolha parada onde estava · `voo` = voando até o lugar novo (o fator da duração cresce com a
 * distância — um arremesso longo voa mais). */
type Pouso = { fase: "ini" | "voo"; mapa: Map<string, { dx: number; dy: number; fator: number }> };

const escPermitido = (e: KeyboardEvent) => e.key === "Escape" && !e.defaultPrevented && !document.querySelector("[role='dialog'][aria-modal='true']");

/**
 * As BOLHAS DO CHAT (estilo Messenger), por portal no `body`: uma por conversa aberta (a mais recente em cima; acima de 4,
 * "+N"). ARRASTAR uma bolha (mouse e toque — limiar de 6px) a leva presa ao dedo; ao soltar, a PILHA encosta na borda mais
 * perto (mola) naquela altura. Durante o arrasto surge a LIXEIRA no centro inferior: soltar nela EXCLUI a conversa (a bolha
 * é atraída e some dentro dela) — o único jeito de excluir. Tocar abre a JANELA ao lado da pilha; tocar de novo, Esc ou
 * qualquer toque fora MINIMIZA (com o alfinete `fixada`, só o toque na bolha e o Esc). No celular, a janela ocupa a tela.
 */
export function BolhasChat({
  bolhas,
  extras,
  ativa,
  fixada,
  posicao,
  onPosicao,
  onReordenar,
  onTocar,
  onMinimizar,
  onExcluir,
  onExtras,
  janela,
}: {
  bolhas: Bolha[];
  /** Quantas conversas abertas ficaram fora da pilha ("+N" abre a lista). */
  extras: number;
  /** A conversa com a janela aberta. */
  ativa: Conversa | null;
  /** A janela fica aberta mesmo tocando fora (o alfinete). */
  fixada: boolean;
  posicao: PosicaoBolhas;
  onPosicao: (p: PosicaoBolhas) => void;
  /** A ORDEM nova das bolhas visíveis (arrastar dentro da coluna, ou Alt + ↑/↓). */
  onReordenar: (ordem: Conversa[]) => void;
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
  /** O POUSO (FLIP): ao soltar, cada bolha sai de onde estava (a arrastada, do ponto em que foi solta) e voa até o lugar novo
   * — sem o "pulo" de volta. `null` = sem pouso em curso. */
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

  const n = bolhas.length + (extras > 0 ? 1 : 0);
  // As chaves na ordem da pilha (as bolhas e o "+N") — o pouso anima cada uma.
  const chaves = useMemo(() => [...bolhas.map((b) => b.conversa as string), ...(extras > 0 ? ["+"] : [])], [bolhas, extras]);
  const passo = t ? t.tam + VAO : 0;
  const alturaPilha = t ? n * t.tam + Math.max(0, n - 1) * VAO : 0;
  const esquerda = t ? (posicao.lado === "esq" ? MARGEM : t.largura - MARGEM - t.tam) : 0;
  const topo = t ? topoDasBolhas(posicao, t, alturaPilha) : 0;
  const lixeira = t ? { x: t.largura / 2, y: t.altura - t.base - LIXEIRA.base - LIXEIRA.tam / 2 } : { x: 0, y: 0 };

  /** Pousa: cada bolha parte de onde está (`de`) e voa até o lugar novo; limpa depois do voo. */
  const pousar = useCallback((mapa: Pouso["mapa"]) => {
    setPouso({ fase: "ini", mapa });
    requestAnimationFrame(() => requestAnimationFrame(() => setPouso({ fase: "voo", mapa })));
    const maior = Math.max(1, ...[...mapa.values()].map((v) => v.fator));
    window.setTimeout(() => setPouso((p) => (p?.mapa === mapa ? null : p)), duracaoMotionMs() * maior + 400);
  }, []);

  const pegar = useCallback(
    (e: React.PointerEvent, conversa: Conversa, indice: number) => {
      if (!t || e.button > 0) return;
      // Segura JÁ na pressão (antes do limiar): o navegador não começa a selecionar texto nem a arrastar a foto.
      if (e.pointerType === "mouse") e.preventDefault();
      const x0 = e.clientX;
      const y0 = e.clientY;
      const yBolha = topo + indice * passo;
      // Onde o dedo pegou a bolha (ela segue presa nesse ponto).
      const dx0 = x0 - esquerda;
      const dy0 = y0 - yBolha;
      const total = bolhas.length;
      let ativo = false;
      let assentar = 0;
      let soltar: (() => void) | null = null;
      const amostras: AmostraArrasto[] = [{ x: x0, y: y0, t: performance.now() }];
      // Com UMA bolha não há o que reordenar: já sai movendo.
      let ultimo: Arrasto = { conversa, x: esquerda, y: yBolha, naLixeira: false, modo: total > 1 ? "ordem" : "mover", alvo: indice, rot: 0 };
      const mover = (ev: PointerEvent) => {
        if (!ativo) {
          if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < LIMIAR) return;
          ativo = true;
          soltar = segurar("grabbing");
          // Arrastar a bolha MINIMIZA a conversa aberta (a janela não fica solta enquanto a pilha muda de lugar).
          if (ativaRef.current) onMinimizar();
        }
        ev.preventDefault();
        const agora = performance.now();
        amostras.push({ x: ev.clientX, y: ev.clientY, t: agora });
        while (amostras.length > 2 && agora - amostras[0].t > 120) amostras.shift();
        const x = ev.clientX - dx0;
        const y = ev.clientY - dy0;
        // Saiu da COLUNA (de lado, ou bem acima/abaixo da pilha) = passa a MOVER a pilha (até soltar).
        let modo = ultimo.modo;
        if (modo === "ordem" && (Math.abs(x - esquerda) > t.tam * 0.9 || y < topo - passo || y > topo + alturaPilha)) modo = "mover";
        const alvo = modo === "ordem" ? Math.min(total - 1, Math.max(0, Math.round((y - topo) / passo))) : indice;
        // A inclinação acompanha a velocidade de lado (o "peso" da bolha).
        const { vx } = velocidadeArrasto(amostras.slice(-4));
        const rot = Math.max(-14, Math.min(14, vx * 9));
        const naLixeira = Math.hypot(ev.clientX - lixeira.x, ev.clientY - lixeira.y) < LIXEIRA.ima;
        if (naLixeira && !ultimo.naLixeira) navigator.vibrate?.(10);
        if (modo === "ordem" && alvo !== ultimo.alvo) navigator.vibrate?.(5);
        // Perto da lixeira, a bolha é ATRAÍDA para o centro dela (ímã).
        ultimo = naLixeira
          ? { conversa, x: lixeira.x - t.tam / 2, y: lixeira.y - t.tam / 2, naLixeira, modo, alvo, rot: 0 }
          : { conversa, x, y, naLixeira, modo, alvo, rot };
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
          setSumindo(conversa);
          window.setTimeout(() => {
            setSumindo(null);
            setArrasto(null);
            onExcluir(conversa);
          }, duracaoMotionMs() * 0.6 + 20);
          return;
        }
        const mapa: Pouso["mapa"] = new Map();
        if (ultimo.modo === "ordem") {
          // REORDENAR: a bolha vai ao lugar escolhido; cada uma sai de onde está agora (as que abriram espaço, deslocadas).
          const ordem = moverBolha(
            bolhas.map((b) => b.conversa),
            indice,
            ultimo.alvo,
          );
          ordem.forEach((c, jn) => {
            const jv = bolhas.findIndex((b) => b.conversa === c);
            const y = c === conversa ? ultimo.y : topo + (jv + desvioNaOrdem(jv, indice, ultimo.alvo)) * passo;
            const x = c === conversa ? ultimo.x : esquerda;
            mapa.set(c, { dx: x - esquerda, dy: y - (topo + jn * passo), fator: 1.8 });
          });
          setArrasto(null);
          if (ultimo.alvo !== indice) onReordenar(ordem);
          pousar(mapa);
          return;
        }
        // ARREMESSO: a pilha vai para onde a bolha CAIRIA com a inércia — um peteleco leva ao outro lado da tela. Cada bolha
        // parte de onde está (as outras vinham em cadeia atrás) e voa com mola; quanto mais longe, mais longo o voo.
        // Parado antes de soltar = sem arremesso (a velocidade conta até o instante de soltar).
        const ult = amostras[amostras.length - 1];
        amostras.push({ x: ult.x, y: ult.y, t: performance.now() });
        const p = projetarArremesso(ultimo.x, ultimo.y, velocidadeArrasto(amostras));
        const nova = encostarBolhas(p.x + t.tam / 2, p.y - indice * passo, t, alturaPilha);
        const esqNova = nova.lado === "esq" ? MARGEM : t.largura - MARGEM - t.tam;
        const topoNovo = topoDasBolhas(nova, t, alturaPilha);
        chaves.forEach((k, j) => {
          const dx = ultimo.x - esqNova;
          const dy = ultimo.y + (j - indice) * passo - (topoNovo + j * passo);
          mapa.set(k, { dx, dy, fator: 1.8 + Math.min(2.6, Math.hypot(dx, dy) / 380) });
        });
        setArrasto(null);
        onPosicao(nova);
        pousar(mapa);
      };
      window.addEventListener("pointermove", mover, { passive: false });
      window.addEventListener("pointerup", fim);
      window.addEventListener("pointercancel", fim);
    },
    [t, passo, esquerda, topo, alturaPilha, lixeira.x, lixeira.y, onPosicao, onReordenar, onExcluir, onMinimizar, chaves, bolhas, pousar],
  );

  /** Teclado: Alt + ↑/↓ reordena, Alt + ←/→ leva a pilha para o outro lado. */
  const tecla = (e: React.KeyboardEvent, i: number) => {
    if (!e.altKey) return;
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const para = i + (e.key === "ArrowUp" ? -1 : 1);
      if (para < 0 || para >= bolhas.length) return;
      onReordenar(moverBolha(
        bolhas.map((b) => b.conversa),
        i,
        para,
      ));
    } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      onPosicao({ ...posicao, lado: e.key === "ArrowLeft" ? "esq" : "dir" });
    }
  };

  if (!t || (!bolhas.length && !extras && !exibida)) return null;
  const indiceAtiva = Math.max(
    0,
    bolhas.findIndex((b) => b.conversa === exibida),
  );
  // A janela AO LADO da pilha (do lado de dentro da tela), alinhada à bolha ativa e presa na área livre; cresce A PARTIR da
  // bolha (a origem da animação é o centro dela).
  const yAtiva = topo + indiceAtiva * passo;
  const altJanela = Math.min(JANELA.altura, t.altura - t.topo - t.base);
  const jTopo = Math.min(Math.max(t.topo, yAtiva), Math.max(t.topo, t.altura - t.base - altJanela));
  const jLado = posicao.lado === "dir" ? { right: MARGEM + t.tam + 14 } : { left: MARGEM + t.tam + 14 };
  const telaCheia = t.largura < 640;
  const arrastando = arrasto != null && sumindo == null;
  const iPresa = arrasto ? bolhas.findIndex((b) => b.conversa === arrasto.conversa) : -1;
  /** Para onde vai a bolha `j` que NÃO está presa: na ORDEM, abre espaço; ao MOVER, segue a presa em cadeia (atrás dela). */
  const segue = (j: number): Segue | null => {
    if (!arrasto || iPresa < 0 || sumindo) return null;
    if (arrasto.modo === "ordem") return { dx: 0, dy: desvioNaOrdem(j, iPresa, arrasto.alvo) * passo, atraso: 0 };
    if (arrasto.naLixeira) return null;
    return { dx: arrasto.x - esquerda, dy: arrasto.y - (topo + iPresa * passo), atraso: Math.abs(j - iPresa) };
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
                  transformOrigin: `${posicao.lado === "dir" ? "right" : "left"} ${Math.max(0, yAtiva - jTopo + t.tam / 2)}px`,
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
        className={`fixed z-[60] m-0 flex list-none flex-col p-0 select-none [-webkit-touch-callout:none] [&_img]:pointer-events-none [&_img]:[-webkit-user-drag:none] ${telaCheia && ativa ? "hidden" : ""}`}
        style={{ left: esquerda, top: topo, gap: VAO, touchAction: "none" }}
      >
        {bolhas.map((b, i) => {
          const presa = arrasto?.conversa === b.conversa ? arrasto : null;
          const sai = sumindo === b.conversa;
          return (
            <li
              key={b.conversa}
              className={`relative ${b.nova && !presa ? "animate-cabeca-entra" : ""}`}
              style={estiloDaBolha(presa ? { dx: presa.x - esquerda, dy: presa.y - (topo + i * passo), ima: presa.naLixeira, rot: presa.rot } : null, segue(i), pouso, b.conversa, i)}
            >
              <button
                type="button"
                draggable={false}
                onPointerDown={(e) => pegar(e, b.conversa, i)}
                onClick={() => !engolirClique.current && onTocar(b.conversa)}
                onKeyDown={(e) => tecla(e, i)}
                aria-label={`${b.rotulo}${b.naoLidas ? ` — ${b.naoLidas} não lida${b.naoLidas === 1 ? "" : "s"}` : ""}`}
                aria-expanded={ativa === b.conversa}
                title={`${b.rotulo} — tocar abre ou minimiza; arraste na coluna para reordenar, para fora para mover (ou arremesse), ou até a lixeira para fechar`}
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
          <li style={estiloDaBolha(null, segue(bolhas.length), pouso, "+", bolhas.length)}>
            <button
              type="button"
              onClick={onExtras}
              aria-label={`Mais ${extras} conversa${extras === 1 ? "" : "s"}`}
              title={`Mais ${extras} conversa${extras === 1 ? "" : "s"}`}
              className="flex items-center justify-center rounded-full bg-surface text-[14px] font-semibold text-text-2 shadow-flutuante transition-transform duration-[var(--motion-duration)] hover:scale-105"
              style={{ width: t.tam, height: t.tam }}
            >
              +{extras}
            </button>
          </li>
        )}
      </ul>
      {arrasto && (
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
      {arrastando && (
        <p aria-live="polite" className="sr-only">
          {arrasto.naLixeira ? "Solte para excluir a conversa" : "Arraste até a lixeira para excluir"}
        </p>
      )}
    </>,
    document.body,
  );
}

type Segue = { dx: number; dy: number; atraso: number };

/** Quanto (em lugares) a bolha `j` desce/sobe para abrir espaço quando a da posição `de` está sobre a posição `alvo`. */
function desvioNaOrdem(j: number, de: number, alvo: number): number {
  if (j === de) return 0;
  if (de < alvo && j > de && j <= alvo) return -1;
  if (alvo < de && j >= alvo && j < de) return 1;
  return 0;
}

/** O MOVIMENTO de uma bolha: PRESA ao dedo (sem atraso, inclinada pela velocidade; na lixeira, o ímã com mola), SEGUINDO a
 * presa (abrindo espaço na ordem, ou em cadeia atrás dela — cada uma um pouco depois), no início do POUSO (parada onde
 * estava) ou VOANDO até o lugar com mola, em cadeia. */
function estiloDaBolha(presa: { dx: number; dy: number; ima: boolean; rot: number } | null, segue: Segue | null, pouso: Pouso | null, chave: string, i: number): CSSProperties {
  if (presa)
    return {
      transform: `translate3d(${presa.dx}px, ${presa.dy}px, 0) rotate(${presa.rot}deg)`,
      transition: presa.ima ? "transform calc(var(--motion-duration) * 1.2) cubic-bezier(0.34, 1.56, 0.64, 1)" : "transform 70ms linear",
      zIndex: 3,
    };
  if (segue)
    return {
      transform: `translate3d(${segue.dx}px, ${segue.dy}px, 0)`,
      // Sem atraso (ele recomeçaria a cada movimento do dedo): a cadeia vem da DURAÇÃO — quanto mais longe da presa, mais
      // devagar ela alcança.
      transition: `transform calc(var(--motion-duration) * ${segue.atraso ? 0.7 + segue.atraso * 0.45 : 1.2}) cubic-bezier(0.22, 1, 0.36, 1)`,
      zIndex: 2 - Math.min(1, segue.atraso),
    };
  const voo = pouso?.mapa.get(chave);
  if (voo && pouso?.fase === "ini") return { transform: `translate3d(${voo.dx}px, ${voo.dy}px, 0)`, transition: "none" };
  return {
    transform: "translate3d(0, 0, 0)",
    transition: `transform calc(var(--motion-duration) * ${voo?.fator ?? 2.4}) cubic-bezier(0.34, 1.3, 0.64, 1) ${i * 35}ms`,
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
