"use client";

import dynamic from "next/dynamic";
import { type ReactNode, useMemo, useState } from "react";
import { dataBR, num } from "@/lib/format";
import { Button } from "../Button";
import { IconChevronLeft, IconChevronRight, IconLayers, IconRestaurar, IconZoom, IconZoomOut } from "../icons";
import { Skeleton } from "../Skeleton";
import type { LinhaDica, PontoTemporal, SerieTemporalDef } from "./SerieTemporal";
import { TOPO_DAS_DATAS } from "./serie-medidas";
import { corSerie } from "./shared";

// O gráfico (Recharts) só chega com a tela: a mesma altura enquanto o código é baixado.
const SerieTemporal = dynamic(() => import("./SerieTemporal").then((m) => m.SerieTemporal), {
  ssr: false,
  loading: () => <Skeleton className="h-[360px] w-full rounded-card" />,
});

/** O cartão do gráfico. O corte arredondado é feito pelo `clip-path` (e o `isolate`), não só pelo `overflow-hidden`: as camadas
 * que o navegador compõe à parte — o vidro com desfoque, as pílulas das datas, as animações de opacidade — escapavam do raio. */
export const CARTAO_GRAFICO = "relative isolate overflow-hidden rounded-card bg-surface-2/60 [clip-path:inset(0_round_var(--radius-card))]";
/** O "vidro" dos controles SOBRE o desenho do gráfico: a superfície translúcida, desfocada, com o anel. */
export const VIDRO = "vidro-controles rounded-[calc(var(--radius-control)+4px)] bg-surface/55 p-1 shadow-ring backdrop-blur-md";
/** A escala dos controles sobre o desenho em telas menores (`zoom` reduz também o espaço que ocupam). */
export const ESCALA_CONTROLES = "max-lg:[zoom:0.9] max-sm:[zoom:0.8]";
/** A pilha lateral (lupa, restaurar, tabela) encolhe mais: no celular cobriria boa parte da altura do desenho. */
const ESCALA_PILHA = "max-lg:[zoom:0.85] max-sm:[zoom:0.7]";

const plural = (n: number, um: string, varios: string) => `${num(n)} ${n === 1 ? um : varios}`;

/** A JANELA do zoom à vista (as datas mostradas e as setas que andam no tempo). */
export type JanelaGrafico = { de: string; ate: string; dias: number; podeVoltar: boolean; podeAvancar: boolean; onVoltar: () => void; onAvancar: () => void };

/**
 * O GRÁFICO NO TEMPO do sistema (Execução, Frotas): o DESENHO (`SerieTemporal preencher`) ocupa o cartão e os controles
 * ficam SOBRE ele, em vidro — o tipo e o agrupamento (`controles`) no alto à esquerda; as setas e as datas do zoom ao lado;
 * a LEGENDA (uma bolinha por série, liga e desliga — ao menos uma fica) e o `direita` (funil/avisos/ajuda) no alto à
 * direita; a lupa, o restaurar e a tabela empilhados no canto inferior direito. "Ver em tabela" troca o desenho pela
 * `tabela` (os mesmos controles numa linha acima dela). A dica, a marca, o trecho e a origem vêm do host.
 */
