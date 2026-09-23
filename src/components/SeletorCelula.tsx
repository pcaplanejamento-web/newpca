"use client";

import { IconChevronDown, IconSpinner } from "./icons";

export type OpcaoCelula = { id: number; nome: string; cor?: string };

/**
 * DROPDOWN DENTRO DA CÉLULA de uma tabela (ex.: Responsável e Situação do protocolo na Mesa): mostra o
 * valor atual (com o ponto de cor, quando a opção tem cor) e troca na hora. É um `<select>` nativo
 * transparente sobre o visual — acessível, leve com milhares de linhas e com o seletor do próprio
 * celular; o clique nele NÃO abre a linha. Sem `onChange` (sem permissão) vira só o texto. O valor atual
 * que não está mais nas opções (pessoa inativa, situação excluída) aparece pelo `rotuloAtual`.
 */
export function SeletorCelula({
  valor,
  opcoes,
  onChange,
  rotuloAtual,
  vazio = "—",
  salvando = false,
  ariaLabel,
}: {
  valor: number | null;
  opcoes: OpcaoCelula[];
  onChange?: (id: number | null) => void;
  /** Rótulo do valor atual quando ele não está entre as opções. */
  rotuloAtual?: string | null;
  /** Texto de "nenhum" (valor `null`). */
  vazio?: string;
  salvando?: boolean;
  ariaLabel: string;
}) {
  const atual = valor != null ? opcoes.find((o) => o.id === valor) : undefined;
  const nome = atual?.nome ?? (valor != null ? (rotuloAtual ?? `#${valor}`) : null);
  const visual = (
    <span className="inline-flex max-w-[14rem] items-center gap-1.5 truncate text-[12px] font-medium" style={atual?.cor ? { color: atual.cor } : undefined}>
      {atual?.cor && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: atual.cor }} />}
      <span className={`truncate ${nome ? (atual?.cor ? "" : "text-text-2") : "text-faint"}`}>{nome ?? vazio}</span>
    </span>
  );
  if (!onChange) return visual;
  return (
    <span className="relative inline-flex min-h-[44px] items-center gap-1 rounded-control px-2 transition-colors hover:bg-surface-2 focus-within:ring-2 focus-within:ring-accent/40">
      {visual}
      {salvando ? <IconSpinner className="h-3.5 w-3.5 shrink-0 text-accent" /> : <IconChevronDown className="h-3.5 w-3.5 shrink-0 text-faint" />}
      <select
        aria-label={ariaLabel}
        title={nome ?? vazio}
        disabled={salvando}
        value={valor ?? ""}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-wait"
      >
        <option value="">{vazio}</option>
        {valor != null && !atual && (
          <option value={valor} disabled>
            {nome}
          </option>
        )}
        {opcoes.map((o) => (
          <option key={o.id} value={o.id}>
            {o.nome}
          </option>
        ))}
      </select>
    </span>
  );
}
