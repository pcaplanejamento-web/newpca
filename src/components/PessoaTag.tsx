"use client";

import { nomeExibicao, type Pessoa } from "@/lib/pessoa";
import { Avatar } from "./Avatar";
import { usePresencaDe } from "./CanalGrupo";

const ROTULO = { online: "online agora", ausente: "ausente" } as const;

/** A FOTO de uma pessoa com o ponto de PRESENÇA (online/ausente) quando o ADM ligou a presença e ela está no grupo ativo —
 * fora do painel (ou desligada), a foto de sempre. Só re-renderiza quando o estado DESSA pessoa muda. */
export function AvatarPessoa({
  pessoa,
  size = "xs",
  className = "",
  pulsar = false,
}: {
  pessoa: Pick<Pessoa, "id" | "nome" | "foto">;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
  /** O ponto de quem está ONLINE pulsa (o "ao vivo" das pilhas de fotos). */
  pulsar?: boolean;
}) {
  const presenca = usePresencaDe(pessoa.id);
  return <Avatar nome={pessoa.nome} foto={pessoa.foto} size={size} presenca={presenca} pulsar={pulsar && presenca === "online"} className={className} />;
}

/**
 * PESSOA numa célula/linha: FOTO (avatar — iniciais na cor da pessoa quando não há foto; com o ponto de presença) + o
 * APELIDO (o nome de exibição; sem apelido, o nome). O nome completo fica no `title`. Usada nas colunas Responsável e
 * Distribuição da Mesa (e no gatilho do `SeletorPessoa`). Sem pessoa, o texto `vazio` esmaecido.
 */
export function PessoaTag({ pessoa, vazio = "—", className = "" }: { pessoa: Pessoa | null | undefined; vazio?: string; className?: string }) {
  const presenca = usePresencaDe(pessoa?.id);
  if (!pessoa) return <span className={`text-[12px] text-faint ${className}`}>{vazio}</span>;
  const nome = nomeExibicao(pessoa);
  const titulo = `${nome === pessoa.nome ? nome : `${nome} — ${pessoa.nome}`}${presenca ? ` (${ROTULO[presenca]})` : ""}`;
  return (
    <span className={`inline-flex min-w-0 max-w-[14rem] items-center gap-1.5 ${className}`} title={titulo}>
      <Avatar nome={pessoa.nome} foto={pessoa.foto} size="xs" presenca={presenca} />
      <span className="truncate text-[12px] font-medium text-text-2">{nome}</span>
    </span>
  );
}
