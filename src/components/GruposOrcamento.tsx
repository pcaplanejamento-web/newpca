"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { type GrupoOrcamento, motivoGruposInvalidos, sugerirGrupos } from "@/lib/orcamento-grupos";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { TextField } from "./Field";
import { IconPlus, IconTrash } from "./icons";
import { Modal } from "./Modal";
import { SeletorMultiplo } from "./SeletorMultiplo";
import { toast } from "./Toast";

/**
 * O editor dos GRUPOS ORÇAMENTÁRIOS (Configurar no Orçamento): unidades cadastradas que COMPARTILHAM o orçamento (ex.: a
 * Secretaria e o Fundo da Cultura) viram UMA linha no "Ver por Grupo" do PCA × Orçamento. Cada unidade em um grupo; as
 * SUGESTÕES vêm dos vínculos (unidades que recebem ações da mesma unidade do orçamento). Grava a lista inteira.
 */
export function GruposOrcamento({
  aberto,
  onFechar,
  grupos: inicial,
  unidades,
  vinculos,
}: {
  aberto: boolean;
  onFechar: () => void;
  grupos: GrupoOrcamento[];
  unidades: { id: number; sigla: string; nome: string }[];
  vinculos: { chave: string; alvoId: number }[];
}) {
  const router = useRouter();
  const [grupos, setGrupos] = useState(inicial);
  const [salvando, setSalvando] = useState(false);
  const sigla = useMemo(() => new Map(unidades.map((u) => [u.id, u.sigla])), [unidades]);
  const ids = useMemo(() => new Set(unidades.map((u) => u.id)), [unidades]);
  const motivo = motivoGruposInvalidos(grupos, ids);
  const sugestoes = sugerirGrupos(vinculos, grupos);
  const proximoId = () => Math.max(0, ...grupos.map((g) => g.id)) + 1;
  const mudar = (id: number, p: Partial<GrupoOrcamento>) => setGrupos((gs) => gs.map((g) => (g.id === id ? { ...g, ...p } : g)));
  // Uma unidade em UM grupo: as de outro grupo ficam fora das opções deste.
  const opcoes = (g: GrupoOrcamento) => {
    const emOutro = new Set(grupos.filter((x) => x.id !== g.id).flatMap((x) => x.unidades));
    return unidades.filter((u) => !emOutro.has(u.id)).map((u) => ({ valor: String(u.id), rotulo: `${u.sigla} — ${u.nome}` }));
  };

  async function salvar() {
    if (motivo || salvando) return;
    setSalvando(true);
    try {
      const r = await fetch("/api/orcamento/grupos", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ grupos }) });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Não foi possível salvar os grupos.");
      toast.success("Grupos orçamentários salvos.");
      onFechar();
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar os grupos.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      open={aberto}
      onClose={onFechar}
      titulo="Grupos orçamentários"
      size="lg"
      bloqueado={salvando}
      rodape={
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary" icon={<IconPlus className="h-4 w-4" />} onClick={() => setGrupos((gs) => [...gs, { id: proximoId(), nome: "", unidades: [] }])}>
            Novo grupo
          </Button>
          <Button size="sm" variant="primary" className="ml-auto" loading={salvando} disabled={!!motivo} title={motivo ?? undefined} onClick={() => void salvar()}>
            Salvar
          </Button>
        </div>
      }
    >
      <div className="space-y-[var(--gap-block)]">
        <p className="text-[13px] text-muted">
          Unidades que compartilham o mesmo orçamento (ex.: a Secretaria e o Fundo) somam numa linha só no “Ver por Grupo”. Cada unidade fica em um grupo.
        </p>
        {sugestoes.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] text-muted">Sugestões pelos vínculos:</span>
            {sugestoes.map((us) => (
              <Button
                key={us.join(",")}
                size="xs"
                variant="secondary"
                icon={<IconPlus className="h-3.5 w-3.5" />}
                onClick={() => setGrupos((gs) => [...gs, { id: proximoId(), nome: us.map((u) => sigla.get(u) ?? u).join(" + "), unidades: us }])}
              >
                {us.map((u) => sigla.get(u) ?? u).join(" + ")}
              </Button>
            ))}
          </div>
        )}
        {grupos.length === 0 && <p className="py-6 text-center text-sm text-muted">Nenhum grupo. Use “Novo grupo” ou uma sugestão.</p>}
        {grupos.map((g) => (
          <div key={g.id} className="grid items-end gap-2 rounded-card border border-border p-[var(--pad-card)] sm:grid-cols-[1fr_1.4fr_auto]">
            <TextField label="Nome do grupo" value={g.nome} maxLength={80} onChange={(e) => mudar(g.id, { nome: e.target.value })} />
            <SeletorMultiplo
              rotulo="Unidades"
              suspenso
              textoVazio="Nenhuma"
              opcoes={opcoes(g)}
              selecionados={g.unidades.map(String)}
              onChange={(vs) => mudar(g.id, { unidades: vs.map(Number) })}
            />
            <Button size="sm" variant="icon" aria-label={`Excluir o grupo ${g.nome}`} icon={<IconTrash className="h-4 w-4" />} onClick={() => setGrupos((gs) => gs.filter((x) => x.id !== g.id))} />
          </div>
        ))}
        {motivo && grupos.length > 0 && <Callout kind="warn">{motivo}</Callout>}
      </div>
    </Modal>
  );
}
