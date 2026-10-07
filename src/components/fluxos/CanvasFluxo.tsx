"use client";

import { type DragEvent, type PointerEvent as RPointerEvent, type ReactNode, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { type Grafo, type PassoExec, portasDo, type Registro, SAIDA_ERRO } from "@/lib/fluxo-core";
import { corCategoria } from "@/lib/fluxo-nos";
import { alturaNo, caminhoSvg, coresDasLigacoes, dobraDaRota, GRADE, LARGURA_NO, PASSO_PORTA, type Ponto, posPorta, rotaOrtogonal, rotasDoGrafo, setasDaRota, snap, TOPO_PORTAS } from "@/lib/fluxo-layout";

export { alturaNo, LARGURA_NO };
import { segurar } from "../segurar";
import { IconeNo } from "./IconeNo";

const ZOOM_MIN = 0.3;
const ZOOM_MAX = 1.8;
const curva = (a: Ponto, b: Ponto) => caminhoSvg(rotaOrtogonal(a, b, []));
/** A seta da direção do fluxo (desenhada no meio dos trechos e na chegada). */
const SETA = "M -5 -4 L 3 0 L -5 4 z";

const COR_ESTADO: Record<PassoExec["estado"], string> = {
  fila: "var(--border)",
  rodando: "var(--info)",
  ok: "var(--ok)",
  erro: "var(--danger)",
  ignorado: "var(--faint)",
};

export type Vista = { x: number; y: number; z: number };
type Arrasto =
  | { tipo: "pan"; x0: number; y0: number; vx: number; vy: number }
  | { tipo: "no"; id: string; x0: number; y0: number; nx: number; ny: number; moveu: boolean }
  | { tipo: "ligar"; de: string; saida: string; ax: number; ay: number; px: number; py: number }
  | { tipo: "dobra"; i: number; x0: number; dx0: number };

/**
 * O CANVAS do fluxo (estilo N8N): grade pontilhada, PAN (arrastar o fundo), ZOOM (roda / botões), nós como cartões na cor
 * da categoria com as portas (entradas à esquerda, saídas à direita — a "erro" em vermelho), conexões em curva; arrastar
 * de uma saída até uma entrada LIGA; tocar numa conexão a marca (Delete remove). Soltar um item da paleta cria o nó ali.
 * Controlado: o grafo vem de fora e cada mudança sai por `onMudar`.
 */
export function CanvasFluxo({
  grafo,
  registro,
  selecionado,
  onSelecionar,
  onMudar,
  passos,
  somenteLeitura = false,
  onSoltarTipo,
  vista,
  onVista,
  altura,
  extra,
}: {
  grafo: Grafo;
  registro: Registro;
  selecionado: string | null;
  onSelecionar: (id: string | null) => void;
  onMudar: (g: Grafo) => void;
  passos?: Record<string, PassoExec>;
  somenteLeitura?: boolean;
  /** Um tipo da paleta solto no canvas (coordenadas do canvas). */
  onSoltarTipo?: (tipo: string, x: number, y: number) => void;
  vista: Vista;
  onVista: (v: Vista) => void;
  altura: number | string;
  /** Sobreposições (ex.: botões de zoom) dentro do quadro. */
  extra?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const arrasto = useRef<Arrasto | null>(null);
  const soltarSel = useRef<(() => void) | null>(null);
  const [temp, setTemp] = useState<{ a: { x: number; y: number }; b: { x: number; y: number } } | null>(null);
  const [conSel, setConSel] = useState<number | null>(null);
  // As ROTAS (sem linha sobre linha, desviando dos componentes), as cores (uma por ligação do mesmo nó) e as setas.
  const rotas = useMemo(() => rotasDoGrafo(grafo, registro), [grafo, registro]);
  const cores = useMemo(() => coresDasLigacoes(grafo), [grafo]);
  // A cor de cada porta ligada (a bolinha fica PREENCHIDA com a cor da linha).
  const corPorta = useMemo(() => {
    const m = new Map<string, string>();
    grafo.conexoes.forEach((c, i) => {
      if (!m.has(`s|${c.de}|${c.saida}`)) m.set(`s|${c.de}|${c.saida}`, cores[i]);
      m.set(`e|${c.para}|${c.entrada}`, cores[i]);
    });
    return m;
  }, [grafo.conexoes, cores]);

  const paraCanvas = useCallback(
    (cx: number, cy: number) => {
      const r = ref.current?.getBoundingClientRect();
      return { x: (cx - (r?.left ?? 0) - vista.x) / vista.z, y: (cy - (r?.top ?? 0) - vista.y) / vista.z };
    },
    [vista],
  );

  // Delete/Backspace removem a conexão ou o nó marcado (fora de campos de texto).
  useEffect(() => {
    if (somenteLeitura) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const alvo = e.target as HTMLElement | null;
      if (alvo?.closest("input, textarea, select, [contenteditable]")) return;
      if (document.activeElement && document.activeElement !== document.body && !ref.current?.contains(document.activeElement)) return;
      if (conSel != null) {
        onMudar({ ...grafo, conexoes: grafo.conexoes.filter((_, i) => i !== conSel) });
        setConSel(null);
        e.preventDefault();
      } else if (selecionado) {
        onMudar({ ...grafo, nos: grafo.nos.filter((n) => n.id !== selecionado), conexoes: grafo.conexoes.filter((c) => c.de !== selecionado && c.para !== selecionado) });
        onSelecionar(null);
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [conSel, selecionado, grafo, onMudar, onSelecionar, somenteLeitura]);

  // Uma função por render (o grafo mais recente); os ouvintes chamam a atual pelo `fimRef`.
  const fim = (e: PointerEvent) => {
      const a = arrasto.current;
      arrasto.current = null;
      soltarSel.current?.();
      soltarSel.current = null;
      window.removeEventListener("pointermove", mover);
      if (pararRef.current) {
        window.removeEventListener("pointerup", pararRef.current);
        window.removeEventListener("pointercancel", pararRef.current);
        pararRef.current = null;
      }
      if (a?.tipo === "ligar") {
        setTemp(null);
        const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-porta-entrada]");
        const para = el?.dataset.no;
        const entrada = el?.dataset.portaEntrada;
        if (para && entrada && para !== a.de) {
          const nova = { de: a.de, saida: a.saida, para, entrada };
          if (!grafo.conexoes.some((c) => c.de === nova.de && c.saida === nova.saida && c.para === nova.para && c.entrada === nova.entrada))
            onMudar({ ...grafo, conexoes: [...grafo.conexoes, nova] });
        }
      } else if (a?.tipo === "no" && !a.moveu) onSelecionar(a.id);
      else if (a?.tipo === "pan" && Math.abs(e.clientX - a.x0) < 4 && Math.abs(e.clientY - a.y0) < 4) {
        onSelecionar(null);
        setConSel(null);
      }
  };
  const fimRef = useRef(fim);
  fimRef.current = fim;
  const pararRef = useRef<((e: PointerEvent) => void) | null>(null);
  const grafoRef = useRef(grafo);
  grafoRef.current = grafo;
  const vistaRef = useRef(vista);
  vistaRef.current = vista;

  // biome-ignore lint/correctness/useExhaustiveDependencies: estável — lê tudo por refs
  const mover = useCallback((e: PointerEvent) => {
    const a = arrasto.current;
    if (!a) return;
    const z = vistaRef.current.z;
    if (a.tipo === "dobra") {
      // Só um ARRASTO de verdade ajusta (tocar para marcar não vira dobra manual).
      if (Math.abs(e.clientX - a.x0) < 4) return;
      const g = grafoRef.current;
      const x = snap(a.dx0 + (e.clientX - a.x0) / z);
      if (g.conexoes[a.i]?.x === x) return;
      onMudar({ ...g, conexoes: g.conexoes.map((c, i) => (i === a.i ? { ...c, x } : c)) });
    } else if (a.tipo === "pan") onVista({ ...vistaRef.current, x: a.vx + e.clientX - a.x0, y: a.vy + e.clientY - a.y0 });
    else if (a.tipo === "no") {
      const dx = (e.clientX - a.x0) / z;
      const dy = (e.clientY - a.y0) / z;
      if (!a.moveu && Math.hypot(dx, dy) < 4 / z) return;
      a.moveu = true;
      const g = grafoRef.current;
      onMudar({ ...g, nos: g.nos.map((n) => (n.id === a.id ? { ...n, x: snap(a.nx + dx), y: snap(a.ny + dy) } : n)) });
    } else {
      const r = ref.current?.getBoundingClientRect();
      const v = vistaRef.current;
      setTemp({ a: { x: a.ax, y: a.ay }, b: { x: (e.clientX - (r?.left ?? 0) - v.x) / v.z, y: (e.clientY - (r?.top ?? 0) - v.y) / v.z } });
    }
  }, []);

  const comecar = (e: RPointerEvent, a: Arrasto) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    arrasto.current = a;
    soltarSel.current = segurar("grabbing");
    window.addEventListener("pointermove", mover);
    const f = (ev: PointerEvent) => fimRef.current(ev);
    pararRef.current = f;
    window.addEventListener("pointerup", f);
    window.addEventListener("pointercancel", f);
  };

  const roda = (e: React.WheelEvent) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, vista.z * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    onVista({ z, x: mx - ((mx - vista.x) / vista.z) * z, y: my - ((my - vista.y) / vista.z) * z });
  };

  const soltar = (e: DragEvent) => {
    const tipo = e.dataTransfer.getData("application/x-fluxo-no");
    if (!tipo || !onSoltarTipo) return;
    e.preventDefault();
    const p = paraCanvas(e.clientX, e.clientY);
    onSoltarTipo(tipo, snap(p.x - LARGURA_NO / 2), snap(p.y - 20));
  };

  return (
    <div
      ref={ref}
      role="none"
      className="relative touch-none select-none overflow-hidden rounded-card border border-border bg-[var(--surface-2,var(--bg))] outline-none "
      style={{
        height: altura,
        backgroundImage: "radial-gradient(var(--border) 1px, transparent 1px)",
        backgroundSize: `${GRADE * vista.z}px ${GRADE * vista.z}px`,
        backgroundPosition: `${vista.x}px ${vista.y}px`,
      }}
      onPointerDown={(e) => comecar(e, { tipo: "pan", x0: e.clientX, y0: e.clientY, vx: vista.x, vy: vista.y })}
      onWheel={roda}
      onDragOver={(e) => onSoltarTipo && e.preventDefault()}
      onDrop={soltar}
    >
      <div className="absolute left-0 top-0 origin-top-left" style={{ transform: `translate(${vista.x}px, ${vista.y}px) scale(${vista.z})` }}>
        <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width="1" height="1" aria-hidden="true">
          {grafo.conexoes.map((c, i) => {
            const pts = rotas[i];
            if (!pts) return null;
            const d = caminhoSvg(pts);
            const erro = c.saida === SAIDA_ERRO;
            const ativo = passos?.[c.de]?.estado === "ok" && !erro;
            const marcada = conSel === i;
            const cor = marcada ? "var(--accent)" : cores[i];
            const dobra = somenteLeitura ? null : dobraDaRota(pts);
            return (
              <g key={`${c.de}-${c.saida}-${c.para}-${c.entrada}`}>
                {/* biome-ignore lint/a11y/noStaticElementInteractions: a linha se marca/ajusta com o ponteiro; pelo teclado, Organizar refaz as rotas */}
                <path
                  d={d}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={14}
                  className={somenteLeitura ? "" : `pointer-events-auto ${dobra ? "cursor-ew-resize" : "cursor-pointer"}`}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    if (somenteLeitura) return;
                    setConSel(i);
                    onSelecionar(null);
                    // Arrastar a LINHA (qualquer trecho) desloca a dobra vertical para os lados.
                    if (dobra) comecar(e, { tipo: "dobra", i, x0: e.clientX, dx0: dobra.x });
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    if (c.x != null) onMudar({ ...grafo, conexoes: grafo.conexoes.map((x, j) => (j === i ? { de: x.de, saida: x.saida, para: x.para, entrada: x.entrada } : x)) });
                  }}
                >
                  <title>{dobra ? "Arraste para ajustar a linha · duplo clique volta ao automático · Delete remove" : "Toque para marcar · Delete remove"}</title>
                </path>
                <path
                  d={d}
                  fill="none"
                  stroke={cor}
                  strokeWidth={marcada ? 3 : 2}
                  strokeDasharray={erro ? "6 4" : undefined}
                  className={`transition-[stroke] duration-[var(--motion-duration)] ${ativo && !marcada ? "fluxo-conexao-viva" : ""}`}
                />
                {setasDaRota(pts).map((s, k) => (
                  <path key={k} d={SETA} fill={cor} transform={`translate(${s.x} ${s.y}) rotate(${s.ang})`} />
                ))}
              </g>
            );
          })}
          {temp && <path d={curva(temp.a, temp.b)} fill="none" stroke="var(--accent)" strokeWidth={2} strokeDasharray="5 4" />}
        </svg>
        {grafo.nos.map((n) => {
          const d = registro.get(n.tipo);
          const p = portasDo(d);
          const passo = passos?.[n.id];
          const cor = d ? corCategoria(d.categoria) : "var(--danger)";
          const sel = selecionado === n.id;
          return (
            <div
              key={n.id}
              data-no={n.id}
              role="none"
              // O NÓ INTEIRO arrasta (não só o título) — tocar no corpo nunca arrasta o quadro de fundo; as portas param antes.
              onPointerDown={(e) => comecar(e, { tipo: "no", id: n.id, x0: e.clientX, y0: e.clientY, nx: n.x, ny: n.y, moveu: false })}
              className={`absolute cursor-grab rounded-xl border bg-surface shadow-soft transition-shadow active:cursor-grabbing ${sel ? "border-accent shadow-[0_0_0_2px_var(--accent)]" : "border-border"} ${n.desativado ? "opacity-50" : ""}`}
              style={{ left: n.x, top: n.y, width: LARGURA_NO, height: alturaNo(d), borderTop: `3px solid ${cor}` }}
            >
              <button
                type="button"
                className="flex h-[46px] w-full cursor-grab items-center gap-2 rounded-t-xl px-2.5 text-left active:cursor-grabbing"
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelecionar(n.id);
                  }
                }}
                title={d?.descricao}
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg text-white" style={{ background: cor }}>
                  <IconeNo nome={d?.icone ?? "alert"} className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-text">{n.nome || d?.rotulo || n.tipo}</span>
                  <span className="block truncate text-[11px] text-muted">{passo && passo.estado !== "fila" ? textoPasso(passo) : (d?.rotulo ?? "Tipo desconhecido")}</span>
                </span>
                {passo && passo.estado !== "fila" && (
                  <span
                    className={`size-2.5 shrink-0 rounded-full ${passo.estado === "rodando" ? "animate-pulse" : ""}`}
                    style={{ background: COR_ESTADO[passo.estado] }}
                    title={passo.estado}
                  />
                )}
              </button>
              {p?.entradas.map((porta, i) => (
                <Porta key={`e-${porta}`} lado="entrada" no={n.id} porta={porta} cor={corPorta.get(`e|${n.id}|${porta}`)} rotulo={d?.rotulosPortas?.[porta] ?? (p.entradas.length > 1 ? porta : "")} indice={i} />
              ))}
              {p?.saidas.map((porta, i) => (
                <Porta
                  key={`s-${porta}`}
                  lado="saida"
                  no={n.id}
                  porta={porta}
                  cor={corPorta.get(`s|${n.id}|${porta}`)}
                  rotulo={porta === SAIDA_ERRO ? "erro" : (d?.rotulosPortas?.[porta] ?? (p.saidas.length > 2 ? porta : ""))}
                  indice={i}
                  erro={porta === SAIDA_ERRO}
                  contagem={passo?.amostra?.[porta]?.length}
                  onPointerDown={
                    somenteLeitura
                      ? undefined
                      : (e) => {
                          const o = posPorta(n, d, "saida", porta);
                          comecar(e, { tipo: "ligar", de: n.id, saida: porta, ax: o.x, ay: o.y, px: o.x, py: o.y });
                          setTemp({ a: o, b: o });
                        }
                  }
                />
              ))}
            </div>
          );
        })}
      </div>
      {extra}
    </div>
  );
}

