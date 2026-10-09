"use client";

import { ABA_KEYS } from "@/lib/abas";
import { rotuloTela } from "@/lib/papeis-core";
import { Checkbox } from "./Field";

/** Um grupo que se escolhe para a pessoa — com as telas que ele libera. */
export type GrupoOpcao = { id: number; nome: string; abas: readonly string[] };

/** As telas que o grupo libera, na ordem da navegação ("Mesa, PCA"). */
export const telasDoGrupo = (g: GrupoOpcao): string[] => ABA_KEYS.filter((t) => g.abas.includes(t)).map(rotuloTela);

/**
 * Os GRUPOS de uma pessoa (Usuários → Editar e Aprovar): uma caixa por grupo, com as telas que ele libera — marcar não
 * grava (quem usa grava no "Salvar"/"Aprovar"). O grupo decide QUAIS telas a pessoa abre e as unidades que ela vê; o papel
 * decide o que ela faz nelas. Lista longa rola por dentro; alvos de 44px no toque.
 */
export function GruposDaPessoa({
  grupos,
  selecionados,
  onChange,
  disabled = false,
}: {
  grupos: readonly GrupoOpcao[];
  selecionados: readonly number[];
  onChange: (ids: number[]) => void;
  disabled?: boolean;
}) {
  if (grupos.length === 0) return <p className="text-[13px] text-muted">Nenhum grupo cadastrado — crie os grupos em Grupos.</p>;
  const marcados = new Set(selecionados);
  return (
    <ul className="max-h-64 divide-y divide-border overflow-y-auto rounded-card border border-border" aria-label="Grupos da pessoa">
      {grupos.map((g) => {
        const telas = telasDoGrupo(g);
        return (
          <li key={g.id} className="flex min-h-11 items-center px-3 lg:min-h-[var(--h-control-sm)]">
            <Checkbox
              checked={marcados.has(g.id)}
              disabled={disabled}
              onChange={(e) => onChange(e.target.checked ? [...selecionados, g.id] : selecionados.filter((x) => x !== g.id))}
              label={
                <span className="flex flex-col py-1">
                  <span className="font-medium text-text">{g.nome}</span>
                  <span className="text-[12px] text-muted">{telas.length ? `Abre: ${telas.join(", ")}` : "Não libera nenhuma tela"}</span>
                </span>
              }
            />
          </li>
        );
      })}
    </ul>
  );
}
