"use client";

import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import {
  anosDoCard,
  type CardEmpenho,
  cardPorOrgao,
  estadoCard,
  NOME_TIPO,
  type OrgaoGestorCenti,
  orgaosDaLeitura,
  pendenciasDoCard,
  type ResumoCard,
  rotuloAnos,
  type TipoCard,
  type VinculoCard,
} from "@/lib/empenho-cards-core";
import { usaPeriodo } from "@/lib/empenhos-core";
import { brl, dataHoraBR, num } from "@/lib/format";
import { ConteudoAba } from "./AbasEspaco";
import { Ajuda } from "./Ajuda";
import { Avisos } from "./Avisos";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { useConfirmacao } from "./Confirmacao";
import { EmpenhoCardConfig } from "./EmpenhoCardConfig";
import { EmpenhoCardImportacao } from "./EmpenhoCardImportacao";
import { EmpenhoCardVinculos } from "./EmpenhoCardVinculos";
import { ErroCarga } from "./ErroCarga";
import { SelectField, TextField } from "./Field";
import { IconCheck, IconChevronLeft, IconEmpenho, IconLiquidacao, IconPagamento, IconTrash } from "./icons";
import { Modal } from "./Modal";
import { CartaoFinanceiro, GRADE_ORCAMENTOS } from "./OrcamentoCard";
import { QuadroNovoCard } from "./QuadroCard";
import { Segmented } from "./Segmented";
import { SkeletonCartao } from "./Skeleton";
import { toast } from "./Toast";

type SubAba = "importacao" | "vinculos" | "configuracao";
type Detalhe = {
  card: ResumoCard;
  vinculos?: VinculoCard[];
  catalogo?: Parameters<typeof EmpenhoCardVinculos>[0]["catalogo"];
  cadastro?: Parameters<typeof EmpenhoCardVinculos>[0]["cadastro"];
  conflitos?: Parameters<typeof EmpenhoCardVinculos>[0]["conflitos"];
  mapa?: OrgaoGestorCenti[];
};

const TIPOS: readonly TipoCard[] = ["empenhos", "liquidacoes", "pagamentos"];
const ICONE: Record<TipoCard, typeof IconEmpenho> = { empenhos: IconEmpenho, liquidacoes: IconLiquidacao, pagamentos: IconPagamento };
const anoAtual = () => Number(new Date().toISOString().slice(0, 4));

/** O endereço da aba (sem recarregar): o tipo, o card aberto e a sub-aba — voltar a Configurações reabre no mesmo lugar. */
function gravarNaUrl(tipo: TipoCard, card: number | null, sub: SubAba | null) {
  const u = new URL(window.location.href);
  u.searchParams.set("tipo", tipo);
  if (card) u.searchParams.set("card", String(card));
  else u.searchParams.delete("card");
  if (card && sub) u.searchParams.set("sub", sub);
  else u.searchParams.delete("sub");
  window.history.replaceState(window.history.state, "", u);
}

/**
 * Configurações → IMPORTAÇÕES (só o ADM): TODAS as importações da Centi num lugar — os CARDS de empenhos, liquidações e
 * pagamentos (`Segmented` por tipo). Tocar num card abre ele NO LUGAR (voltar · nome · estado · números · avisos · excluir)
 * com as sub-abas **Importação · Vínculos (empenhos) · Configuração** — os MESMOS componentes de sempre
 * (`EmpenhoCardImportacao`, `EmpenhoCardVinculos`, `EmpenhoCardConfig`), só a aberta montada. As telas de Empenhos,
 * Liquidações e Pagamentos ficam só com os dados.
 */
