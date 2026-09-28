"use client";

import { textoSobre } from "@/lib/color";
import { useMemo, useState } from "react";
import { chamarPadronizacao as chamar } from "@/lib/padronizacao-cliente";
import { predicadoBusca } from "@/lib/tabela-filtros";
import { alternarValor, corEtiquetaSugerida, type EtiquetaTarefa, PALETA_ETIQUETAS } from "@/lib/tarefas-core";
import { Button } from "./Button";
import { Dropdown } from "./Dropdown";
import { Checkbox, SearchField, TextField } from "./Field";
import { IconPencil, IconPlus, IconTrash } from "./icons";
import { toast } from "./Toast";

/** As CORES sugeridas para uma etiqueta (dados — a etiqueta guarda a cor escolhida). */
/** Quantas etiquetas aparecem antes do "Mostrar mais". */
const VISIVEIS = 12;

/** O rótulo de UMA etiqueta na cor dela (o chip do seletor e do detalhe). */
export function ChipEtiqueta({ etiqueta: e }: { etiqueta: Pick<EtiquetaTarefa, "nome" | "cor"> }) {
  return (
    <span
      className="inline-flex min-h-8 max-w-full items-center truncate rounded-[4px] px-3 text-[13px] font-semibold"
      style={{ background: e.cor, color: textoSobre(e.cor) }}
      title={e.nome}
    >
      {e.nome}
    </span>
  );
}

/**
 * SELETOR DE ETIQUETAS (como o do Trello): as marcadas em chips + o "+" que abre o painel — busca, caixas de marcar na cor
 * de cada etiqueta, "Mostrar mais" acima de 12 e, para editores, o lápis (renomear/recolorir/EXCLUIR — do quadro todo, com
 * confirmação) e "Criar etiqueta" (já
 * marcada na tarefa). Marcar muda só o rascunho da tarefa (`onChange`); criar/editar grava na hora e o quadro recarrega
 * (`onMudouEtiquetas`).
 */
export function SeletorEtiquetas({
  etiquetas,
  marcados,
  onChange,
  quadroId,
  podeEditar,
  onMudouEtiquetas,
  disabled = false,
}: {
  etiquetas: EtiquetaTarefa[];
  marcados: number[];
  onChange: (ids: number[]) => void;
  quadroId: number;
  /** Editor: cria e edita etiquetas do quadro. */
  podeEditar: boolean;
  onMudouEtiquetas: () => void;
  disabled?: boolean;
}) {
  const porId = useMemo(() => new Map(etiquetas.map((e) => [e.id, e])), [etiquetas]);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {marcados.map((id) => {
        const e = porId.get(id);
        return e ? <ChipEtiqueta key={id} etiqueta={e} /> : null;
      })}
      <Dropdown
        width={300}
        ariaLabel="Escolher etiquetas"
        triggerClassName={`h-11 w-11 justify-center rounded-control bg-surface-2 text-muted hover:text-text lg:h-8 lg:w-8 ${disabled ? "pointer-events-none opacity-50" : ""}`}
        trigger={<IconPlus className="h-4 w-4" />}
      >
        <PainelEtiquetas etiquetas={etiquetas} marcados={marcados} onChange={onChange} quadroId={quadroId} podeEditar={podeEditar} onMudouEtiquetas={onMudouEtiquetas} />
      </Dropdown>
    </div>
  );
}

