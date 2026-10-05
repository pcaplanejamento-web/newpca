"use client";

import { useMemo, useState } from "react";
import { brl, num } from "@/lib/format";
import { type AlvosVinculo, type LinhaVinculo, linhasVinculos, semVinculo, type UnidadeOrcamento, type VinculoOrcamento } from "@/lib/orcamento-vinculo";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { type AberturaVinculo, type DadosVinculo, EditorVinculoOrcamento } from "./EditorVinculoOrcamento";
import { IconLink, IconPencil, IconPlus } from "./icons";
import { Modal } from "./Modal";

/** A unidade da LINHA do comparativo: a cadastrada (`id`) ou a linha "Sem vínculo" (`id` null). */
export type UnidadeDaLinha = { id: number | null; sigla: string; nome: string };

const textoAcoes = (l: LinhaVinculo) =>
  l.vinculo.acoes == null
    ? l.vinculo.acoesFora.length > 0
      ? `As demais, menos ${num(l.vinculo.acoesFora.length)}`
      : "Todas as demais"
    : `${num(l.acoes.length)} ${l.acoes.length === 1 ? "ação" : "ações"}`;

const abertura = (v: VinculoOrcamento): AberturaVinculo => ({ id: v.id, chave: v.chave, alvoId: v.alvoId, acoes: v.acoes, acoesFora: v.acoesFora });

/**
 * Os VÍNCULOS de UMA linha do orçamento do PCA (o lápis da linha): na unidade cadastrada, os vínculos que trazem orçamento
 * a ela (a unidade do CUBO, as ações e a dotação no orçamento do ano — sem a visão) + "Novo vínculo" já com a unidade; na
 * linha "Sem vínculo", as unidades do CUBO com ações sem vínculo + "Vincular". Tocar edita no MESMO editor da aba
 * Vínculos (`EditorVinculoOrcamento`, a mesma regra). Apresentacional: grava via `onCriar`/`onEditar`/`onExcluir`.
 */
export function VinculosDaUnidade({
  unidade,
  unidades,
  vinculos,
  alvos,
  salvando = false,
  erro = null,
  onCriar,
  onEditar,
  onExcluir,
  onFechar,
}: {
  /** A linha aberta (`null` = fechado). */
  unidade: UnidadeDaLinha | null;
  /** As unidades do CUBO do orçamento do ano (`unidadesDoOrcamento`). */
  unidades: UnidadeOrcamento[];
  vinculos: VinculoOrcamento[];
  alvos: AlvosVinculo;
  salvando?: boolean;
  erro?: string | null;
  onCriar: (lista: DadosVinculo[]) => Promise<boolean>;
  onEditar: (id: number, dados: DadosVinculo) => Promise<boolean>;
  onExcluir: (id: number) => Promise<boolean>;
  onFechar: () => void;
}) {
  const [aberto, setAberto] = useState<AberturaVinculo | null>(null);
  const linhas = useMemo(
    () => (unidade?.id != null ? linhasVinculos(unidades, vinculos).filter((l) => l.vinculo.alvoId === unidade.id) : []),
    [unidade, unidades, vinculos],
  );
  const pendencias = useMemo(() => (unidade && unidade.id == null ? semVinculo(unidades, vinculos, alvos.unidades) : []), [unidade, unidades, vinculos, alvos]);

  const fechar = () => {
    setAberto(null);
    onFechar();
  };
  const salvar = async (d: DadosVinculo) => {
    const ok = aberto?.id != null ? await onEditar(aberto.id, d) : await onCriar([d]);
    if (ok) setAberto(null);
  };

  const titulo = !unidade
    ? "Vínculos"
    : aberto
      ? aberto.id != null
        ? `Editar vínculo · ${unidade.sigla}`
        : `Novo vínculo · ${unidade.sigla}`
      : unidade.id == null
        ? "Sem vínculo"
        : `Vínculos · ${unidade.sigla}`;

  return (
    <Modal open={unidade != null} onClose={aberto && !salvando ? () => setAberto(null) : fechar} titulo={titulo} size="lg" bloqueado={salvando}>
      {unidade &&
        (aberto ? (
          <EditorVinculoOrcamento
            key={`${aberto.id ?? "novo"}:${aberto.chave ?? ""}`}
            unidades={unidades}
            vinculos={vinculos}
            alvos={alvos}
            inicial={aberto}
            salvando={salvando}
            erro={erro}
            onSalvar={(d) => void salvar(d)}
            onExcluir={aberto.id != null ? () => void onExcluir(aberto.id as number).then((ok) => ok && setAberto(null)) : undefined}
            onFechar={() => setAberto(null)}
            onAbrirVinculo={(v) => setAberto(abertura(v))}
          />
        ) : (
          <div className="space-y-[var(--gap-block)]">
            {unidade.id != null && <p className="text-sm text-muted">{unidade.nome}</p>}
            {unidade.id != null ? (
              linhas.length === 0 ? (
                <Callout kind="info">Nenhum vínculo traz orçamento a esta unidade neste ano.</Callout>
              ) : (
                <ul className="divide-y divide-border overflow-hidden rounded-card border border-border">
                  {linhas.map((l) => (
                    <li key={l.vinculo.id}>
                      <button
                        type="button"
                        onClick={() => setAberto(abertura(l.vinculo))}
                        className="flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium text-text" title={l.unidade.texto}>
                            {l.unidade.texto}
                          </span>
                          <span className="block text-xs text-muted">
                            {num(l.lancamentos)} lançamento(s) · {brl(l.valorInicial)}
                          </span>
                        </span>
                        <Badge tone={l.vinculo.acoes == null ? "blue" : "violet"}>{textoAcoes(l)}</Badge>
                        <IconPencil className="h-4 w-4 shrink-0 text-muted" />
                      </button>
                    </li>
                  ))}
                </ul>
              )
            ) : pendencias.length === 0 ? (
              <Callout kind="info">Todas as ações do orçamento deste ano estão vinculadas.</Callout>
            ) : (
              <ul className="divide-y divide-border overflow-hidden rounded-card border border-border">
                {pendencias.map((p) => (
                  <li key={p.unidade.chave} className="flex min-h-11 items-center gap-3 px-3 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-text" title={p.unidade.texto}>
                        {p.unidade.texto}
                      </span>
                      <span className="block text-xs text-muted">
                        {p.vinculada ? `${num(p.acoes.length)} de ${num(p.unidade.acoes.length)} ações sem vínculo` : "Sem vínculo"} · {brl(p.valorInicial)}
                      </span>
                    </span>
                    <Button
                      size="xs"
                      variant="secondary"
                      icon={<IconLink className="h-4 w-4" />}
                      onClick={() => setAberto({ chave: p.unidade.chave, alvoId: p.sugestaoId, acoes: p.vinculada ? p.acoes.map((a) => a.chave) : null })}
                    >
                      Vincular
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            {unidade.id != null && (
              <div className="flex justify-end">
                <Button size="sm" variant="secondary" icon={<IconPlus className="h-4 w-4" />} onClick={() => setAberto({ alvoId: unidade.id })}>
                  Novo vínculo para {unidade.sigla}
                </Button>
              </div>
            )}
          </div>
        ))}
    </Modal>
  );
}
