"use client";

import { useMemo, useState } from "react";
import { brl, num } from "@/lib/format";
import { type AlvosVinculo, linhasVinculos, semVinculo, type UnidadeOrcamento, type VinculoOrcamento } from "@/lib/orcamento-vinculo";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { type AberturaVinculo, type DadosVinculo, EditorVinculoOrcamento } from "./EditorVinculoOrcamento";
import { IconChevronDown, IconPlus } from "./icons";
import { Modal } from "./Modal";

/** A unidade da LINHA do comparativo: a cadastrada (`id`) ou a linha "Sem vínculo" (`id` null). */
export type UnidadeDaLinha = { id: number | null; sigla: string; nome: string };

/** Um item do banner: um vínculo gravado, uma unidade do orçamento sem vínculo ou um vínculo NOVO (rascunho). */
type Item = { chave: string; titulo: string; resumo: string; pendentes: number; inicial: AberturaVinculo };

/**
 * Os VÍNCULOS de UMA linha do orçamento do PCA — UM banner só: cada unidade do orçamento ligada à unidade da linha é um
 * item que abre ali mesmo o editor (`EditorVinculoOrcamento fixo="alvo"`: a unidade CADASTRADA é a da linha e fica fixa;
 * as ações aparecem TODAS, marcadas e desmarcadas, com o destino de cada uma). "Adicionar unidade do orçamento" abre um
 * item novo em que se escolhe a unidade do orçamento. Na linha "Sem vínculo", os itens são as unidades do orçamento com
 * ações sem vínculo (`fixo="cubo"`: escolhe-se a unidade cadastrada). As ações sem vínculo ficam em destaque (âmbar).
 * Apresentacional: grava via `onCriar`/`onEditar`/`onExcluir` (a mesma gravação da aba Vínculos).
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
  const [aberto, setAberto] = useState<string | null>(null);
  const [novo, setNovo] = useState(false);
  const pendencias = useMemo(() => new Map(semVinculo(unidades, vinculos, alvos.unidades).map((p) => [p.unidade.chave, p])), [unidades, vinculos, alvos]);

  const itens = useMemo<Item[]>(() => {
    if (!unidade) return [];
    if (unidade.id == null)
      return [...pendencias.values()].map((p) => ({
        chave: `p:${p.unidade.chave}`,
        titulo: p.unidade.texto,
        resumo: `${p.vinculada ? `${num(p.acoes.length)} de ${num(p.unidade.acoes.length)} ações sem vínculo` : "Sem vínculo"} · ${brl(p.valorInicial)}`,
        pendentes: p.acoes.length,
        inicial: { chave: p.unidade.chave, alvoId: p.sugestaoId, acoes: p.vinculada ? p.acoes.map((a) => a.chave) : null },
      }));
    return linhasVinculos(unidades, vinculos)
      .filter((l) => l.vinculo.alvoId === unidade.id)
      .map((l) => ({
        chave: `v:${l.vinculo.id}`,
        titulo: l.unidade.texto,
        resumo: `${num(l.acoes.length)} de ${num(l.unidade.acoes.length)} ações · ${brl(l.valorInicial)}`,
        pendentes: pendencias.get(l.unidade.chave)?.acoes.length ?? 0,
        inicial: { id: l.vinculo.id, chave: l.vinculo.chave, alvoId: l.vinculo.alvoId, acoes: l.vinculo.acoes, acoesFora: l.vinculo.acoesFora },
      }));
  }, [unidade, unidades, vinculos, pendencias]);

  const fechar = () => {
    setAberto(null);
    setNovo(false);
    onFechar();
  };
  const salvar = async (inicial: AberturaVinculo, d: DadosVinculo) => {
    const ok = inicial.id != null ? await onEditar(inicial.id, d) : await onCriar([d]);
    if (ok) {
      setAberto(null);
      setNovo(false);
    }
  };

  const editor = (inicial: AberturaVinculo, chave: string, fecharItem: () => void) => (
    <EditorVinculoOrcamento
      key={chave}
      unidades={unidades}
      vinculos={vinculos}
      alvos={alvos}
      inicial={inicial}
      fixo={unidade?.id != null ? "alvo" : "cubo"}
      salvando={salvando}
      erro={erro}
      onSalvar={(d) => void salvar(inicial, d)}
      onExcluir={inicial.id != null ? () => void onExcluir(inicial.id as number).then((ok) => ok && setAberto(null)) : undefined}
      onFechar={fecharItem}
    />
  );

  const titulo = !unidade ? "Vínculos" : unidade.id == null ? "Ações sem vínculo" : `Vínculos · ${unidade.sigla}`;
  return (
    <Modal open={unidade != null} onClose={fechar} titulo={titulo} size="lg" bloqueado={salvando}>
      {unidade && (
        <div className="space-y-[var(--gap-block)]">
          {unidade.id != null && unidade.nome && <p className="text-sm text-muted">{unidade.nome} — as unidades do orçamento que trazem dotação a ela.</p>}
          {itens.length === 0 && !novo && (
            <Callout kind="info">
              {unidade.id == null ? "Todas as ações do orçamento deste ano estão vinculadas." : "Nenhuma unidade do orçamento está vinculada a esta unidade neste ano."}
            </Callout>
          )}
          {itens.length > 0 && (
            <ul className="divide-y divide-border overflow-hidden rounded-card border border-border">
              {itens.map((it) => {
                const aberta = aberto === it.chave;
                return (
                  <li key={it.chave}>
                    <button
                      type="button"
                      aria-expanded={aberta}
                      disabled={salvando}
                      onClick={() => setAberto(aberta ? null : it.chave)}
                      className="flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-text" title={it.titulo}>
                          {it.titulo}
                        </span>
                        <span className="block text-xs text-muted">{it.resumo}</span>
                      </span>
                      {it.pendentes > 0 && <Badge tone="amber">{num(it.pendentes)} sem vínculo</Badge>}
                      <IconChevronDown className={`h-4 w-4 shrink-0 text-muted transition-transform ${aberta ? "rotate-180" : ""}`} />
                    </button>
                    {aberta && <div className="border-t border-border bg-surface-2/40 px-3 py-3">{editor(it.inicial, it.chave, () => setAberto(null))}</div>}
                  </li>
                );
              })}
            </ul>
          )}
          {unidade.id != null &&
            (novo ? (
              <div className="rounded-card border border-accent/40 px-3 py-3">
                <p className="mb-2 text-sm font-semibold text-text">Adicionar unidade do orçamento a {unidade.sigla}</p>
                {editor({ alvoId: unidade.id }, "novo", () => setNovo(false))}
              </div>
            ) : (
              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<IconPlus className="h-4 w-4" />}
                  disabled={salvando}
                  onClick={() => {
                    setAberto(null);
                    setNovo(true);
                  }}
                >
                  Adicionar unidade do orçamento
                </Button>
              </div>
            ))}
        </div>
      )}
    </Modal>
  );
}
