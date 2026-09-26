"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { type FeriadoCadastro, feriadosNacionais, ROTULO_TIPO_FERIADO, TIPOS_FERIADO, type TipoFeriado } from "@/lib/calendario-core";
import { dataBR, dataIsoBrasilia } from "@/lib/format";
import { chamarPadronizacao as chamar } from "@/lib/padronizacao-cliente";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { useConfirmacao } from "./Confirmacao";
import { type Column, DataTable } from "./DataTable";
import { ErroCarga } from "./ErroCarga";
import { SelectField, TextField } from "./Field";
import { IconPencil, IconPlus, IconTrash } from "./icons";
import { Modal } from "./Modal";
import { SkeletonLinhas } from "./Skeleton";
import { Switch } from "./Switch";
import { toast } from "./Toast";

type Rascunho = { id: number | null; data: string; nome: string; tipo: TipoFeriado; anual: boolean };
const TOM: Record<TipoFeriado, "red" | "amber" | "blue" | "slate"> = { nacional: "red", estadual: "blue", municipal: "amber", facultativo: "slate" };

/**
 * FERIADOS (Configurações → Feriados, migração `0047`): os feriados e pontos facultativos que o CALENDÁRIO sombreia e que o
 * aviso de prazo considera. Os NACIONAIS (fixos + os móveis pela Páscoa — Carnaval, Sexta-feira Santa, Corpus Christi) são
 * calculados sozinhos (a lista do ano, só leitura); aqui o ADM cadastra os ESTADUAIS, MUNICIPAIS e pontos facultativos —
 * "todo ano" repete o dia/mês. Só componentes do design-system.
 */
