"use client";

import { useState } from "react";
import { dataIsoBrasilia } from "@/lib/format";
import { chamarPadronizacao as chamar } from "@/lib/padronizacao-cliente";
import { blocosPdfTarefas, type ConteudoPdfTarefa } from "@/lib/tarefas-pdf";
import { nomeExibicao, type Pessoa } from "@/lib/pessoa";
import {
  alternarValor,
  type CampoTarefa,
  type FiltroTarefas,
  numerosMesa,
  opcoesFiltroLista,
  ROTULO_PRIORIDADE,
  rotuloData,
  rotuloTicket,
  siglasDaTarefa,
  type TarefaResumo,
} from "@/lib/tarefas-core";
import { Avatar } from "./Avatar";
import { useQuemExporta } from "./ConfigTabelas";
import { Dropdown } from "./Dropdown";
import { usePodeExportar } from "./ExportarTabelas";
import { IconFile, IconFilter } from "./icons";
import { toast } from "./Toast";

/** O filtro de UMA lista: as pessoas, as siglas e os números da Mesa (vazio = sem filtro). */
export type FiltroDaLista = Pick<FiltroTarefas, "responsaveis" | "siglas" | "mesa">;
export const FILTRO_LISTA_VAZIO: FiltroDaLista = { responsaveis: [], siglas: [], mesa: [] };
export const contarFiltroLista = (f: FiltroDaLista) => f.responsaveis.length + f.siglas.length + f.mesa.length;

const botaoPe =
  "relative grid h-11 w-11 shrink-0 place-items-center rounded-control text-text-2 hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] lg:h-[var(--h-control-sm)] lg:w-[var(--h-control-sm)]";

function Chip({ ativo, onClick, children, titulo }: { ativo: boolean; onClick: () => void; children: React.ReactNode; titulo: string }) {
  return (
    <button
      type="button"
      aria-pressed={ativo}
      title={titulo}
      onClick={onClick}
      className={`inline-flex min-h-8 items-center gap-1.5 rounded-chip px-2 text-[12px] font-semibold transition-colors any-pointer-coarse:min-h-11 ${
        ativo ? "bg-accent text-[var(--sobre-escuro)]" : "bg-surface-2 text-text-2 hover:bg-[color-mix(in_srgb,var(--text)_10%,var(--surface-2))]"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * O FILTRO da lista (o funil no pé da coluna): os MEMBROS envolvidos, a SIGLA da unidade e o PROTOCOLO/DFD/ITEM — as
 * opções saem dos cartões da própria lista. Vários valores numa seção = qualquer um; entre seções = todos.
 */
export function FiltroLista({
  nome,
  tarefas,
  pessoas,
  filtro,
  onChange,
}: {
  nome: string;
  tarefas: TarefaResumo[];
  pessoas: Map<number, Pessoa>;
  filtro: FiltroDaLista;
  onChange: (f: FiltroDaLista) => void;
}) {
  const op = opcoesFiltroLista(tarefas);
  const n = contarFiltroLista(filtro);
  const vazio = !op.pessoas.length && !op.siglas.length && !op.mesa.length;
  return (
    <Dropdown
      papel="dialog"
      align="end"
      width={300}
      className="inline-flex shrink-0"
      ariaLabel={`Filtrar a lista ${nome}`}
      title={n ? `Filtro da lista: ${n} ativo(s)` : "Filtrar a lista"}
      triggerClassName={`relative h-11 w-11 shrink-0 justify-center !rounded-control text-text-2 hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] lg:h-[var(--h-control-sm)] lg:w-[var(--h-control-sm)] ${n ? "!text-accent" : ""}`}
      trigger={
        <>
          <IconFilter className="h-4 w-4" aria-hidden />
          {n > 0 && <span className="absolute top-0.5 right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-[var(--sobre-escuro)] tabular-nums">{n}</span>}
        </>
      }
    >
      <div className="max-h-[60dvh] space-y-3 overflow-y-auto p-2">
        <div className="flex items-center justify-between">
          <p className="text-[13px] font-semibold text-text">Filtrar a lista</p>
          {n > 0 && (
            <button type="button" onClick={() => onChange(FILTRO_LISTA_VAZIO)} className="min-h-8 rounded-control px-2 text-[12px] font-semibold text-accent hover:bg-surface-2">
              Limpar
            </button>
          )}
        </div>
        {vazio && <p className="text-[12.5px] text-muted">Os cartões desta lista não têm membros, unidade nem vínculo da Mesa.</p>}
        {op.pessoas.length > 0 && (
          <section className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Membros</p>
            <div className="flex flex-wrap gap-1.5">
              {op.pessoas.map((id) => {
                const p = pessoas.get(id);
                const rot = p ? nomeExibicao(p) : `#${id}`;
                return (
                  <Chip key={id} titulo={rot} ativo={filtro.responsaveis.includes(id)} onClick={() => onChange({ ...filtro, responsaveis: alternarValor(filtro.responsaveis, id) })}>
                    {p && <Avatar nome={p.nome} foto={p.foto} size="xs" />}
                    <span className="max-w-[9rem] truncate">{rot}</span>
                  </Chip>
                );
              })}
            </div>
          </section>
        )}
        {op.siglas.length > 0 && (
          <section className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Unidade</p>
            <div className="flex flex-wrap gap-1.5">
              {op.siglas.map((sg) => (
                <Chip key={sg} titulo={`Unidade ${sg}`} ativo={filtro.siglas.includes(sg)} onClick={() => onChange({ ...filtro, siglas: alternarValor(filtro.siglas, sg) })}>
                  {sg}
                </Chip>
              ))}
            </div>
          </section>
        )}
        {op.mesa.length > 0 && (
          <section className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Protocolo · DFD · Item</p>
            <div className="flex flex-wrap gap-1.5">
              {op.mesa.map((m) => (
                <Chip key={m.chave} titulo={m.texto} ativo={filtro.mesa.includes(m.chave)} onClick={() => onChange({ ...filtro, mesa: alternarValor(filtro.mesa, m.chave) })}>
                  <span className="tabular-nums">{m.texto}</span>
                </Chip>
              ))}
            </div>
          </section>
        )}
      </div>
    </Dropdown>
  );
}

