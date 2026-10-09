"use client";

import { useMemo, useState } from "react";
import { brl, num } from "@/lib/format";
import {
  type AlvosVinculo,
  type AlvoVinculo,
  conflitoVinculo,
  type EscopoVinculos,
  escopoEscolhido,
  type ModoEscopo,
  PADRAO_ESCOLHA,
  semVinculo,
  type UnidadeOrcamento,
  type VinculoOrcamento,
  type VisaoVinculos,
} from "@/lib/orcamento-vinculo";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { Checkbox, SelectField } from "./Field";
import { IconLock, IconRefresh, IconTrash } from "./icons";
import { Segmented } from "./Segmented";
import { SeletorMultiplo } from "./SeletorMultiplo";

/** O que o editor grava: a unidade do CUBO (texto), a cadastrada e as ações (lista ou as DEMAIS menos as de fora). */
export type DadosVinculo = { texto: string; alvoId: number; acoes: string[] | null; acoesFora: string[] };

/** O vínculo aberto no editor: `id` = editar um gravado; sem ele, criar (opcionalmente já com a unidade do CUBO). */
export type AberturaVinculo = { id?: number; chave?: string; alvoId?: number | null; acoes?: string[] | null; acoesFora?: string[] };

/** Em que VISÃO se configura (vínculos por visão): as visões e a aberta (`null` = o padrão). */
export type ContextoVisao = { visoes: VisaoVinculos[]; visaoId: number | null };

/** A escolha de ONDE salvar (controlada): o modo e, em "Escolher", as visões ("0" = o padrão). */
export type ValorEscopo = { modo: ModoEscopo; escolhidas: string[] };

/**
 * ONDE SALVAR um vínculo (vínculos por visão) — "Esta visão" (ou "Padrão", sem visão aberta) · "Todas" · "Escolher" (o
 * padrão e as visões numa lista suspensa; as que já têm vínculos próprios na unidade vêm marcadas "· própria"). Com a
 * unidade própria na visão aberta, o selo e "Usar o padrão". Apresentacional (controlado).
 */
