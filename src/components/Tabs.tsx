"use client";

import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";

// Abas com sublinhado animado (spec do usuário). Indicador desliza para a aba
// ativa; no mobile, arrastar (swipe) troca de aba com transição fluida do painel.
// Respeita --motion-duration (acessibilidade).
export type Tab = { key: string; label: string; icon?: ReactNode; content: ReactNode };

export function Tabs({ tabs, className = "" }: { tabs: Tab[]; className?: string }) {
  const [idx, setIdx] = useState(0);
  const [ind, setInd] = useState({ left: 0, width: 0 });
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const idxRef = useRef(idx);
  idxRef.current = idx;

  // Mede a aba ativa (posição do sublinhado) ao trocar e no resize.
  useLayoutEffect(() => {
    const el = btnRefs.current[idx];
    if (el) setInd({ left: el.offsetLeft, width: el.offsetWidth });
  }, [idx, tabs.length]);
  useEffect(() => {
    const onResize = () => {
      const el = btnRefs.current[idxRef.current];
      if (el) setInd({ left: el.offsetLeft, width: el.offsetWidth });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const ir = (i: number) => setIdx(Math.max(0, Math.min(tabs.length - 1, i)));

  return (
    <div className={className}>
      <div
        role="tablist"
        className="relative flex gap-1 overflow-x-auto border-b border-border"
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") ir(idx + 1);
          else if (e.key === "ArrowLeft") ir(idx - 1);
        }}
      >
        {tabs.map((t, i) => (
          <button
            key={t.key}
            ref={(el) => {
              btnRefs.current[i] = el;
            }}
            type="button"
            role="tab"
            aria-selected={i === idx}
            tabIndex={i === idx ? 0 : -1}
            onClick={() => ir(i)}
            className={`inline-flex items-center gap-2 whitespace-nowrap px-3 py-2.5 text-[14px] font-medium transition-colors duration-[var(--motion-duration)] focus-visible:outline-none ${
              i === idx ? "text-accent" : "text-muted hover:text-text-2"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
        <span
          aria-hidden
          className="absolute bottom-0 h-[2px] rounded-full bg-accent transition-[left,width] duration-[var(--motion-duration)] ease-[var(--motion-ease)]"
          style={{ left: ind.left, width: ind.width }}
        />
      </div>

      <div
        className="overflow-hidden"
        onTouchStart={(e) => {
          startX.current = e.touches[0].clientX;
          setDragging(true);
        }}
        onTouchMove={(e) => {
          if (!dragging) return;
          const dx = e.touches[0].clientX - startX.current;
          const nasBordas = (idx === 0 && dx > 0) || (idx === tabs.length - 1 && dx < 0);
          setDragX(nasBordas ? dx * 0.25 : dx);
        }}
        onTouchEnd={() => {
          const limite = 50;
          if (dragX <= -limite) ir(idx + 1);
          else if (dragX >= limite) ir(idx - 1);
          setDragX(0);
          setDragging(false);
        }}
      >
        <div
          className="flex"
          style={{
            transform: `translateX(calc(${-idx * 100}% + ${dragX}px))`,
            transition: dragging ? "none" : "transform var(--motion-duration) var(--motion-ease)",
          }}
        >
          {tabs.map((t) => (
            <div key={t.key} role="tabpanel" className="w-full shrink-0 pt-4">
              {t.content}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
