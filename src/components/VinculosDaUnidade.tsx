"use client";

import { type ReactNode, useMemo, useState } from "react";
import { brl, dataIsoBrasilia, num } from "@/lib/format";
import type { AlvosVinculo, UnidadeOrcamento, VinculoOrcamento } from "@/lib/orcamento-vinculo";
import { blocosVinculosDaLinha, vinculosDaLinha } from "@/lib/vinculos-unidade";
import { Badge } from "./Badge";
import { BotaoAcao } from "./BotaoAcao";
import { Button } from "./Button";
import { useQuemExporta } from "./ConfigTabelas";
import { type AberturaVinculo, type DadosVinculo, EditorVinculoOrcamento } from "./EditorVinculoOrcamento";
import { usePodeExportar } from "./ExportarTabelas";
import { IconChevronDown, IconFile, IconPlus } from "./icons";
import { Modal } from "./Modal";
import { StatMini } from "./StatMini";
import { toast } from "./Toast";

/** A unidade da LINHA do comparativo: a cadastrada (`id`) ou a linha "Sem vínculo" (`id` null). */
export type UnidadeDaLinha = { id: number | null; sigla: string; nome: string };

/** Um item que abre o editor ali mesmo (acordeão). */
function ItemAcordeao({
  aberto,
  onAlternar,
  disabled,
  titulo,
  resumo,
  extra,
  children,
}: {
  aberto: boolean;
  onAlternar: () => void;
  disabled?: boolean;
  titulo: string;
  resumo: ReactNode;
  extra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <li>
      <button
        type="button"
        aria-expanded={aberto}
        disabled={disabled}
        onClick={onAlternar}
        className="flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-medium text-text" title={titulo}>
            {titulo}
          </span>
          <span className="block text-xs text-muted">{resumo}</span>
        </span>
        {extra}
        <IconChevronDown className={`h-4 w-4 shrink-0 text-muted transition-transform duration-[var(--motion-duration)] ${aberto ? "rotate-180" : ""}`} />
      </button>
      {aberto && <div className="border-t border-border bg-surface-2 px-3 py-3">{children}</div>}
    </li>
  );
}

/** Cabeçalho de uma seção do banner: título + contagem + ação opcional à direita. */
function TituloSecao({ titulo, contagem, acao }: { titulo: string; contagem: string; acao?: ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-2 lg:min-h-[var(--h-control-sm)]">
      <h3 className="text-[13px] font-semibold text-text">
        {titulo} <span className="font-normal text-muted">({contagem})</span>
      </h3>
      {acao}
    </div>
  );
}

/**
 * Os VÍNCULOS de UMA linha do orçamento do PCA — UM banner: no topo o resumo (unidades do orçamento, dotação vinculada, sem
 * vínculo); a seção **Unidades do orçamento** (as ligadas à unidade da linha — cada uma abre ali o editor com a unidade
 * CADASTRADA FIXA, `fixo="alvo"`, e TODAS as ações com o destino) + "Adicionar"; a seção **Sem vínculo**, SEPARADA (as
 * ações que nenhum vínculo leva, por unidade do orçamento, em âmbar — tocar abre o editor para vinculá-las). Na linha "Sem
 * vínculo" do comparativo, só a seção Sem vínculo de TODO o orçamento (`fixo="cubo"`, a sugestão pré-escolhida). O PDF
 * (cabeçalho, com a ação Exportar) traz o mesmo conteúdo. Núcleo puro: `vinculos-unidade.ts`. Grava via
 * `onCriar`/`onEditar`/`onExcluir` (a mesma gravação da aba Vínculos).
 */
