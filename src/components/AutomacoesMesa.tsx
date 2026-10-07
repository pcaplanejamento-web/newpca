"use client";

import { useConfirmacao } from "./Confirmacao";
import { Dropdown } from "./Dropdown";
import { IconRobo } from "./icons";
import { classeQuadradoFiltro } from "./SeletorFiltro";

/**
 * AUTOMAÇÕES da Mesa do sistema: a lista das automações que a pessoa marcou como "Disponível na Mesa"; escolher uma
 * CONFIRMA ("rodar com 12 DFDs…") e a roda em segundo plano (o andamento no painel flutuante do canto). Duas formas:
 * `barra` = o quadrado só-ícone da barra da Mesa (todos os FILTRADOS da visão) e `selecao` = o botão da barra de seleção
 * (os SELECIONADOS). Só tokens do DS.
 */
export function AutomacoesMesa({
  automacoes,
  alvo,
  onEscolher,
  variante = "barra",
}: {
  automacoes: { id: number; nome: string }[];
  /** Com o quê roda: "3 protocolos selecionados (12 DFDs)" / "40 DFDs filtrados". */
  alvo: string;
  onEscolher: (id: number) => void;
  variante?: "barra" | "selecao";
}) {
  const { confirmar, confirmacao } = useConfirmacao();
  if (!automacoes.length) return null;
  const escolher = async (a: { id: number; nome: string }) => {
    if (await confirmar({ titulo: `Executar “${a.nome}”?`, texto: `Com ${alvo}. Roda em segundo plano — acompanhe no canto inferior.`, confirmar: "Executar" })) onEscolher(a.id);
  };
  return (
    <>
      <Dropdown
        align="end"
        ariaLabel="Automações"
        title={`Automações — rodar com ${alvo}`}
        triggerClassName={
          variante === "barra"
            ? classeQuadradoFiltro(false)
            : "h-11 gap-1.5 rounded-control border border-border bg-surface-2 px-3 text-[13px] font-semibold text-text-2 hover:bg-surface lg:h-[var(--h-control-sm)]"
        }
        trigger={
          variante === "barra" ? (
            <IconRobo className="h-4 w-4" />
          ) : (
            <>
              <IconRobo className="h-4 w-4" />
              Automação
            </>
          )
        }
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
                  void escolher(a);
                }}
              >
                <IconRobo className="h-4 w-4 shrink-0 text-muted" />
                <span className="min-w-0 truncate">{a.nome}</span>
              </button>
            ))}
          </div>
        )}
      </Dropdown>
      {confirmacao}
    </>
  );
}
