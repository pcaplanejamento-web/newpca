import type { ReactNode } from "react";

type Props = {
  title: string;
  value: string;
  subtitle?: string;
  icon: ReactNode;
  gradient: string;
};

export function KpiCard({ title, value, subtitle, icon, gradient }: Props) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl p-5 text-white shadow-lg ${gradient}`}
    >
      <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-white/10" />
      <div className="pointer-events-none absolute right-6 top-12 h-16 w-16 rounded-full bg-white/10" />
      <div className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
        {icon}
      </div>
      <div className="relative mt-4">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-white/80">
          {title}
        </div>
        <div className="mt-1 text-2xl font-bold leading-tight tracking-tight sm:text-[1.7rem]">
          {value}
        </div>
        {subtitle ? (
          <div className="mt-1 truncate text-xs text-white/80" title={subtitle}>
            {subtitle}
          </div>
        ) : null}
      </div>
    </div>
  );
}