/** O PDF da LISTA (o ícone no pé da coluna): os cartões À VISTA (com o filtro da lista e o do quadro) com TODO o conteúdo
 * de cada um — dados, descrição, notas, links, checklists, eventos e comentários (lidos de cada tarefa, 4 por vez). */
export function PdfLista({
  nome,
  tarefas,
  pessoas,
  etiquetas,
  campos,
}: {
  nome: string;
  tarefas: TarefaResumo[];
  pessoas: Map<number, Pessoa>;
  etiquetas: Map<number, { nome: string }>;
  campos?: CampoTarefa[];
}) {
  const pode = usePodeExportar();
  const quem = useQuemExporta();
  const [gerando, setGerando] = useState(false);
  if (!pode) return null;
  const gerar = async () => {
    const lista = tarefas.filter((t) => !t.template);
    if (!lista.length) {
      toast.error("Nenhum cartão à vista nesta lista.");
      return;
    }
    setGerando(true);
    try {
      const conteudos = new Map<number, ConteudoPdfTarefa | null>();
      for (let i = 0; i < lista.length; i += 4)
        await Promise.all(
          lista.slice(i, i + 4).map(async (t) => {
            const j = await chamar<ConteudoPdfTarefa & { tarefa: { descricao?: string | null; blocos?: unknown } }>(`/api/tarefas/${t.id}`).catch(() => null);
            conteudos.set(t.id, j ? { ...j, descricao: j.tarefa.descricao, blocos: j.tarefa.blocos } : null);
          }),
        );
      const [{ baixarDocumentoPdf }, { nomeArquivoPdf }] = await Promise.all([import("@/lib/documento-pdf"), import("@/lib/exportar-pdf-core")]);
      const blocos = blocosPdfTarefas(lista, conteudos, {
        pessoa: (id) => (pessoas.get(id) ? nomeExibicao(pessoas.get(id) as Pessoa) : `#${id}`),
        etiqueta: (id) => etiquetas.get(id)?.nome ?? `#${id}`,
        campos,
      });
      await baixarDocumentoPdf(
        nomeArquivoPdf(nome, dataIsoBrasilia(new Date().toISOString())),
        { titulo: `${nome} — ${lista.length} ${lista.length === 1 ? "tarefa" : "tarefas"}`, blocos },
        { usuario: quem },
      );
    } catch {
      toast.error("Não foi possível gerar o PDF — tente de novo.");
    } finally {
      setGerando(false);
    }
  };
  return (
    <button type="button" onClick={gerar} disabled={gerando} aria-label={`Baixar o PDF da lista ${nome}`} title={gerando ? "Gerando o PDF…" : "Baixar o PDF da lista (todo o conteúdo das tarefas)"} className={`${botaoPe} disabled:opacity-50`}>
      <IconFile className={`h-4 w-4 ${gerando ? "animate-pulse" : ""}`} aria-hidden />
    </button>
  );
}
