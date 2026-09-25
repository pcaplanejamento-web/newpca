"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { chamarPadronizacao as chamar } from "@/lib/padronizacao-cliente";
import type { Pessoa } from "@/lib/pessoa";
import type { Quadro } from "@/lib/tarefas";
import type { Automacao, EtiquetaTarefa, ListaTarefas } from "@/lib/tarefas-core";
import { AcoesCadastro } from "./AcoesCadastro";
import { AutomacoesQuadro, ModelosQuadro } from "./AutomacoesQuadro";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { ColorField } from "./ColorField";
import { useConfirmacao } from "./Confirmacao";
import { TextField } from "./Field";
import { IconCheck, IconPencil, IconPlus, IconTrash } from "./icons";
import { Modal } from "./Modal";
import { CamposQuadro, type CamposQuadroValor } from "./QuadroCard";
import { Switch } from "./Switch";
import { toast } from "./Toast";

type RascunhoLista = { id: number | null; nome: string; limiteWip: string; concluida: boolean; arquivada: boolean };
type RascunhoEtiqueta = { id: number | null; nome: string; cor: string };

/**
 * A aba CONFIGURAÇÃO do quadro (editores; os demais só consultam): os dados do quadro (nome · cor · descrição), arquivar
 * e excluir; as LISTAS (ordem ↑/↓, nome, limite de cartões — WIP —, "lista de concluídas" — entrar nela conclui a tarefa —,
 * arquivar; excluir só a vazia), as ETIQUETAS (nome + cor), as AUTOMAÇÕES e os MODELOS. Cada alteração grava na hora e
 * recarrega o quadro.
 */
export function ConfiguracaoQuadro({
  quadro,
  listas,
  etiquetas,
  automacoes,
  pessoas,
  modelosQuadro,
  modelosTarefa,
  usuarioId,
  podeEditar,
  onMudou,
}: {
  quadro: Quadro;
  /** TODAS as listas (inclusive arquivadas), na ordem. */
  listas: ListaTarefas[];
  etiquetas: EtiquetaTarefa[];
  automacoes: Automacao[];
  /** As pessoas do grupo (alvo de "atribuir"). */
  pessoas: Pessoa[];
  modelosQuadro: { id: number; nome: string; criadoPor: number | null; listas: string[] }[];
  modelosTarefa: { id: number; nome: string; criadoPor: number | null }[];
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

  const excluirLista = async (l: ListaTarefas) => {
    if (!(await confirmar({ titulo: `Excluir a lista "${l.nome}"?`, texto: "Só uma lista VAZIA pode ser excluída — com cartões, arquive-a.", confirmar: "Excluir", perigo: true })))
      return;
    await gravar(`lista-${l.id}`, () => chamar(`/api/tarefas/listas/${l.id}`, "DELETE"), "Lista excluída.");
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

  const wipValido = !lista?.limiteWip.trim() || (/^\d+$/.test(lista.limiteWip.trim()) && Number(lista.limiteWip) >= 1 && Number(lista.limiteWip) <= 999);

  return (
    <div className="grid grid-cols-1 gap-[var(--gap-block)] lg:grid-cols-2">
      <Secao titulo="Quadro">
        <CamposQuadro valor={campos} onChange={setCampos} disabled={!podeEditar} />
        {podeEditar && (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <Switch checked={quadro.arquivado} disabled={ocupado != null} onChange={arquivarQuadro} label="Quadro arquivado" />
            <div className="ml-auto flex gap-2">
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
              <Button size="sm" variant="secondary" icon={<IconPlus className="h-4 w-4" />} onClick={() => setLista({ id: null, nome: "", limiteWip: "", concluida: false, arquivada: false })}>
                Nova lista
              </Button>
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
                    onExcluir={() => excluirLista(l)}
                  />
                )}
              </li>
            ))}
          </ul>
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
          modelosTarefa={modelosTarefa.map((m) => ({ ...m, detalhe: "" }))}
          usuarioId={usuarioId}
          podeEditar={podeEditar}
          ocupado={ocupado != null}
          gravar={gravar}
        />
      </Secao>

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
