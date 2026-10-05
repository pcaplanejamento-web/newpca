"use client";

import { useMemo, useState } from "react";
import { brl, num } from "@/lib/format";
import {
  type AlvosVinculo,
  type AlvoVinculo,
  conflitoVinculo,
  semVinculo,
  type UnidadeOrcamento,
  type VinculoOrcamento,
} from "@/lib/orcamento-vinculo";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { Checkbox, SelectField } from "./Field";
import { IconTrash } from "./icons";

/** O que o editor grava: a unidade do CUBO (texto), a cadastrada e as ações (lista ou as DEMAIS menos as de fora). */
export type DadosVinculo = { texto: string; alvoId: number; acoes: string[] | null; acoesFora: string[] };

/** O vínculo aberto no editor: `id` = editar um gravado; sem ele, criar (opcionalmente já com a unidade do CUBO). */
export type AberturaVinculo = { id?: number; chave?: string; alvoId?: number | null; acoes?: string[] | null; acoesFora?: string[] };

/**
 * "SIGLA — Nome (ÓRGÃO)" de uma unidade cadastrada — o órgão entra quando a sigla se repete entre unidades (ex.: a
 * unidade própria de um órgão dual): nunca duas opções iguais.
 */
export function useRotuloUnidade(alvos: AlvosVinculo) {
  return useMemo(() => {
    const conta = new Map<string, number>();
    for (const u of alvos.unidades) conta.set(u.sigla.trim().toUpperCase(), (conta.get(u.sigla.trim().toUpperCase()) ?? 0) + 1);
    const orgao = new Map(alvos.orgaos.map((o) => [o.id, o]));
    const porId = new Map(alvos.unidades.map((u) => [u.id, u]));
    const texto = (a: AlvoVinculo) => {
      const o = (conta.get(a.sigla.trim().toUpperCase()) ?? 0) > 1 && a.orgaoId != null ? orgao.get(a.orgaoId) : undefined;
      return `${a.sigla} — ${a.nome}${o ? ` (${o.sigla || o.nome})` : ""}`;
    };
    return { texto, deId: (id: number | null | undefined) => (id != null && porId.get(id) ? texto(porId.get(id) as AlvoVinculo) : "") };
  }, [alvos]);
}

/**
 * EDITOR de UM vínculo do orçamento (o MESMO na aba Vínculos do orçamento e no banner da linha do PCA): a unidade do
 * orçamento e a unidade cadastrada — o lado da TELA em que se está fica fixo (`fixo`: no Orçamento a do orçamento; no PCA a
 * cadastrada) — e TODAS as ações da unidade do orçamento, marcadas e desmarcadas, cada uma com o destino: marcada = este
 * vínculo; de outro vínculo = "vai para SIGLA" (travada); desmarcada = vai ao vínculo "as demais" de outra unidade, senão
 * fica SEM VÍNCULO (âmbar). "Incluir as demais ações" (as que vierem depois também entram; um por unidade do orçamento). A
 * REGRA (`conflitoVinculo`) aparece na hora e trava o Salvar. Apresentacional: grava via `onSalvar`/`onExcluir`.
 */
