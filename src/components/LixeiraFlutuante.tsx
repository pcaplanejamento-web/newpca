import { IconTrash } from "./icons";

/** A LIXEIRA dos flutuantes: o tamanho, a distância da base da área livre e o raio em que o flutuante é ATRAÍDO para dentro. */
export const LIXEIRA = { tam: 64, base: 28, ima: 72 };

/** "Reduzir movimento" (o do sistema ou o `data-motion` do ADM): sem voo nem inclinação. */
export function semMovimento(): boolean {
  if (typeof window === "undefined") return false;
  const m = document.documentElement.dataset.motion;
  return m === "off" || m === "reduced" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** A LIXEIRA dos flutuantes (as bolhas do chat e o painel "Em segundo plano"): surge com o arrasto (`aberta`), centrada em
 * (x, y); `ativa` = o flutuante está sobre ela (vermelha, puxando). `bloqueada` = não aceita (âmbar). */
export function LixeiraFlutuante({ x, y, aberta, ativa, bloqueada = false }: { x: number; y: number; aberta: boolean; ativa: boolean; bloqueada?: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none fixed z-[59] ${aberta ? "animate-lixeira-entra" : "animate-lixeira-sai"}`}
      style={{ width: LIXEIRA.tam, height: LIXEIRA.tam, left: x - LIXEIRA.tam / 2, top: y - LIXEIRA.tam / 2 }}
    >
      <span
        className={`flex h-full w-full items-center justify-center rounded-full text-white shadow-flutuante transition-[background-color,transform] duration-[var(--motion-duration)] ${
          ativa ? (bloqueada ? "scale-[1.08] bg-[var(--warn)]" : "scale-[1.18] bg-[var(--danger)]") : "bg-[color-mix(in_oklab,var(--text)_70%,transparent)]"
        }`}
      >
        <IconTrash className={`h-6 w-6 transition-transform duration-[var(--motion-duration)] ${ativa && !bloqueada ? "-rotate-12 scale-110" : ""}`} />
      </span>
    </div>
  );
}

