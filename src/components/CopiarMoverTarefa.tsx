"use client";

import { useEffect, useState } from "react";
import { chamarPadronizacao as chamar } from "@/lib/padronizacao-cliente";
import { type EtiquetaTarefa, listaDeTemplates, OPCOES_COPIA_PADRAO, type OpcoesCopia, rotuloTicket, type TarefaResumo } from "@/lib/tarefas-core";
import { Button } from "./Button";
import { Dropdown } from "./Dropdown";
import { Checkbox, SelectField, TextField } from "./Field";
import { IconCartaoMais, IconChecklist } from "./icons";
import { Modal } from "./Modal";
import { Segmented } from "./Segmented";
import { Skeleton } from "./Skeleton";
import { toast } from "./Toast";

/** O que o diálogo faz: COPIAR (outra tarefa igual), MOVER para outro quadro ou CRIAR TEMPLATE (uma cópia-modelo). */
export type ModoCopia = "copiar" | "mover" | "template";
/** Um quadro de destino (os ativos que a pessoa vê) com as listas ativas. */
export type DestinoCopia = {
  id: number;
  nome: string;
  cor: string;
  grupoNome: string;
  /** O fundo (a capa da miniatura no "Mudar de quadros"). */
  fundoUrl: string | null;
  fundoAjuste: string | null;
  fundoGradiente: string | null;
  privado: boolean;
  listas: { id: number; nome: string; concluida: boolean }[];
};
/** O resultado: a tarefa criada (cópia/template) ou a movida, e o quadro onde ficou. */
export type ResultadoCopia = { modo: ModoCopia; id: number; ticket: number; quadroId: number };

/** Os QUADROS de destino (ativos, que a pessoa vê, com as listas) — buscados só quando um diálogo/seletor abre. */
export const buscarDestinos = () => chamar<{ quadros: DestinoCopia[] }>("/api/tarefas/destinos").then((j) => j.quadros);

const TITULO: Record<ModoCopia, string> = { copiar: "Copiar tarefa", mover: "Mover para outro quadro", template: "Criar template" };
const OPCOES: { k: keyof OpcoesCopia; rotulo: string }[] = [
  { k: "checklists", rotulo: "Checklists (desmarcados)" },
  { k: "etiquetas", rotulo: "Etiquetas" },
  { k: "pessoas", rotulo: "Responsáveis, observadores e equipes" },
  { k: "datas", rotulo: "Datas (início, prazo e lembrete)" },
];

/**
 * COPIAR · MOVER PARA OUTRO QUADRO · CRIAR TEMPLATE de uma tarefa (o menu "…" do detalhe e do cartão): o quadro e a lista
 * de destino (os quadros vêm SÓ ao abrir), a posição e o que vai junto. Em outro quadro, as etiquetas casam pelo NOME (as
 * que faltam são criadas) e ficam só as pessoas do grupo dele. Mover leva também checklists, comentários, eventos e o
 * histórico (a tarefa ganha o ticket do destino).
 */