export function ImportacoesAdmin() {
  const [cards, setCards] = useState<ResumoCard[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [tipo, setTipo] = useState<TipoCard>("empenhos");
  const [aberto, setAberto] = useState<{ id: number; sub: SubAba } | null>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/importacoes", { cache: "no-store" });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; cards?: ResumoCard[] };
      if (!r.ok || !j.ok || !j.cards) throw new Error(j.error ?? "Não foi possível carregar as importações.");
      setCards(j.cards);
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar as importações.");
    }
  }, []);

  // A 1ª carga + o endereço (`?tipo=&card=&sub=`): reabre onde estava.
  useEffect(() => {
    const u = new URL(window.location.href);
    const t = u.searchParams.get("tipo");
    if (t && (TIPOS as readonly string[]).includes(t)) setTipo(t as TipoCard);
    const id = Number(u.searchParams.get("card"));
    const sub = u.searchParams.get("sub");
    if (Number.isInteger(id) && id > 0) setAberto({ id, sub: sub === "vinculos" || sub === "configuracao" ? sub : "importacao" });
    void carregar();
  }, [carregar]);

  const doTipo = useMemo(() => (cards ?? []).filter((c) => c.tipo === tipo), [cards, tipo]);
  const contagem = (t: TipoCard) => (cards ?? []).filter((c) => c.tipo === t).length;

  const abrir = (id: number, sub: SubAba = "importacao") => {
    setAberto({ id, sub });
    gravarNaUrl(tipo, id, sub);
  };
  const fechar = () => {
    setAberto(null);
    gravarNaUrl(tipo, null, null);
    void carregar();
  };
  const trocarTipo = (t: TipoCard) => {
    setTipo(t);
    gravarNaUrl(t, null, null);
  };

  if (aberto) {
    return (
      <CardAberto
        key={aberto.id}
        id={aberto.id}
        sub={aberto.sub}
        cards={cards ?? []}
        onSub={(sub) => {
          setAberto({ id: aberto.id, sub });
          gravarNaUrl(tipo, aberto.id, sub);
        }}
        onFechar={fechar}
        onMudou={carregar}
      />
    );
  }

  return (
    <div className="space-y-[var(--gap-block)]">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<TipoCard>
          value={tipo}
          onChange={trocarTipo}
          ariaLabel="Tipo de importação"
          options={TIPOS.map((t) => ({ value: t, label: cards ? `${NOME_TIPO[t].titulo} (${num(contagem(t))})` : NOME_TIPO[t].titulo, curto: NOME_TIPO[t].titulo }))}
        />
        <div className="ml-auto">
          <AjudaImportacoes />
        </div>
      </div>
      {erro && <ErroCarga msg={erro} kind={cards ? "warn" : "danger"} onTentar={carregar} />}
      {cards == null && !erro ? (
        <div className={GRADE_ORCAMENTOS}>
          <SkeletonCartao />
          <SkeletonCartao />
        </div>
      ) : cards ? (
        <ListaCards tipo={tipo} cards={doTipo} todos={cards} onAbrir={(id, sub) => abrir(id, sub)} />
      ) : null}
    </div>
  );
}

/** O (?) da aba: como as importações funcionam. */
function AjudaImportacoes() {
  return (
    <Ajuda titulo="Importações da Centi" botao="sm">
      <p>
        Cada <strong>card</strong> é uma importação da Centi com a sua própria configuração: a integração, os anos, a atualização automática
        (horário, frequência, dias úteis) e as regras da conferência. Os dados importados aparecem nas telas Empenhos, Liquidações e
        Pagamentos.
      </p>
      <p>
        <strong>Empenhos</strong>: os <strong>vínculos</strong> dizem o que entra (órgãos gestores, unidades orçamentárias e ações da Centi) e a
        que órgão ou unidade do cadastro cada um pertence — só o que um vínculo cobre é gravado.
      </p>
      <p>
        <strong>Liquidações</strong> e <strong>Pagamentos</strong>: cada importação lê todos os órgãos com o “ID na Centi” (Órgãos e Unidades);
        o número do empenho liga o registro ao empenho — o órgão e a unidade são os dele.
      </p>
      <p>
        Toda importação é <strong>conferida</strong> antes de gravar (o total da Centi, a soma e a queda em relação à anterior) e só o que mudou
        é regravado. A ordem para começar: 1. Configuração, 2. Vínculos (empenhos), 3. Importação.
      </p>
    </Ajuda>
  );
}