function PainelEtiquetas({
  etiquetas,
  marcados,
  onChange,
  quadroId,
  podeEditar,
  onMudouEtiquetas,
}: {
  etiquetas: EtiquetaTarefa[];
  marcados: number[];
  onChange: (ids: number[]) => void;
  quadroId: number;
  podeEditar: boolean;
  onMudouEtiquetas: () => void;
}) {
  const [busca, setBusca] = useState("");
  const [mais, setMais] = useState(false);
  const [edicao, setEdicao] = useState<{ id: number | null; nome: string; cor: string } | null>(null);
  const [gravando, setGravando] = useState(false);
  // Excluir pede um 2º toque (a confirmação fica no próprio painel — um aviso flutuante fecharia o menu).
  const [confirmaExcluir, setConfirmaExcluir] = useState(false);
  const casa = predicadoBusca(busca);
  const lista = casa ? etiquetas.filter((e) => casa([e.nome])) : etiquetas;
  const visiveis = mais || casa ? lista : lista.slice(0, VISIVEIS);

  const gravar = async () => {
    if (!edicao?.nome.trim() || gravando) return;
    setGravando(true);
    try {
      const corpo = { nome: edicao.nome.trim(), cor: edicao.cor };
      if (edicao.id == null) {
        const { id } = await chamar<{ id: number }>(`/api/tarefas/quadros/${quadroId}/etiquetas`, "POST", corpo);
        onChange([...marcados, id]);
      } else await chamar(`/api/tarefas/etiquetas/${edicao.id}`, "PATCH", corpo);
      setEdicao(null);
      onMudouEtiquetas();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setGravando(false);
    }
  };

  const excluir = async () => {
    if (edicao?.id == null || gravando) return;
    if (!confirmaExcluir) return setConfirmaExcluir(true);
    setGravando(true);
    try {
      await chamar(`/api/tarefas/etiquetas/${edicao.id}`, "DELETE");
      onChange(marcados.filter((x) => x !== edicao.id));
      toast.success(`Etiqueta “${edicao.nome}” excluída de todo o quadro.`);
      setEdicao(null);
      onMudouEtiquetas();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setGravando(false);
      setConfirmaExcluir(false);
    }
  };

  if (edicao)
    return (
      <div className="space-y-3 p-1">
        <p className="text-[13px] font-semibold text-text">{edicao.id == null ? "Criar etiqueta" : "Editar etiqueta"}</p>
        <div className="grid place-items-center rounded-control bg-surface-2 p-3">
          <ChipEtiqueta etiqueta={{ nome: edicao.nome || "Etiqueta", cor: edicao.cor }} />
        </div>
        <TextField label="Nome" value={edicao.nome} maxLength={30} autoFocus onChange={(e) => setEdicao({ ...edicao, nome: e.target.value })} onKeyDown={(e) => e.key === "Enter" && gravar()} />
        <fieldset>
          <legend className="mb-1 text-[12px] font-semibold text-muted">Cor</legend>
          <div className="grid grid-cols-5 gap-1.5">
            {PALETA_ETIQUETAS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Cor ${c}`}
                aria-pressed={edicao.cor === c}
                onClick={() => setEdicao({ ...edicao, cor: c })}
                className="h-8 rounded-[4px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                style={{ background: c, boxShadow: edicao.cor === c ? "0 0 0 2px var(--surface), 0 0 0 4px var(--text)" : undefined }}
              />
            ))}
          </div>
        </fieldset>
        {confirmaExcluir && <p className="text-[12.5px] text-muted">A etiqueta sai de todas as tarefas do quadro. Toque de novo para confirmar.</p>}
        <div className="flex flex-wrap justify-end gap-2">
          {edicao.id != null && (
            <Button
              variant="ghost"
              size="sm"
              className="mr-auto"
              disabled={gravando}
              style={{ color: "var(--danger)" }}
              icon={<IconTrash className="h-4 w-4" />}
              onClick={excluir}
            >
              {confirmaExcluir ? "Confirmar exclusão" : "Excluir"}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            disabled={gravando}
            onClick={() => {
              setConfirmaExcluir(false);
              setEdicao(null);
            }}
          >
            Voltar
          </Button>
          <Button size="sm" loading={gravando} disabled={!edicao.nome.trim()} onClick={gravar}>
            {edicao.id == null ? "Criar" : "Salvar"}
          </Button>
        </div>
      </div>
    );

  return (
    <div className="space-y-2 p-1">
      <p className="text-[13px] font-semibold text-text">Etiquetas</p>
      {etiquetas.length > 6 && <SearchField compacto value={busca} placeholder="Buscar etiquetas…" aria-label="Buscar etiquetas" onChange={(e) => setBusca(e.target.value)} onClear={() => setBusca("")} />}
      {!etiquetas.length && <p className="text-[12.5px] text-muted">O quadro ainda não tem etiquetas{podeEditar ? " — crie a primeira." : "."}</p>}
      <ul className="space-y-0.5">
        {visiveis.map((e) => (
          <li key={e.id} className="flex min-h-11 items-center gap-1 lg:min-h-9">
            <Checkbox
              checked={marcados.includes(e.id)}
              onChange={() => onChange(alternarValor(marcados, e.id))}
              label={
                <span className="block h-8 w-[12.5rem] max-w-full truncate rounded-control px-2 text-[12.5px] font-semibold leading-8" style={{ color: "var(--surface)", background: e.cor }}>
                  {e.nome}
                </span>
              }
            />
            {podeEditar && (
              <Button variant="ghost" size="xs" aria-label={`Editar a etiqueta ${e.nome}`} icon={<IconPencil className="h-3.5 w-3.5" />} onClick={() => setEdicao({ id: e.id, nome: e.nome, cor: e.cor })} />
            )}
          </li>
        ))}
      </ul>
      {!casa && lista.length > VISIVEIS && (
        <Button variant="ghost" size="sm" onClick={() => setMais((m) => !m)}>
          {mais ? "Mostrar menos" : `Mostrar mais ${lista.length - VISIVEIS}`}
        </Button>
      )}
      {podeEditar && (
        <Button variant="secondary" size="sm" className="w-full" icon={<IconPlus className="h-4 w-4" />} onClick={() => setEdicao({ id: null, nome: busca.trim(), cor: corEtiquetaSugerida(etiquetas.length) })}>
          Criar etiqueta
        </Button>
      )}
    </div>
  );
}
