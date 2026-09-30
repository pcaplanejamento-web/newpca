"use client";

import { useEffect, useRef } from "react";

// A CONSTELAÇÃO da vitrine de acesso (o "plexo" do Dattago): pontos em várias profundidades que vagam ao acaso, surgem e
// somem devagar, ligados aos VIZINHOS mais próximos — as ligações fecham TRIÂNGULOS (véu leve), uma triangulação viva; os de
// perto são maiores, mais rápidos e mais nítidos (a ideia de profundidade).
// Um <canvas> só (sem DOM por ponto); desenha só enquanto está visível (no celular a vitrine não aparece → não roda) e,
// sem movimento (sistema ou ADM), fica num quadro parado. A cor vem do token `--vitrine-ponto`.

type Ponto = { x: number; y: number; z: number; vx: number; vy: number; idade: number; vida: number };

const DENSIDADE = 1 / 11000; // pontos por px² (limitado abaixo)
const MIN_PONTOS = 40;
const MAX_PONTOS = 120;
const ALCANCE = 190; // distância máxima (px) de uma ligação, na camada da frente
const VIZINHOS = 3; // ligações por ponto (os mais próximos) — fecham triângulos

function novoPonto(w: number, h: number, nascendo: boolean): Ponto {
  const z = 0.25 + Math.random() * 0.75;
  const ang = Math.random() * Math.PI * 2;
  const vel = (0.05 + Math.random() * 0.12) * z;
  const vida = 9000 + Math.random() * 11000;
  return { x: Math.random() * w, y: Math.random() * h, z, vx: Math.cos(ang) * vel, vy: Math.sin(ang) * vel, vida, idade: nascendo ? 0 : Math.random() * vida };
}

/** Opacidade no ciclo de vida: surge, fica e some (seno suave). */
const brilho = (p: Ponto) => Math.sin(Math.PI * Math.min(1, p.idade / p.vida)) ** 0.8;

function semMovimento(): boolean {
  const m = document.documentElement.dataset.motion;
  return m === "off" || m === "reduced" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function ConstelacaoAnimada({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const cor = getComputedStyle(canvas).getPropertyValue("--vitrine-ponto").trim() || "#8b93ff";
    const parado = semMovimento();
    let w = 0;
    let h = 0;
    let pontos: Ponto[] = [];
    let raf = 0;
    let antes = 0;

    function medir() {
      if (!canvas || !ctx) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.max(MIN_PONTOS, Math.min(MAX_PONTOS, Math.round(w * h * DENSIDADE)));
      pontos = Array.from({ length: n }, () => novoPonto(w, h, false));
    }

    // Buffers reaproveitados a cada quadro (sem lixo para o coletor).
    let viz: number[][] = [];

    function desenhar() {
      if (!ctx) return;
      const n = pontos.length;
      if (viz.length !== n) viz = Array.from({ length: n }, () => []);
      ctx.clearRect(0, 0, w, h);
      // 1) A MALHA: cada ponto liga-se aos VIZINHOS mais próximos (até VIZINHOS, dentro do alcance da profundidade dele) —
      //    as ligações se fecham em triângulos, como uma triangulação viva.
      for (let i = 0; i < n; i++) viz[i].length = 0;
      const perto: [number, number][] = [];
      for (let i = 0; i < n; i++) {
        const a = pontos[i];
        const alcance = ALCANCE * (0.55 + a.z * 0.45);
        perto.length = 0;
        for (let j = 0; j < n; j++) {
          if (j === i) continue;
          const dx = a.x - pontos[j].x;
          const dy = a.y - pontos[j].y;
          const d2 = dx * dx + dy * dy;
          if (d2 <= alcance * alcance) perto.push([d2, j]);
        }
        perto.sort((x, y) => x[0] - y[0]);
        for (let k = 0; k < Math.min(VIZINHOS, perto.length); k++) {
          const j = perto[k][1];
          if (!viz[i].includes(j)) viz[i].push(j);
          if (!viz[j].includes(i)) viz[j].push(i);
        }
      }
      // 2) Os TRIÂNGULOS (três pontos ligados entre si): um véu bem leve — a sensação de volume.
      ctx.fillStyle = cor;
      for (let i = 0; i < n; i++) {
        for (const j of viz[i]) {
          if (j <= i) continue;
          for (const k of viz[j]) {
            if (k <= j || !viz[i].includes(k)) continue;
            const A = pontos[i];
            const B = pontos[j];
            const C = pontos[k];
            ctx.globalAlpha = Math.min(brilho(A), brilho(B), brilho(C)) * ((A.z + B.z + C.z) / 3) * 0.07;
            ctx.beginPath();
            ctx.moveTo(A.x, A.y);
            ctx.lineTo(B.x, B.y);
            ctx.lineTo(C.x, C.y);
            ctx.closePath();
            ctx.fill();
          }
        }
      }
      // 3) As LIGAÇÕES: mais fortes quanto mais perto e mais à frente.
      ctx.strokeStyle = cor;
      for (let i = 0; i < n; i++) {
        const a = pontos[i];
        for (const j of viz[i]) {
          if (j <= i) continue;
          const b = pontos[j];
          const zm = (a.z + b.z) / 2;
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          ctx.lineWidth = 0.5 + zm * 0.7;
          ctx.globalAlpha = Math.max(0, 1 - d / (ALCANCE * 1.1)) * Math.min(brilho(a), brilho(b)) * (0.25 + zm * 0.55);
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
      // 4) Os PONTOS (os da frente com halo).
      for (const p of pontos) {
        const al = brilho(p) * (0.3 + p.z * 0.7);
        const r = 0.8 + p.z * 2.2;
        if (p.z > 0.75) {
          ctx.globalAlpha = al * 0.2;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r * 3.2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = al;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    function passo(t: number) {
      const dt = Math.min(64, antes ? t - antes : 16);
      antes = t;
      for (let i = 0; i < pontos.length; i++) {
        const p = pontos[i];
        // Deriva ao acaso (passeio suave da direção) + a vida: ao fim, renasce em outro lugar.
        p.vx += (Math.random() - 0.5) * 0.004 * p.z;
        p.vy += (Math.random() - 0.5) * 0.004 * p.z;
        const lim = 0.2 * p.z;
        p.vx = Math.max(-lim, Math.min(lim, p.vx));
        p.vy = Math.max(-lim, Math.min(lim, p.vy));
        p.x += p.vx * dt * 0.06;
        p.y += p.vy * dt * 0.06;
        p.idade += dt;
        if (p.idade >= p.vida || p.x < -40 || p.x > w + 40 || p.y < -40 || p.y > h + 40) pontos[i] = novoPonto(w, h, true);
      }
      desenhar();
      raf = requestAnimationFrame(passo);
    }

    function iniciar() {
      cancelAnimationFrame(raf);
      antes = 0;
      medir();
      if (!w || !h) return; // escondido (celular): nada a desenhar
      if (parado) desenhar();
      else raf = requestAnimationFrame(passo);
    }

    const ro = new ResizeObserver(iniciar);
    ro.observe(canvas);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  return <canvas ref={ref} className={`pointer-events-none h-full w-full ${className}`} />;
}
