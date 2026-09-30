"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { chamarPadronizacao as chamar } from "@/lib/padronizacao-cliente";
import { nomeExibicao, type Pessoa } from "@/lib/pessoa";
import type { Quadro } from "@/lib/tarefas";
import type { Automacao, CampoTarefa, EquipeQuadro, EtiquetaTarefa, ListaTarefas } from "@/lib/tarefas-core";
import { AutomacoesQuadro, ModelosQuadro } from "./AutomacoesQuadro";
import { Avatar } from "./Avatar";
import { Button } from "./Button";
import { CamposPersonalizadosQuadro } from "./CamposTarefa";
import { ColorField } from "./ColorField";
import { useConfirmacao } from "./Confirmacao";
import { TextField } from "./Field";
import { IconPencil, IconPlus, IconTrash, IconUpload } from "./icons";
import { ImportarTrello } from "./ImportarTrello";
import { SincronizacaoTrello } from "./SincronizacaoTrello";
import { Modal } from "./Modal";
import { SeletorPessoas } from "./SeletorPessoas";
import { CamposQuadro, type CamposQuadroValor, } from "./QuadroCard";
import { Switch } from "./Switch";
import { toast } from "./Toast";

type RascunhoEquipe = { id: number | null; nome: string; cor: string; membros: number[] };

/**
 * A aba CONFIGURAÇÃO do quadro (editores; os demais só consultam) — SÓ o que não se faz direto no quadro: cor e descrição,
 * arquivar, privado, importar do Trello e excluir; as EQUIPES (nome + cor + pessoas — a tarefa com a equipe envolve todos
 * os membros), os CAMPOS personalizados (+ o formato do título automático), as AUTOMAÇÕES, o TRELLO e os MODELOS. O nome
 * (cabeçalho), as listas (menu "…" da lista, arrastar, "Adicionar outra lista"), as etiquetas (no cartão), o fundo e as
 * listas do mês (menu do quadro) ficam no próprio quadro. Cada alteração grava na hora e recarrega o quadro.
 */