export function GraficoTemporal({
  pontos,
  series,
  controles,
  direita,
  janela,
  podeAproximar,
  onZoom,
  onRestaurar,
  tabela,
  ajustarY,
  ariaLabel,
  ariaLabelLegenda = "Linhas do gráfico",
  gran,
  onEscolher,
  extraDica,
  onTrecho,
  dicaTrecho,
}: {
  pontos: PontoTemporal[];
  series: readonly SerieTemporalDef[];
  controles: readonly ReactNode[];
  direita?: ReactNode;
  janela: JanelaGrafico | null;
  podeAproximar: boolean;
  /** < 1 aproxima, > 1 afasta. */
  onZoom: (fator: number) => void;
  onRestaurar: () => void;
  tabela: ReactNode;
  ajustarY?: boolean;
  ariaLabel: string;
  ariaLabelLegenda?: string;
  /** O agrupamento por extenso ("dia", "semana", "mês") — a dica das datas do zoom. */
  gran: string;
  onEscolher?: (p: PontoTemporal) => void;
  extraDica?: (p: PontoTemporal) => LinhaDica[];
  onTrecho?: (a: PontoTemporal, b: PontoTemporal) => void;
  dicaTrecho?: (a: PontoTemporal, b: PontoTemporal) => LinhaDica[];
}) {
  const [verDados, setVerDados] = useState(false);
  // As linhas que a pessoa desligou na legenda (só na tela); ao menos uma fica sempre à vista.
  const [ocultas, setOcultas] = useState<ReadonlySet<string>>(() => new Set());
  const vistas = useMemo(() => {
    const v = series.filter((x) => !ocultas.has(x.chave));
    return v.length ? v : series;
  }, [series, ocultas]);

  const botaoTabela = (
    <Button
      size="sm"
      variant="icon"
      aria-pressed={verDados}
      aria-label={verDados ? "Ver o gráfico" : "Ver os dados do gráfico em tabela"}
      title={verDados ? "Ver o gráfico" : "Ver os dados do gráfico em tabela"}
      onClick={() => setVerDados((v) => !v)}
    >
      <IconLayers className="h-4 w-4" />
    </Button>
  );
  if (verDados)
    return (
      <>
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          {controles}
          {botaoTabela}
          {direita && <div className="ml-auto flex items-center">{direita}</div>}
        </div>
        {tabela}
      </>
    );
  return (
    <div className={CARTAO_GRAFICO}>
      {/* Os controles sobre o desenho, em vidro; em telas menores, numa escala menor (cabem sem cobrir o gráfico). */}
      <div data-reserva-dica="topo" className={`pointer-events-none absolute inset-x-2 top-2 z-10 flex items-start gap-2 max-md:flex-nowrap md:flex-wrap ${ESCALA_CONTROLES}`}>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {controles.map((c, i) => (
            <div key={i} className={`pointer-events-auto ${VIDRO}`}>
              {c}
            </div>
          ))}
        </div>
        {janela && (
          <div className={`pointer-events-auto flex items-center gap-1 pr-3 text-[13px] font-medium text-text ${VIDRO}`}>
            <Button size="sm" variant="icon" aria-label="Voltar no tempo" title="Voltar no tempo" disabled={!janela.podeVoltar} onClick={janela.onVoltar}>
              <IconChevronLeft className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="icon" aria-label="Avançar no tempo" title="Avançar no tempo" disabled={!janela.podeAvancar} onClick={janela.onAvancar}>
              <IconChevronRight className="h-4 w-4" />
            </Button>
            <span className="whitespace-nowrap tabular-nums" aria-live="polite" title={`${plural(janela.dias, "dia", "dias")} à vista, por ${gran}`}>
              {dataBR(janela.de)} a {dataBR(janela.ate)}
              <span className="ml-1.5 text-muted">· {plural(janela.dias, "dia", "dias")}</span>
            </span>
          </div>
        )}
        {/* A legenda e o funil/avisos/ajuda; no celular, um embaixo do outro. */}
        <div className="ml-auto flex shrink-0 items-start gap-2 max-md:flex-col max-md:items-end">
          <fieldset className={`pointer-events-auto flex shrink-0 items-center ${VIDRO}`} aria-label={ariaLabelLegenda}>
            {series.map((x) => {
              const vista = vistas.some((d) => d.chave === x.chave);
              const ultima = vista && vistas.length === 1;
              const rotulo = ultima ? `${x.rotulo}: ao menos uma linha fica no gráfico` : `${vista ? "Ocultar" : "Mostrar"} ${x.rotulo}`;
              const cor = x.hex ?? corSerie(x.cor);
              return (
                <Button
                  key={x.chave}
                  size="sm"
                  variant="icon"
                  aria-pressed={vista}
                  aria-label={rotulo}
                  title={rotulo}
                  disabled={ultima}
                  onClick={() =>
                    setOcultas((o) => {
                      const n = new Set(o);
                      if (n.has(x.chave)) n.delete(x.chave);
                      else n.add(x.chave);
                      return n;
                    })
                  }
                >
                  <span
                    aria-hidden
                    className="block h-2.5 w-2.5 rounded-full border-2 transition-colors duration-[var(--motion-duration)]"
                    style={{ borderColor: cor, background: vista ? cor : "transparent" }}
                  />
                </Button>
              );
            })}
          </fieldset>
          {direita && <div className={`pointer-events-auto flex shrink-0 items-center ${VIDRO}`}>{direita}</div>}
        </div>
      </div>
      <SerieTemporal
        pontos={pontos}
        preencher
        altura={420}
        ajustarY={ajustarY}
        series={series}
        ocultas={ocultas}
        ariaLabel={ariaLabel}
        onEscolher={onEscolher}
        extraDica={extraDica}
        onTrecho={onTrecho}
        dicaTrecho={dicaTrecho}
      />
      {/* A lupa, o restaurar e a tabela empilhados à direita, ACIMA da linha das datas. */}
      <div className="pointer-events-none absolute right-2 z-10" style={{ bottom: TOPO_DAS_DATAS }}>
        <div data-reserva-dica="lado" className={`pointer-events-auto flex flex-col items-center gap-1 ${VIDRO} ${ESCALA_PILHA}`}>
          <Button size="sm" variant="icon" aria-label="Aproximar" title="Aproximar (menos dias à vista, mais detalhe)" disabled={!podeAproximar} onClick={() => onZoom(0.5)}>
            <IconZoom className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="icon" aria-label="Afastar" title="Afastar (mais dias à vista)" disabled={!janela} onClick={() => onZoom(2)}>
            <IconZoomOut className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="icon" aria-label="Restaurar o zoom" title="Restaurar o zoom (o período inteiro)" disabled={!janela} onClick={onRestaurar}>
            <IconRestaurar className="h-4 w-4" />
          </Button>
          {botaoTabela}
        </div>
      </div>
    </div>
  );
}
