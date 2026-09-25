"use client";

import { Fragment, useRef, useState } from "react";
import { dataHoraBR } from "@/lib/format";
import { nomeExibicao, type Pessoa } from "@/lib/pessoa";
import type { ComentarioTarefa } from "@/lib/tarefas";
import { textoMencao } from "@/lib/tarefas-core";
import { predicadoBusca } from "@/lib/tabela-filtros";
import { Avatar } from "./Avatar";
import { Button } from "./Button";
import { IconEnviar, IconPencil, IconTrash } from "./icons";

/** O termo de @menção sendo digitado logo antes do cursor (`null` = não está citando). */
const termoMencao = (texto: string, cursor: number) => /@([\p{L}\p{N}._-]{0,40})$/u.exec(texto.slice(0, cursor))?.[1] ?? null;

/** O texto com as @menções destacadas (accent). */
function TextoComMencoes({ texto }: { texto: string }) {
  return (
    <>
      {texto.split(/(@[\p{L}\p{N}._-]{2,60})/u).map((parte, i) =>
        parte.startsWith("@") ? (
          <span key={i} className="font-semibold text-accent">
            {parte}
          </span>
        ) : (
          <Fragment key={i}>{parte}</Fragment>
        ),
      )}
    </>
  );
}

/**
 * COMENTÁRIOS de uma tarefa: a conversa (foto, nome, data/hora de Brasília, "(editado)"; as @menções em destaque) e o
 * campo de escrever — digitar "@" abre as PESSOAS DO GRUPO (tocar insere a menção); Ctrl/⌘+Enter envia. Editar só o
 * próprio; excluir o próprio ou, para editores, qualquer um. Só apresenta — quem usa grava.
 */
