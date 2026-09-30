import type { ReactNode } from "react";
import { IconBadgeCheck, IconClipboard, IconLayers } from "./icons";
import { type Identidade, MarcaSistema } from "./MarcaSistema";

// A VITRINE das telas de acesso: o painel IMERSIVO ao lado do formulário (só a partir do `lg` — no celular, o formulário
// ocupa a tela). Fundo escuro por token (`--vitrine-*`), a constelação que flutua devagar e o que o sistema faz. Sem
// números inventados: só a marca do ADM e os módulos reais. Decorativa para leitores de tela, exceto os textos.

// Os pontos da constelação (posições fixas — o HTML do servidor e o do navegador são iguais) e as ligações entre eles.
const PONTOS: [number, number][] = [
  [8, 12], [16, 8], [22, 17], [13, 22], [30, 10], [71, 9], [82, 15], [91, 6], [86, 27], [76, 22],
  [62, 33], [94, 41], [70, 48], [83, 55], [91, 63], [74, 70], [60, 64], [88, 80], [67, 86], [79, 94],
  [52, 90], [40, 95], [95, 92], [48, 5], [57, 16],
];
const LIGACOES: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 0], [1, 4], [4, 23], [23, 24], [5, 6], [6, 7], [6, 9], [9, 8], [8, 11], [10, 12],
  [12, 13], [13, 14], [13, 15], [15, 16], [15, 17], [17, 19], [18, 19], [18, 20], [20, 21], [17, 22], [9, 10],
];

const DESTAQUES: { icone: ReactNode; titulo: string; texto: string }[] = [
  {
    icone: <IconClipboard className="h-4 w-4" />,
    titulo: "Mesa de planejamento",
    texto: "Protocolos, DFDs e itens num só fluxo, com a conferência automática.",
  },
  {
    icone: <IconLayers className="h-4 w-4" />,
    titulo: "PCA e orçamento integrados",
    texto: "O plano de cada ano lado a lado com a dotação do orçamento.",
  },
  {
    icone: <IconBadgeCheck className="h-4 w-4" />,
    titulo: "Transparência e rastreabilidade",
    texto: "Histórico de cada alteração e o PCA publicado para consulta.",
  },
];

export function VitrineAcesso({ identidade }: { identidade?: Identidade }) {
  return (
    <aside
      className="relative hidden overflow-hidden text-[var(--vitrine-texto)] lg:flex lg:flex-col"
      style={{ background: "radial-gradient(120% 90% at 85% 15%, var(--vitrine-bg-2) 0%, var(--vitrine-bg) 60%)" }}
    >
      {/* Constelação (decorativa) */}
      <svg aria-hidden="true" className="absolute inset-0 h-full w-full animate-vitrine-flutuar" viewBox="0 0 100 100" preserveAspectRatio="none">
        <g stroke="var(--vitrine-ponto)" strokeOpacity="0.28" strokeWidth="1">
          {LIGACOES.map(([a, b]) => (
            <line key={`${a}-${b}`} x1={PONTOS[a][0]} y1={PONTOS[a][1]} x2={PONTOS[b][0]} y2={PONTOS[b][1]} vectorEffect="non-scaling-stroke" />
          ))}
        </g>
      </svg>
      <div aria-hidden="true" className="absolute inset-0 animate-vitrine-flutuar">
        {PONTOS.map(([x, y], i) => (
          <span
            key={`${x}-${y}`}
            className="absolute rounded-full bg-[var(--vitrine-ponto)] animate-vitrine-cintilar"
            style={{
              left: `${x}%`,
              top: `${y}%`,
              width: i % 3 === 0 ? 5 : 3,
              height: i % 3 === 0 ? 5 : 3,
              opacity: i % 3 === 0 ? 0.9 : 0.55,
              animationDelay: `${(i % 7) * 0.6}s`,
              boxShadow: i % 3 === 0 ? "0 0 12px var(--vitrine-ponto)" : undefined,
            }}
          />
        ))}
      </div>

      <div className="relative flex flex-1 flex-col p-12 xl:p-16">
        <MarcaSistema identidade={identidade} tamanho="lg" claro />

        <div className="my-auto max-w-xl py-12">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--vitrine-ponto)]">Plano de Contratações Anual</p>
          <h2 className="mt-4 text-[44px] font-bold leading-[1.05] tracking-tight xl:text-[54px]">
            Todo o planejamento.
            <br />
            Uma só visão.
          </h2>
          <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-[var(--vitrine-muted)]">
            Das demandas de cada unidade ao PCA publicado: protocolos, DFDs, catálogo, orçamento e tarefas reunidos numa única
            plataforma, para a equipe de Planejamento decidir com dado conferido.
          </p>
          <ul className="mt-9 space-y-5">
            {DESTAQUES.map((d) => (
              <li key={d.titulo} className="flex items-start gap-3.5">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[color-mix(in_srgb,var(--vitrine-ponto)_30%,transparent)] bg-[color-mix(in_srgb,var(--vitrine-ponto)_14%,transparent)] text-[var(--vitrine-ponto)]">
                  {d.icone}
                </span>
                <span>
                  <span className="block text-[14px] font-semibold">{d.titulo}</span>
                  <span className="block text-[13px] leading-snug text-[var(--vitrine-muted)]">{d.texto}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-[12px] text-[var(--vitrine-muted)]">
          © {new Date().getFullYear()} Prefeitura Municipal de Rio Verde · Planejamento e Custos
        </p>
      </div>
    </aside>
  );
}