export function CopiarMoverTarefa({
  aberto,
  onFechar,
  onFeito,
}: {
  aberto: { modo: ModoCopia; tarefa: Pick<TarefaResumo, "id" | "ticket" | "titulo" | "listaId">; quadroId: number } | null;
  onFechar: () => void;
  onFeito: (r: ResultadoCopia) => void;
}) {
  const [destinos, setDestinos] = useState<DestinoCopia[] | null>(null);
  const [quadroId, setQuadroId] = useState(0);
  const [listaId, setListaId] = useState(0);
  const [titulo, setTitulo] = useState("");
  const [noInicio, setNoInicio] = useState(false);
  const [opcoes, setOpcoes] = useState<OpcoesCopia>(OPCOES_COPIA_PADRAO);
  const [enviando, setEnviando] = useState(false);
  const modo = aberto?.modo;

  // Abre: busca os quadros de destino e começa no quadro atual (mover: no primeiro OUTRO).
  // biome-ignore lint/correctness/useExhaustiveDependencies: reinicia só quando OUTRO diálogo abre.
  useEffect(() => {
    if (!aberto) return;
    setTitulo(aberto.modo === "mover" ? "" : aberto.tarefa.titulo);
    setNoInicio(false);
    setOpcoes(aberto.modo === "template" ? { ...OPCOES_COPIA_PADRAO, datas: false, pessoas: false } : OPCOES_COPIA_PADRAO);
    let vivo = true;
    buscarDestinos()
      .then((quadros) => {
        if (!vivo) return;
        setDestinos(quadros);
        const q = aberto.modo === "mover" ? quadros.find((x) => x.id !== aberto.quadroId) : (quadros.find((x) => x.id === aberto.quadroId) ?? quadros[0]);
        escolherQuadro(q ?? null, aberto.modo, aberto.tarefa.listaId);
      })
      .catch((e) => vivo && toast.error((e as Error).message));
    return () => {
      vivo = false;
    };
  }, [aberto?.modo, aberto?.tarefa.id]);

  function escolherQuadro(q: DestinoCopia | null, m: ModoCopia | undefined, listaAtual?: number) {
    setQuadroId(q?.id ?? 0);
    const ls = q?.listas ?? [];
    const padrao = ls.find((l) => l.id === listaAtual)?.id ?? ls.find((l) => !l.concluida)?.id ?? ls[0]?.id ?? 0;
    setListaId(m === "template" ? listaDeTemplates(ls.map((l) => ({ ...l, arquivada: false })), padrao) : padrao);
  }

  const fechar = () => {
    if (enviando) return;
    setDestinos(null);
    onFechar();
  };
  if (!aberto || !modo) return null;
  const opcoesQuadro = (destinos ?? []).filter((q) => modo !== "mover" || q.id !== aberto.quadroId);
  const quadro = opcoesQuadro.find((q) => q.id === quadroId);
  const pode = !!quadro && quadro.listas.some((l) => l.id === listaId) && !enviando && (modo === "mover" || titulo.trim().length > 0);

  const enviar = async () => {
    if (!pode) return;
    setEnviando(true);
    try {
      const j =
        modo === "mover"
          ? await chamar<{ id: number; ticket: number; quadroId: number }>(`/api/tarefas/${aberto.tarefa.id}/mover-quadro`, "POST", { quadroId, listaId })
          : await chamar<{ id: number; ticket: number; quadroId: number }>(`/api/tarefas/${aberto.tarefa.id}/copiar`, "POST", {
              quadroId,
              listaId,
              titulo: titulo.trim(),
              noInicio,
              template: modo === "template",
              ...opcoes,
            });
      toast.success(
        modo === "mover"
          ? `Tarefa movida para “${quadro?.nome}” (${rotuloTicket(j.ticket)}).`
          : `${modo === "template" ? "Template" : "Cópia"} ${rotuloTicket(j.ticket)} criad${modo === "template" ? "o" : "a"}${j.quadroId !== aberto.quadroId ? ` em “${quadro?.nome}”` : ""}.`,
      );
      setDestinos(null);
      onFeito({ modo, ...j });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal
      open
      onClose={fechar}
      size="lg"
      bloqueado={enviando}
      titulo={`${TITULO[modo]} — ${rotuloTicket(aberto.tarefa.ticket)}`}
      rodape={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" disabled={enviando} onClick={fechar}>
            Cancelar
          </Button>
          <Button loading={enviando} disabled={!pode} onClick={enviar}>
            {modo === "mover" ? "Mover" : modo === "template" ? "Criar template" : "Copiar"}
          </Button>
        </div>
      }
    >
      {!destinos ? (
        <div className="space-y-3">
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
        </div>
      ) : !opcoesQuadro.length ? (
        <p className="text-sm text-muted">{modo === "mover" ? "Nenhum outro quadro ativo que você veja." : "Nenhum quadro ativo."}</p>
      ) : (
        <div className="space-y-4">
          {modo !== "mover" && <TextField label="Título" value={titulo} maxLength={200} onChange={(e) => setTitulo(e.target.value)} />}
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField label="Quadro" value={quadroId} onChange={(e) => escolherQuadro(opcoesQuadro.find((q) => q.id === Number(e.target.value)) ?? null, modo)}>
              {opcoesQuadro.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.nome} — {q.grupoNome}
                  {q.id === aberto.quadroId ? " (este)" : ""}
                </option>
              ))}
            </SelectField>
            <SelectField label="Lista" value={listaId} onChange={(e) => setListaId(Number(e.target.value))}>
              {(quadro?.listas ?? []).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nome}
                </option>
              ))}
            </SelectField>
          </div>
          {modo !== "mover" && (
            <>
              <Segmented<"fim" | "topo">
                ariaLabel="Posição na lista"
                value={noInicio ? "topo" : "fim"}
                onChange={(v) => setNoInicio(v === "topo")}
                options={[
                  { value: "fim", label: "No fim da lista" },
                  { value: "topo", label: "No topo" },
                ]}
              />
              <fieldset className="space-y-1">
                <legend className="mb-1 text-[13px] font-semibold text-text">Manter</legend>
                {OPCOES.map((o) => (
                  <div key={o.k} className="flex min-h-11 items-center lg:min-h-9">
                    <Checkbox label={o.rotulo} checked={opcoes[o.k]} onChange={(e) => setOpcoes((x) => ({ ...x, [o.k]: e.target.checked }))} />
                  </div>
                ))}
              </fieldset>
            </>
          )}
          {quadro && quadro.id !== aberto.quadroId && (
            <p className="text-[12.5px] text-muted">
              Em outro quadro, as etiquetas casam pelo nome (as que faltam são criadas lá) e ficam só as pessoas do grupo “{quadro.grupoNome}”.
              {modo === "mover" ? " Checklists, comentários, eventos e o histórico vão junto; a tarefa ganha o ticket do quadro de destino." : ""}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}

/**
 * CRIAR A PARTIR DE TEMPLATE (o ícone no pé da lista): os templates do quadro com a prévia (etiquetas, checklist) — escolher
 * COPIA o template para esta lista e abre a tarefa nova com o foco no fim do título.
 */
export function SeletorTemplates({
  templates,
  etiquetas,
  lista,
  onEscolher,
}: {
  templates: Pick<TarefaResumo, "id" | "titulo" | "etiquetas" | "checklist">[];
  etiquetas: Map<number, EtiquetaTarefa>;
  lista: string;
  onEscolher: (id: number) => void;
}) {
  return (
    <Dropdown
      align="end"
      width={280}
      ariaLabel={`Criar a partir de template em ${lista}`}
      triggerClassName="h-11 w-11 shrink-0 justify-center rounded-control text-text-2 hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] lg:h-[var(--h-control-sm)] lg:w-[var(--h-control-sm)]"
      trigger={<IconCartaoMais className="h-4 w-4" aria-hidden />}
    >
      {(fechar) => (
        <div className="space-y-1">
          <p className="px-2 pt-1 text-[12px] font-semibold text-muted">Criar a partir de template</p>
          {!templates.length && <p className="px-2 pb-2 text-[12.5px] text-muted">Nenhum template — no detalhe de uma tarefa, use o menu “…” → “Criar template”.</p>}
          {templates.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                fechar();
                onEscolher(t.id);
              }}
              className="flex min-h-11 w-full flex-col gap-1 rounded-control px-2 py-1.5 text-left hover:bg-surface-2"
            >
              {t.etiquetas.length > 0 && (
                <span className="flex flex-wrap gap-1">
                  {t.etiquetas.map((e) => {
                    const x = etiquetas.get(e);
                    return x ? <span key={e} title={x.nome} className="h-1.5 w-8 rounded-full" style={{ background: x.cor }} /> : null;
                  })}
                </span>
              )}
              <span className="line-clamp-2 text-[13px] text-text">{t.titulo}</span>
              {t.checklist.total > 0 && (
                <span className="inline-flex items-center gap-1 text-[11px] text-muted">
                  <IconChecklist className="h-3 w-3" />
                  {t.checklist.total}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </Dropdown>
  );
}