export function EditorVinculoOrcamento({
  unidades,
  vinculos,
  alvos,
  inicial,
  salvando = false,
  erro,
  onSalvar,
  onExcluir,
  onFechar,
  onAbrirVinculo,
  fixo,
}: {
  unidades: UnidadeOrcamento[];
  vinculos: VinculoOrcamento[];
  alvos: AlvosVinculo;
  inicial: AberturaVinculo;
  salvando?: boolean;
  erro?: string | null;
  onSalvar: (dados: DadosVinculo) => void;
  onExcluir?: () => void;
  onFechar: () => void;
  /** Abrir OUTRO vínculo da mesma unidade (o que a regra acusa) no lugar deste. */
  onAbrirVinculo?: (v: VinculoOrcamento) => void;
  /** O lado que NÃO muda (a tela em que se configura): "cubo" = a unidade do orçamento (tela do Orçamento) · "alvo" = a
   * unidade cadastrada (o PCA — a linha da unidade). Editar um vínculo gravado fixa a unidade do orçamento. */
  fixo?: "cubo" | "alvo";
}) {
  const rotulo = useRotuloUnidade(alvos);
  const [chave, setChave] = useState(inicial.chave ?? "");
  const [alvoId, setAlvoId] = useState<number | null>(inicial.alvoId ?? null);
  const unidade = unidades.find((u) => u.chave === chave);
  const outros = vinculos.filter((v) => v.chave === chave && v.id !== inicial.id);
  const demaisOcupado = outros.some((o) => o.acoes == null);
  // As ações que este vínculo PODE ter: as da unidade que nenhum outro vínculo pegou explicitamente.
  const usadas = new Set(outros.flatMap((o) => o.acoes ?? []));
  const disponiveis = (unidade?.acoes ?? []).filter((a) => !usadas.has(a.chave));
  const [demais, setDemais] = useState(inicial.id != null ? inicial.acoes == null : !demaisOcupado && inicial.acoes == null);
  const [marcadas, setMarcadas] = useState<Set<string>>(() => {
    if (inicial.acoes) return new Set(inicial.acoes);
    const fora = new Set(inicial.acoesFora ?? []);
    return new Set(disponiveis.filter((a) => !fora.has(a.chave)).map((a) => a.chave));
  });
  const vis = (a: AlvoVinculo) => !a.oculto || a.id === alvoId;
  const grupos = alvos.orgaos.map((o) => ({ rotulo: o.nome, itens: alvos.unidades.filter((u) => u.orgaoId === o.id && vis(u)) })).filter((g) => g.itens.length > 0);

  const acoes = demais ? null : disponiveis.filter((a) => marcadas.has(a.chave)).map((a) => a.chave);
  const acoesFora = demais ? disponiveis.filter((a) => !marcadas.has(a.chave)).map((a) => a.chave) : [];
  const textoAcao = (k: string) => unidade?.acoes.find((a) => a.chave === k)?.texto ?? k;
  const motivo =
    !unidade ? "Escolha a unidade do orçamento." : alvoId == null ? "Escolha a unidade cadastrada." : conflitoVinculo(outros, { alvoId, acoes }, textoAcao);
  const leva = disponiveis.filter((a) => marcadas.has(a.chave));
  // O vínculo que a regra acusa (a mesma unidade cadastrada, ou o "com as demais") — para abri-lo em vez de duplicar.
  const conflitante = motivo ? (outros.find((o) => o.alvoId === alvoId) ?? (demais ? outros.find((o) => o.acoes == null) : undefined)) : undefined;
  const cuboFixo = inicial.id != null || fixo === "cubo";
  // O destino de cada ação que NÃO é deste vínculo (para mostrar TODAS — marcadas e desmarcadas — com o que acontece):
  // a de outro vínculo explícito vai à unidade dele; a livre desmarcada vai ao "demais" de outro vínculo, senão fica sem vínculo.
  const destinoOutro = new Map(outros.flatMap((o) => (o.acoes ?? []).map((a) => [a, o.alvoId] as const)));
  const outroDemais = outros.find((o) => o.acoes == null);
  const destinoDesmarcada = (k: string) =>
    !demais && outroDemais && !outroDemais.acoesFora.includes(k) ? `vai para ${siglaDe(outroDemais.alvoId)} (as demais)` : null;
  const siglaDe = (id: number) => alvos.unidades.find((u) => u.id === id)?.sigla ?? "outra unidade";
  // Quantas ações de cada unidade do orçamento estão SEM vínculo (a escolha da unidade aponta o que falta).
  const pendentes = useMemo(() => new Map(semVinculo(unidades, vinculos, alvos.unidades).map((p) => [p.unidade.chave, p.acoes.length])), [unidades, vinculos, alvos]);

  return (
    <div className="space-y-[var(--gap-block)]">
      <SelectField
        label="Unidade do orçamento"
        value={chave}
        disabled={cuboFixo || salvando}
        onChange={(e) => {
          const k = e.target.value;
          setChave(k);
          const u = unidades.find((x) => x.chave === k);
          const o = vinculos.filter((v) => v.chave === k);
          const livres = (u?.acoes ?? []).filter((a) => !new Set(o.flatMap((x) => x.acoes ?? [])).has(a.chave));
          setDemais(!o.some((x) => x.acoes == null));
          setMarcadas(new Set(livres.map((a) => a.chave)));
        }}
      >
        <option value="">Escolha…</option>
        {unidades.map((u) => (
          <option key={u.chave} value={u.chave}>
            {u.texto}
            {pendentes.get(u.chave) ? ` — ${num(pendentes.get(u.chave) ?? 0)} ação(ões) sem vínculo` : ""}
          </option>
        ))}
      </SelectField>
      <SelectField
        label="Unidade cadastrada"
        value={alvoId ?? ""}
        disabled={fixo === "alvo" || salvando}
        onChange={(e) => setAlvoId(e.target.value ? Number(e.target.value) : null)}
      >
        <option value="">Escolha…</option>
        {grupos.map((g) => (
          <optgroup key={g.rotulo} label={g.rotulo}>
            {g.itens.map((a) => (
              <option key={a.id} value={a.id}>
                {rotulo.texto(a)}
                {a.oculto ? " (oculta)" : ""}
              </option>
            ))}
          </optgroup>
        ))}
      </SelectField>
      {unidade && (
        <>
          <Checkbox
            checked={demais}
            disabled={salvando || (demaisOcupado && !demais)}
            onChange={(e) => setDemais(e.target.checked)}
            label={
              demaisOcupado
                ? "Incluir as demais ações — já é de outro vínculo desta unidade"
                : "Incluir as demais ações (também as que vierem nos próximos orçamentos)"
            }
          />
          <div className="rounded-card border border-border">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-1.5">
              <span className="text-[12.5px] font-semibold text-text-2">
                Ações da unidade ({num(leva.length)} de {num(unidade.acoes.length)} marcadas)
              </span>
              <span className="flex gap-1">
                <Button size="xs" variant="ghost" disabled={salvando} onClick={() => setMarcadas(new Set(disponiveis.map((a) => a.chave)))}>
                  Marcar todas
                </Button>
                <Button size="xs" variant="ghost" disabled={salvando} onClick={() => setMarcadas(new Set())}>
                  Desmarcar todas
                </Button>
              </span>
            </div>
            <ul className="max-h-72 divide-y divide-border overflow-y-auto">
              {unidade.acoes.map((a) => {
                const outro = destinoOutro.get(a.chave);
                const marcada = outro == null && marcadas.has(a.chave);
                const nota = outro != null ? `vai para ${siglaDe(outro)}` : marcada ? null : (destinoDesmarcada(a.chave) ?? "sem vínculo");
                return (
                  <li key={a.chave} className="flex items-center gap-3 px-3 py-1.5">
                    <span className="min-w-0 flex-1">
                      <Checkbox
                        checked={marcada || outro != null}
                        disabled={salvando || outro != null}
                        onChange={(e) =>
                          setMarcadas((m) => {
                            const n = new Set(m);
                            if (e.target.checked) n.add(a.chave);
                            else n.delete(a.chave);
                            return n;
                          })
                        }
                        label={<span className="text-[13px] text-text">{a.texto}</span>}
                      />
                    </span>
                    <span className="shrink-0 text-right text-[12px] tabular-nums">
                      <span className="block text-text-2">{brl(a.valorInicial)}</span>
                      {nota && (
                        <span className="block" style={{ color: nota === "sem vínculo" ? "var(--warn)" : "var(--muted)" }}>
                          {nota}
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
          <p className="text-[12.5px] text-muted">
            Neste orçamento, o vínculo leva {num(leva.length)} de {num(disponiveis.length)} ações livres ·{" "}
            {num(leva.reduce((s, a) => s + a.lancamentos, 0))} lançamentos · {brl(leva.reduce((s, a) => s + a.valorInicial, 0))}
            {usadas.size > 0 ? ` · ${num(usadas.size)} ação(ões) já em outros vínculos desta unidade` : ""}
          </p>
        </>
      )}
      {(motivo || erro) && (
        <Callout kind={erro ? "danger" : "warn"}>
          <span className="block">{erro ?? motivo}</span>
          {!erro && onAbrirVinculo && conflitante && (
            <Button size="sm" variant="secondary" className="mt-2" onClick={() => onAbrirVinculo(conflitante)}>
              Abrir o vínculo com {rotulo.deId(conflitante.alvoId)}
            </Button>
          )}
        </Callout>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
        {onExcluir && (
          <Button variant="danger" className="mr-auto" disabled={salvando} icon={<IconTrash className="h-4 w-4" />} onClick={onExcluir}>
            Excluir vínculo
          </Button>
        )}
        <Button variant="secondary" disabled={salvando} onClick={onFechar}>
          Cancelar
        </Button>
        <Button
          loading={salvando}
          disabled={motivo != null}
          onClick={() => unidade && alvoId != null && onSalvar({ texto: unidade.texto, alvoId, acoes, acoesFora })}
        >
          {inicial.id != null ? "Salvar vínculo" : "Criar vínculo"}
        </Button>
      </div>
    </div>
  );
}
