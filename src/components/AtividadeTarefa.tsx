"use client";

import { useEffect, useMemo, useState } from "react";
import type { LinhaHistorico } from "@/lib/auditoria-core";
import { dataHoraBR } from "@/lib/format";
import { nomeExibicao, type Pessoa } from "@/lib/pessoa";
import type { ComentarioTarefa } from "@/lib/tarefas";
import { textoMencao } from "@/lib/tarefas-core";
import { Avatar } from "./Avatar";
import { Button } from "./Button";
import { EditorRico } from "./EditorRico";
import { EventoHistorico } from "./Historico";
import { IconEnviar, IconPencil, IconTrash } from "./icons";
import { SkeletonLinhas } from "./Skeleton";
import { TextoFormatado } from "./TextoFormatado";

/** A preferência do aparelho: mostrar os DETALHES (o histórico de alterações) no fluxo de atividade. */
const CHAVE_DETALHES = "tarefas:atividade-detalhes";
const hora = (d: string | null) => (d ?? "").replace("T", " ");

/**
 * COMENTÁRIOS E ATIVIDADE de uma tarefa (um fluxo só, como no Trello): no topo o campo de escrever — digitar "@" abre as
 * PESSOAS DO GRUPO (tocar insere a menção); Ctrl/⌘+Enter envia; o texto aceita a formatação (negrito, listas, links) —
 * e, do mais novo ao mais antigo, os comentários (foto, nome, data/hora de Brasília, "editado"; o texto FORMATADO com as
 * @menções em destaque) intercalados, com **Mostrar detalhes** (lembrado no aparelho), às alterações do HISTÓRICO. Editar
 * só o próprio; excluir o próprio ou, para editores, qualquer um. Só apresenta — quem usa grava.
 */
export function AtividadeTarefa({
  comentarios,
  historico,
  pessoas,
  usuarioId,
  podeModerar,
  somenteLeitura = false,
  onEnviar,
  onEditar,
  onExcluir,
}: {
  comentarios: ComentarioTarefa[];
  /** O histórico de alterações (carregado só com os detalhes à vista — `null` = ainda não pedido). */
  historico: { linhas: LinhaHistorico[] | null; erro: string | null; onDetalhes: (v: boolean) => void };
  /** As pessoas do grupo (fotos e sugestões de @menção). */
  pessoas: Pessoa[];
  usuarioId: number;
  /** O papel EXCLUI: apaga o comentário de outra pessoa. */
  podeModerar: boolean;
  /** O papel só VÊ: sem escrever, editar ou apagar o próprio comentário. */
  somenteLeitura?: boolean;
  onEnviar: (texto: string) => Promise<boolean>;
  onEditar: (c: ComentarioTarefa, texto: string) => Promise<boolean>;
  onExcluir: (c: ComentarioTarefa) => void;
}) {
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [editando, setEditando] = useState<{ id: number; texto: string } | null>(null);
  const [detalhes, setDetalhes] = useState(false);
  // A preferência lida DEPOIS da montagem (o HTML do servidor não sabe) — conveniência do aparelho.
  // biome-ignore lint/correctness/useExhaustiveDependencies: só na montagem.
  useEffect(() => {
    try {
      if (localStorage.getItem(CHAVE_DETALHES) === "1") {
        setDetalhes(true);
        historico.onDetalhes(true);
      }
    } catch {
      // sem armazenamento: começa sem os detalhes
    }
  }, []);
  const alternarDetalhes = () => {
    const v = !detalhes;
    setDetalhes(v);
    historico.onDetalhes(v);
    try {
      localStorage.setItem(CHAVE_DETALHES, v ? "1" : "0");
    } catch {
      // sem armazenamento: vale só nesta tela
    }
  };
  // O FLUXO: comentários + (com os detalhes) as alterações, do mais novo ao mais antigo.
  const fluxo = useMemo(() => {
    const itens: ({ tipo: "c"; quando: string; c: ComentarioTarefa } | { tipo: "h"; quando: string; l: LinhaHistorico })[] = comentarios.map((c) => ({ tipo: "c", quando: hora(c.criadoEm), c }));
    if (detalhes) for (const l of historico.linhas ?? []) itens.push({ tipo: "h", quando: hora(l.criadoEm), l });
    return itens.sort((a, b) => b.quando.localeCompare(a.quando));
  }, [comentarios, historico.linhas, detalhes]);
  const porId = new Map(pessoas.map((p) => [p.id, p]));
  const menciona = useMemo(() => ({ pessoas, texto: textoMencao }), [pessoas]);
  const enviar = async () => {
    const t = texto.trim();
    if (!t || enviando) return;
    setEnviando(true);
    if (await onEnviar(t)) {
      setTexto("");
    }
    setEnviando(false);
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {!somenteLeitura && (
      <div className="flex shrink-0 items-end gap-2">
        <div className="min-w-0 flex-1">
          <EditorRico
            compacto
            valor={texto}
            onChange={setTexto}
            rotulo="Escrever comentário"
            placeholder="Escrever um comentário… (@ menciona alguém)"
            maxLength={5000}
            disabled={enviando}
            menciona={menciona}
            onTecla={(e) => {
              if (e.key !== "Enter" || !(e.ctrlKey || e.metaKey)) return false;
              enviar();
              return true;
            }}
          />
        </div>
        <Button variant="accent" size="sm" loading={enviando} disabled={!texto.trim()} aria-label="Enviar comentário" icon={<IconEnviar className="h-4 w-4" />} onClick={enviar} />
      </div>
      )}
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] font-semibold text-muted">Comentários e atividade</p>
        <Button variant="ghost" size="sm" aria-pressed={detalhes} onClick={alternarDetalhes}>
          {detalhes ? "Ocultar detalhes" : "Mostrar detalhes"}
        </Button>
      </div>
      <ol className="min-h-0 flex-1 space-y-3 overflow-y-auto">
        {fluxo.length === 0 && (
          <li className="py-6 text-center text-[12.5px] text-muted">{somenteLeitura ? "Nenhum comentário." : "Nenhum comentário — comece a conversa acima."}</li>
        )}
        {detalhes && !historico.linhas && !historico.erro && (
          <li>
            <SkeletonLinhas linhas={2} />
          </li>
        )}
        {historico.erro && detalhes && <li className="text-[12.5px]" style={{ color: "var(--danger)" }}>{historico.erro}</li>}
        {fluxo.map((x) => {
          if (x.tipo === "h") return <EventoHistorico key={`h${x.l.id}`} linha={x.l} />;
          const c = x.c;
          const autor = c.usuarioId != null ? porId.get(c.usuarioId) : undefined;
          // O próprio comentário: editar/apagar com Manipular (fora do só-leitura).
          const meu = c.usuarioId === usuarioId && !somenteLeitura;
          return (
            <li key={`c${c.id}`} className="flex gap-2.5">
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
                    <EditorRico
                      compacto
                      autoFocus
                      valor={editando.texto}
                      onChange={(v) => setEditando({ id: c.id, texto: v })}
                      rotulo="Editar comentário"
                      maxLength={5000}
                      menciona={menciona}
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
                  <div className="mt-1 rounded-control bg-surface-2 px-2.5 py-1.5">
                    <TextoFormatado texto={c.texto} />
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
