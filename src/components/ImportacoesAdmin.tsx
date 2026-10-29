"use client";

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  anosAutomaticos,
  anosDoCard,
  type CardEmpenho,
  cardAutomatico,
  contagemAutomaticas,
  type ConfigImportacoes,
  cardPorOrgao,
  estadoCard,
  FREQUENCIAS,
  motivoConfigImportacoes,
  NOME_TIPO,
  OPCOES_INTERVALO,
  OPCOES_QUEDA,
  type OrgaoGestorCenti,
  orgaosDaLeitura,
  pendenciasDoCard,
  REGRAS_REMOVIDOS,
  type RegraRemovidos,
  type ResumoCard,
  rotuloAno,
  rotuloAnos,
  rotuloFrequencia,
  type TipoCard,
  type VinculoCard,
} from "@/lib/empenho-cards-core";
import { usaPeriodo } from "@/lib/empenhos-core";
import { haQuanto } from "@/lib/acessos-core";
import type { LinhaCron } from "@/lib/importacoes-cron-sql";
import { type EstadoLinha, importarCards, type LinhaImportacao, perguntaDeQueda, prepararCards } from "@/lib/importar-cards";
import { brl, dataHoraBR, num } from "@/lib/format";
import { ConteudoAba } from "./AbasEspaco";
import { Ajuda } from "./Ajuda";
import { type Aviso, Avisos } from "./Avisos";
import { AndamentoImportacao } from "./AndamentoImportacao";
import { useImportacaoDoCard, useImportacoesLocais } from "./ImportacoesAoVivo";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { useConfirmacao } from "./Confirmacao";
import { EmpenhoCardConfig } from "./EmpenhoCardConfig";
import { EmpenhoCardImportacao } from "./EmpenhoCardImportacao";
import { EmpenhoCardVinculos } from "./EmpenhoCardVinculos";
import { ErroCarga } from "./ErroCarga";
import { SelectField, TextField } from "./Field";
import { IconCheck, IconChevronLeft, IconDownload, IconEmpenho, IconPencil, IconLiquidacao, IconPagamento, IconTrash } from "./icons";
import { Modal } from "./Modal";
import { Progress } from "./Progress";
import { CartaoFinanceiro, GRADE_ORCAMENTOS } from "./OrcamentoCard";
import { QuadroNovoCard } from "./QuadroCard";
import { FrotaAdmin } from "./frota/FrotaAdmin";
import { Segmented } from "./Segmented";
import { SecaoBanner } from "./SecaoBanner";
import { SkeletonCartao } from "./Skeleton";
import { Switch } from "./Switch";
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
  // A FROTA (Vólus) mora na mesma aba, sem cards (uma integração só) — `?tipo=frotas`.
  const [frotas, setFrotas] = useState(false);
  const [aberto, setAberto] = useState<{ id: number; sub: SubAba } | null>(null);
  const [config, setConfig] = useState<ConfigImportacoes | null>(null);
  const [erroConfig, setErroConfig] = useState<string | null>(null);
  const [cron, setCron] = useState<LinhaCron[]>([]);

  const carregarConfig = useCallback(async () => {
    const r = await fetch("/api/admin/importacoes/config", { cache: "no-store" }).catch(() => null);
    const j = (await r?.json().catch(() => ({}))) as { ok?: boolean; error?: string; config?: ConfigImportacoes; cron?: LinhaCron[] } | undefined;
    if (r?.ok && j?.ok && j.config) {
      setConfig(j.config);
      setCron(j.cron ?? []);
      setErroConfig(null);
    } else setErroConfig(j?.error ?? "Não foi possível carregar a atualização automática.");
  }, []);

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
    if (t === "frotas") setFrotas(true);
    const id = Number(u.searchParams.get("card"));
    const sub = u.searchParams.get("sub");
    if (Number.isInteger(id) && id > 0) setAberto({ id, sub: sub === "vinculos" || sub === "configuracao" ? sub : "importacao" });
    void carregar();
    void carregarConfig();
  }, [carregar, carregarConfig]);

  // A SITUAÇÃO da automática acompanha a cada minuto (só com a aba à vista).
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void carregarConfig();
    }, 60_000);
    return () => clearInterval(id);
  }, [carregarConfig]);

  // O card aberto pelo endereço manda no tipo (um link só com `?card=` de outro tipo volta à lista certa).
  const tipoDoAberto = aberto ? cards?.find((c) => c.id === aberto.id)?.tipo : undefined;
  useEffect(() => {
    if (tipoDoAberto) setTipo(tipoDoAberto);
  }, [tipoDoAberto]);

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
  const trocarTipo = (t: TipoCard | "frotas") => {
    if (t === "frotas") {
      setFrotas(true);
      const u = new URL(window.location.href);
      u.searchParams.set("tipo", "frotas");
      u.searchParams.delete("card");
      u.searchParams.delete("sub");
      window.history.replaceState(null, "", u);
      return;
    }
    setFrotas(false);
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
        config={config}
        erroConfig={erroConfig}
        onTentarConfig={carregarConfig}
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
        <Segmented<TipoCard | "frotas">
          value={frotas ? "frotas" : tipo}
          onChange={trocarTipo}
          ariaLabel="Tipo de importação"
          options={[
            ...TIPOS.map((t) => ({ value: t, label: cards ? `${NOME_TIPO[t].titulo} (${num(contagem(t))})` : NOME_TIPO[t].titulo, curto: NOME_TIPO[t].titulo })),
            { value: "frotas" as const, label: "Frotas (Vólus)", curto: "Frotas" },
          ]}
        />
        {!frotas && (
          <div className="ml-auto flex items-center gap-2">
            {cards && config && <ImportarTudo cards={cards} regra={config.removidos} onMudou={carregar} />}
            <AjudaImportacoes />
          </div>
        )}
      </div>
      {frotas ? (
        <FrotaAdmin />
      ) : (
        <>
      {config && <PainelAutomatica config={config} cards={cards} cron={cron} onSalvo={setConfig} />}
      {erroConfig && <ErroCarga msg={erroConfig} onTentar={carregarConfig} />}
      {erro && <ErroCarga msg={erro} kind={cards ? "warn" : "danger"} onTentar={carregar} />}
      {cards == null && !erro ? (
        <div className={GRADE_ORCAMENTOS}>
          <SkeletonCartao />
          <SkeletonCartao />
        </div>
      ) : cards ? (
        <ListaCards tipo={tipo} cards={doTipo} todos={cards} config={config} onAbrir={(id, sub) => abrir(id, sub)} />
      ) : null}
        </>
      )}
    </div>
  );
}