/** A grade dos cards do tipo + o "Novo card" (o nome e, nos empenhos, os vínculos copiados de outro card). */
function ListaCards({ tipo, cards, todos, onAbrir }: { tipo: TipoCard; cards: ResumoCard[]; todos: ResumoCard[]; onAbrir: (id: number, sub?: SubAba) => void }) {
  const liq = cardPorOrgao(tipo);
  const nomeTipo = NOME_TIPO[tipo];
  const Icone = ICONE[tipo];
  const [novo, setNovo] = useState(false);
  const [nome, setNome] = useState("");
  const [copiarDe, setCopiarDe] = useState("");
  const [criando, setCriando] = useState(false);

  async function criar() {
    if (!nome.trim()) return;
    setCriando(true);
    try {
      const r = await fetch("/api/empenhos/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, nome: nome.trim(), copiarDe: copiarDe ? Number(copiarDe) : null }),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; id?: number };
      if (!r.ok || !j.ok || !j.id) throw new Error(j.error ?? "Não foi possível criar o card.");
      toast.success(`Card "${nome.trim()}" criado — confirme a configuração${liq ? "" : " e os vínculos"} antes de importar.`);
      setNovo(false);
      setNome("");
      setCopiarDe("");
      onAbrir(j.id, "configuracao");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível criar o card.");
    } finally {
      setCriando(false);
    }
  }

  return (
    <>
      <div className={GRADE_ORCAMENTOS}>
        {cards.map((c) => (
          <CartaoFinanceiro key={c.id} onClick={() => onAbrir(c.id)} icone={<Icone className="h-5 w-5" />} {...propsDoCartao(c)} />
        ))}
        <QuadroNovoCard onClick={() => setNovo(true)} rotulo={cards.length ? "Novo card" : `Novo card de ${nomeTipo.varios}`} />
      </div>

      <Modal
        open={novo}
        onClose={() => !criando && setNovo(false)}
        bloqueado={criando}
        size="md"
        titulo={`Novo card de ${nomeTipo.varios}`}
        rodape={
          <div className="flex w-full justify-end gap-2">
            <Button size="sm" variant="secondary" onClick={() => setNovo(false)} disabled={criando}>
              Cancelar
            </Button>
            <Button size="sm" onClick={criar} loading={criando} disabled={!nome.trim()}>
              Criar
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <TextField denso label="Nome" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={60} autoFocus placeholder={`Ex.: ${nomeTipo.titulo} da Saúde`} />
          {!liq && (
            <SelectField
              denso
              label="Copiar os vínculos de"
              value={copiarDe}
              onChange={(e) => setCopiarDe(e.target.value)}
              rotuloExtra={
                <Ajuda titulo="Copiar os vínculos" compacta>
                  O card novo começa com os mesmos vínculos do card escolhido (depois cada um segue o seu). Nenhum = o card começa vazio —
                  escolha na sub-aba Vínculos o que ele importa.
                </Ajuda>
              }
            >
              <option value="">Nenhum (começar vazio)</option>
              {todos
                .filter((c) => c.tipo === "empenhos")
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome} ({num(c.vinculos)} vínculos)
                  </option>
                ))}
            </SelectField>
          )}
          <p className="text-[12.5px] text-muted">
            {liq ? (
              <>
                Depois de criar, confirme a <strong>Configuração</strong> — a importação lê todos os órgãos com o “ID na Centi” cadastrado em
                Órgãos e Unidades.
              </>
            ) : (
              <>
                Depois de criar: 1. confirme a <strong>Configuração</strong>, 2. crie os <strong>Vínculos</strong>. Só então a importação é
                liberada.
              </>
            )}
          </p>
        </div>
      </Modal>
    </>
  );
}