export function ComentariosTarefa({
  comentarios,
  pessoas,
  usuarioId,
  podeModerar,
  onEnviar,
  onEditar,
  onExcluir,
}: {
  comentarios: ComentarioTarefa[];
  /** As pessoas do grupo (fotos e sugestões de @menção). */
  pessoas: Pessoa[];
  usuarioId: number;
  /** Editor (admin/gestor): exclui o comentário de outra pessoa. */
  podeModerar: boolean;
  onEnviar: (texto: string) => Promise<boolean>;
  onEditar: (c: ComentarioTarefa, texto: string) => Promise<boolean>;
  onExcluir: (c: ComentarioTarefa) => void;
}) {
  const [texto, setTexto] = useState("");
  const [cursor, setCursor] = useState(0);
  const [enviando, setEnviando] = useState(false);
  const [semSugestao, setSemSugestao] = useState(false);
  const [editando, setEditando] = useState<{ id: number; texto: string } | null>(null);
  const campo = useRef<HTMLTextAreaElement>(null);
  const porId = new Map(pessoas.map((p) => [p.id, p]));
  const termo = termoMencao(texto, cursor);
  const casa = termo != null ? predicadoBusca(termo) : null;
  const sugestoes = termo == null || semSugestao ? [] : pessoas.filter((p) => !casa || casa([nomeExibicao(p), p.nome])).slice(0, 6);

  const mencionar = (p: Pessoa) => {
    const antes = texto.slice(0, cursor).replace(/@[\p{L}\p{N}._-]*$/u, `${textoMencao(p)} `);
    const novo = antes + texto.slice(cursor);
    setTexto(novo);
    setCursor(antes.length);
    requestAnimationFrame(() => {
      campo.current?.focus();
      campo.current?.setSelectionRange(antes.length, antes.length);
    });
  };
  const enviar = async () => {
    const t = texto.trim();
    if (!t || enviando) return;
    setEnviando(true);
    if (await onEnviar(t)) {
      setTexto("");
      setCursor(0);
    }
    setEnviando(false);
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <ol className="min-h-0 flex-1 space-y-3 overflow-y-auto">
        {comentarios.length === 0 && <li className="py-6 text-center text-[12.5px] text-muted">Nenhum comentário — comece a conversa abaixo.</li>}
        {comentarios.map((c) => {
          const autor = c.usuarioId != null ? porId.get(c.usuarioId) : undefined;
          const meu = c.usuarioId === usuarioId;
          return (
            <li key={c.id} className="flex gap-2.5">
              <Avatar nome={autor?.nome ?? c.usuarioNome} foto={autor?.foto} size="sm" className="mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-[12.5px] font-semibold text-text">{autor ? nomeExibicao(autor) : c.usuarioNome}</span>
                  <span className="text-[11px] text-faint">
                    {dataHoraBR(c.criadoEm)}
                    {c.editadoEm ? " · editado" : ""}
                  </span>
                  {(meu || podeModerar) && editando?.id !== c.id && (
                    <span className="ml-auto flex gap-0.5">
                      {meu && (
                        <Button variant="ghost" size="xs" aria-label="Editar comentário" icon={<IconPencil className="h-3.5 w-3.5" />} onClick={() => setEditando({ id: c.id, texto: c.texto })} />
                      )}
                      <Button variant="ghost" size="xs" aria-label="Excluir comentário" style={{ color: "var(--danger)" }} icon={<IconTrash className="h-3.5 w-3.5" />} onClick={() => onExcluir(c)} />
                    </span>
                  )}
                </div>
                {editando?.id === c.id ? (
                  <div className="mt-1 space-y-2">
                    <textarea
                      value={editando.texto}
                      rows={3}
                      maxLength={5000}
                      aria-label="Editar comentário"
                      onChange={(e) => setEditando({ id: c.id, texto: e.target.value })}
                      className="w-full resize-y rounded-control border border-accent bg-surface px-3 py-2 text-[13px] text-text outline-none ring-4 ring-accent/20"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={!editando.texto.trim()}
                        onClick={async () => (await onEditar(c, editando.texto.trim())) && setEditando(null)}
                      >
                        Salvar
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditando(null)}>
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-0.5 whitespace-pre-wrap break-words text-[13px] leading-snug text-text-2">
                    <TextoComMencoes texto={c.texto} />
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      <div className="relative shrink-0">
        {sugestoes.length > 0 && (
          <ul aria-label="Mencionar pessoa" className="absolute right-0 bottom-full left-0 z-10 mb-1 overflow-hidden rounded-card border border-border bg-surface shadow-soft">
            {sugestoes.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => mencionar(p)}
                  className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-[13px] text-text hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none lg:min-h-9"
                >
                  <Avatar nome={p.nome} foto={p.foto} size="xs" />
                  <span className="truncate">{nomeExibicao(p)}</span>
                  <span className="ml-auto truncate text-[11px] text-faint">{textoMencao(p)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-end gap-2">
          <textarea
            ref={campo}
            value={texto}
            rows={2}
            maxLength={5000}
            disabled={enviando}
            aria-label="Escrever comentário"
            placeholder="Comentar… (@ menciona alguém)"
            onChange={(e) => {
              setTexto(e.target.value);
              setCursor(e.target.selectionStart ?? e.target.value.length);
              setSemSugestao(false);
            }}
            onSelect={(e) => setCursor(e.currentTarget.selectionStart ?? 0)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                enviar();
              } else if (e.key === "Escape" && sugestoes.length) {
                e.stopPropagation();
                setSemSugestao(true);
              }
            }}
            className="min-w-0 flex-1 resize-none rounded-control border border-border-2 bg-surface-2 px-3 py-2 text-[13px] text-text outline-none transition-[border-color,box-shadow] duration-[var(--motion-duration)] placeholder:text-faint focus:border-accent focus:bg-surface focus:ring-4 focus:ring-accent/20"
          />
          <Button variant="accent" size="sm" loading={enviando} disabled={!texto.trim()} aria-label="Enviar comentário" icon={<IconEnviar className="h-4 w-4" />} onClick={enviar} />
        </div>
      </div>
    </div>
  );
}
