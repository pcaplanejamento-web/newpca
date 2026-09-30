import { type GrupoDetalhe, type LinhaResumoDetalhe, resumoDetalhes, textoResumoDetalhes } from "@/lib/papeis-detalhes-core";
import { Badge } from "./Badge";

/**
 * RESUMO dos DETALHES de um papel — as RESTRIÇÕES dentro das telas que ele abre (colunas, Responsável, Distribuição,
 * linhas, desempenho…). `compacto` = um selo com a contagem (célula de tabela; o texto inteiro na dica); normal = por
 * grupo (Mesa, Mesa do PCA…), uma linha por restrição. Sem nenhuma, diz "Sem restrições". O Administrador não tem
 * restrições (quem chama nem passa os detalhes dele).
 */
export function ResumoDetalhesPapel({ detalhes, compacto = false, vazio = "Sem restrições" }: { detalhes: unknown; compacto?: boolean; vazio?: string }) {
  const linhas = resumoDetalhes(detalhes);
  if (linhas.length === 0) return <span className="text-[12.5px] text-faint">{vazio}</span>;
  if (compacto)
    return (
      <span title={textoResumoDetalhes(detalhes)}>
        <Badge tone="amber">
          {linhas.length} {linhas.length === 1 ? "restrição" : "restrições"}
        </Badge>
      </span>
    );
  const grupos = new Map<GrupoDetalhe, LinhaResumoDetalhe[]>();
  for (const l of linhas) grupos.set(l.grupo, [...(grupos.get(l.grupo) ?? []), l]);
  return (
    <div className="space-y-3">
      {[...grupos].map(([grupo, ls]) => (
        <section key={grupo}>
          <h4 className="mb-1 text-[11.5px] font-semibold uppercase tracking-wide text-faint">{grupo}</h4>
          <ul className="divide-y divide-border">
            {ls.map((l) => (
              <li key={l.rotulo} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2 first:pt-0 last:pb-0">
                <span className="text-[13px] font-medium text-text">{l.rotulo}</span>
                <span className="text-right text-[12.5px] text-muted">{l.valor}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
