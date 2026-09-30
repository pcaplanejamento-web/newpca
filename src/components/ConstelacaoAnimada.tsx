"use client";

import { useEffect, useRef } from "react";

// A CONSTELAÇÃO da vitrine de acesso: pontos em 3 profundidades que vagam ao acaso, surgem e somem devagar, ligados por
// linhas quando próximos na MESMA camada — os de perto maiores, mais rápidos e mais nítidos (a ideia de profundidade).
// Um <canvas> só (sem DOM por ponto); desenha só enquanto está visível (no celular a vitrine não aparece → não roda) e,
// sem movimento (sistema ou ADM), fica num quadro parado. A cor vem do token `--vitrine-ponto`.

type Ponto = { x: number; y: number; z: number; vx: number; vy: number; idade: number; vida: number };

const DENSIDADE = 1 / 14000; // pontos por px² (limitado abaixo)
const MIN_PONTOS = 36;
const MAX_PONTOS = 110;
const ALCANCE = 150; // distância máxima (px) de uma ligação, na camada da frente

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

    function desenhar() {
      if (!ctx) return;
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = cor;
      ctx.lineWidth = 1;
      for (let i = 0; i < pontos.length; i++) {
        const a = pontos[i];
        const ba = brilho(a);
        for (let j = i + 1; j < pontos.length; j++) {
          const b = pontos[j];
          if (Math.abs(a.z - b.z) > 0.22) continue; // só na mesma camada de profundidade
          const zm = (a.z + b.z) / 2;
          const alcance = ALCANCE * zm;
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 > alcance * alcance) continue;
          ctx.globalAlpha = (1 - Math.sqrt(d2) / alcance) * Math.min(ba, brilho(b)) * zm * 0.5;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
      ctx.fillStyle = cor;
      for (const p of pontos) {
        const al = brilho(p) * (0.25 + p.z * 0.75);
        const r = 0.6 + p.z * 2.1;
        if (p.z > 0.8) {
          ctx.globalAlpha = al * 0.18; // halo dos pontos da frente
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