/** O conteúdo do card de cada tipo (os números do `CartaoFinanceiro`). */
function propsDoCartao(c: ResumoCard) {
  const e = estadoCard(c, c.lendo);
  const pct = (a: number, b: number) => (b > 0 ? (a / b) * 100 : 0);
  const fmtPct = (p: number) => p.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  const rodape = c.ultimaExecucao ? `Última leitura em ${dataHoraBR(c.ultimaExecucao)}` : "Ainda não importado";
  const base = {
    sobretitulo: `${NOME_TIPO[c.tipo].titulo} · ${rotuloAnos(c.anos)}`,
    nome: c.nome,
    selo: (
      <Badge tone={e.tom} dot vivo={c.lendo} tamanho="linha">
        {e.rotulo}
      </Badge>
    ),
    rodape,
  };
  if (c.tipo === "pagamentos") {
    const p = pct(c.pago, c.soma - c.anulado);
    return {
      ...base,
      destaque: { rotulo: "Pago líquido", valor: c.liquidado },
      barra: { rotulo: "Retenções", pct: p, texto: `${fmtPct(p)}% retido` },
      linhas: [
        { rotulo: `Ordens · ${num(c.empenhos)} pagamentos`, valor: c.soma },
        { rotulo: `Anuladas · ${num(c.saldoPagar)}`, valor: c.anulado, sinal: "−" as const, tom: "text-[var(--danger)]" },
        { rotulo: "Retenções", valor: c.pago, sinal: "−" as const, tom: "text-text" },
        "divisor" as const,
        { rotulo: "Pago líquido", valor: c.liquidado, tom: "text-[var(--ok)]" },
      ],
      numeros: [
        { valor: c.vinculos, rotulo: "órgãos" },
        { valor: c.unidadesOrc, rotulo: "unidades" },
        { valor: c.acoes, rotulo: "empenhos" },
        { valor: c.fornecedores, rotulo: "credores" },
      ],
    };
  }
  if (c.tipo === "liquidacoes") {
    const p = pct(c.pago, c.liquidado);
    return {
      ...base,
      destaque: { rotulo: "Liquidado líquido", valor: c.liquidado },
      barra: { rotulo: "Pagamento", pct: p, texto: `${fmtPct(p)}% pago` },
      linhas: [
        { rotulo: `Liquidado · ${num(c.empenhos)} liquidações`, valor: c.soma },
        { rotulo: "Anulado", valor: c.anulado, sinal: "−" as const, tom: "text-[var(--danger)]" },
        "divisor" as const,
        { rotulo: "Pago", valor: c.pago, tom: "text-[var(--ok)]" },
        { rotulo: "Saldo", valor: c.saldoPagar, tom: "text-text" },
      ],
      numeros: [
        { valor: c.vinculos, rotulo: "órgãos" },
        { valor: c.unidadesOrc, rotulo: "unidades" },
        { valor: c.acoes, rotulo: "empenhos" },
        { valor: c.fornecedores, rotulo: "credores" },
      ],
    };
  }
  const p = pct(c.pago, c.soma - c.anulado);
  return {
    ...base,
    destaque: { rotulo: "Empenhado líquido", valor: c.soma - c.anulado },
    barra: { rotulo: "Execução", pct: p, texto: `${fmtPct(p)}% pago` },
    linhas: [
      { rotulo: `Empenhado · ${num(c.empenhos)} empenhos`, valor: c.soma },
      { rotulo: "Anulado", valor: c.anulado, sinal: "−" as const, tom: "text-[var(--danger)]" },
      "divisor" as const,
      { rotulo: "Liquidado", valor: c.liquidado, tom: "text-text" },
      { rotulo: "Pago", valor: c.pago, tom: "text-[var(--ok)]" },
      { rotulo: "Saldo a pagar", valor: c.saldoPagar, tom: "text-text" },
    ],
    numeros: [
      { valor: c.gestores, rotulo: "órgãos gestores" },
      { valor: c.unidadesOrc, rotulo: "unidades orç." },
      { valor: c.acoes, rotulo: "ações" },
      { valor: c.fornecedores, rotulo: "fornecedores" },
      { valor: c.vinculos, rotulo: "vínculos" },
    ],
  };
}

/**
 * O CARD ABERTO no lugar da lista: a linha do card (voltar · cor · nome · estado · números · avisos · excluir) e as
 * sub-abas com as ferramentas de cada uma à direita (o slot do `ConteudoAba`). Os dados do card (e, nos empenhos, os
 * vínculos, o catálogo e o cadastro) vêm sob demanda e são relidos a cada mudança.
 */
