"use client";

import { useMemo, useState } from "react";
import { brl, num } from "@/lib/format";
import {
  type AlvosVinculo,
  type AlvoVinculo,
  chaveVinculo,
  conflitoVinculo,
  type UnidadeOrcamento,
  type VinculoOrcamento,
} from "@/lib/orcamento-vinculo";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { Checkbox, SelectField } from "./Field";
import { IconTrash } from "./icons";
import { SeletorMultiplo } from "./SeletorMultiplo";

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
 * EDITOR de UM vínculo do orçamento (corpo de um `Modal`): a unidade do orçamento (fixa ao editar), a unidade
 * cadastrada (agrupadas por órgão; ocultas só se já escolhidas) e as AÇÕES — as que nenhum OUTRO vínculo da unidade
 * pegou —, com "Incluir as demais ações" (as que vierem depois também entram; um por unidade do orçamento). A REGRA
 * (`conflitoVinculo`) aparece na hora e trava o Salvar; a prévia diz quanto o vínculo leva neste orçamento.
 * Apresentacional: grava via `onSalvar`/`onExcluir`.
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
  const textoPorChave = new Map(disponiveis.map((a) => [a.texto, a.chave]));

  return (
    <div className="space-y-[var(--gap-block)]">
      <SelectField
        label="Unidade do orçamento"
        value={chave}
        disabled={inicial.id != null || salvando}
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
          </option>
        ))}
      </SelectField>
      <SelectField
        label="Unidade cadastrada"
        value={alvoId ?? ""}
        disabled={salvando}
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
          <SeletorMultiplo
            rotulo={demais ? "Ações (desmarque as que ficam de fora)" : "Ações deste vínculo"}
            opcoes={disponiveis.map((a) => ({ valor: a.texto, contagem: a.lancamentos }))}
            selecionados={leva.map((a) => a.texto)}
            textoVazio="Nenhuma"
            disabled={salvando}
            onChange={(v) => setMarcadas(new Set(v.map((t) => textoPorChave.get(t) ?? chaveVinculo(t))))}
          />
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
