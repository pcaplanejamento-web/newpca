import { type Capacidades, ROTULO_ACAO, resumoCapacidades } from "@/lib/papeis-core";
import { Badge } from "./Badge";

/**
 * RESUMO de um papel (ou do acesso efetivo): as telas que abre e as ações em cada uma. `compacto` = um selo por tela
 * (célula de tabela; as ações na dica); normal = uma linha por tela com as ações por extenso. Sem nenhuma tela, diz.
 */
export function ResumoPapel({ capacidades, compacto = false, vazio = "Nenhuma tela" }: { capacidades: Capacidades; compacto?: boolean; vazio?: string }) {
  const linhas = resumoCapacidades(capacidades);
  if (linhas.length === 0) return <span className="text-[12.5px] text-faint">{vazio}</span>;
  if (compacto)
    return (
      <span className="flex flex-wrap gap-1">
        {linhas.map((l) => (
          <span key={l.tela} title={`${l.rotulo}: ${l.tudo ? "tudo" : l.acoes.map((a) => ROTULO_ACAO[a]).join(", ")}`}>
            <Badge tone={l.tudo ? "blue" : "slate"}>
              {l.rotulo}
              {!l.tudo && ` · ${l.acoes.length}`}
            </Badge>
          </span>
        ))}
      </span>
    );
  return (
    <ul className="divide-y divide-border">
      {linhas.map((l) => (
        <li key={l.tela} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2 first:pt-0 last:pb-0">
          <span className="text-[13px] font-medium text-text">{l.rotulo}</span>
          <span className="text-right text-[12.5px] text-muted">
            {l.tudo ? <Badge tone="blue">Tudo</Badge> : l.acoes.map((a) => ROTULO_ACAO[a]).join(" · ")}
          </span>
        </li>
      ))}
    </ul>
  );
}
