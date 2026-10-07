"use client";

import { Dropdown } from "./Dropdown";
import { IconRobo } from "./icons";
import { classeQuadradoFiltro } from "./SeletorFiltro";

/**
 * AUTOMAÇÕES na barra da Mesa do sistema: o quadrado só-ícone (como os filtros ao lado) abre a lista das automações que
 * a pessoa marcou como "Disponível na Mesa"; escolher uma a roda com os DFDs da Mesa (`alvo` diz quais). Só tokens do DS.
 */
export function AutomacoesMesa({
  automacoes,
  alvo,
  onEscolher,
}: {
  automacoes: { id: number; nome: string }[];
  /** Com o quê roda: "3 DFDs selecionados" / "12 DFDs à vista". */
  alvo: string;
  onEscolher: (id: number) => void;
}) {
  if (!automacoes.length) return null;
  return (
    <Dropdown
      align="end"
      ariaLabel="Automações"
      title={`Automações — rodar com ${alvo}`}
      triggerClassName={classeQuadradoFiltro(false)}
      trigger={<IconRobo className="h-4 w-4" />}
      width={300}
    >
      {(fechar) => (
        <div className="p-1">
          <p className="px-3 py-2 text-xs text-muted">Rodar com {alvo}</p>
          {automacoes.map((a) => (
            <button
              key={a.id}
              type="button"
              role="menuitem"
              className="flex min-h-11 w-full items-center gap-2 rounded-control px-3 text-left text-sm text-text hover:bg-surface-2 focus-visible:bg-surface-2 lg:min-h-9"
              onClick={() => {
                fechar();
                onEscolher(a.id);
              }}
            >
              <IconRobo className="h-4 w-4 shrink-0 text-muted" />
              <span className="min-w-0 truncate">{a.nome}</span>
            </button>
          ))}
        </div>
      )}
    </Dropdown>
  );
}
