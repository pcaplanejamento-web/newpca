"use client";

import { useEffect } from "react";
import { nomeExibicao } from "@/lib/pessoa";
import { Avatar } from "./Avatar";
import { EVENTO_ABRIR_CHAT, useCanalGrupo } from "./CanalGrupo";
import { IconChat, IconPencil } from "./icons";

type Tipo = "protocolo" | "dfd" | "tarefa";

/** O link do item no sistema (vira o CARTÃO no chat). */
const linkDo = (tipo: Tipo, id: number) => (tipo === "tarefa" ? `/painel/tarefas/abrir/${id}` : `/painel/mesa?abrir=${tipo}:${id}`);
const NOME: Record<Tipo, string> = { protocolo: "este protocolo", dfd: "este DFD", tarefa: "esta tarefa" };

/**
 * VENDO AGORA, no cabeçalho de um banner (protocolo, DFD, tarefa): registra que ESTA tela está com o item aberto (e se tem
 * alteração não salva) e mostra quem MAIS do grupo está com ele aberto — as fotos com o pulso ao vivo; quem está EDITANDO
 * em âmbar ("Ana editando" — combine antes de salvar: o último "Salvar" vale); e "Conversar sobre…" (abre o chat do grupo
 * com o link do item). Sem a presença ligada, não faz nada.
 */
export function VendoAgora({ tipo, id, editando = false, rotulo = "" }: { tipo: Tipo; id: number | null | undefined; editando?: boolean; rotulo?: string }) {
  const canal = useCanalGrupo();
  const alvo = id != null ? `${tipo}:${id}` : null;
  const registrar = canal?.registrarVendo;
  useEffect(() => {
    if (!registrar || !alvo) return;
    return registrar(alvo, editando, rotulo);
  }, [registrar, alvo, editando, rotulo]);
  if (!canal || !alvo || id == null) return null;
  const outros = (canal.vendo.get(alvo) ?? []).filter((v) => v.id !== canal.usuarioId);
  if (!outros.length) return null;
  const pessoa = (pid: number) => canal.pessoas.find((p) => p.id === pid);
  const nomes = outros.map((o) => (pessoa(o.id) ? nomeExibicao(pessoa(o.id) as NonNullable<ReturnType<typeof pessoa>>) : "Alguém"));
  const editandoNomes = outros.filter((o) => o.editando).map((o) => nomes[outros.indexOf(o)]);
  const conversar = () =>
    window.dispatchEvent(new CustomEvent(EVENTO_ABRIR_CHAT, { detail: { conversa: "grupo", texto: `Sobre ${NOME[tipo]}: ${location.origin}${linkDo(tipo, id)} ` } }));
  return (
    <span className="flex shrink-0 animate-fade-in-up items-center gap-1">
      <span role="img" className="flex items-center rounded-full bg-surface-2 py-0.5 pr-2 pl-0.5" title={`Também aqui agora: ${nomes.join(", ")}`} aria-label={`Também com ${NOME[tipo]} aberto: ${nomes.join(", ")}`}>
        <span className="flex items-center">
          {outros.slice(0, 3).map((o, i) => {
            const p = pessoa(o.id);
            return (
              <span key={o.id} className={`animate-entrar-pessoa inline-flex rounded-full ring-2 ring-surface-2 ${i ? "-ml-1.5" : ""}`} style={{ zIndex: 3 - i }}>
                <Avatar nome={p?.nome ?? "?"} foto={p?.foto} size="xs" presenca="online" pulsar />
              </span>
            );
          })}
        </span>
        <span className="ml-1.5 hidden text-[11.5px] font-medium text-text-2 sm:inline">{outros.length === 1 ? "também aqui" : `+${outros.length} aqui`}</span>
      </span>
      {editandoNomes.length > 0 && (
        <span
          className="inline-flex items-center gap-1 rounded-full bg-[color-mix(in_oklab,var(--warn)_16%,transparent)] px-2 py-0.5 text-[11.5px] font-medium text-[var(--warn)]"
          title={`${editandoNomes.join(", ")} ${editandoNomes.length === 1 ? "tem" : "têm"} alterações não salvas em ${NOME[tipo]} — combine antes de salvar (o último "Salvar" vale).`}
        >
          <IconPencil className="h-3 w-3" />
          <span className="max-w-[9rem] truncate">{editandoNomes.length === 1 ? `${editandoNomes[0]} editando` : `${editandoNomes.length} editando`}</span>
        </span>
      )}
      {canal.chatGrupo && (
        <button
          type="button"
          onClick={conversar}
          aria-label={`Conversar sobre ${NOME[tipo]} no chat do grupo`}
          title={`Conversar sobre ${NOME[tipo]} no chat do grupo`}
          className="inline-flex h-11 w-11 items-center justify-center rounded-control text-muted transition-colors hover:bg-surface-2 hover:text-accent lg:h-8 lg:w-8"
        >
          <IconChat className="h-4 w-4" />
        </button>
      )}
    </span>
  );
}
