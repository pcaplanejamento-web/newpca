"use client";

import type { Pessoa } from "@/lib/pessoa";
import { IconChevronDown, IconSpinner } from "./icons";
import { PessoaTag } from "./PessoaTag";

/** Opção do seletor: `nome` é o texto da lista nativa; `cor` = ponto de cor (situação); `pessoa` = a
 * célula mostra FOTO + APELIDO (responsável). */
export type OpcaoCelula = { id: number; nome: string; cor?: string; pessoa?: Pessoa | null };

/**
 * DROPDOWN DENTRO DA CÉLULA de uma tabela (ex.: Responsável e Situação do protocolo na Mesa): mostra o
 * valor atual (o ponto de cor da situação, ou a foto + apelido da pessoa) e troca na hora. É um
 * `<select>` nativo transparente sobre o visual — acessível, leve com milhares de linhas e com o seletor
 * do próprio celular; o clique nele NÃO abre a linha. Sem `onChange` (sem permissão) vira só o visual. O
 * valor atual que não está entre as opções (pessoa de outro grupo/inativa, situação excluída) vem em
 * `atual` e aparece igual, mas não pode ser re-escolhido.
 */
export function SeletorCelula({
  valor,
  opcoes,
  onChange,
  atual,
  vazio = "—",
  salvando = false,
  ariaLabel,
}: {
  valor: number | null;
  opcoes: OpcaoCelula[];
  onChange?: (id: number | null) => void;
  /** O valor atual quando ele NÃO está entre as opções. */
  atual?: OpcaoCelula | null;
  /** Texto de "nenhum" (valor `null`). */
  vazio?: string;
  salvando?: boolean;
  ariaLabel: string;
}) {
  const naLista = valor != null ? opcoes.find((o) => o.id === valor) : undefined;
  const sel = naLista ?? (valor != null ? (atual ?? { id: valor, nome: `#${valor}` }) : null);
  const visual =
    sel?.pessoa !== undefined ? (
      <PessoaTag pessoa={sel.pessoa} vazio={vazio} />
    ) : (
      <span className="inline-flex max-w-[14rem] items-center gap-1.5 truncate text-[12px] font-medium" style={sel?.cor ? { color: sel.cor } : undefined}>
        {sel?.cor && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: sel.cor }} />}
        <span className={`truncate ${sel ? (sel.cor ? "" : "text-text-2") : "text-faint"}`}>{sel?.nome ?? vazio}</span>
      </span>
    );
  if (!onChange) return visual;
  return (
    <span className="relative inline-flex min-h-11 items-center gap-1 rounded-control px-2 transition-colors hover:bg-surface-2 focus-within:ring-2 focus-within:ring-accent/40 lg:min-h-[calc(var(--h-control-sm)-6px)]">
      {visual}
      {salvando ? <IconSpinner className="h-3.5 w-3.5 shrink-0 text-accent" /> : <IconChevronDown className="h-3.5 w-3.5 shrink-0 text-faint" />}
      <select
        aria-label={ariaLabel}
        title={sel?.nome ?? vazio}
        disabled={salvando}
        value={valor ?? ""}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-wait"
      >
        <option value="">{vazio}</option>
        {sel && !naLista && (
          <option value={sel.id} disabled>
            {sel.nome}
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
