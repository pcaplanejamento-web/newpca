"use client";

import { nomeExibicao, type Pessoa } from "@/lib/pessoa";
import { Avatar } from "./Avatar";

/**
 * PESSOA numa célula/linha: FOTO (avatar — iniciais na cor da pessoa quando não há foto) + o APELIDO (o
 * nome de exibição; sem apelido, o nome). O nome completo fica no `title`. Usada nas colunas Responsável
 * e Distribuição da Mesa (e dentro do `SeletorCelula`). Sem pessoa, o texto `vazio` esmaecido.
 */
export function PessoaTag({ pessoa, vazio = "—", className = "" }: { pessoa: Pessoa | null | undefined; vazio?: string; className?: string }) {
  if (!pessoa) return <span className={`text-[12px] text-faint ${className}`}>{vazio}</span>;
  const nome = nomeExibicao(pessoa);
  return (
    <span className={`inline-flex min-w-0 max-w-[14rem] items-center gap-1.5 ${className}`} title={nome === pessoa.nome ? nome : `${nome} — ${pessoa.nome}`}>
      <Avatar nome={pessoa.nome} foto={pessoa.foto} size="xs" />
      <span className="truncate text-[12px] font-medium text-text-2">{nome}</span>
    </span>
  );
}