export function EscopoVinculo({
  contexto,
  chave,
  valor,
  onChange,
  onUsarPadrao,
  disabled = false,
}: {
  contexto: ContextoVisao;
  /** A unidade do CUBO do vínculo (marca as visões com vínculos próprios nela). */
  chave: string;
  valor: ValorEscopo;
  onChange: (v: ValorEscopo) => void;
  onUsarPadrao?: () => void;
  disabled?: boolean;
}) {
  const aberta = contexto.visoes.find((v) => v.id === contexto.visaoId);
  const propria = !!aberta && aberta.proprias.includes(chave);
  const opcoes = [
    { valor: PADRAO_ESCOLHA, rotulo: "Padrão" },
    ...contexto.visoes.map((v) => ({ valor: String(v.id), rotulo: `${v.nome ?? `Visão ${v.id}`}${v.proprias.includes(chave) ? " · própria" : ""}` })),
  ];
  return (
    <section className="space-y-2 rounded-card border border-border p-[var(--pad-card)]" aria-label="Onde salvar">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-text">Salvar em</span>
        <Segmented<ModoEscopo>
          value={valor.modo}
          onChange={(modo) => onChange({ ...valor, modo })}
          disabled={disabled}
          ariaLabel="Onde salvar o vínculo"
          options={[
            {
              value: "esta",
              label: contexto.visaoId == null ? "Padrão" : "Esta visão",
              dica: contexto.visaoId == null ? "As visões sem vínculos próprios nesta unidade seguem o padrão" : `Só na visão “${aberta?.nome ?? ""}”`,
            },
            { value: "todas", label: "Todas", dica: "O padrão e as visões com vínculos próprios nesta unidade" },
            { value: "escolher", label: "Escolher", dica: "O padrão e/ou as visões que você marcar" },
          ]}
        />
        {propria && <Badge tone="violet">Próprio desta visão</Badge>}
        {propria && onUsarPadrao && (
          <Button size="sm" variant="ghost" icon={<IconRefresh className="h-4 w-4" />} disabled={disabled} onClick={onUsarPadrao} title="Apaga os vínculos desta visão nesta unidade — ela volta a seguir o padrão">
            Usar o padrão
          </Button>
        )}
      </div>
      {valor.modo === "escolher" && (
        <SeletorMultiplo
          suspenso
          rotulo="Visões"
          textoVazio="Nenhuma"
          opcoes={opcoes}
          selecionados={valor.escolhidas}
          disabled={disabled}
          onChange={(escolhidas) => onChange({ ...valor, escolhidas })}
        />
      )}
    </section>
  );
}

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
  fixosNoContexto = false,
  contexto,
  onUsarPadrao,
}: {
  unidades: UnidadeOrcamento[];
  vinculos: VinculoOrcamento[];
  alvos: AlvosVinculo;
  inicial: AberturaVinculo;
  salvando?: boolean;
  erro?: string | null;
  /** Grava no ESCOPO escolhido (sem `contexto`, o padrão). */
  onSalvar: (dados: DadosVinculo, escopo: EscopoVinculos) => void;
  onExcluir?: (escopo: EscopoVinculos) => void;
  onFechar: () => void;
  /** Abrir OUTRO vínculo da mesma unidade (o que a regra acusa) no lugar deste. */
  onAbrirVinculo?: (v: VinculoOrcamento) => void;
  /** O lado que NÃO muda (a tela em que se configura): "cubo" = a unidade do orçamento (tela do Orçamento) · "alvo" = a
   * unidade cadastrada (o PCA — a linha da unidade). Editar um vínculo gravado fixa a unidade do orçamento. */
  fixo?: "cubo" | "alvo";
  /** O lado fixo JÁ aparece em volta (o acordeão do banner da linha): não repete. */
  fixosNoContexto?: boolean;
  /** Vínculos por visão: as visões e a aberta — mostra "Salvar em" (com visões cadastradas). */
  contexto?: ContextoVisao;
  /** A visão aberta volta a seguir o padrão nesta unidade. */
  onUsarPadrao?: (chave: string) => void;
}) {
  const rotulo = useRotuloUnidade(alvos);
  const [valorEscopo, setValorEscopo] = useState<ValorEscopo>(() => ({ modo: "esta", escolhidas: [String(contexto?.visaoId ?? PADRAO_ESCOLHA)] }));
  const comEscopo = !!contexto && contexto.visoes.length > 0;
  const escopo: EscopoVinculos = contexto
    ? escopoEscolhido(valorEscopo.modo, valorEscopo.escolhidas, contexto.visaoId, contexto.visoes)
    : { padrao: true, visoes: [] };
  const semDestino = !escopo.padrao && escopo.visoes.length === 0;
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
    !demais && outroDemais && !outroDemais.acoesFora.includes(k) ? `vai para ${siglaDe(outroDemais.alvoId)}` : null;
  const siglaDe = (id: number) => alvos.unidades.find((u) => u.id === id)?.sigla ?? "outra unidade";
  // Quantas ações de cada unidade do orçamento estão SEM vínculo (a escolha da unidade aponta o que falta).
  const pendentes = useMemo(() => new Map(semVinculo(unidades, vinculos, alvos.unidades).map((p) => [p.unidade.chave, p.acoes.length])), [unidades, vinculos, alvos]);

  const deOutros = (unidade?.acoes ?? []).filter((x) => destinoOutro.has(x.chave));
  // As de outros vínculos numa linha só, agrupadas pelo destino ("2 em GGIM").
  const porSigla = new Map<string, number>();
  for (const a of deOutros) {
    const s = siglaDe(destinoOutro.get(a.chave) ?? 0);
    porSigla.set(s, (porSigla.get(s) ?? 0) + 1);
  }
  const outrosPorDestino = [...porSigla].map(([sigla, n]) => `${num(n)} em ${sigla}`);
  const marcar = (k: string, sim: boolean) =>
    setMarcadas((m) => {
      const n = new Set(m);
      if (sim) n.add(k);
      else n.delete(k);
      return n;
    });
  const mostraCubo = !(cuboFixo && fixosNoContexto);
  const mostraAlvo = !(fixo === "alvo" && fixosNoContexto);

  return (
    <div className="space-y-[var(--gap-block)]">
      {(mostraCubo || mostraAlvo) && (
        <div className={`grid grid-cols-1 gap-3 ${mostraCubo && mostraAlvo ? "sm:grid-cols-2" : ""}`}>
          {mostraCubo &&
            (cuboFixo ? (
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
                    {pendentes.get(u.chave) ? ` — ${num(pendentes.get(u.chave) ?? 0)} sem vínculo` : ""}
                  </option>
                ))}
              </SelectField>
            ))}
          {mostraAlvo &&
            (fixo === "alvo" ? (
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
            ))}
        </div>
      )}
      {unidade && (
        <section aria-label="Ações deste vínculo">
          <div className="flex min-h-11 items-center justify-between gap-3 border-b border-border lg:min-h-[var(--h-control-sm)]">
            <Checkbox
              checked={disponiveis.length > 0 && leva.length === disponiveis.length}
              indeterminado={leva.length > 0}
              disabled={salvando || disponiveis.length === 0}
              onChange={(e) => setMarcadas(new Set(e.target.checked ? disponiveis.map((x) => x.chave) : []))}
              label={
                <span className="text-[13px] font-semibold text-text">
                  Ações <span className="font-normal tabular-nums text-muted">{num(leva.length)}/{num(disponiveis.length)}</span>
                </span>
              }
            />
            <span className="text-[13px] font-semibold tabular-nums text-text">{brl(leva.reduce((s, a) => s + a.valorInicial, 0))}</span>
          </div>
          {disponiveis.length === 0 ? (
            <p className="py-3 text-[12.5px] text-muted">Todas as ações desta unidade já estão em outros vínculos.</p>
          ) : (
            <ul className="divide-y divide-border">
              {disponiveis.map((a) => {
                const marcada = marcadas.has(a.chave);
                return (
                  <li key={a.chave} className="flex min-h-11 items-center gap-3 py-1">
                    <span className="min-w-0 flex-1">
                      <Checkbox
                        checked={marcada}
                        disabled={salvando}
                        onChange={(e) => marcar(a.chave, e.target.checked)}
                        label={<span className={`text-[13px] ${marcada ? "text-text" : "text-muted"}`}>{a.texto}</span>}
                      />
                    </span>
                    <span className="shrink-0 text-right text-[12.5px] tabular-nums">
                      <span className={`block ${marcada ? "text-text-2" : "text-muted"}`}>{brl(a.valorInicial)}</span>
                      {!marcada && destinoDesmarcada(a.chave) && <span className="block text-[11.5px] text-muted">{destinoDesmarcada(a.chave)}</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="space-y-1 border-t border-border pt-2 text-[12.5px] text-muted">
            {demaisOcupado && !demais ? (
              <p>Ações futuras desta unidade vão para {outroDemais ? siglaDe(outroDemais.alvoId) : "outro vínculo"}.</p>
            ) : (
              <Checkbox
                checked={demais}
                disabled={salvando}
                onChange={(e) => setDemais(e.target.checked)}
                label={<span className="text-[12.5px] text-text-2">Incluir ações futuras desta unidade</span>}
              />
            )}
            {outrosPorDestino.length > 0 && (
              <p className="flex items-center gap-1.5" title={deOutros.map((a) => `${a.texto} → ${siglaDe(destinoOutro.get(a.chave) ?? 0)}`).join("\n")}>
                <IconLock className="h-3.5 w-3.5 shrink-0" aria-hidden />
                Em outros vínculos: {outrosPorDestino.join(" · ")}
              </p>
            )}
          </div>
        </section>
      )}
      {comEscopo && contexto && unidade && (
        <EscopoVinculo
          contexto={contexto}
          chave={unidade.chave}
          valor={valorEscopo}
          onChange={setValorEscopo}
          onUsarPadrao={onUsarPadrao ? () => onUsarPadrao(unidade.chave) : undefined}
          disabled={salvando}
        />
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
            aria-label="Excluir vínculo"
            title="Excluir vínculo"
            icon={<IconTrash className="h-4 w-4" style={{ color: "var(--danger)" }} />}
            onClick={() => onExcluir(escopo)}
            disabled={salvando || semDestino}
          />
        )}
        <Button size="sm" variant="ghost" disabled={salvando} onClick={onFechar}>
          Cancelar
        </Button>
        <Button
          size="sm"
          loading={salvando}
          disabled={motivo != null || semDestino}
          title={semDestino ? "Escolha onde salvar" : undefined}
          onClick={() => unidade && alvoId != null && onSalvar({ texto: unidade.texto, alvoId, acoes, acoesFora }, escopo)}
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