function CardAberto({
  id,
  sub,
  cards,
  onSub,
  onFechar,
  onMudou,
}: {
  id: number;
  sub: SubAba;
  cards: ResumoCard[];
  onSub: (s: SubAba) => void;
  onFechar: () => void;
  onMudou: () => Promise<void>;
}) {
  const [d, setD] = useState<Detalhe | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const { confirmar, confirmacao } = useConfirmacao();

  const carregar = useCallback(async () => {
    try {
      const r = await fetch(`/api/admin/importacoes/${id}`, { cache: "no-store" });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string } & Partial<Detalhe>;
      if (!r.ok || !j.ok || !j.card) throw new Error(j.error ?? "Não foi possível abrir o card.");
      setD(j as Detalhe);
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível abrir o card.");
    }
  }, [id]);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  const mudou = useCallback(() => {
    void carregar();
    void onMudou();
  }, [carregar, onMudou]);

  // Enquanto o card chega, o resumo da lista (sem vínculos) já mostra a linha.
  const c = d?.card ?? cards.find((x) => x.id === id) ?? null;
  if (!c) {
    return (
      <div className="space-y-[var(--gap-block)]">
        <Voltar onFechar={onFechar} />
        {erro ? <ErroCarga msg={erro} onTentar={carregar} /> : <SkeletonCartao />}
      </div>
    );
  }
  const liq = cardPorOrgao(c.tipo);
  const nome = NOME_TIPO[c.tipo];
  const e = estadoCard(c, c.lendo);
  const pendencias = pendenciasDoCard(c, c.vinculos);
  const subs: SubAba[] = liq ? ["importacao", "configuracao"] : ["importacao", "vinculos", "configuracao"];
  const aba: SubAba = subs.includes(sub) ? sub : "importacao";
  const etapas = [
    { aba: "configuracao" as const, rotulo: "1. Configuração", feito: !!c.configuradoEm },
    ...(liq ? [] : [{ aba: "vinculos" as const, rotulo: "2. Vínculos", feito: c.vinculos > 0 }]),
  ];

  async function excluir(card: ResumoCard) {
    const ok = await confirmar({
      titulo: `Excluir o card "${card.nome}"?`,
      texto: liq
        ? `${nome.masc ? "Os" : "As"} ${num(card.empenhos)} ${nome.varios} ${nome.masc ? "gravados" : "gravadas"} e o histórico das importações vão junto. Esta ação não pode ser desfeita.`
        : `Os ${num(card.empenhos)} empenhos gravados, os ${num(card.vinculos)} vínculos e o histórico das importações vão junto. Esta ação não pode ser desfeita.`,
      confirmar: "Excluir",
      perigo: true,
    });
    if (!ok) return;
    setExcluindo(true);
    const r = await fetch(`/api/empenhos/cards/${card.id}`, { method: "DELETE" }).catch(() => null);
    setExcluindo(false);
    if (r?.ok) {
      toast.success(`Card "${card.nome}" excluído.`);
      onFechar();
      return;
    }
    toast.error("Não foi possível excluir o card.");
  }

  const indicadores = [
    { rotulo: nome.titulo, valor: num(c.empenhos) },
    c.tipo === "pagamentos" ? { rotulo: "Pago líquido", valor: brl(c.liquidado) } : { rotulo: liq ? "Liquidado" : "Empenhado", valor: brl(c.soma) },
    { rotulo: "Anos", valor: rotuloAnos(c.anos) },
    { rotulo: "Última leitura", valor: c.ultimaExecucao ? dataHoraBR(c.ultimaExecucao) : "—" },
  ];

  let conteudo: ReactNode = <SkeletonCartao />;
  if (d) {
    if (aba === "importacao") conteudo = <EmpenhoCardImportacao card={d.card} podeExcluir onMudou={mudou} />;
    else if (aba === "configuracao")
      conteudo = (
        <EmpenhoCardConfig
          card={d.card as CardEmpenho}
          leitura={d.vinculos && d.mapa ? orgaosDaLeitura(d.vinculos, d.mapa) : undefined}
          onSalvo={(proxima) => {
            mudou();
            if (proxima) onSub(proxima);
          }}
        />
      );
    else if (d.vinculos && d.catalogo && d.cadastro)
      conteudo = (
        <EmpenhoCardVinculos
          cardId={id}
          anos={anosDoCard(d.card.anos, anoAtual())}
          vinculos={d.vinculos}
          catalogo={d.catalogo}
          cadastro={d.cadastro}
          conflitos={d.conflitos}
          mapa={d.mapa}
          porOrgao={d.card.porOrgao}
          podeEditar
          podeBuscar
          comPeriodo={usaPeriodo(d.card.parametros)}
          configurado={!!d.card.configuradoEm}
          onMudou={mudou}
        />
      );
  }

  return (
    <div className="space-y-[var(--gap-block)]">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Voltar onFechar={onFechar} />
            <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full" style={{ background: c.cor }} />
            <h2 className="min-w-0 truncate text-lg font-bold tracking-tight text-text" title={c.nome}>
              {c.nome}
            </h2>
            <Badge tone={e.tom} dot vivo={c.lendo} tamanho="linha" className="shrink-0">
              {e.rotulo}
            </Badge>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Avisos
              titulo="Avisos do card"
              avisos={
                pendencias.length
                  ? [
                      {
                        id: "configurar",
                        tom: "warn",
                        texto: (
                          <>
                            <p className="font-semibold text-text">Configure o card antes de importar</p>
                            <p>{pendencias.map((p) => p.texto).join(" ")} A importação (e a atualização automática) só é liberada depois.</p>
                            <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
                              {etapas.map((et) => (
                                <button
                                  key={et.aba}
                                  type="button"
                                  onClick={() => onSub(et.aba)}
                                  className={`inline-flex min-h-11 items-center gap-1.5 font-semibold lg:min-h-0 ${et.feito ? "text-[color:var(--ok)]" : "text-text underline underline-offset-2"}`}
                                >
                                  {et.feito && <IconCheck className="h-4 w-4" />}
                                  {et.rotulo}
                                </button>
                              ))}
                              <span className="text-muted">{liq ? "2" : "3"}. Importação</span>
                            </p>
                          </>
                        ),
                      },
                    ]
                  : []
              }
            />
            <Button
              size="sm"
              variant="icon"
              loading={excluindo}
              aria-label={`Excluir o card ${c.nome}`}
              title="Excluir card"
              icon={<IconTrash className="h-4 w-4" style={{ color: "var(--danger)" }} />}
              onClick={() => excluir(c)}
            />
          </div>
        </div>
        <dl className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
          {indicadores.map((i) => (
            <div key={i.rotulo} className="flex items-baseline gap-1.5">
              <dt className="text-muted">{i.rotulo}</dt>
              <dd className="font-semibold tabular-nums text-text">{i.valor}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Segmented<SubAba>
          value={aba}
          onChange={onSub}
          ariaLabel={`Seções do card ${c.nome}`}
          options={subs.map((s) => ({ value: s, label: s === "importacao" ? "Importação" : s === "vinculos" ? "Vínculos" : "Configuração", curto: s === "configuracao" ? "Config." : undefined }))}
        />
        <div ref={setSlot} className="flex min-w-[min(100%,20rem)] flex-1 flex-wrap items-center justify-end gap-2 empty:hidden" />
      </div>
      {erro && d && <ErroCarga msg={erro} kind="warn" onTentar={carregar} />}
      <ConteudoAba aba={aba} abaServidor={aba} slot={slot} className="space-y-[var(--gap-block)]">
        {conteudo}
      </ConteudoAba>
      {confirmacao}
    </div>
  );
}

function Voltar({ onFechar }: { onFechar: () => void }) {
  return (
    <button
      type="button"
      onClick={onFechar}
      aria-label="Voltar às importações"
      title="Voltar às importações"
      className="grid h-11 w-11 shrink-0 place-items-center rounded-control text-muted transition-colors hover:bg-surface-2 hover:text-text lg:h-[var(--h-control-sm)] lg:w-[var(--h-control-sm)]"
    >
      <IconChevronLeft className="h-4 w-4" />
    </button>
  );
}
