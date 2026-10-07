"use client";

import { type DefNo, SAIDA_ERRO } from "@/lib/fluxo-core";
import { Ajuda } from "../Ajuda";

const portas = (d: DefNo, lista: string[]) => lista.map((p) => d.rotulosPortas?.[p] ?? p).join(" · ");

/**
 * O (?) de um COMPONENTE (nó) do fluxo — o que ele faz, o que recebe, o que entrega e o que se configura. No nó do
 * diagrama, na paleta e no painel: monta-se o diagrama sem adivinhar. Não inicia arrasto (para o ponteiro).
 */
export function AjudaNo({ def }: { def: DefNo }) {
  return (
    <span role="none" className="inline-flex shrink-0" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <Ajuda compacta titulo={def.rotulo} rotulo="Sobre o componente">
        <div className="space-y-2 text-sm">
          <p className="text-text">{def.descricao}</p>
          <p className="text-muted">
            <span className="font-medium text-text">Recebe: </span>
            {def.entradas.length ? portas(def, def.entradas) : "nada — é o começo do fluxo"}
          </p>
          <p className="text-muted">
            <span className="font-medium text-text">Entrega: </span>
            {def.saidas.length ? portas(def, def.saidas) : "nada — é o fim do caminho"}
            {` · se falhar, a saída “${SAIDA_ERRO}” (ligada, o fluxo segue por ela)`}
          </p>
          {def.campos.length > 0 && (
            <div>
              <p className="font-medium text-text">Configuração</p>
              <ul className="mt-1 space-y-1 text-muted">
                {def.campos.map((c) => (
                  <li key={c.chave}>
                    <span className="text-text">{c.rotulo}</span>
                    {c.obrigatorio && <span className="text-[var(--danger)]"> *</span>}
                    {c.ajuda ? ` — ${c.ajuda}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Ajuda>
    </span>
  );
}