const textoPasso = (p: PassoExec) =>
  p.estado === "erro"
    ? (p.erro ?? "Erro")
    : p.estado === "rodando"
      ? (p.aviso ?? "Executando…")
      : p.estado === "ignorado"
        ? "Sem itens — pulado"
        : `${p.itens} item(ns)${p.vezes > 1 ? ` · ${p.vezes}×` : ""}`;

function Porta({
  lado,
  no,
  porta,
  rotulo,
  indice,
  erro,
  cor,
  contagem,
  onPointerDown,
}: {
  lado: "entrada" | "saida";
  no: string;
  porta: string;
  rotulo: string;
  indice: number;
  erro?: boolean;
  /** Ligada = a bolinha PREENCHIDA com a cor da linha. */
  cor?: string;
  contagem?: number;
  onPointerDown?: (e: RPointerEvent) => void;
}) {
  // As portas ficam DENTRO da borda do nó (3px em cima, 1px dos lados): desconta para o centro da bolinha cair
  // exatamente onde a linha chega (`posPorta`).
  const top = TOPO_PORTAS + indice * PASSO_PORTA - 3;
  const dados = lado === "entrada" ? { "data-porta-entrada": porta, "data-no": no } : {};
  return (
    <div className={`absolute flex h-6 items-center gap-1 ${lado === "entrada" ? "left-0 pl-3" : "right-0 flex-row-reverse pr-3"}`} style={{ top }}>
      <span
        {...dados}
        role="none"
        onPointerDown={onPointerDown}
        style={cor ? { background: cor, borderColor: cor } : undefined}
        className={`absolute top-1/2 size-3.5 -translate-y-1/2 rounded-full border-2 bg-surface transition-colors duration-[var(--motion-duration)] ${lado === "entrada" ? "-left-[8px]" : "-right-[8px] cursor-crosshair"} ${erro ? "border-[var(--danger)]" : "border-[var(--muted)] hover:border-accent"} before:absolute before:-inset-2.5 before:content-['']`}
      />
      {rotulo && <span className={`text-[10px] font-medium ${erro ? "text-[var(--danger)]" : "text-muted"}`}>{rotulo}</span>}
      {contagem != null && contagem > 0 && <span className="rounded bg-[var(--accent-soft)] px-1 text-[10px] tabular-nums text-accent">{contagem}</span>}
    </div>
  );
}
