"use client";

import { type ReactNode, useMemo, useState } from "react";
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
import { IconLock, IconTrash } from "./icons";

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

  const deOutros = (unidade?.acoes ?? []).filter((x) => destinoOutro.has(x.chave));
  const marcar = (k: string, sim: boolean) =>
    setMarcadas((m) => {
      const n = new Set(m);
      if (sim) n.add(k);
      else n.delete(k);
      return n;
    });

  return (
    <div className="space-y-[var(--gap-block)]">
      <section aria-label="Unidades do vínculo" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {cuboFixo ? (
          <CampoFixo rotulo="Unidade do orçamento" valor={unidade?.texto ?? chave} />
        ) : (
          <SelectField
            label="Unidade do orçamento"
            value={chave}
            disabled={salvando}
            onChange={(e) => {
              const k = e.target.value;
              setChave(k);
              const u = unidades.find((x) => x.chave === k);
              const o = vinculos.filter((v) => v.chave === k);
              const ocupadas = new Set(o.flatMap((x) => x.acoes ?? []));
              setDemais(!o.some((x) => x.acoes == null));
              setMarcadas(new Set((u?.acoes ?? []).filter((a) => !ocupadas.has(a.chave)).map((a) => a.chave)));
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
        )}
        {fixo === "alvo" ? (
          <CampoFixo rotulo="Unidade cadastrada" valor={rotulo.deId(alvoId) || "—"} />
        ) : (
          <SelectField label="Unidade cadastrada" value={alvoId ?? ""} disabled={salvando} onChange={(e) => setAlvoId(e.target.value ? Number(e.target.value) : null)}>
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
        )}
      </section>
      {unidade && (
        <section aria-label="Ações deste vínculo" className="overflow-hidden rounded-card border border-border bg-surface">
          <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-border bg-surface-2 px-3 py-2">
            <Checkbox
              checked={disponiveis.length > 0 && leva.length === disponiveis.length}
              indeterminado={leva.length > 0}
              disabled={salvando || disponiveis.length === 0}
              onChange={(e) => setMarcadas(new Set(e.target.checked ? disponiveis.map((x) => x.chave) : []))}
              label={<span className="text-[13px] font-semibold text-text">Ações deste vínculo</span>}
            />
            <span className="text-[12px] tabular-nums text-text-2">
              <b>{num(leva.length)}</b> de {num(disponiveis.length)} · <b>{brl(leva.reduce((s, a) => s + a.valorInicial, 0))}</b>
            </span>
            <div className="w-full">
              {demaisOcupado && !demais ? (
                <p className="text-[12px] text-muted">As demais ações desta unidade já vão para {outroDemais ? siglaDe(outroDemais.alvoId) : "outro vínculo"}.</p>
              ) : (
                <Checkbox
                  checked={demais}
                  disabled={salvando}
                  onChange={(e) => setDemais(e.target.checked)}
                  label={<span className="text-[12.5px] text-text-2">Incluir as demais ações (também as dos próximos orçamentos)</span>}
                />
              )}
            </div>
          </header>
          {disponiveis.length === 0 ? (
            <p className="px-3 py-3 text-[12.5px] text-muted">Todas as ações desta unidade já estão em outros vínculos.</p>
          ) : (
            <ul className="divide-y divide-border">
              {disponiveis.map((a) => {
                const marcada = marcadas.has(a.chave);
                const nota = marcada ? null : (destinoDesmarcada(a.chave) ?? "sem vínculo");
                return (
                  <LinhaAcao key={a.chave} valor={a.valorInicial} nota={nota} alerta={nota === "sem vínculo"} marcada={marcada}>
                    <Checkbox
                      checked={marcada}
                      disabled={salvando}
                      onChange={(e) => marcar(a.chave, e.target.checked)}
                      label={<span className="text-[13px] text-text">{a.texto}</span>}
                    />
                  </LinhaAcao>
                );
              })}
            </ul>
          )}
          {deOutros.length > 0 && (
            <>
              <p className="border-y border-border bg-surface-2 px-3 py-1.5 text-[12px] font-semibold text-muted">
                Em outros vínculos desta unidade ({num(deOutros.length)})
              </p>
              <ul className="divide-y divide-border opacity-80">
                {deOutros.map((a) => (
                  <LinhaAcao key={a.chave} valor={a.valorInicial} nota={`vai para ${siglaDe(destinoOutro.get(a.chave) ?? 0)}`}>
                    <span className="flex items-center gap-2.5 text-[13px] text-text-2">
                      <IconLock className="h-4 w-4 shrink-0 text-muted" aria-label="Travada" />
                      {a.texto}
                    </span>
                  </LinhaAcao>
                ))}
              </ul>
            </>
          )}
        </section>
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
          <Button
            size="sm"
            variant="ghost"
            className="mr-auto"
            disabled={salvando}
            aria-label="Excluir vínculo"
            title="Excluir vínculo"
            icon={<IconTrash className="h-4 w-4" style={{ color: "var(--danger)" }} />}
            onClick={onExcluir}
          />
        )}
        <Button size="sm" variant="ghost" disabled={salvando} onClick={onFechar}>
          Cancelar
        </Button>
        <Button
          size="sm"
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

/** O lado do vínculo que a tela FIXA (não se escolhe aqui): rótulo + o valor, sem parecer um campo desabilitado. */
function CampoFixo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="min-w-0">
      <span className="mb-1.5 block text-[13px] font-medium text-text-2">{rotulo}</span>
      <p className="flex min-h-11 items-center rounded-card bg-surface-2 px-3 py-2 text-[13.5px] font-semibold text-text lg:min-h-[var(--h-control)]">
        <span className="line-clamp-2">{valor}</span>
      </p>
    </div>
  );
}

/** Uma ação na lista do editor: a caixa (ou o cadeado) com o texto, o valor e o destino quando não é deste vínculo. */
function LinhaAcao({
  valor,
  nota,
  alerta = false,
  marcada = false,
  children,
}: {
  valor: number;
  nota: string | null;
  alerta?: boolean;
  marcada?: boolean;
  children: ReactNode;
}) {
  return (
    <li className="flex min-h-11 items-center gap-3 px-3 py-1.5" style={marcada ? { background: "var(--accent-soft)" } : undefined}>
      <span className="min-w-0 flex-1">{children}</span>
      <span className="shrink-0 text-right text-[12px] tabular-nums">
        <span className="block font-medium text-text-2">{brl(valor)}</span>
        {nota && (
          <span className="block" style={{ color: alerta ? "var(--warn)" : "var(--muted)" }}>
            {nota}
          </span>
        )}
      </span>
    </li>
  );
}