export function VinculosDaUnidade({
  unidade,
  unidades,
  vinculos,
  alvos,
  orcamento,
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
  /** "Nome (ano)" do orçamento — o subtítulo do PDF. */
  orcamento: string;
  salvando?: boolean;
  erro?: string | null;
  onCriar: (lista: DadosVinculo[]) => Promise<boolean>;
  onEditar: (id: number, dados: DadosVinculo) => Promise<boolean>;
  onExcluir: (id: number) => Promise<boolean>;
  onFechar: () => void;
}) {
  const [aberto, setAberto] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);
  const podeExportar = usePodeExportar();
  const quem = useQuemExporta();
  const alvoId = unidade?.id ?? null;
  const v = useMemo(() => vinculosDaLinha(unidades, vinculos, alvoId, alvos.unidades), [unidades, vinculos, alvoId, alvos]);
  const siglaDe = (id: number) => alvos.unidades.find((u) => u.id === id)?.sigla ?? `#${id}`;
  const titulo = !unidade ? "Vínculos" : unidade.id == null ? "Ações sem vínculo" : `Vínculos · ${unidade.sigla}`;

  const fechar = () => {
    setAberto(null);
    onFechar();
  };
  const salvar = async (inicial: AberturaVinculo, d: DadosVinculo) => {
    const ok = inicial.id != null ? await onEditar(inicial.id, d) : await onCriar([d]);
    if (ok) setAberto(null);
  };
  const alternar = (k: string) => setAberto((a) => (a === k ? null : k));
  const editor = (inicial: AberturaVinculo, k: string) => (
    <EditorVinculoOrcamento
      key={k}
      unidades={unidades}
      vinculos={vinculos}
      alvos={alvos}
      inicial={inicial}
      fixo={alvoId != null ? "alvo" : "cubo"}
      salvando={salvando}
      erro={erro}
      onSalvar={(d) => void salvar(inicial, d)}
      onExcluir={inicial.id != null ? () => void onExcluir(inicial.id as number).then((ok) => ok && setAberto(null)) : undefined}
      onFechar={() => setAberto(null)}
    />
  );
  const abertura = (vin: VinculoOrcamento): AberturaVinculo => ({ id: vin.id, chave: vin.chave, alvoId: vin.alvoId, acoes: vin.acoes, acoesFora: vin.acoesFora });

  async function baixarPdf() {
    if (!unidade || gerando) return;
    setGerando(true);
    try {
      const [{ baixarDocumentoPdf }, { nomeArquivoPdf }] = await Promise.all([import("@/lib/documento-pdf"), import("@/lib/exportar-pdf-core")]);
      await baixarDocumentoPdf(
        nomeArquivoPdf(titulo.replace(" · ", " - "), dataIsoBrasilia(new Date().toISOString())),
        { titulo, blocos: blocosVinculosDaLinha({ titulo, nome: unidade.id != null ? unidade.nome : "", anoOrcamento: orcamento }, v, siglaDe) },
        { usuario: quem },
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar o PDF.");
    } finally {
      setGerando(false);
    }
  }

  return (
    <Modal
      open={unidade != null}
      onClose={fechar}
      titulo={titulo}
      size="lg"
      bloqueado={salvando}
      acoesCabecalho={
        podeExportar && unidade ? <BotaoAcao rotulo="Baixar PDF dos vínculos" icon={<IconFile className="h-4 w-4" />} loading={gerando} onClick={() => void baixarPdf()} /> : undefined
      }
    >
      {unidade && (
        <div className="space-y-[var(--gap-block)]">
          {unidade.id != null && unidade.nome && <p className="text-sm text-muted">{unidade.nome}</p>}
          <div className="grid grid-cols-1 gap-[var(--gap-block)] sm:grid-cols-3">
            {unidade.id != null && (
              <>
                <StatMini label="Unidades do orçamento" value={num(v.ligadas.length)} hint={orcamento} />
                <StatMini label="Dotação vinculada" value={brl(v.valorVinculado)} tone="accent" hint="sem o filtro da visão" />
              </>
            )}
            <StatMini
              label="Sem vínculo"
              value={brl(v.valorSemVinculo)}
              tone={v.acoesSemVinculo > 0 ? "warn" : "ok"}
              hint={`${num(v.acoesSemVinculo)} ação(ões)`}
              className={unidade.id == null ? "sm:col-span-3" : ""}
            />
          </div>

          {unidade.id != null && (
            <section className="space-y-2">
              <TituloSecao
                titulo="Unidades do orçamento"
                contagem={num(v.ligadas.length)}
                acao={
                  <Button size="sm" variant="ghost" icon={<IconPlus className="h-4 w-4" />} disabled={salvando} onClick={() => alternar("novo")}>
                    Adicionar
                  </Button>
                }
              />
              {aberto === "novo" && <div className="rounded-card border border-border bg-surface-2 px-3 py-3">{editor({ alvoId: unidade.id }, "novo")}</div>}
              {v.ligadas.length === 0 ? (
                <p className="rounded-card border border-dashed border-border-2 px-3 py-4 text-center text-sm text-muted">
                  Nenhuma unidade do orçamento traz dotação a {unidade.sigla} — use “Adicionar”.
                </p>
              ) : (
                <ul className="divide-y divide-border overflow-hidden rounded-card border border-border">
                  {v.ligadas.map((l) => {
                    const k = `v:${l.vinculo.id}`;
                    const deste = l.acoes.filter((a) => a.alvoId === unidade.id).length;
                    const sem = l.acoes.filter((a) => a.alvoId == null).length;
                    return (
                      <ItemAcordeao
                        key={k}
                        aberto={aberto === k}
                        onAlternar={() => alternar(k)}
                        disabled={salvando}
                        titulo={l.unidade.texto}
                        resumo={`${num(deste)} de ${num(l.acoes.length)} ações · ${brl(l.valor)}`}
                        extra={sem > 0 ? <Badge tone="amber">{num(sem)} sem vínculo</Badge> : undefined}
                      >
                        {editor(abertura(l.vinculo), k)}
                      </ItemAcordeao>
                    );
                  })}
                </ul>
              )}
            </section>
          )}

          <section className="space-y-2">
            <TituloSecao titulo="Sem vínculo" contagem={`${num(v.acoesSemVinculo)} ${v.acoesSemVinculo === 1 ? "ação" : "ações"}`} />
            {v.semVinculo.length === 0 ? (
              <p className="rounded-card border border-dashed border-border-2 px-3 py-4 text-center text-sm text-muted">
                {unidade.id == null ? "Todas as ações do orçamento estão vinculadas." : "Todas as ações destas unidades do orçamento estão vinculadas."}
              </p>
            ) : (
              <ul className="divide-y divide-border overflow-hidden rounded-card border border-border">
                {v.semVinculo.map((p) => {
                  const k = `s:${p.unidade.chave}`;
                  // Na unidade cadastrada, vincular = marcar no vínculo dela com esta unidade do orçamento.
                  const ligada = unidade.id != null ? v.ligadas.find((l) => l.unidade.chave === p.unidade.chave) : undefined;
                  const inicial: AberturaVinculo = ligada
                    ? abertura(ligada.vinculo)
                    : { chave: p.unidade.chave, alvoId: p.sugestaoId, acoes: p.vinculada ? p.acoes.map((a) => a.chave) : null };
                  return (
                    <ItemAcordeao
                      key={k}
                      aberto={aberto === k}
                      onAlternar={() => alternar(k)}
                      disabled={salvando}
                      titulo={p.unidade.texto}
                      resumo={
                        <span className="line-clamp-2" style={{ color: "var(--warn)" }} title={p.acoes.map((a) => a.texto).join("\n")}>
                          {p.acoes.map((a) => a.texto).join(" · ")}
                        </span>
                      }
                      extra={<span className="shrink-0 text-[12.5px] font-semibold tabular-nums text-text-2">{brl(p.valor)}</span>}
                    >
                      {editor(inicial, k)}
                    </ItemAcordeao>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}
    </Modal>
  );
}