/**
 * IMPORTAR TUDO de uma vez: todos os cards configurados (o executor `importarCards`, `importar-cards.ts` — o MESMO do
 * "Importar agora" das KPIs da Execução): cada card num lote próprio, um por vez, os empenhos primeiro; o ano escolhido ou
 * o lote aberto do card (retomado); a confirmação de cada queda vem uma por vez. Interromper para entre um card e outro.
 */
function ImportarTudo({ cards, regra, onMudou }: { cards: ResumoCard[]; regra: RegraRemovidos; onMudou: () => void }) {
  const anoAtual = new Date().getFullYear();
  const anos = useMemo(() => [...new Set(cards.flatMap((c) => anosDoCard(c.anos, anoAtual)))].sort((a, b) => b - a), [cards, anoAtual]);
  const [aberto, setAberto] = useState(false);
  const [ano, setAno] = useState(anoAtual);
  const [linhas, setLinhas] = useState<LinhaImportacao[] | null>(null);
  const [rodando, setRodando] = useState(false);
  const parar = useRef(false);
  const { perguntar, confirmacao } = useConfirmacao();

  const muda = (id: number, l: Partial<LinhaImportacao>) => setLinhas((ls) => ls?.map((x) => (x.card.id === id ? { ...x, ...l } : x)) ?? ls);

  useEffect(() => {
    if (!rodando) return;
    const aviso = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [rodando]);

  async function comecar() {
    parar.current = false;
    setRodando(true);
    try {
      const todas = await prepararCards(cards, () => ano, anoAtual);
      setLinhas(todas);
      await importarCards(todas, {
        regra,
        parar: () => parar.current,
        pararEntreCards: true,
        confirmarQueda: perguntaDeQueda(perguntar),
        onLinha: muda,
      });
    } finally {
      setRodando(false);
      onMudou();
    }
  }

  const locais = useImportacoesLocais();
  const vao = (linhas ?? []).filter((l) => l.estado !== "pulado");
  const feitos = vao.filter((l) => l.estado !== "fila" && l.estado !== "lendo").length;
  const total = vao.length;
  const fracao = total ? vao.reduce((t, l) => t + (l.estado === "fila" ? 0 : l.estado === "lendo" ? l.fracao : 1), 0) / total : 0;
  const tom = (e: EstadoLinha) => (e === "gravado" ? "emerald" : e === "falhou" ? "red" : e === "parcial" || e === "cancelado" ? "amber" : e === "lendo" ? "blue" : "slate");
  const rotulo: Record<EstadoLinha, string> = { fila: "Na fila", lendo: "Lendo", gravado: "Gravado", parcial: "Parcial", falhou: "Falhou", interrompido: "Interrompida", cancelado: "Cancelada", pulado: "Fora" };

  return (
    <>
      <Button size="sm" variant="secondary" icon={<IconDownload className="h-4 w-4" />} onClick={() => setAberto(true)}>
        Importar tudo
      </Button>
      <Modal
        open={aberto}
        onClose={() => !rodando && setAberto(false)}
        bloqueado={rodando}
        size="lg"
        titulo="Importar tudo"
        rodape={
          <div className="flex flex-wrap items-center justify-end gap-2">
            {rodando ? (
              <Button size="sm" variant="danger" onClick={() => (parar.current = true)}>
                Interromper
              </Button>
            ) : (
              <>
                <Button size="sm" variant="secondary" onClick={() => setAberto(false)}>
                  Fechar
                </Button>
                <Button size="sm" icon={<IconDownload className="h-4 w-4" />} onClick={comecar} disabled={!anos.length}>
                  {linhas ? "Importar de novo" : "Importar"}
                </Button>
              </>
            )}
          </div>
        }
      >
        <div className="space-y-[var(--gap-block)]">
          <p className="text-[13px] text-muted">
            Cada card num lote próprio, um de cada vez: primeiro os empenhos, depois as liquidações e os pagamentos (que se ligam
            ao empenho pelo número). Só o que mudou é gravado; a importação aberta de um card é continuada de onde parou.
          </p>
          <SelectField label="Ano" compacto value={String(ano)} onChange={(e) => setAno(Number(e.target.value))} disabled={rodando}>
            {anos.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </SelectField>
          {linhas && total > 0 && <Progress value={fracao * 100} label={`${num(feitos)} de ${num(total)} cards concluídos`} />}
          {linhas && (
            <ul className="divide-y divide-border rounded-card border border-border">
              {linhas.map((l) => (
                <li key={l.card.id} className="space-y-1 p-[var(--pad-card)]">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={tom(l.estado)} dot vivo={l.estado === "lendo"}>
                      {rotulo[l.estado]}
                    </Badge>
                    <span className="font-medium text-text">{l.card.nome}</span>
                    <span className="text-xs text-muted">
                      {NOME_TIPO[l.card.tipo].titulo} · {l.ano}
                    </span>
                  </div>
                  {!(l.estado === "lendo" && locais.some((x) => x.cardId === l.card.id && x.estado === "rodando")) && <p className="text-[12.5px] text-text-2">{l.texto}</p>}
                  {l.estado === "lendo" && <AndamentoDoCard cardId={l.card.id} fracao={l.fracao} />}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Modal>
      {confirmacao}
    </>
  );
}

/** O andamento ao vivo de UM card no "Importar tudo" (o da aba; antes de começar, a barra simples). */
function AndamentoDoCard({ cardId, fracao }: { cardId: number; fracao: number }) {
  const imp = useImportacaoDoCard(cardId);
  return imp?.estado === "rodando" ? <AndamentoImportacao imp={imp} compacto /> : <Progress value={fracao * 100} />;
}

/** O (?) da aba: como as importações funcionam. */
function AjudaImportacoes() {
  return (
    <Ajuda titulo="Importações da Centi" botao="sm">
      <p>
        Cada <strong>card</strong> é uma importação da Centi com a sua configuração (a integração e os anos). A{" "}
        <strong>atualização automática</strong> (horário, frequência, dias úteis) e as <strong>regras da conferência</strong> são as mesmas para
        todos os cards — o quadro acima da lista. Os dados importados aparecem nas telas Empenhos, Liquidações e Pagamentos.
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
function ListaCards({
  tipo,
  cards,
  todos,
  config,
  onAbrir,
}: {
  tipo: TipoCard;
  cards: ResumoCard[];
  todos: ResumoCard[];
  /** A configuração central (o selo "Automática" de cada card = a escolha dele). */
  config: ConfigImportacoes | null;
  onAbrir: (id: number, sub?: SubAba) => void;
}) {
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
          <CartaoFinanceiro key={c.id} onClick={() => onAbrir(c.id)} icone={<Icone className="h-5 w-5" />} {...propsDoCartao(c, !!config && cardAutomatico(config, c, anoAtual()))} />
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
function propsDoCartao(c: ResumoCard, automatica: boolean) {
  const e = estadoCard(c, c.lendo, automatica);
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
 * A ATUALIZAÇÃO AUTOMÁTICA e as REGRAS da conferência — CENTRAIS, valem para todos os cards: o resumo numa linha e
 * "Editar" abre os campos (`motivoConfigImportacoes`, a mesma régua do servidor). Gravar vale na próxima execução.
 */
/**
 * O QUE A AUTOMÁTICA ESTÁ FAZENDO: a última execução e, por importação, a situação atual e há quanto tempo está nela
 * (erro em vermelho; a mesma situação há mais de 30 min em âmbar) — o motivo de uma importação não avançar fica à vista.
 */
function SituacaoAutomatica({ cron, cards }: { cron: LinhaCron[]; cards: ResumoCard[] | null }) {
  const agora = Date.now();
  if (!cron.length) return <p className="mt-2 text-[13px] text-muted">A atualização automática ainda não registrou nenhuma execução.</p>;
  const geral = cron.find((c) => c.chave === "centi:geral");
  const nome = (chave: string) => {
    if (chave === "frota:geral") return "Frotas (Vólus)";
    const id = Number(chave.slice(6));
    return cards?.find((c) => c.id === id)?.nome ?? `Card ${id}`;
  };
  // "Parada" = a MESMA situação de TRABALHO há mais de 30 min (as de espera normal — fora da hora, intervalo, nada a fazer —
  // ficam iguais por horas sem nada errado).
  const espera = /fora da hora|intervalo mínimo|nada a atualizar|nenhum ano|nenhuma importação|desligada|conduzida por uma aba|importação manual/i;
  const parada = (c: LinhaCron) => !c.erro && !espera.test(c.situacao) && agora - Date.parse(`${c.desde.replace(" ", "T")}Z`) > 30 * 60_000;
  const linhas = cron.filter((c) => c.chave !== "centi:geral").sort((a, b) => b.erro - a.erro || nome(a.chave).localeCompare(nome(b.chave), "pt-BR"));
  return (
    <div className="mt-3 space-y-1.5 border-t border-border pt-3 text-[13px]">
      {geral && (
        <p className="text-text-2">
          Última execução {haQuanto(geral.em, agora)} · {geral.situacao}
        </p>
      )}
      <ul className="space-y-1">
        {linhas.map((c) => (
          <li key={c.chave} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <Badge tone={c.erro ? "red" : parada(c) ? "amber" : "slate"} dot>
              {nome(c.chave)}
            </Badge>
            <span className={c.erro ? "text-[color:var(--danger)]" : "text-text-2"}>{c.situacao}</span>
            <span className="text-faint tabular-nums" title={`Nesta situação desde ${dataHoraBR(`${c.desde.replace(" ", "T")}Z`)}`}>
              {haQuanto(c.desde, agora)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PainelAutomatica({ config, cards, cron, onSalvo }: { config: ConfigImportacoes; cards: ResumoCard[] | null; cron: LinhaCron[]; onSalvo: (c: ConfigImportacoes) => void }) {
  const [editando, setEditando] = useState<ConfigImportacoes | null>(null);
  const [salvando, setSalvando] = useState(false);
  const v = editando;
  const motivo = v ? motivoConfigImportacoes(v) : null;
  const muda = <K extends keyof ConfigImportacoes>(k: K, valor: ConfigImportacoes[K]) => setEditando((x) => (x ? { ...x, [k]: valor } : x));

  async function salvar() {
    if (!v || motivo) return;
    setSalvando(true);
    try {
      const r = await fetch("/api/admin/importacoes/config", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(v) });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; config?: ConfigImportacoes };
      if (!r.ok || !j.ok || !j.config) throw new Error(j.error ?? "Não foi possível salvar.");
      onSalvo(j.config);
      setEditando(null);
      toast.success(j.config.ativa ? "Atualização automática salva — vale na próxima execução." : "Configuração salva — a atualização automática está desligada.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  const queda = (n: number) => OPCOES_QUEDA.find((o) => o.valor === n)?.rotulo ?? `${n}%`;
  const ano = anoAtual();
  const conta = cards ? contagemAutomaticas(config, cards, ano) : null;
  /** Editar: a escolha do formato antigo (todas) vira a lista EXPLÍCITA — salvar passa a valer a escolha. */
  const editar = () =>
    setEditando({ ...config, automaticas: config.automaticas ?? Object.fromEntries((cards ?? []).map((c) => [String(c.id), [...c.anos]])) });
  return (
    <>
      <SecaoBanner
        titulo="Atualização automática e regras (todas as importações)"
        acao={
          <Button size="sm" variant="secondary" icon={<IconPencil className="h-4 w-4" />} onClick={editar}>
            Editar
          </Button>
        }
      >
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-text-2">
          <Badge tone={config.ativa ? "emerald" : "slate"} dot vivo={config.ativa}>
            {config.ativa ? "Ligada" : "Desligada"}
          </Badge>
          <span>{rotuloFrequencia(config.frequenciaMin, config.diasUteis, config.horaInicio, config.horaFim)}</span>
          {conta && (
            <span title="Importações (card × ano) que atualizam sozinhas — escolha em Editar.">
              {num(conta.auto)} de {num(conta.total)} {conta.total === 1 ? "importação automática" : "importações automáticas"}
            </span>
          )}
          <span className="text-muted">
            Queda: soma {queda(config.quedaSoma)} · registros {queda(config.quedaRegistros)} · {config.removidos === "apagar" ? "apaga" : "marca"} o que a Centi não traz mais
            {config.intervaloMin > 0 && ` · intervalo mínimo de ${(OPCOES_INTERVALO.find((o) => o.valor === config.intervaloMin)?.rotulo ?? "").toLowerCase()}`}
          </span>
        </p>
        <SituacaoAutomatica cron={cron} cards={cards} />
      </SecaoBanner>
      <Modal
        open={!!v}
        onClose={() => !salvando && setEditando(null)}
        bloqueado={salvando}
        size="lg"
        titulo="Atualização automática e regras"
        acoesCabecalho={motivo ? <Avisos titulo="Corrija antes de salvar" avisos={[{ id: "motivo", texto: motivo, tom: "danger" }]} /> : undefined}
        rodape={
          <div className="flex w-full justify-end gap-2">
            <Button size="sm" variant="secondary" onClick={() => setEditando(null)} disabled={salvando}>
              Cancelar
            </Button>
            <Button size="sm" onClick={salvar} loading={salvando} disabled={!!motivo}>
              Salvar
            </Button>
          </div>
        }
      >
        {v && (
          <div className="space-y-[var(--gap-block)]">
            <SecaoBanner titulo="Atualização automática">
              <div className="flex flex-wrap items-center gap-1">
                <Switch checked={v.ativa} onChange={(x) => muda("ativa", x)} label="Ligada" dica="Liga a atualização automática de TODAS as importações (desligada por padrão)." />
                <Ajuda titulo="Atualização automática" compacta>
                  <p>
                    Ligada, o sistema importa sozinho, em segundo plano, numa FILA ÚNICA: os cards de empenhos primeiro, depois os de liquidações e
                    de pagamentos — cada card na sua vez, um ano por vez, com a MESMA conferência da importação manual.
                  </p>
                  <p>Uma queda suspeita nunca passa sozinha: a importação fecha como parcial e você confirma numa importação manual.</p>
                </Ajuda>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <SelectField denso label="Frequência" value={String(v.frequenciaMin)} onChange={(e) => muda("frequenciaMin", Number(e.target.value))} rotuloExtra={<Ajuda titulo="Frequência" compacta>De quanto em quanto tempo cada card é lido, dentro do horário.</Ajuda>}>
                  {FREQUENCIAS.map((f) => (
                    <option key={f.valor} value={f.valor}>
                      {f.rotulo}
                    </option>
                  ))}
                </SelectField>
                <TextField denso label="Das" type="time" value={v.horaInicio} onChange={(e) => muda("horaInicio", e.target.value)} rotuloExtra={<Ajuda titulo="Horário" compacta>A leitura só acontece entre esses horários (Brasília).</Ajuda>} />
                <TextField denso label="Até" type="time" value={v.horaFim} onChange={(e) => muda("horaFim", e.target.value)} rotuloExtra={<Ajuda titulo="Horário" compacta>A leitura só acontece entre esses horários (Brasília).</Ajuda>} />
              </div>
              <div className="flex items-center gap-1">
                <Switch checked={v.diasUteis} onChange={(x) => muda("diasUteis", x)} label="Só em dias úteis" />
                <Ajuda titulo="Dias úteis" compacta>
                  Ligado: não lê aos sábados, domingos e feriados.
                </Ajuda>
              </div>
            </SecaoBanner>
            {cards && <EscolhaAutomaticas cards={cards} valor={v.automaticas ?? {}} legado={config.automaticas == null} onMudar={(a) => muda("automaticas", a)} />}
            <SecaoBanner titulo="Regras da conferência">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <SelectField denso label="Queda da soma" value={String(v.quedaSoma)} onChange={(e) => muda("quedaSoma", Number(e.target.value))} rotuloExtra={<Ajuda titulo="Queda da soma" compacta>A importação que trouxer a soma do ano ABAIXO deste % da última importação concluída pede confirmação antes de gravar (a automática fecha como parcial).</Ajuda>}>
                  {OPCOES_QUEDA.map((o) => (
                    <option key={o.valor} value={o.valor}>
                      {o.rotulo}
                    </option>
                  ))}
                </SelectField>
                <SelectField denso label="Queda dos registros" value={String(v.quedaRegistros)} onChange={(e) => muda("quedaRegistros", Number(e.target.value))} rotuloExtra={<Ajuda titulo="Queda dos registros" compacta>O mesmo para o número de registros do ano.</Ajuda>}>
                  {OPCOES_QUEDA.map((o) => (
                    <option key={o.valor} value={o.valor}>
                      {o.rotulo}
                    </option>
                  ))}
                </SelectField>
              </div>
              <SelectField
                denso
                label="Intervalo mínimo entre atualizações"
                value={String(v.intervaloMin)}
                onChange={(e) => muda("intervaloMin", Number(e.target.value))}
                rotuloExtra={
                  <Ajuda titulo="Intervalo mínimo" compacta>
                    Depois de uma importação concluída, o mesmo card só começa outra quando passar este tempo — vale para a importação do card, o “Importar tudo”, o
                    “Importar agora” da Execução e a atualização automática. Continuar uma importação aberta e importar de novo depois de uma falha seguem livres.
                  </Ajuda>
                }
              >
                {OPCOES_INTERVALO.map((o) => (
                  <option key={o.valor} value={o.valor}>
                    {o.rotulo}
                  </option>
                ))}
              </SelectField>
              <SelectField denso label="Registros que a Centi não traz mais" value={v.removidos} onChange={(e) => muda("removidos", e.target.value as RegraRemovidos)} rotuloExtra={<Ajuda titulo="Removidos na Centi" compacta>Marcar = ficam guardados, fora das somas (o rodapé das tabelas mostra “Removidos na Centi”). Apagar = saem do banco na importação conferida.</Ajuda>}>
                {REGRAS_REMOVIDOS.map((r) => (
                  <option key={r.valor} value={r.valor}>
                    {r.rotulo}
                  </option>
                ))}
              </SelectField>
            </SecaoBanner>
          </div>
        )}
      </Modal>
    </>
  );
}

/**
 * QUAIS IMPORTAÇÕES atualizam sozinhas: cada card (por tipo) com os ANOS dele em chips — toda importação é de um ano, então
 * a escolha é por card E por ano ("Ano atual" acompanha a virada do ano). O card ainda a configurar não entra.
 */
function EscolhaAutomaticas({
  cards,
  valor,
  legado,
  onMudar,
}: {
  cards: ResumoCard[];
  valor: Record<string, number[]>;
  /** A escolha ainda não foi salva (até agora, todas as importações eram automáticas). */
  legado: boolean;
  onMudar: (a: Record<string, number[]>) => void;
}) {
  const ano = anoAtual();
  const prontos = cards.filter((c) => pendenciasDoCard(c, c.vinculos).length === 0);
  const todas = () => onMudar(Object.fromEntries(prontos.map((c) => [String(c.id), [...c.anos]])));
  const nenhuma = () => onMudar({});
  const alternar = (c: ResumoCard, a: number, ligado: boolean) => {
    const atual = (valor[String(c.id)] ?? []).filter((x) => c.anos.includes(x));
    const novo = ligado ? c.anos.filter((x) => x === a || atual.includes(x)) : atual.filter((x) => x !== a);
    onMudar({ ...valor, [String(c.id)]: novo });
  };
  const avisos: Aviso[] = [
    ...(legado ? [{ id: "legado", texto: "Até agora todas as importações eram automáticas. Salvar passa a valer a escolha abaixo.", tom: "info" as const }] : []),
    ...cards
      .filter((c) => pendenciasDoCard(c, c.vinculos).length > 0)
      .map((c) => ({
        id: `pend-${c.id}`,
        texto: `${c.nome}: ${pendenciasDoCard(c, c.vinculos).map((p) => p.texto).join(" ")} — não entra na automática.`,
        tom: "warn" as const,
      })),
  ];
  return (
    <SecaoBanner
      titulo="Quais importações"
      acao={
        <div className="flex items-center gap-1">
          <Avisos titulo="Avisos da escolha" avisos={avisos} />
          <Button size="sm" variant="ghost" onClick={todas}>
            Todas
          </Button>
          <Button size="sm" variant="ghost" onClick={nenhuma}>
            Nenhuma
          </Button>
          <Ajuda titulo="Quais importações" compacta>
            <p>
              Ligue os ANOS de cada card que a atualização automática lê. Toda importação é de um ano: o card que tem 2025 e 2026 pode
              atualizar só 2026, por exemplo. “Ano atual” acompanha a virada do ano.
            </p>
            <p>O que fica desligado só é importado à mão (a aba Importação do card ou “Importar tudo”). Um card novo começa manual.</p>
          </Ajuda>
        </div>
      }
    >
      {cards.length === 0 && <p className="text-[13px] text-muted">Nenhum card cadastrado.</p>}
      {TIPOS.map((t) => {
        const doTipo = cards.filter((c) => c.tipo === t);
        if (!doTipo.length) return null;
        return (
          <div key={t} className="space-y-1.5">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-muted">{NOME_TIPO[t].titulo}</p>
            <ul className="divide-y divide-border rounded-control border border-border">
              {doTipo.map((c) => {
                const pend = pendenciasDoCard(c, c.vinculos).length > 0;
                const escolhidos = (valor[String(c.id)] ?? []).filter((a) => c.anos.includes(a));
                return (
                  <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1">
                    <span className={`min-w-0 flex-1 truncate text-[13px] font-medium ${pend ? "text-muted" : "text-text"}`} title={c.nome}>
                      {c.nome}
                    </span>
                    <div className="flex flex-wrap items-center gap-x-3">
                      {c.anos.map((a) => {
                        const rotulo = a <= 0 ? `${rotuloAno(a)} (${ano + a})` : rotuloAno(a);
                        const ligado = !pend && escolhidos.includes(a);
                        return (
                          <Switch
                            key={a}
                            checked={ligado}
                            disabled={pend}
                            onChange={(x) => alternar(c, a, x)}
                            label={rotulo}
                            dica={pend ? "Card a configurar — não entra na automática." : ligado ? `${c.nome} · ${rotulo}: automática (desligar = manual)` : `${c.nome} · ${rotulo}: manual (ligar = automática)`}
                          />
                        );
                      })}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </SecaoBanner>
  );
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
  config,
  erroConfig,
  onTentarConfig,
  onSub,
  onFechar,
  onMudou,
}: {
  id: number;
  sub: SubAba;
  cards: ResumoCard[];
  config: ConfigImportacoes | null;
  erroConfig: string | null;
  onTentarConfig: () => void;
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
  const e = estadoCard(c, c.lendo, !!config && cardAutomatico(config, c, anoAtual()));
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
    const j = (await r?.json().catch(() => ({}))) as { error?: string } | undefined;
    toast.error(j?.error ?? "Não foi possível excluir o card.");
  }

  const indicadores = [
    { rotulo: nome.titulo, valor: num(c.empenhos) },
    c.tipo === "pagamentos" ? { rotulo: "Pago líquido", valor: brl(c.liquidado) } : { rotulo: liq ? "Liquidado" : "Empenhado", valor: brl(c.soma) },
    { rotulo: "Anos", valor: rotuloAnos(c.anos) },
    { rotulo: "Última leitura", valor: c.ultimaExecucao ? dataHoraBR(c.ultimaExecucao) : "—" },
  ];

  let conteudo: ReactNode = <SkeletonCartao />;
  if (d) {
    if (aba === "importacao")
      conteudo = config ? (
        <EmpenhoCardImportacao card={d.card} config={config} podeExcluir onMudou={mudou} />
      ) : erroConfig ? (
        <ErroCarga msg={erroConfig} onTentar={onTentarConfig} />
      ) : (
        <SkeletonCartao />
      );
    else if (aba === "configuracao")
      conteudo = (
        <EmpenhoCardConfig
          card={d.card as CardEmpenho}
          leitura={d.vinculos && d.mapa ? orgaosDaLeitura(d.vinculos, d.mapa) : undefined}
          automaticos={config ? (config.ativa ? anosAutomaticos(config, d.card, anoAtual()) : null) : undefined}
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
