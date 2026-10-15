"use client";

import type { ProblemaGrafo } from "@/lib/fluxo-core";
import { Dropdown } from "../Dropdown";
import { IconAlert, IconChevronRight } from "../icons";

/**
 * PROBLEMAS / ATENÇÕES do fluxo: o selo do editor ("2 problema(s)") abre a LISTA — cada um com o componente em que está e,
 * quando há, "ir ao componente" (o diagrama abre com ele escolhido). Antes só havia a dica do mouse (no toque, nada).
 */
export function ProblemasFluxo({
  itens,
  nivel,
  nomeDo,
  onIr,
}: {
  itens: ProblemaGrafo[];
  nivel: "erro" | "atencao";
  /** O nome do componente pelo id (o rótulo do tipo). */
  nomeDo: (id: string) => string | null;
  onIr: (id: string) => void;
}) {
  if (!itens.length) return null;
  const erro = nivel === "erro";
  const rotulo = erro ? `${itens.length} problema(s)` : `${itens.length} atenção(ões)`;
  const cor = erro ? "var(--danger)" : "var(--warn)";
  return (
    <Dropdown
      papel="dialog"
      align="end"
      width={360}
      ariaLabel={erro ? "Problemas do fluxo" : "Atenções do fluxo"}
      title={`${rotulo} — toque para ver`}
      triggerClassName="inline-flex h-11 items-center gap-1.5 rounded-chip border px-2.5 text-xs font-semibold lg:h-[var(--h-control-sm)]"
      gatilho={{ style: { color: cor, borderColor: `color-mix(in oklab, ${cor} 40%, transparent)`, background: `color-mix(in oklab, ${cor} 10%, transparent)` } }}
      trigger={
        <>
          <IconAlert className="size-3.5" />
          {rotulo}
        </>
      }
    >
      {(fechar) => (
        <div className="p-2">
          <p className="px-2 pb-2 text-xs font-semibold text-muted">{erro ? "Corrija para executar" : "Não impedem executar"}</p>
          <ul className="space-y-1">
            {itens.map((p, i) => {
              const nome = p.no ? nomeDo(p.no) : null;
              const conteudo = (
                <>
                  <IconAlert className="mt-0.5 size-4 shrink-0" style={{ color: cor }} />
                  <span className="min-w-0 flex-1">
                    {nome && <span className="block text-xs font-semibold text-muted">{nome}</span>}
                    <span className="block whitespace-normal break-words text-sm text-text">{p.texto}</span>
                  </span>
                </>
              );
              return (
                <li key={`${p.no ?? ""}-${i}`}>
                  {p.no ? (
                    <button
                      type="button"
                      onClick={() => {
                        fechar();
                        if (p.no) onIr(p.no);
                      }}
                      title="Ir ao componente"
                      className="flex min-h-11 w-full items-start gap-2 rounded-control px-2 py-2 text-left hover:bg-surface-2 focus-visible:shadow-ring"
                    >
                      {conteudo}
                      <IconChevronRight className="mt-0.5 size-4 shrink-0 text-muted" />
                    </button>
                  ) : (
                    <div className="flex items-start gap-2 px-2 py-2">{conteudo}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Dropdown>
  );
}
