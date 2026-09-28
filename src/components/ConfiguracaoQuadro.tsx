"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { chamarPadronizacao as chamar } from "@/lib/padronizacao-cliente";
import { nomeExibicao, type Pessoa } from "@/lib/pessoa";
import type { Quadro } from "@/lib/tarefas";
import type { Automacao, CampoTarefa, EquipeQuadro, EtiquetaTarefa, ListaTarefas } from "@/lib/tarefas-core";
import { AcoesCadastro } from "./AcoesCadastro";
import { AutomacoesQuadro, ModelosQuadro } from "./AutomacoesQuadro";
import { Avatar } from "./Avatar";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { CamposPersonalizadosQuadro } from "./CamposTarefa";
import { ColorField } from "./ColorField";
import { useConfirmacao } from "./Confirmacao";
import { TextField } from "./Field";
import { IconCalendar, IconCheck, IconPencil, IconPlus, IconTrash, IconUpload } from "./icons";
import { ImportarTrello } from "./ImportarTrello";
import { FundoQuadro } from "./FundoQuadro";
import { ExcluirLista } from "./MenuLista";
import { Modal } from "./Modal";
import { SeletorPessoas } from "./SeletorPessoas";
import { CamposPeriodo, CamposQuadro, type CamposQuadroValor, type PeriodoQuadro } from "./QuadroCard";
import { mesSeguinte } from "@/lib/calendario-core";
import { dataIsoBrasilia } from "@/lib/format";
import { Switch } from "./Switch";
import { toast } from "./Toast";

type RascunhoLista = { id: number | null; nome: string; limiteWip: string; concluida: boolean; arquivada: boolean };
type RascunhoEtiqueta = { id: number | null; nome: string; cor: string };
type RascunhoEquipe = { id: number | null; nome: string; cor: string; membros: number[] };

