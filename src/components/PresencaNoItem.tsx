"use client";

import { nomeExibicao } from "@/lib/pessoa";
import { type Atividade, type TelaOnde, textoAtividade } from "@/lib/presenca-core";
import { Avatar } from "./Avatar";
import { useCanalEstavel, useVendoDe } from "./CanalGrupo";
import { IconPencil, IconSettings, IconUser } from "./icons";
import { NAV_MODULOS } from "./navModulos";

const NOME_ALVO: Record<string, string> = { protocolo: "este protocolo", dfd: "este DFD", tarefa: "esta tarefa" };

/**
 * QUEM ESTÁ COM ESTE ITEM ABERTO, na linha da tabela ou no cartão (protocolo, DFD, tarefa): as fotos com o pulso ao vivo e
 * o lápis âmbar quando alguém tem alteração não salva. Lê só o armazém do item (`useVendoDe`) — a linha só re-renderiza
 * quando muda quem está com ELE aberto. Sem a presença (ou sem ninguém), não desenha nada.
 */
export function PresencaNoItem({ alvo, className = "" }: { alvo: string; className?: string }) {
  const c = useCanalEstavel();
  const vendo = useVendoDe(alvo);
  if (!c || !vendo) return null;
  const outros = vendo.filter((v) => v.id !== c.usuarioId);
  if (!outros.length) return null;
  const nomes = outros.map((o) => {
    const p = c.pessoas.get(o.id);
    return `${p ? nomeExibicao(p) : "Alguém"}${o.editando ? " (editando)" : ""}`;
  });
  const editando = outros.some((o) => o.editando);
  const texto = `${nomes.join(", ")} ${outros.length === 1 ? "está" : "estão"} com ${NOME_ALVO[alvo.split(":")[0]] ?? "este item"} aberto agora`;
  return (
    <span role="img" aria-label={texto} title={texto} className={`inline-flex shrink-0 animate-fade-in-up items-center align-middle ${className}`}>
      {outros.slice(0, 2).map((o, i) => {
        const p = c.pessoas.get(o.id);
        return (
          <span key={o.id} className={`inline-flex rounded-full ring-2 ring-surface ${i ? "-ml-1.5" : ""}`} style={{ zIndex: 2 - i }}>
            <Avatar nome={p?.nome ?? "?"} foto={p?.foto} size="xs" presenca="online" />
          </span>
        );
      })}
      {outros.length > 2 && <span className="ml-0.5 text-[10.5px] font-semibold tabular-nums text-text-2">+{outros.length - 2}</span>}
      {editando && (
        <span className="ml-0.5 grid h-4 w-4 place-items-center rounded-full bg-[color-mix(in_oklab,var(--warn)_18%,transparent)] text-[var(--warn)]">
          <IconPencil className="h-2.5 w-2.5" />
        </span>
      )}
    </span>
  );
}

const ICONE_TELA: Partial<Record<TelaOnde, typeof IconUser>> = {
  ...Object.fromEntries(NAV_MODULOS.map((m) => [m.aba, m.Icon])),
  perfil: IconUser,
  admin: IconSettings,
};

/** ONDE a pessoa está e o que está fazendo, numa linha: o ícone da tela + "Mesa › Protocolo 144756/2026 · editando"
 * (âmbar quando edita). */
export function AtividadePessoa({ atividade, className = "" }: { atividade: Atividade; className?: string }) {
  const Icone = ICONE_TELA[atividade.tela] ?? IconSettings;
  const texto = textoAtividade(atividade);
  return (
    <span className={`flex min-w-0 items-center gap-1 text-[11.5px] ${atividade.editando ? "text-[var(--warn)]" : "text-text-2"} ${className}`} title={texto}>
      {atividade.editando ? <IconPencil className="h-3 w-3 shrink-0" /> : <Icone className="h-3 w-3 shrink-0 text-faint" />}
      <span className="truncate">{texto}</span>
    </span>
  );
}
