import type { ReactNode } from "react";
import type { TextosAcesso } from "@/lib/acesso-core";
import { ConstelacaoAnimada } from "./ConstelacaoAnimada";
import { IconBadgeCheck, IconClipboard, IconLayers } from "./icons";
import { type Identidade, MarcaSistema } from "./MarcaSistema";

// A VITRINE das telas de acesso: o painel IMERSIVO ao lado do formulário (só a partir do `lg` — no celular, o formulário
// ocupa a tela). Fundo escuro por token (`--vitrine-*`), a constelação animada e os TEXTOS do ADM (Configurações → Tela
// de acesso — `textosAcesso`). Sem números inventados.

/** O ícone de cada destaque, pela posição. */
const ICONES: ReactNode[] = [<IconClipboard key="a" className="h-4 w-4" />, <IconLayers key="b" className="h-4 w-4" />, <IconBadgeCheck key="c" className="h-4 w-4" />];

/** `previa` = a MESMA vitrine em miniatura (Configurações → Tela de acesso): visível em qualquer tela, num cartão. */
export function VitrineAcesso({ identidade, textos, previa = false }: { identidade?: Identidade; textos: TextosAcesso; previa?: boolean }) {
  return (
    <aside
      className={`relative overflow-hidden text-[var(--vitrine-texto)] ${previa ? "flex min-h-[520px] flex-col rounded-card" : "hidden lg:flex lg:flex-col"}`}
      style={{ background: "radial-gradient(120% 90% at 85% 15%, var(--vitrine-bg-2) 0%, var(--vitrine-bg) 60%)" }}
    >
      <ConstelacaoAnimada className="absolute inset-0" />

      <div className={`relative flex flex-1 flex-col ${previa ? "p-6 sm:p-8" : "p-12 xl:p-16 [@media(max-height:820px)]:p-8 [@media(max-height:820px)]:px-12"}`}>
        <MarcaSistema identidade={identidade} tamanho="lg" claro />

        <div className={`my-auto max-w-xl ${previa ? "py-8" : "py-12"}`}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--vitrine-ponto)]">{textos.rotulo}</p>
          <h2
            className={`mt-4 whitespace-pre-line font-bold leading-[1.05] tracking-tight ${previa ? "text-[30px] sm:text-[36px]" : "text-[44px] xl:text-[54px]"}`}
          >
            {textos.titulo}
          </h2>
          <p className="mt-5 max-w-lg whitespace-pre-line text-[15px] leading-relaxed text-[var(--vitrine-muted)]">{textos.descricao}</p>
          {textos.destaques.length > 0 && (
            <ul className="mt-9 space-y-5">
              {textos.destaques.map((d, i) => (
                <li key={`${i}-${d.titulo}`} className="flex items-start gap-3.5">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[color-mix(in_srgb,var(--vitrine-ponto)_30%,transparent)] bg-[color-mix(in_srgb,var(--vitrine-ponto)_14%,transparent)] text-[var(--vitrine-ponto)] backdrop-blur-sm">
                    {ICONES[i % ICONES.length]}
                  </span>
                  <span>
                    <span className="block text-[14px] font-semibold">{d.titulo}</span>
                    {d.texto && <span className="block text-[13px] leading-snug text-[var(--vitrine-muted)]">{d.texto}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="text-[12px] text-[var(--vitrine-muted)]">
          © {new Date().getFullYear()} {textos.rodape}
        </p>
      </div>
    </aside>
  );
}