export function ConfiguracaoQuadro({
  quadro,
  listas,
  etiquetas,
  equipes = [],
  campos: camposQuadro = [],
  automacoes,
  pessoas,
  todas = pessoas,
  modelosQuadro,
  usuarioId,
  pode,
  onMudou,
}: {
  quadro: Quadro;
  /** TODAS as listas (inclusive arquivadas), na ordem. */
  listas: ListaTarefas[];
  etiquetas: EtiquetaTarefa[];
  equipes?: EquipeQuadro[];
  /** Os CAMPOS personalizados do quadro (migração `0056`). */
  campos?: CampoTarefa[];
  automacoes: Automacao[];
  /** As pessoas do grupo (alvo de "atribuir" e membros das equipes). */
  pessoas: Pessoa[];
  /** Todas as pessoas conhecidas (as de fora do grupo que já estão numa equipe seguem visíveis). */
  todas?: Pessoa[];
  modelosQuadro: { id: number; nome: string; criadoPor: number | null; listas: string[] }[];
  usuarioId: number;
  /** O que o PAPEL permite neste quadro: Configurar (as seções), Importar (o Trello .json) e Excluir (o quadro). */
  pode: { configurar: boolean; importar: boolean; excluir: boolean };
  onMudou: () => void;
}) {
  const podeEditar = pode.configurar;
  const router = useRouter();
  const { confirmar, confirmacao } = useConfirmacao();
  const base: CamposQuadroValor = { nome: quadro.nome, cor: quadro.cor, descricao: quadro.descricao ?? "" };
  const [campos, setCampos] = useState(base);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [equipe, setEquipe] = useState<RascunhoEquipe | null>(null);
  const [trello, setTrello] = useState(false);
  const porId = new Map(todas.map((p) => [p.id, p]));
  const sujo = JSON.stringify(campos) !== JSON.stringify(base);

  /** Uma gravação por vez: o desfecho no aviso flutuante e o quadro recarregado (também na falha). */
  const gravar = async (chave: string, fn: () => Promise<unknown>, sucesso: string) => {
    if (ocupado) return false;
    setOcupado(chave);
    try {
      await fn();
      toast.success(sucesso);
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    } finally {
      setOcupado(null);
      onMudou();
    }
  };

  const salvarQuadro = () =>
    gravar(
      "quadro",
      () => chamar(`/api/tarefas/quadros/${quadro.id}`, "PATCH", { cor: campos.cor, descricao: campos.descricao.trim() || null }),
      "Quadro salvo.",
    );

  const arquivarQuadro = (arquivado: boolean) =>
    gravar("arquivar", () => chamar(`/api/tarefas/quadros/${quadro.id}`, "PATCH", { arquivado }), arquivado ? "Quadro arquivado." : "Quadro reativado.");

  const excluirQuadro = async () => {
    const ok = await confirmar({
      titulo: `Excluir o quadro "${quadro.nome}"?`,
      texto: "As listas, as tarefas e as etiquetas vão junto. Esta ação não pode ser desfeita — prefira arquivar.",
      confirmar: "Excluir",
      perigo: true,
    });
    if (!ok) return;
    setOcupado("excluir");
    try {
      await chamar(`/api/tarefas/quadros/${quadro.id}`, "DELETE");
      router.push("/painel/tarefas");
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
      setOcupado(null);
    }
  };

  const salvarEquipe = async () => {
    if (!equipe) return;
    const corpo = { nome: equipe.nome.trim(), cor: equipe.cor, membros: equipe.membros };
    const ok = await gravar(
      "equipe",
      () => (equipe.id == null ? chamar(`/api/tarefas/quadros/${quadro.id}/equipes`, "POST", corpo) : chamar(`/api/tarefas/equipes/${equipe.id}`, "PATCH", corpo)),
      equipe.id == null ? "Equipe criada." : "Equipe salva.",
    );
    if (ok) setEquipe(null);
  };

  const excluirEquipe = async (e: EquipeQuadro) => {
    if (!(await confirmar({ titulo: `Excluir a equipe "${e.nome}"?`, texto: "Ela sai de todas as tarefas do quadro (os responsáveis de cada tarefa ficam).", confirmar: "Excluir", perigo: true })))
      return;
    await gravar(`equipe-${e.id}`, () => chamar(`/api/tarefas/equipes/${e.id}`, "DELETE"), "Equipe excluída.");
  };

  return (
    <div className="grid grid-cols-1 gap-[var(--gap-block)] lg:grid-cols-2">
      <Secao titulo="Quadro">
        <CamposQuadro valor={campos} onChange={setCampos} disabled={!podeEditar} semNome />
        {(podeEditar || pode.importar || pode.excluir) && (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
            {podeEditar && <Switch checked={quadro.arquivado} disabled={ocupado != null} onChange={arquivarQuadro} label="Quadro arquivado" />}
            {podeEditar && quadro.criadoPor === usuarioId && (
              <Switch
                checked={quadro.privado}
                disabled={ocupado != null}
                onChange={async (privado) => {
                  // Tornar privado tira as outras pessoas de tudo dentro do quadro — confirma antes.
                  if (
                    privado &&
                    !(await confirmar({
                      titulo: "Tornar o quadro privado?",
                      texto: "Só você verá este quadro. As outras pessoas saem das tarefas, equipes, eventos e checklists dele.",
                      confirmar: "Tornar privado",
                      perigo: true,
                    }))
                  )
                    return;
                  gravar("privado", () => chamar(`/api/tarefas/quadros/${quadro.id}`, "PATCH", { privado }), privado ? "Quadro privado — só você o vê." : "Quadro visível ao grupo.");
                }}
                label="Privado (só você vê)"
              />
            )}
            <div className="ml-auto flex flex-wrap justify-end gap-2">
              {pode.importar && (
                <Button variant="ghost" size="sm" disabled={ocupado != null || quadro.arquivado} icon={<IconUpload className="h-4 w-4" />} onClick={() => setTrello(true)}>
                  Importar do Trello
                </Button>
              )}
              {pode.excluir && (
                <Button
                  variant="ghost"
                  size="sm"
                  loading={ocupado === "excluir"}
                  disabled={ocupado != null}
                  icon={<IconTrash className="h-4 w-4" style={{ color: "var(--danger)" }} />}
                  onClick={excluirQuadro}
                >
                  Excluir quadro
                </Button>
              )}
              {podeEditar && (
                <Button size="sm" loading={ocupado === "quadro"} disabled={!sujo || ocupado != null} onClick={salvarQuadro}>
                  Salvar
                </Button>
              )}
            </div>
          </div>
        )}
      </Secao>

      <Secao
        titulo="Equipes"
        acao={
          podeEditar && (
            <Button size="sm" variant="secondary" icon={<IconPlus className="h-4 w-4" />} onClick={() => setEquipe({ id: null, nome: "", cor: "#16a34a", membros: [] })}>
              Nova equipe
            </Button>
          )
        }
      >
        {equipes.length === 0 ? (
          <p className="text-[12.5px] text-muted">Nenhuma equipe — atribua uma equipe à tarefa e todos os membros dela passam a responder por ela (lembretes, calendário e filtros).</p>
        ) : (
          <ul className="divide-y divide-border">
            {equipes.map((e) => {
              const membros = e.membros.map((id) => porId.get(id)).filter((p): p is Pessoa => !!p);
              return (
                <li key={e.id} className="flex min-h-11 items-center gap-2 py-1.5">
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: e.cor }} />
                  <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="min-w-0 max-w-full truncate text-[13px] font-medium text-text">{e.nome}</span>
                    <span className="inline-flex items-center gap-1.5" title={membros.map((p) => nomeExibicao(p)).join(", ")}>
                      <span className="flex -space-x-1.5">
                        {membros.slice(0, 5).map((p) => (
                          <Avatar key={p.id} nome={p.nome} foto={p.foto} size="xs" className="ring-2 ring-surface" />
                        ))}
                      </span>
                      <span className="text-[12px] text-muted">
                        {e.membros.length} {e.membros.length === 1 ? "pessoa" : "pessoas"}
                      </span>
                    </span>
                  </span>
                  {podeEditar && (
                    <div className="flex gap-1">
                      <Button variant="ghost" size="xs" disabled={ocupado != null} aria-label={`Editar ${e.nome}`} icon={<IconPencil className="h-4 w-4" />} onClick={() => setEquipe({ id: e.id, nome: e.nome, cor: e.cor, membros: [...e.membros] })} />
                      <Button
                        variant="ghost"
                        size="xs"
                        disabled={ocupado != null}
                        aria-label={`Excluir ${e.nome}`}
                        style={{ color: "var(--danger)" }}
                        icon={<IconTrash className="h-4 w-4" />}
                        onClick={() => excluirEquipe(e)}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Secao>

      <Secao titulo="Campos personalizados">
        <CamposPersonalizadosQuadro
          quadroId={quadro.id}
          formatoTitulo={quadro.formatoTitulo}
          campos={camposQuadro}
          podeEditar={podeEditar && !quadro.arquivado}
          ocupado={ocupado != null}
          gravar={gravar}
          confirmar={confirmar}
        />
      </Secao>

      <Secao id="secao-automacoes" titulo="Automações">
        <AutomacoesQuadro
          quadroId={quadro.id}
          automacoes={automacoes}
          listas={listas.filter((l) => !l.arquivada)}
          etiquetas={etiquetas}
          pessoas={pessoas}
          podeEditar={podeEditar}
          ocupado={ocupado != null}
          gravar={gravar}
        />
      </Secao>

      <Secao id="secao-trello" titulo="Trello">
        <SincronizacaoTrello quadroId={quadro.id} privado={quadro.privado} />
      </Secao>

      <Secao titulo="Modelos">
        <ModelosQuadro
          quadroId={quadro.id}
          quadroNome={quadro.nome}
          modelosQuadro={modelosQuadro.map((m) => ({ ...m, detalhe: m.listas.join(" · ") }))}
          usuarioId={usuarioId}
          podeEditar={podeEditar}
          ocupado={ocupado != null}
          gravar={gravar}
        />
      </Secao>

      <Modal
        open={equipe != null}
        onClose={() => ocupado == null && setEquipe(null)}
        titulo={equipe?.id == null ? "Nova equipe" : "Editar equipe"}
        bloqueado={ocupado === "equipe"}
        rodape={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" disabled={ocupado != null} onClick={() => setEquipe(null)}>
              Cancelar
            </Button>
            <Button loading={ocupado === "equipe"} disabled={!equipe?.nome.trim() || ocupado != null} onClick={salvarEquipe}>
              Salvar
            </Button>
          </div>
        }
      >
        {equipe && (
          <div className="space-y-4">
            <TextField label="Nome" value={equipe.nome} maxLength={60} onChange={(e) => setEquipe({ ...equipe, nome: e.target.value })} />
            <ColorField label="Cor" value={equipe.cor} onChange={(cor) => setEquipe({ ...equipe, cor })} />
            <div className="space-y-1.5">
              <p className="text-[12.5px] font-medium text-text-2">Pessoas da equipe</p>
              <SeletorPessoas
                pessoas={pessoas}
                fora={todas.filter((p) => !pessoas.some((x) => x.id === p.id))}
                selecionadas={equipe.membros}
                usuarioId={usuarioId}
                onChange={(membros) => setEquipe({ ...equipe, membros })}
              />
              <p className="text-[12px] text-muted">Mudar as pessoas da equipe muda todas as tarefas dela.</p>
            </div>
          </div>
        )}
      </Modal>
      <ImportarTrello aberto={trello} quadroId={quadro.id} pessoas={pessoas} onFechar={() => setTrello(false)} onFeito={onMudou} />
      {confirmacao}
    </div>
  );
}

function Secao({ id, titulo, acao, children }: { id?: string; titulo: string; acao?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-3 rounded-card border border-border bg-surface p-[var(--pad-card)] shadow-ring">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="flex-1 text-[14px] font-semibold text-text">{titulo}</h2>
        {acao}
      </div>
      {children}
    </section>
  );
}