export function FeriadosAdmin() {
  const [lista, setLista] = useState<FeriadoCadastro[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [r, setR] = useState<Rascunho | null>(null);
  const [salvando, setSalvando] = useState(false);
  const { confirmar, confirmacao } = useConfirmacao();
  const ano = Number(dataIsoBrasilia(new Date().toISOString()).slice(0, 4));
  const nacionais = useMemo(() => feriadosNacionais(ano), [ano]);

  const carregar = useCallback(async () => {
    try {
      const j = await chamar<{ feriados: FeriadoCadastro[] }>("/api/admin/feriados");
      setLista(j.feriados);
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
      setLista((l) => l ?? []);
    }
  }, []);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  const salvar = async () => {
    if (!r) return;
    setSalvando(true);
    try {
      const corpo = { data: r.data, nome: r.nome.trim(), tipo: r.tipo, anual: r.anual };
      if (r.id) await chamar(`/api/admin/feriados/${r.id}`, "PATCH", corpo);
      else await chamar("/api/admin/feriados", "POST", corpo);
      toast.success(r.id ? "Feriado atualizado." : "Feriado cadastrado.");
      setR(null);
      await carregar();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSalvando(false);
    }
  };
  const excluir = async (f: FeriadoCadastro) => {
    if (!(await confirmar({ titulo: `Excluir o feriado "${f.nome}"?`, confirmar: "Excluir", perigo: true }))) return;
    try {
      await chamar(`/api/admin/feriados/${f.id}`, "DELETE");
      toast.success("Feriado excluído.");
      await carregar();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  if (lista === null) return <SkeletonLinhas linhas={4} />;
  const valido = r != null && /^\d{4}-\d{2}-\d{2}$/.test(r.data) && r.nome.trim().length > 0;
  const cols: Column<FeriadoCadastro>[] = [
    { key: "data", header: "Data", nowrap: true, value: (f) => f.data, render: (f) => <span className="tabular-nums">{f.anual ? `${dataBR(f.data).slice(0, 5)} (todo ano)` : dataBR(f.data)}</span> },
    { key: "nome", header: "Feriado", align: "left", minWidth: 200, value: (f) => f.nome, render: (f) => f.nome },
    { key: "tipo", header: "Tipo", nowrap: true, value: (f) => ROTULO_TIPO_FERIADO[f.tipo], render: (f) => <Badge tone={TOM[f.tipo]}>{ROTULO_TIPO_FERIADO[f.tipo]}</Badge> },
    {
      key: "acoes",
      header: "",
      filter: "none",
      align: "right",
      nowrap: true,
      render: (f) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="xs" aria-label={`Editar ${f.nome}`} icon={<IconPencil className="h-4 w-4" />} onClick={() => setR({ ...f })} />
          <Button variant="ghost" size="xs" aria-label={`Excluir ${f.nome}`} style={{ color: "var(--danger)" }} icon={<IconTrash className="h-4 w-4" />} onClick={() => excluir(f)} />
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-[var(--gap-block)]">
      {erro && <ErroCarga msg={erro} onTentar={() => void carregar()} kind={lista.length ? "warn" : "danger"} />}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted">
          Os feriados estaduais, municipais e pontos facultativos que o <strong className="text-text-2">Calendário</strong> mostra e que o aviso de prazo em dia
          não útil considera. Os nacionais são calculados sozinhos.
        </p>
        <Button icon={<IconPlus className="h-4 w-4" />} onClick={() => setR({ id: null, data: "", nome: "", tipo: "municipal", anual: true })}>
          Novo feriado
        </Button>
      </div>
      {lista.length === 0 ? (
        <p className="rounded-card border border-border bg-surface p-6 text-center text-sm text-muted">Nenhum feriado cadastrado — o calendário usa só os nacionais.</p>
      ) : (
        <DataTable columns={cols} rows={lista} getKey={(f) => f.id} pageSize={20} density="compact" resumo={(l) => `${l.length} feriado${l.length === 1 ? "" : "s"}`} />
      )}
      <details className="rounded-card border border-border bg-surface p-3">
        <summary className="min-h-11 cursor-pointer content-center text-[13px] font-semibold text-text-2 lg:min-h-0">Nacionais de {ano} (calculados)</summary>
        <ul className="mt-2 grid gap-1 text-[13px] sm:grid-cols-2">
          {nacionais.map((f) => (
            <li key={`${f.data}${f.nome}`} className="flex items-center gap-2">
              <span className="w-12 shrink-0 tabular-nums text-muted">{dataBR(f.data).slice(0, 5)}</span>
              <span className="min-w-0 flex-1 truncate text-text">{f.nome}</span>
              <Badge tone={TOM[f.tipo]}>{ROTULO_TIPO_FERIADO[f.tipo]}</Badge>
            </li>
          ))}
        </ul>
      </details>

      <Modal
        open={r !== null}
        onClose={() => !salvando && setR(null)}
        titulo={r?.id ? "Editar feriado" : "Novo feriado"}
        size="md"
        bloqueado={salvando}
        rodape={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" disabled={salvando} onClick={() => setR(null)}>
              Cancelar
            </Button>
            <Button loading={salvando} disabled={!valido} onClick={salvar}>
              {r?.id ? "Salvar" : "Cadastrar"}
            </Button>
          </div>
        }
      >
        {r && (
          <div className="space-y-[var(--gap-block)]">
            <TextField label="Nome" value={r.nome} maxLength={80} placeholder="Ex.: Aniversário de Rio Verde" onChange={(e) => setR({ ...r, nome: e.target.value })} />
            <TextField label="Data" type="date" value={r.data} onChange={(e) => setR({ ...r, data: e.target.value })} />
            <SelectField label="Tipo" value={r.tipo} onChange={(e) => setR({ ...r, tipo: e.target.value as TipoFeriado })}>
              {TIPOS_FERIADO.map((t) => (
                <option key={t} value={t}>
                  {ROTULO_TIPO_FERIADO[t]}
                </option>
              ))}
            </SelectField>
            <Switch checked={r.anual} onChange={(v) => setR({ ...r, anual: v })} label="Repete todo ano (mesmo dia e mês)" />
          </div>
        )}
      </Modal>
      {confirmacao}
    </div>
  );
}