/**
 * A aba CONFIGURAÇÃO do quadro (editores; os demais só consultam): os dados do quadro (nome · cor · descrição), arquivar
 * e excluir; as LISTAS (ordem ↑/↓, nome, limite de cartões — WIP —, "lista de concluídas" — entrar nela conclui a tarefa —,
 * arquivar; excluir — `ExcluirLista`: mover os cartões ou excluir tudo), a IMAGEM DE FUNDO (`FundoQuadro`), as ETIQUETAS (nome + cor), as EQUIPES (nome + cor + pessoas — a tarefa com a equipe
 * envolve todos os membros), os CAMPOS personalizados (+ o formato do título automático), as AUTOMAÇÕES e os MODELOS. Cada alteração grava na hora e
 * recarrega o quadro.
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
  podeEditar,
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
  podeEditar: boolean;
  onMudou: () => void;
}) {
  const router = useRouter();
  const { confirmar, confirmacao } = useConfirmacao();
  const base: CamposQuadroValor = { nome: quadro.nome, cor: quadro.cor, descricao: quadro.descricao ?? "" };
  const [campos, setCampos] = useState(base);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [lista, setLista] = useState<RascunhoLista | null>(null);
  const [etiqueta, setEtiqueta] = useState<RascunhoEtiqueta | null>(null);
  const [equipe, setEquipe] = useState<RascunhoEquipe | null>(null);
  const [periodo, setPeriodo] = useState<PeriodoQuadro | null>(null);
  const [trello, setTrello] = useState(false);
  const [excluindoLista, setExcluindoLista] = useState<number | null>(null);
  const porId = new Map(todas.map((p) => [p.id, p]));
  const [ordem, setOrdem] = useState<number[] | null>(null);
  // A ordem otimista vale até as listas do servidor chegarem.
  // biome-ignore lint/correctness/useExhaustiveDependencies: zera quando as listas do SERVIDOR mudam.
  useEffect(() => setOrdem(null), [listas]);
  const sujo = JSON.stringify(campos) !== JSON.stringify(base);
  const listasOrdem = ordem ? ordem.map((id) => listas.find((l) => l.id === id)).filter((l): l is ListaTarefas => !!l) : listas;

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

  const gerarPeriodo = async () => {
    if (!periodo) return;
    let criadas = 0;
    const okGravou = await gravar(
      "periodo",
      async () => {
        criadas = (await chamar<{ criadas: number }>(`/api/tarefas/quadros/${quadro.id}/listas/periodo`, "POST", periodo)).criadas;
      },
      "Listas do mês atualizadas.",
    );
    if (okGravou) {
      setPeriodo(null);
      if (!criadas) toast.info("Todas as listas desse mês já existiam.");
    }
  };

  const salvarQuadro = () =>
    gravar(
      "quadro",
      () => chamar(`/api/tarefas/quadros/${quadro.id}`, "PATCH", { nome: campos.nome.trim(), cor: campos.cor, descricao: campos.descricao.trim() || null }),
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

  const moverLista = async (i: number, d: -1 | 1) => {
    const ids = listasOrdem.map((l) => l.id);
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    setOrdem(ids); // otimista
    const ok = await gravar("ordem", () => chamar(`/api/tarefas/quadros/${quadro.id}/listas`, "PATCH", { ids }), "Ordem das listas salva.");
    if (!ok) setOrdem(null);
  };

  const salvarLista = async () => {
    if (!lista) return;
    const wip = lista.limiteWip.trim() ? Number(lista.limiteWip) : null;
    const corpo = { nome: lista.nome.trim(), limiteWip: wip, concluida: lista.concluida };
    const ok = await gravar(
      "lista",
      () =>
        lista.id == null
          ? chamar(`/api/tarefas/quadros/${quadro.id}/listas`, "POST", corpo)
          : chamar(`/api/tarefas/listas/${lista.id}`, "PATCH", { ...corpo, arquivada: lista.arquivada }),
      lista.id == null ? "Lista criada." : "Lista salva.",
    );
    if (ok) setLista(null);
  };

  const salvarEtiqueta = async () => {
    if (!etiqueta) return;
    const corpo = { nome: etiqueta.nome.trim(), cor: etiqueta.cor };
    const ok = await gravar(
      "etiqueta",
      () => (etiqueta.id == null ? chamar(`/api/tarefas/quadros/${quadro.id}/etiquetas`, "POST", corpo) : chamar(`/api/tarefas/etiquetas/${etiqueta.id}`, "PATCH", corpo)),
      etiqueta.id == null ? "Etiqueta criada." : "Etiqueta salva.",
    );
    if (ok) setEtiqueta(null);
  };

  const excluirEtiqueta = async (e: EtiquetaTarefa) => {
    if (!(await confirmar({ titulo: `Excluir a etiqueta "${e.nome}"?`, texto: "Ela sai de todas as tarefas do quadro.", confirmar: "Excluir", perigo: true }))) return;
    await gravar(`etiqueta-${e.id}`, () => chamar(`/api/tarefas/etiquetas/${e.id}`, "DELETE"), "Etiqueta excluída.");
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

  const wipValido = !lista?.limiteWip.trim() || (/^\d+$/.test(lista.limiteWip.trim()) && Number(lista.limiteWip) >= 1 && Number(lista.limiteWip) <= 999);

  return (
    <div className="grid grid-cols-1 gap-[var(--gap-block)] lg:grid-cols-2">
      <Secao titulo="Quadro">
        <CamposQuadro valor={campos} onChange={setCampos} disabled={!podeEditar} />
        {podeEditar && (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <Switch checked={quadro.arquivado} disabled={ocupado != null} onChange={arquivarQuadro} label="Quadro arquivado" />
            <div className="ml-auto flex flex-wrap justify-end gap-2">
              <Button variant="ghost" size="sm" disabled={ocupado != null || quadro.arquivado} icon={<IconUpload className="h-4 w-4" />} onClick={() => setTrello(true)}>
                Importar do Trello
              </Button>
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
              <Button size="sm" loading={ocupado === "quadro"} disabled={!sujo || !campos.nome.trim() || ocupado != null} onClick={salvarQuadro}>
                Salvar
              </Button>
            </div>
          </div>
        )}
      </Secao>

      <div className="space-y-[var(--gap-block)]">
        <Secao
          titulo="Listas"
          acao={
            podeEditar && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="ghost" icon={<IconCalendar className="h-4 w-4" />} disabled={quadro.arquivado} onClick={() => setPeriodo({ ...mesSeguinte(dataIsoBrasilia(new Date().toISOString())), diasUteis: true })}>
                  Listas do mês
                </Button>
                <Button size="sm" variant="secondary" icon={<IconPlus className="h-4 w-4" />} onClick={() => setLista({ id: null, nome: "", limiteWip: "", concluida: false, arquivada: false })}>
                  Nova lista
                </Button>
              </div>
            )
          }
        >
          <ul className="divide-y divide-border">
            {listasOrdem.map((l, i) => (
              <li key={l.id} className={`flex min-h-11 items-center gap-2 py-1.5 ${l.arquivada ? "opacity-60" : ""}`}>
                {l.concluida && <IconCheck className="h-4 w-4 shrink-0" style={{ color: "var(--ok)" }} aria-label="Lista de concluídas" />}
                {/* Nome + selos quebram de linha no celular: as ações (↑/↓/editar/excluir) nunca empurram o cartão. */}
                <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                  <span className="min-w-0 max-w-full truncate text-[13px] font-medium text-text">{l.nome}</span>
                  {l.limiteWip != null && <Badge>WIP {l.limiteWip}</Badge>}
                  {l.arquivada && <Badge>Arquivada</Badge>}
                </span>
                {podeEditar && (
                  <AcoesCadastro
                    nome={l.nome}
                    primeira={i === 0}
                    ultima={i === listasOrdem.length - 1}
                    disabled={ocupado != null}
                    onMover={(d) => moverLista(i, d)}
                    onEditar={() => setLista({ id: l.id, nome: l.nome, limiteWip: l.limiteWip == null ? "" : String(l.limiteWip), concluida: l.concluida, arquivada: l.arquivada })}
                    onExcluir={() => setExcluindoLista(l.id)}
                  />
                )}
              </li>
            ))}
          </ul>
        </Secao>

        <Secao titulo="Imagem de fundo">
          <FundoQuadro quadroId={quadro.id} fundoUrl={quadro.fundoUrl} podeEditar={podeEditar && !quadro.arquivado} onMudou={onMudou} />
        </Secao>

        <Secao
          titulo="Etiquetas"
          acao={
            podeEditar && (
              <Button size="sm" variant="secondary" icon={<IconPlus className="h-4 w-4" />} onClick={() => setEtiqueta({ id: null, nome: "", cor: "#0ea5e9" })}>
                Nova etiqueta
              </Button>
            )
          }
        >
          {etiquetas.length === 0 ? (
            <p className="text-[12.5px] text-muted">Nenhuma etiqueta — elas marcam os cartões (ex.: Urgente, Licitação, Aguardando).</p>
          ) : (
            <ul className="divide-y divide-border">
              {etiquetas.map((e) => (
                <li key={e.id} className="flex min-h-11 items-center gap-2 py-1.5">
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: e.cor }} />
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-text">{e.nome}</span>
                  {podeEditar && (
                    <div className="flex gap-1">
                      <Button variant="ghost" size="xs" disabled={ocupado != null} aria-label={`Editar ${e.nome}`} icon={<IconPencil className="h-4 w-4" />} onClick={() => setEtiqueta({ ...e })} />
                      <Button
                        variant="ghost"
                        size="xs"
                        disabled={ocupado != null}
                        aria-label={`Excluir ${e.nome}`}
                        style={{ color: "var(--danger)" }}
                        icon={<IconTrash className="h-4 w-4" />}
                        onClick={() => excluirEtiqueta(e)}
                      />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Secao>
      </div>

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

      <Secao titulo="Automações">
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
        open={periodo != null}
        onClose={() => ocupado == null && setPeriodo(null)}
        titulo="Listas dos dias do mês"
        size="md"
        bloqueado={ocupado === "periodo"}
        rodape={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" disabled={ocupado != null} onClick={() => setPeriodo(null)}>
              Cancelar
            </Button>
            <Button loading={ocupado === "periodo"} disabled={ocupado != null} onClick={gerarPeriodo}>
              Gerar listas
            </Button>
          </div>
        }
      >
        {periodo && (
          <div className="space-y-3">
            <CamposPeriodo valor={periodo} onChange={setPeriodo} disabled={ocupado != null} />
            <p className="text-[12.5px] text-muted">Cria uma lista por dia (ex.: “05 - OUTUBRO - 2026”) depois das listas atuais e antes da de concluídas — só as que ainda não existem.</p>
          </div>
        )}
      </Modal>

      <Modal
        open={lista != null}
        onClose={() => ocupado == null && setLista(null)}
        titulo={lista?.id == null ? "Nova lista" : "Editar lista"}
        bloqueado={ocupado === "lista"}
        rodape={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" disabled={ocupado != null} onClick={() => setLista(null)}>
              Cancelar
            </Button>
            <Button loading={ocupado === "lista"} disabled={!lista?.nome.trim() || !wipValido || ocupado != null} onClick={salvarLista}>
              Salvar
            </Button>
          </div>
        }
      >
        {lista && (
          <div className="space-y-4">
            <TextField label="Nome" value={lista.nome} maxLength={60} onChange={(e) => setLista({ ...lista, nome: e.target.value })} />
            <TextField
              label="Limite de cartões (WIP)"
              inputMode="numeric"
              value={lista.limiteWip}
              placeholder="Sem limite"
              error={wipValido ? undefined : "Um número de 1 a 999 (ou vazio = sem limite)."}
              hint="Passando do limite, a contagem da lista fica em âmbar."
              onChange={(e) => setLista({ ...lista, limiteWip: e.target.value })}
            />
            <Switch checked={lista.concluida} onChange={(v) => setLista({ ...lista, concluida: v })} label="Lista de concluídas — o cartão que entra nela é concluído" />
            {lista.id != null && <Switch checked={lista.arquivada} onChange={(v) => setLista({ ...lista, arquivada: v })} label="Arquivada (some do quadro)" />}
          </div>
        )}
      </Modal>

      <Modal
        open={etiqueta != null}
        onClose={() => ocupado == null && setEtiqueta(null)}
        titulo={etiqueta?.id == null ? "Nova etiqueta" : "Editar etiqueta"}
        bloqueado={ocupado === "etiqueta"}
        rodape={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" disabled={ocupado != null} onClick={() => setEtiqueta(null)}>
              Cancelar
            </Button>
            <Button loading={ocupado === "etiqueta"} disabled={!etiqueta?.nome.trim() || ocupado != null} onClick={salvarEtiqueta}>
              Salvar
            </Button>
          </div>
        }
      >
        {etiqueta && (
          <div className="space-y-4">
            <TextField label="Nome" value={etiqueta.nome} maxLength={30} onChange={(e) => setEtiqueta({ ...etiqueta, nome: e.target.value })} />
            <ColorField label="Cor" value={etiqueta.cor} onChange={(cor) => setEtiqueta({ ...etiqueta, cor })} />
          </div>
        )}
      </Modal>
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
      <ExcluirLista
        lista={listas.find((l) => l.id === excluindoLista) ?? null}
        outras={listas.filter((l) => l.id !== excluindoLista && !l.arquivada)}
        onFechar={() => setExcluindoLista(null)}
        onFeito={() => {
          setExcluindoLista(null);
          onMudou();
        }}
      />
      {confirmacao}
    </div>
  );
}

function Secao({ titulo, acao, children }: { titulo: string; acao?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-card border border-border bg-surface p-[var(--pad-card)] shadow-ring">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="flex-1 text-[14px] font-semibold text-text">{titulo}</h2>
        {acao}
      </div>
      {children}
    </section>
  );
}
