"use client";

import { useAnoDoCard } from "./anoDoCard";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { anosDoCard, type CardEmpenho, cardPorOrgao, pendenciasDoCard, type ResumoCard } from "@/lib/empenho-cards-core";
import {
  type AndamentoLote,
  fracaoDoAndamento,
  fracaoDoAno,
  resultadoDosPassos,
  textoResultado,
  diaBR,
  LEITOR_EMPENHOS,
  type LoteCenti,
  type PassoLote,
  type SaudeLote,
  ROTULO_ESTADO_LOTE,
  ROTULO_ESTADO_PASSO,
  rotuloPeriodo,
  usaPeriodo,
} from "@/lib/empenhos-core";
import { textoDuracao } from "@/lib/fluxo-progresso";
import { brl, dataHoraBR, dataIsoBrasilia, formatBytes } from "@/lib/format";
import { type Agora, lerAnoNaCenti, lerPassos, PARALELO_LIQUIDACOES, pedirImportacao, RecusaImportacao } from "@/lib/leitura-centi-cliente";
import { FerramentasAba } from "./AbasEspaco";
import { useEstimativa } from "./fluxos/useEstimativa";
import { Ajuda } from "./Ajuda";
import { Badge } from "./Badge";
import { BotaoCopiar } from "./BotaoCopiar";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { useConfirmacao } from "./Confirmacao";
import { type Column, DataTable } from "./DataTable";
import { ErroCarga } from "./ErroCarga";
import { SelectField } from "./Field";
import { CelulaTexto } from "./CelulaLista";
import { IconDownload, IconTrash } from "./icons";
import { Modal } from "./Modal";
import { Progress } from "./Progress";
import { SecaoBanner, ValorCampo } from "./SecaoBanner";
import { SkeletonLinhas } from "./Skeleton";
import { StatMini } from "./StatMini";
import { toast } from "./Toast";

/** Um órgão da Centi de um card de liquidações (o pedido de uma importação). */
type OrgaoLiq = { idOrgao: number; nome: string; sigla: string };

const anoAtual = () => Number(dataIsoBrasilia(new Date().toISOString()).slice(0, 4));

/** EXCLUI DO BANCO, vários de uma vez: importações inteiras (`{lotes}`) ou passos de uma importação (`{lote, passos}`). */
async function excluirTentativas(cardId: number, corpo: { lotes: number[] } | { lote: number; passos: number[] }): Promise<number> {
  const r = await fetch(`/api/empenhos/cards/${cardId}/importar`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
  const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; excluidos?: number };
  if (!r.ok || !j.ok) throw new Error(j.error ?? `Falha (${r.status}).`);
  return j.excluidos ?? 0;
}

const num = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("pt-BR"));
/** Os empenhos que a importação concluída trouxe IGUAIS (não regravados). */
const semMudanca = (l: LoteCenti) => Math.max(0, l.unicos - (l.fora ?? 0) - (l.inseridos ?? 0) - (l.atualizados ?? 0));
/** O tipo da importação no histórico. */
const rotuloTipo = (l: LoteCenti) =>
  `${l.modo === "pagamentos" ? "Pagamentos" : l.modo === "liquidacoes" ? "Liquidações" : l.modo === "unidades" ? "Catálogo" : "Empenhos"}${l.orgaosCenti ? ` · ${l.orgaosCenti.length} órgãos` : ""}`;
/** O que o lote lê, no plural ("Empenhos", "Liquidações"…). */
const nomeDoLote = (l: LoteCenti) => (l.modo === "pagamentos" ? "Pagamentos" : l.modo === "liquidacoes" ? "Liquidações" : l.modo === "unidades" ? "Catálogo e IDs" : "Empenhos");
/** O nome da soma do lote (o que a Centi traz). */
const rotuloSoma = (l: LoteCenti) => (l.modo === "pagamentos" ? "Soma paga (líquido)" : l.modo === "liquidacoes" ? "Soma liquidada" : "Soma empenhada");
/** A "página" de um passo: nas LIQUIDAÇÕES, o órgão da Centi lido (a página N do período é o N-ésimo órgão do lote). */
const rotuloPagina = (orgaos: number[] | null | undefined, pagina: number) => (orgaos ? `órgão ${orgaos[pagina - 1] ?? "?"}` : `página ${pagina}`);
const tempo = (ms: number | null) => (ms == null ? "—" : `${(ms / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} s`);



/** A duração da importação (do início à conclusão, ou até a última notícia enquanto lê) — em ms. */
const duracaoLote = (l: LoteCenti) => {
  const fim = l.concluidoEm ?? l.vistoEm;
  const t = Date.parse(`${fim.replace(" ", "T")}Z`) - Date.parse(`${l.iniciadoEm.replace(" ", "T")}Z`);
  return Number.isFinite(t) && t >= 0 ? t : null;
};

/**
 * A aba IMPORTAÇÃO de um card: a importação MANUAL lê o ano SEMANA A SEMANA (o período grande demais é dividido ao meio),
 * página a página, com a configuração SALVA do card; cada pedido vira um PASSO à vista na hora — lido ou com o erro em
 * detalhe — e os empenhos só são gravados quando todo o ano foi lido e a contagem confere com o total que a Centi informa.
 * Interromper, fechar a página ou uma falha deixam a tabela do card como estava. O histórico das importações fica abaixo
 * (com Excluir). O ano e o botão Importar ficam na barra das abas (`FerramentasAba`).
 */
export function EmpenhoCardImportacao({ card, podeExcluir }: { card: ResumoCard; podeExcluir: boolean }) {
  const api = card;
  const router = useRouter();
  const anos = useMemo(() => anosDoCard(card.anos, anoAtual()), [card.anos]);
  /** A configuração vem antes de importar (`pendenciasDoCard` — o aviso fica no cabeçalho do card). */
  const bloqueado = pendenciasDoCard(card, card.vinculos).length > 0;
  const [ano, setAno] = useAnoDoCard(card.id, anos);
  const [lotes, setLotes] = useState<(LoteCenti & { saude?: SaudeLote })[] | null>(null);
  const [emAndamento, setEmAndamento] = useState<LoteCenti | null>(null);
  /** O andamento da importação em curso por OUTRO condutor (a atualização automática ou outra aba) — relido a cada 15 s. */
  const [andamento, setAndamento] = useState<AndamentoLote | null>(null);
  const [atual, setAtual] = useState<LoteCenti | null>(null);
  const [passos, setPassos] = useState<PassoLote[]>([]);
  const [agora, setAgora] = useState<Agora | null>(null);
  /** Os segundos do pedido em curso — o andamento AO VIVO enquanto a Centi responde (o passo entra na tabela ao chegar). */
  const [segundos, setSegundos] = useState(0);
  useEffect(() => {
    setSegundos(0);
    if (!agora) return;
    const t0 = Date.now();
    const id = setInterval(() => setSegundos(Math.floor((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(id);
  }, [agora]);
  const [rodando, setRodando] = useState(false);
  const [historico, setHistorico] = useState<LoteCenti | null>(null);
  const [selLotes, setSelLotes] = useState<Set<number>>(new Set());
  const [desatualizados, setDesatualizados] = useState<{ ano: number; n: number }[]>([]);
  /** O que importar = o TIPO do card: os EMPENHOS ou as LIQUIDAÇÕES (todos os órgãos do cadastro com o "ID na Centi"). */
  const tipo = card.tipo;
  const liq = cardPorOrgao(tipo);
  const [orgaosLiq, setOrgaosLiq] = useState<OrgaoLiq[] | null>(null);
  const parar = useRef(false);
  /** O token DESTA aba — o servidor deixa uma aba por vez conduzir o lote. */
  const condutor = useRef("");
  const local = useRef(-1);
  const { confirmar, confirmacao } = useConfirmacao();
  const comPeriodo = usaPeriodo(api.parametros);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch(`/api/empenhos/cards/${api.id}/importar`);
      const j = (await r.json()) as {
        ok?: boolean;
        lotes?: (LoteCenti & { saude?: SaudeLote })[];
        emAndamento?: LoteCenti | null;
        andamento?: AndamentoLote | null;
        desatualizados?: { ano: number; n: number }[];
        orgaosLiquidacao?: OrgaoLiq[] | null;
      };
      if (j.ok) {
        setOrgaosLiq(j.orgaosLiquidacao ?? null);
        setLotes(j.lotes ?? []);
        setEmAndamento(j.emAndamento ?? null);
        setAndamento(j.andamento ?? null);
        setDesatualizados(j.desatualizados ?? []);
      }
    } catch {
      setLotes((l) => l ?? []);
    }
  }, [api.id]);
  useEffect(() => {
    void carregar();
  }, [carregar]);
  // Outro condutor lendo (a atualização automática, outra aba): a tela acompanha sozinha, com a aba à vista.
  const acompanhar = !!emAndamento?.conduzido && !rodando;
  useEffect(() => {
    if (!acompanhar) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void carregar();
    }, 15_000);
    return () => clearInterval(id);
  }, [acompanhar, carregar]);
  /** O tempo restante AO VIVO: a fração do ano (ou da resposta grande) amostrada a cada mudança. */
  const fracaoAtual = rodando && atual ? fracaoDoAno(atual.ano, passos) : acompanhar && andamento && emAndamento ? fracaoDoAndamento(emAndamento.ano, andamento) : 0;
  const restante = useEstimativa(fracaoAtual, rodando || acompanhar);
  const textoRestante = restante == null ? "" : ` · termina em ≈ ${textoDuracao(restante)}`;

  useEffect(() => {
    if (!rodando) return;
    const aviso = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [rodando]);

  const anotar = (p: PassoLote) => setPassos((l) => [...l, p]);

  /** Lê UM lote (os empenhos, ou as liquidações de todos os órgãos da Centi). true = gravado. */
  async function importar(retomar: LoteCenti | null): Promise<boolean> {
    parar.current = false;
    condutor.current = crypto.randomUUID();
    setRodando(true);
    setPassos([]);
    const deQuem = "";
    let lote = retomar;
    let onde = "";
    try {
      if (!lote) lote = (await pedirImportacao<{ lote: LoteCenti }>(api.id, { acao: "iniciar", ano, condutor: condutor.current, ...(tipo !== "empenhos" ? { modo: tipo } : {}) })).lote;
      setAtual(lote);
      const anteriores = retomar ? await lerPassos(api.id, retomar.id) : [];
      setPassos(anteriores);
      lote = await lerAnoNaCenti({
        cardId: api.id,
        lote,
        anteriores,
        condutor: condutor.current,
        comPeriodo,
        parar: () => parar.current,
        onPasso: anotar,
        onLote: setAtual,
        onAgora: setAgora,
        idLocal: () => local.current--,
        onde: (t) => {
          onde = t;
        },
      });
      if (parar.current) {
        await pedirImportacao(api.id, { acao: "cancelar", lote: lote.id, condutor: condutor.current, motivo: "Interrompida por quem importava." });
        toast.info("Importação interrompida — nada foi gravado.");
        return false;
      }
      let conclusao = await pedirImportacao<{ lote: LoteCenti; queda?: string }>(api.id, { acao: "concluir", lote: lote.id, condutor: condutor.current });
      if (conclusao.queda) {
        // A QUEDA em relação à última importação concluída: só grava com a confirmação de quem importa.
        const seguir = await confirmar({ titulo: "Os números caíram — gravar mesmo assim?", texto: `${conclusao.queda} Confira a Centi antes: se for um erro de leitura, cancele (nada é gravado).`, confirmar: "Gravar", cancelar: "Cancelar importação", perigo: true });
        if (!seguir) {
          await pedirImportacao(api.id, { acao: "cancelar", lote: lote.id, condutor: condutor.current, motivo: `Cancelada: ${conclusao.queda}`.slice(0, 300) });
          toast.info("Importação cancelada — nada mudou.");
          return false;
        }
        conclusao = await pedirImportacao<{ lote: LoteCenti; queda?: string }>(api.id, { acao: "concluir", lote: lote.id, condutor: condutor.current, aceitarQueda: true });
      }
      const fim = conclusao.lote;
      setAtual(fim);
      if (fim.estado === "unidades") {
        toast.success(fim.mensagem ?? "Catálogo da Centi atualizado.");
      } else if (fim.estado === "promovido" && tipo === "pagamentos") {
        toast.success(`Pagamentos ${fim.ano} de ${num(fim.orgaosCenti?.length ?? 0)} órgãos importados (${brl(fim.soma)} pagos, líquido): ${num(fim.inseridos)} novos, ${num(fim.atualizados)} atualizados, ${num(semMudanca(fim))} sem mudança, ${num(fim.removidos)} ${card.removidos === "apagar" ? "apagados" : "marcados como removidos"}${fim.fora ? `, ${num(fim.fora)} sem o empenho nem o órgão no cadastro (não gravados)` : ""}.`);
        router.refresh();
      } else if (fim.estado === "promovido" && liq) {
        toast.success(`Liquidações ${fim.ano} de ${num(fim.orgaosCenti?.length ?? 0)} órgãos importadas (${brl(fim.soma)} liquidados): ${num(fim.inseridos)} novas, ${num(fim.atualizados)} atualizadas, ${num(semMudanca(fim))} sem mudança, ${num(fim.removidos)} ${card.removidos === "apagar" ? "apagadas" : "marcadas como removidas"}${fim.fora ? `, ${num(fim.fora)} sem o empenho nem o órgão no cadastro (não gravadas)` : ""}.`);
        router.refresh();
      } else if (fim.estado === "promovido") {
        toast.success(`Empenhos ${fim.ano} importados e conferidos (${brl(fim.soma)} empenhados): ${num(fim.inseridos)} novos, ${num(fim.atualizados)} atualizados, ${num(semMudanca(fim))} sem mudança, ${num(fim.removidos)} ${card.removidos === "apagar" ? "apagados" : "marcados como removidos"}${fim.fora ? `, ${num(fim.fora)} sem vínculo no card (não gravados)` : ""}.`);
        router.refresh();
      } else {
        toast.error(`Importação parcial${deQuem} — nada foi gravado. ${fim.mensagem ?? ""}`);
      }
      return fim.estado === "promovido" || fim.estado === "unidades";
    } catch (e) {
      setAgora(null);
      const msg = e instanceof Error ? e.message : "Falha na importação.";
      if (e instanceof RecusaImportacao) {
        // Recusado pelo sistema (ex.: outra aba conduz o lote) — o lote é de quem o conduz: não cancela.
        toast.error(msg);
      } else if (lote && parar.current) {
        await pedirImportacao(api.id, { acao: "cancelar", lote: lote.id, condutor: condutor.current, motivo: "Interrompida por quem importava." }).catch(() => {});
        toast.info("Importação interrompida — nada foi gravado.");
      } else if (lote) {
        // A falha (a Centi fora do ar, a rede) NÃO perde o que já foi lido: a importação fica ABERTA — Continuar lê só o
        // que falta. A trava desta aba é solta para qualquer aba poder continuar.
        await pedirImportacao(api.id, { acao: "pausar", lote: lote.id, condutor: condutor.current }).catch(() => {});
        toast.error(`A leitura${deQuem} parou${onde ? ` em ${onde}` : ""}: ${msg} O que já foi lido ficou guardado — toque em Continuar para ler só o que falta.`);
      } else {
        toast.error(msg);
      }
      return false;
    } finally {
      setRodando(false);
      void carregar();
    }
  }

  // Trocar de ano (fora de uma leitura) tira da tela os passos e os números da importação de outro ano.
  useEffect(() => {
    if (!rodando && atual && atual.ano !== ano) {
      setAtual(null);
      setPassos([]);
    }
  }, [ano, rodando, atual]);

  async function interromper() {
    if (await confirmar({ titulo: "Interromper a importação?", texto: "O que já foi lido é descartado; os empenhos ficam como estavam.", confirmar: "Interromper", perigo: true })) {
      parar.current = true;
    }
  }

  async function cancelarParada(l: LoteCenti) {
    if (!(await confirmar({ titulo: `Cancelar a importação de ${l.ano}?`, texto: "O que já foi lido é descartado; os empenhos ficam como estavam.", confirmar: "Cancelar importação", perigo: true }))) return;
    await pedirImportacao(api.id, { acao: "cancelar", lote: l.id, motivo: "Cancelada por quem importava." }).catch((e) => toast.error(e instanceof Error ? e.message : "Falha."));
    void carregar();
  }

  /** Exclui do banco as importações escolhidas (a que está lendo agora fica de fora). */
  async function excluirLotes(ls: LoteCenti[]): Promise<boolean> {
    const alvo = ls.filter((l) => !(rodando && atual?.id === l.id));
    if (!alvo.length) return false;
    const uma = alvo.length === 1 ? alvo[0] : null;
    const ok = await confirmar({
      titulo: uma ? `Excluir a importação de ${uma.ano}?` : `Excluir ${alvo.length} importações?`,
      texto: `${uma ? `A tentativa de ${dataHoraBR(uma.iniciadoEm)} sai` : "As tentativas saem"} do banco com os passos e o que foi lido.${alvo.some((l) => l.estado === "promovido") ? " Os empenhos gravados pelas importações concluídas continuam." : ""}`,
      confirmar: "Excluir",
      perigo: true,
    });
    if (!ok) return false;
    try {
      const n = await excluirTentativas(api.id, { lotes: alvo.map((l) => l.id) });
      toast.success(`${num(n)} importaç${n === 1 ? "ão excluída" : "ões excluídas"} do banco.`);
      const ids = new Set(alvo.map((l) => l.id));
      if (atual && ids.has(atual.id)) {
        setAtual(null);
        setPassos([]);
      }
      if (historico && ids.has(historico.id)) setHistorico(null);
      setSelLotes(new Set());
      void carregar();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao excluir.");
      return false;
    }
  }

  /** Exclui passos de uma importação (os locais, que não chegaram ao servidor, saem só da tela). */
  async function excluirPassos(l: LoteCenti, ps: PassoLote[]): Promise<boolean> {
    const lidos = ps.filter((p) => p.estado === "ok").length;
    const ok = await confirmar({
      titulo: ps.length === 1 ? "Excluir este passo?" : `Excluir ${ps.length} passos?`,
      texto: `${ps.length === 1 ? `${rotuloPeriodo(ps[0])} · página ${ps[0].pagina} sai` : "Os passos saem"} do banco.${lidos && l.estado === "lendo" ? " Os períodos lidos voltam a faltar e são lidos de novo ao continuar." : ""}`,
      confirmar: "Excluir",
      perigo: true,
    });
    if (!ok) return false;
    try {
      const ids = ps.filter((p) => p.id > 0).map((p) => p.id);
      if (ids.length) await excluirTentativas(api.id, { lote: l.id, passos: ids });
      const fora = new Set(ps.map((p) => p.id));
      if (atual?.id === l.id) setPassos((lista) => lista.filter((x) => !fora.has(x.id)));
      toast.success(`${num(ps.length)} passo${ps.length === 1 ? " excluído" : "s excluídos"}.`);
      void carregar();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao excluir.");
      return false;
    }
  }

  const erros = passos.filter((p) => p.estado === "erro").length;
  const colunas: Column<LoteCenti & { saude?: SaudeLote }>[] = [
    { key: "quando", header: "Quando", nowrap: true, value: (l) => dataHoraBR(l.iniciadoEm), render: (l) => <span className="tabular-nums">{dataHoraBR(l.iniciadoEm)}</span> },
    { key: "ano", header: "Ano", nowrap: true, total: false, value: (l) => String(l.ano), render: (l) => <span className="tabular-nums">{l.ano}</span> },
    {
      key: "estado",
      header: "Situação",
      nowrap: true,
      value: (l) => ROTULO_ESTADO_LOTE[l.estado]?.rotulo ?? l.estado,
      render: (l) => (
        <Badge tone={ROTULO_ESTADO_LOTE[l.estado]?.tom ?? "slate"} dot>
          {ROTULO_ESTADO_LOTE[l.estado]?.rotulo ?? l.estado}
        </Badge>
      ),
    },
    {
      key: "conferencia",
      header: "Conferência",
      nowrap: true,
      value: (l) => `${l.unicos + l.recusados} de ${l.totalInformado ?? "?"}`,
      render: (l) => (
        <span className="tabular-nums">
          {num(l.unicos + l.recusados)} de {l.totalInformado != null ? num(l.totalInformado) : "?"}
        </span>
      ),
    },
    {
      key: "pedidos",
      header: "Pedidos",
      nowrap: true,
      filter: "range",
      formatarFaixa: num,
      value: (l) => String(l.saude?.pedidos ?? 0),
      numero: (l) => l.saude?.pedidos ?? 0,
      render: (l) =>
        l.saude ? (
          <span className="tabular-nums" title={`${num(l.saude.pedidos)} pedidos à Centi · ${num(l.saude.erros)} com erro`}>
            {num(l.saude.pedidos)}
            {l.saude.erros ? <span className="text-danger"> · {num(l.saude.erros)} erro(s)</span> : null}
          </span>
        ) : (
          "—"
        ),
    },
    { key: "bytes", header: "Baixado", nowrap: true, total: false, filter: "none", value: (l) => String(l.saude?.bytes ?? 0), render: (l) => <span className="tabular-nums">{l.saude?.bytes ? formatBytes(l.saude.bytes) : "—"}</span> },
    {
      key: "duracao",
      header: "Duração",
      nowrap: true,
      total: false,
      filter: "none",
      value: (l) => String(duracaoLote(l) ?? 0),
      render: (l) => {
        const d = duracaoLote(l);
        return <span className="tabular-nums" title={l.saude ? `Esperando a Centi: ${textoDuracao(l.saude.msCenti)}` : undefined}>{d == null ? "—" : textoDuracao(d)}</span>;
      },
    },
    {
      key: "resultado",
      header: "Resultado",
      align: "left",
      minWidth: 220,
      value: (l) => l.mensagem ?? "",
      render: (l) =>
        l.estado === "promovido" ? (
          <span className="text-text-2">
            {num(l.inseridos)} novos · {num(l.atualizados)} atualizados · {num(semMudanca(l))} sem mudança · {num(l.removidos)} removidos
            {l.fora ? ` · ${num(l.fora)} sem vínculo (não gravados)` : ""}
          </span>
        ) : (
          <CelulaTexto texto={l.mensagem ?? (l.estado === "lendo" ? "Em andamento" : "—")} />
        ),
    },
    {
      key: "tipo",
      header: "Tipo",
      nowrap: true,
      value: (l) => rotuloTipo(l),
      render: (l) => <Badge tone={l.modo === "pagamentos" ? "emerald" : l.modo === "liquidacoes" ? "violet" : l.modo === "unidades" ? "slate" : "blue"}>{rotuloTipo(l)}</Badge>,
    },
    { key: "soma", header: "Soma", nowrap: true, align: "right", filter: "range", numero: (l) => l.soma, render: (l) => <span className="tabular-nums">{l.soma != null ? brl(l.soma) : "—"}</span> },
    { key: "leitor", header: "Leitor", nowrap: true, total: false, value: (l) => String(l.leitor), render: (l) => (l.leitor < LEITOR_EMPENHOS ? <Badge tone="amber">v{l.leitor} (anterior)</Badge> : <span className="tabular-nums text-muted">v{l.leitor}</span>) },
    { key: "quem", header: "Por", nowrap: true, value: (l) => l.iniciadoPor, render: (l) => <span className="text-muted">{l.iniciadoPor}</span> },
  ];

  return (
    <>
      <FerramentasAba>
        <SelectField compacto label="Ano" value={String(ano)} onChange={(e) => setAno(Number(e.target.value))} disabled={rodando}>
          {anos.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </SelectField>
        {rodando ? (
          <Button size="sm" variant="danger" onClick={() => void interromper()}>
            Interromper
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={() => void importar(null)}
            disabled={!!emAndamento || !anos.length || bloqueado}
            title={
              bloqueado
                ? liq
                  ? "Configure o card antes de importar (Configuração) e cadastre o “ID na Centi” dos órgãos (Órgãos e Unidades)"
                  : "Configure o card antes de importar (Configuração e Vínculos)"
                : emAndamento
                  ? `Há uma importação de ${emAndamento.ano} em andamento — continue ou cancele antes (aviso abaixo)`
                  : liq && orgaosLiq
                    ? `Lê os ${orgaosLiq.length} órgãos com o ID na Centi: ${orgaosLiq.map((o) => `${o.idOrgao} · ${o.sigla}`).join(", ")}`
                    : undefined
            }
            icon={<IconDownload className="h-4 w-4" />}
          >
            Importar {ano}
          </Button>
        )}
        <Ajuda titulo="Importação" botao="sm">
          <p>
            Lê o ano <strong>{tipo === "pagamentos" ? "mês a mês" : "semana a semana"}</strong>
            {tipo === "pagamentos" ? " (a Centi só recorta os pagamentos por mês)" : " (o período que vier grande demais é dividido ao meio), página a página"}, com a
            configuração salva do card, e guarda tudo num lote separado. Cada pedido aparece na hora em <strong>Passos</strong> — toque
            num para ver o detalhe (o pedido enviado, a resposta, o tempo, o erro).
          </p>
          <p>
            O JSON da Centi é lido <strong>aqui no navegador</strong> e chega ao sistema em partes de tamanho fixo — nenhum pedido passa
            do limite do plano gratuito, qualquer que seja o tamanho do mês. Na <strong>atualização automática</strong> (sem navegador),
            a resposta grande é baixada e processada em fragmentos, um a cada minuto.
          </p>
          {tipo === "pagamentos" ? (
            <>
              <p>
                A Centi entrega os pagamentos por <strong>órgão</strong> e por <strong>mês</strong>, sem páginas. Uma importação lê{" "}
                <strong>todos</strong> os órgãos com o “ID na Centi” cadastrado em Órgãos e Unidades: em cada mês, um pedido por órgão, ao
                mesmo tempo (a coluna Órgão dos passos).
              </p>
              <p>
                A Centi não informa a unidade do pagamento: o <strong>número do empenho</strong> liga o pagamento ao empenho, e o órgão e a
                unidade dele são os do empenho (importe os empenhos antes, inclusive os de anos anteriores, para os restos a pagar). Sem o
                empenho no sistema, fica o órgão do cadastro com o ID na Centi, sem unidade — e passa a seguir o empenho quando ele for
                importado.
              </p>
              <p>
                Os pagamentos só são gravados quando o ano inteiro foi lido, a contagem confere e os valores e a queda passam pelas regras do
                card. As ordens com anulação ficam guardadas, fora do pago líquido. O que sumir da Centi segue a regra do card.
              </p>
            </>
          ) : tipo === "liquidacoes" ? (
            <>
              <p>
                A Centi entrega as liquidações por <strong>órgão</strong>, sem páginas. Uma importação lê <strong>todos</strong> os órgãos
                com o “ID na Centi” cadastrado em Órgãos e Unidades: em cada semana, um pedido por órgão (a coluna Órgão dos passos).
              </p>
              <p>
                A Centi não informa a unidade da liquidação: o <strong>número do empenho</strong> liga a liquidação ao empenho, e o órgão
                e a unidade dela são os do empenho (importe os empenhos antes, inclusive os de anos anteriores, para os restos a pagar).
                Sem o empenho no sistema, fica o órgão do cadastro com o ID na Centi, sem unidade — e passa a seguir o empenho quando ele
                for importado.
              </p>
              <p>
                As liquidações só são gravadas quando o ano inteiro foi lido, a contagem confere e os valores e a queda passam pelas regras
                do card. O que sumir da Centi segue a regra do card.
              </p>
            </>
          ) : (
            <>
              <p>
                Os empenhos só são gravados quando o ano inteiro foi lido e a contagem <strong>confere</strong> com o total que a Centi
                informa em cada período. Faltou registro, a Centi falhou ou você interrompeu: o lote fica parcial e a tabela do card
                continua como estava. O que sumir da Centi segue a <strong>regra do card</strong> (marcar como removido ou apagar).
              </p>
              <p>
                A conclusão também confere os <strong>valores</strong>: nenhum negativo ou acima de R$ 1 bilhão, e a soma empenhada e o
                número de empenhos não podem cair abaixo do limite das regras do card em relação à última importação concluída do ano
                (você confirma antes de gravar). Reimportar regrava só o que <strong>mudou</strong> — o resumo diz quantos vieram iguais.
              </p>
              <p>
                Só os empenhos que os <strong>vínculos</strong> do card cobrem são gravados; os outros são lidos e conferidos, mas
                descartados. Uma <strong>aba por vez</strong> conduz a importação.
              </p>
            </>
          )}
          <p>Toque numa importação do histórico para ver os passos dela; marque e use Excluir para tirá-las do banco (o que já foi gravado continua).</p>
        </Ajuda>
      </FerramentasAba>
      {liq && orgaosLiq && orgaosLiq.length === 0 && (
        <Callout kind="warn">Nenhum órgão tem o “ID na Centi” — cadastre em Órgãos e Unidades: a importação lê {tipo === "pagamentos" ? "os pagamentos" : "as liquidações"} de todos os órgãos com o ID.</Callout>
      )}
      {liq && !rodando && (
        <Callout kind="info">
          O órgão e a unidade de cada {tipo === "pagamentos" ? "pagamento" : "liquidação"} vêm do <strong>empenho de mesmo número</strong>: importe os
          empenhos antes. Os que chegarem depois realinham sozinhos.
        </Callout>
      )}
      {!comPeriodo && tipo !== "pagamentos" && (
        <Callout kind="warn">
          Os parâmetros não usam <code>{"{inicio}"}</code> e <code>{"{fim}"}</code>: o ano só pode ser lido inteiro, e a Centi
          pode recusar por ser grande demais.
        </Callout>
      )}
      {desatualizados.length > 0 && !rodando && (
        <Callout kind="warn">
          {desatualizados.map((d) => `${d.ano} (${num(d.n)} empenhos)`).join(", ")}: lido{desatualizados.length === 1 ? "" : "s"} por uma versão anterior do
          leitor. Importe de novo para atualizar — nada é apagado; o que mudou é regravado.
        </Callout>
      )}
      {emAndamento && !rodando && emAndamento.conduzido && (
        <Callout kind="info">
          <span className="block">
            {emAndamento.automatica
              ? `A atualização automática está importando ${emAndamento.ano} (${num(emAndamento.unicos)} registros lidos) — esta tela acompanha sozinha.`
              : `A importação de ${emAndamento.ano} está em andamento em outra aba (${num(emAndamento.unicos)} registros lidos). Acompanhe por lá — se aquela aba foi fechada, ela fica livre para continuar aqui em até 2 minutos.`}
          </span>
          {andamento && (
            <span className="mt-2 block">
              <Progress
                value={fracaoDoAndamento(emAndamento.ano, andamento) * 100}
                label={`${Math.floor(andamento.fracao * 100)}% do ano lido${andamento.leitura ? ` · ${rotuloPeriodo(andamento.leitura)}: resposta grande ${andamento.leitura.capturado ? `capturada (${formatBytes(andamento.leitura.bytes)}), processando ${Math.floor((100 * andamento.leitura.pos) / Math.max(1, andamento.leitura.chars))}%` : `sendo baixada (${formatBytes(andamento.leitura.bytes)}${andamento.leitura.comprimento ? ` de ${formatBytes(andamento.leitura.comprimento)}` : ""})`}` : ""}${textoRestante}`}
              />
            </span>
          )}
        </Callout>
      )}
      {emAndamento && !rodando && !emAndamento.conduzido && (
        <Callout kind="warn">
          <span className="flex flex-wrap items-center justify-between gap-2">
            Há uma importação de {emAndamento.ano} parada ({num(emAndamento.unicos)} registros lidos) — Continuar lê só o que falta
            {card.ativa ? "; com a atualização automática ligada, ela continua sozinha em até 2 minutos." : "."}
            <span className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => setHistorico(emAndamento)}>
                Ver passos
              </Button>
              <Button size="sm" variant="secondary" onClick={() => void cancelarParada(emAndamento)}>
                Cancelar
              </Button>
              <Button size="sm" onClick={() => void importar(emAndamento)}>
                Continuar
              </Button>
            </span>
          </span>
        </Callout>
      )}
      {(rodando || passos.length > 0) && atual && (
        <div className="space-y-3">
          {rodando && atual.orgaosCenti && (
            <p className="text-[13px] text-muted">
              {nomeDoLote(atual)} de {num(atual.orgaosCenti.length)} órgãos da Centi, lidos ao mesmo tempo em cada{" "}
              {atual.modo === "pagamentos" ? "mês" : "semana"} (até {PARALELO_LIQUIDACOES} pedidos em paralelo).
            </p>
          )}
          {rodando && (
            <Progress
              value={fracaoDoAno(atual.ano, passos) * 100}
              label={
                agora
                  ? `${agora.emCurso && agora.emCurso > 1 ? `${agora.emCurso} pedidos em paralelo · último: ` : ""}${rotuloPeriodo(agora.periodo)} · ${rotuloPagina(atual.orgaosCenti, agora.pagina)}${agora.tentativa > 1 ? ` · tentativa ${agora.tentativa}` : ""}${agora.espera ? ` · nova tentativa em ${agora.espera / 1000} s` : ` · aguardando a Centi há ${segundos} s`}${textoRestante}`
                  : "Conferindo…"
              }
            />
          )}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(9rem,100%),1fr))] gap-[var(--gap-block)]">
            <StatMini label="Registros distintos" value={num(atual.unicos)} hint={`${num(atual.recebidos)} recebidos`} />
            <StatMini label="Total informado" value={num(atual.totalInformado)} hint="Soma dos períodos lidos" />
            <StatMini label="Ano lido" value={`${Math.floor(fracaoDoAno(atual.ano, passos) * 100)}%`} hint={`${num(atual.paginas)} páginas`} />
            <StatMini label={rotuloSoma(atual)} value={atual.soma != null ? brl(atual.soma) : "—"} hint="Dos registros distintos" />
            <StatMini label="Erros" value={num(erros)} tone={erros ? "danger" : "default"} hint={atual.recusados ? `${num(atual.recusados)} recusados` : undefined} />
          </div>
          <ResultadoAteAgora passos={passos} />
          <PassosDoLote passos={passos} orgaos={atual.orgaosCenti} nome={`Passos ${api.nome} ${atual.ano}`} onExcluir={rodando || !podeExcluir ? undefined : (ps) => excluirPassos(atual, ps)} />
        </div>
      )}
      {lotes && lotes.length > 0 && (
        <DataTable
          columns={colunas}
          rows={lotes}
          getKey={(l) => l.id}
          density="compact"
          onRowClick={(l) => setHistorico(l)}
          exportar={{ nome: `Importações ${api.nome}` }}
          selectable={podeExcluir}
          selected={selLotes}
          onSelected={(s) => setSelLotes(s as Set<number>)}
          acoesRodape={
            selLotes.size > 0 ? (
              <Button size="sm" variant="danger" icon={<IconTrash className="h-4 w-4" />} onClick={() => void excluirLotes(lotes.filter((l) => selLotes.has(l.id)))}>
                Excluir selecionadas ({num(selLotes.size)})
              </Button>
            ) : undefined
          }
          resumo={(l) => `${l.length} importaç${l.length === 1 ? "ão" : "ões"}`}
        />
      )}
      {historico && (
        <PassosDoHistorico
          api={api}
          lote={historico}
          onClose={() => setHistorico(null)}
          onExcluir={!podeExcluir || (rodando && atual?.id === historico.id) ? undefined : () => void excluirLotes([historico])}
          onExcluirPasso={!podeExcluir || (rodando && atual?.id === historico.id) ? undefined : (ps) => excluirPassos(historico, ps)}
        />
      )}
      {confirmacao}
    </>
  );
}


/** Os PASSOS de um lote (o mais recente primeiro), com o detalhe de cada um ao tocar — ao vivo e no histórico. */
function PassosDoLote({
  passos,
  orgaos,
  nome,
  onExcluir,
  selecao,
}: {
  passos: PassoLote[];
  /** LIQUIDAÇÕES: os órgãos da Centi do lote — a coluna "Página" vira o órgão lido. */
  orgaos?: number[] | null;
  nome: string;
  onExcluir?: (ps: PassoLote[]) => Promise<boolean>;
  /** A seleção controlada de fora (a ação de excluir fica com quem controla — ex.: o rodapé do banner). */
  selecao?: { sel: Set<number>; onSel: (s: Set<number>) => void };
}) {
  const [aberto, setAberto] = useState<PassoLote | null>(null);
  const [selLocal, setSelLocal] = useState<Set<number>>(new Set());
  const sel = selecao?.sel ?? selLocal;
  const setSel = selecao?.onSel ?? setSelLocal;
  const [excluindo, setExcluindo] = useState(false);
  const linhas = useMemo(() => [...passos].reverse(), [passos]);
  const colunas: Column<PassoLote>[] = [
    { key: "em", header: "Hora", nowrap: true, value: (p) => dataHoraBR(p.em), render: (p) => <span className="tabular-nums">{dataHoraBR(p.em).slice(11)}</span> },
    { key: "periodo", header: "Período", nowrap: true, value: (p) => rotuloPeriodo(p), render: (p) => rotuloPeriodo(p) },
    orgaos
      ? { key: "pagina", header: "Órgão (Centi)", nowrap: true, total: false, value: (p) => String(orgaos[p.pagina - 1] ?? "?"), render: (p) => <span className="tabular-nums">{orgaos[p.pagina - 1] ?? "?"}</span> }
      : { key: "pagina", header: "Página", nowrap: true, total: false, value: (p) => String(p.pagina), render: (p) => <span className="tabular-nums">{p.pagina}</span> },
    {
      key: "estado",
      header: "Situação",
      nowrap: true,
      value: (p) => ROTULO_ESTADO_PASSO[p.estado].rotulo,
      render: (p) => (
        <Badge tone={ROTULO_ESTADO_PASSO[p.estado].tom} dot>
          {ROTULO_ESTADO_PASSO[p.estado].rotulo}
        </Badge>
      ),
    },
    { key: "recebidos", header: "Registros", nowrap: true, value: (p) => String(p.recebidos), render: (p) => <span className="tabular-nums">{num(p.recebidos)}</span> },
    { key: "novos", header: "Únicos no lote", nowrap: true, value: (p) => String(p.novos), render: (p) => <span className="tabular-nums">{num(p.novos)}</span> },
    { key: "total", header: "Total do período", nowrap: true, total: false, value: (p) => num(p.total), render: (p) => <span className="tabular-nums">{num(p.total)}</span> },
    { key: "soma", header: "Soma", nowrap: true, align: "right", filter: "range", numero: (p) => p.soma, render: (p) => <span className="tabular-nums">{p.soma != null ? brl(p.soma) : "—"}</span> },
    {
      key: "resultado",
      header: "Resultado",
      align: "left",
      nowrap: true,
      value: (p) => textoResultado(p) ?? "—",
      render: (p) => <ResultadoPagina r={p} />,
    },
    { key: "bytes", header: "Tamanho", nowrap: true, total: false, value: (p) => (p.bytes ? formatBytes(p.bytes) : "—"), render: (p) => <span className="tabular-nums">{p.bytes ? formatBytes(p.bytes) : "—"}</span> },
    { key: "ms", header: "Tempo", nowrap: true, total: false, value: (p) => tempo(p.ms), render: (p) => <span className="tabular-nums">{tempo(p.ms)}</span> },
    {
      key: "mensagem",
      header: "Detalhe",
      align: "left",
      minWidth: 220,
      value: (p) => p.mensagem ?? "",
      render: (p) => (p.mensagem ? <CelulaTexto texto={p.mensagem} /> : <span className="text-muted">{p.fimPeriodo ? "Fim do período" : "—"}</span>),
    },
  ];
  return (
    <>
      <DataTable
        columns={colunas}
        rows={linhas}
        getKey={(p) => p.id}
        density="compact"
        onRowClick={setAberto}
        exportar={{ nome }}
        selectable={!!onExcluir || !!selecao}
        selected={sel}
        onSelected={(s) => setSel(s as Set<number>)}
        acoesRodape={
          onExcluir && !selecao && sel.size > 0 ? (
            <Button
              className="animate-fade-in-up"
              size="sm"
              variant="danger"
              loading={excluindo}
              icon={<IconTrash className="h-4 w-4" />}
              onClick={async () => {
                setExcluindo(true);
                if (await onExcluir(passos.filter((p) => sel.has(p.id)))) setSel(new Set());
                setExcluindo(false);
              }}
            >
              Excluir selecionados ({num(sel.size)})
            </Button>
          ) : undefined
        }
        vazio="Nenhum pedido feito ainda."
        resumo={(l) => `${l.length} passo${l.length === 1 ? "" : "s"} · ${l.filter((p) => p.estado === "erro").length} com erro`}
      />
      {aberto && (
        <DetalhePasso
          passo={aberto}
          onClose={() => setAberto(null)}
          onExcluir={
            onExcluir
              ? async () => {
                  if (await onExcluir([aberto])) setAberto(null);
                }
              : undefined
          }
        />
      )}
    </>
  );
}

/** O DETALHE de um passo: o resultado ou o erro inteiro, os números e o pedido enviado à Centi. */
function DetalhePasso({ passo: p, onClose, onExcluir }: { passo: PassoLote; onClose: () => void; onExcluir?: () => Promise<void> }) {
  const [excluindo, setExcluindo] = useState(false);
  const campos: [string, ReactNode][] = [
    ["Período", `${diaBR(p.inicio)} a ${diaBR(p.fim)}`],
    ["Página", p.pagina],
    ["Quando", dataHoraBR(p.em)],
    ["Resposta (HTTP)", p.status ?? "—"],
    ["Tamanho", p.bytes ? formatBytes(p.bytes) : "—"],
    ["Tempo", tempo(p.ms)],
    ["Registros recebidos", num(p.recebidos)],
    ["Novos no lote", num(p.novos)],
    ["Recusados (sem número)", num(p.recusados)],
    ["Repetidos no pedido", num(p.repetidos)],
    ["Total do período (Centi)", num(p.total)],
    ["Fim do período", p.estado === "ok" ? (p.fimPeriodo ? "Sim" : "Não — há mais páginas") : "—"],
  ];
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      titulo={`${rotuloPeriodo(p)} · página ${p.pagina}`}
      rodape={
        onExcluir ? (
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="danger"
              loading={excluindo}
              icon={<IconTrash className="h-4 w-4" />}
              onClick={async () => {
                setExcluindo(true);
                await onExcluir();
                setExcluindo(false);
              }}
            >
              Excluir passo
            </Button>
          </div>
        ) : undefined
      }
    >
      <div className="space-y-[var(--gap-block)]">
        <SecaoBanner
          titulo="Resultado"
          acao={
            <Badge tone={ROTULO_ESTADO_PASSO[p.estado].tom} dot>
              {ROTULO_ESTADO_PASSO[p.estado].rotulo}
            </Badge>
          }
        >
          {p.mensagem && <Callout kind={p.estado === "erro" ? "danger" : "warn"}>{p.mensagem}</Callout>}
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {campos.map(([rotulo, valor]) => (
              <div key={rotulo}>
                <dt className="text-[12px] text-muted">{rotulo}</dt>
                <ValorCampo>
                  <span className="tabular-nums">{valor}</span>
                </ValorCampo>
              </div>
            ))}
          </dl>
        </SecaoBanner>
        <SecaoBanner titulo="Pedido enviado à Centi" acao={p.corpo ? <BotaoCopiar texto={p.corpo} rotulo="Copiar" /> : undefined}>
          {p.corpo ? (
            <pre className="whitespace-pre-wrap break-all rounded-control bg-surface-2 p-3 font-mono text-[12px] text-muted">{JSON.stringify(JSON.parse(p.corpo), null, 2)}</pre>
          ) : (
            <p className="text-[12.5px] text-muted">O pedido não chegou ao servidor do sistema (falha de rede ou de sessão).</p>
          )}
        </SecaoBanner>
      </div>
    </Modal>
  );
}

/** Os passos de uma importação do HISTÓRICO (carregados ao abrir). */
function PassosDoHistorico({
  api,
  lote,
  onClose,
  onExcluir,
  onExcluirPasso,
}: {
  api: CardEmpenho;
  lote: LoteCenti;
  onClose: () => void;
  onExcluir?: () => void;
  onExcluirPasso?: (ps: PassoLote[]) => Promise<boolean>;
}) {
  const [passos, setPassos] = useState<PassoLote[] | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [excluindo, setExcluindo] = useState(false);
  // Todos marcados = a importação inteira sai; senão, só os passos marcados.
  const todos = !!passos?.length && passos.every((p) => sel.has(p.id));
  async function excluirMarcados() {
    if (!passos) return;
    if (todos) return onExcluir?.();
    if (!onExcluirPasso) return;
    setExcluindo(true);
    const ps = passos.filter((p) => sel.has(p.id));
    if (await onExcluirPasso(ps)) {
      const fora = new Set(ps.map((p) => p.id));
      setPassos((l) => (l ? l.filter((x) => !fora.has(x.id)) : l));
      setSel(new Set());
    }
    setExcluindo(false);
  }
  const carregar = useCallback(() => {
    setFalha(null);
    lerPassos(api.id, lote.id)
      .then(setPassos)
      .catch((e) => setFalha(e instanceof Error ? e.message : "Falha ao carregar."));
  }, [api.id, lote.id]);
  useEffect(carregar, [carregar]);
  const est = ROTULO_ESTADO_LOTE[lote.estado];
  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      titulo={`Importação de ${lote.ano} — ${dataHoraBR(lote.iniciadoEm)}`}
      rodape={
        sel.size > 0 && (todos ? onExcluir : onExcluirPasso) ? (
          <div className="flex animate-fade-in-up items-center justify-end gap-3">
            <span className="text-[12.5px] text-muted">
              {todos ? "Todos os passos marcados — a importação inteira sai do banco." : `${num(sel.size)} de ${num(passos?.length ?? 0)} passos marcados.`}
            </span>
            <Button size="sm" variant="danger" loading={excluindo} icon={<IconTrash className="h-4 w-4" />} onClick={() => void excluirMarcados()}>
              {todos ? "Excluir importação" : `Excluir selecionados (${num(sel.size)})`}
            </Button>
          </div>
        ) : undefined
      }
    >
      <div className="space-y-[var(--gap-block)]">
        <div className="grid grid-cols-2 gap-[var(--gap-block)] sm:grid-cols-3 xl:grid-cols-5">
          <StatMini label="Situação" value={est?.rotulo ?? lote.estado} />
          <StatMini label="Conferência" value={`${num(lote.unicos + lote.recusados)} de ${lote.totalInformado != null ? num(lote.totalInformado) : "?"}`} />
          <StatMini label="Páginas lidas" value={num(lote.paginas)} />
          <StatMini label={rotuloSoma(lote)} value={lote.soma != null ? brl(lote.soma) : "—"} hint={`Leitor v${lote.leitor}`} />
          <StatMini label="Erros" value={passos ? num(passos.filter((p) => p.estado === "erro").length) : "…"} />
        </div>
        {passos && <ResultadoAteAgora passos={passos} />}
        {lote.mensagem && <Callout kind={lote.estado === "falhou" ? "danger" : "warn"}>{lote.mensagem}</Callout>}
        {falha ? (
          <ErroCarga msg={falha} onTentar={carregar} />
        ) : passos ? (
          <PassosDoLote
            passos={passos}
            orgaos={lote.orgaosCenti}
            nome={`Passos ${api.nome} ${lote.ano}`}
            selecao={onExcluirPasso || onExcluir ? { sel, onSel: setSel } : undefined}
            onExcluir={
              onExcluirPasso
                ? async (ps) => {
                    const ok = await onExcluirPasso(ps);
                    const fora = new Set(ps.map((p) => p.id));
                    if (ok) setPassos((l) => (l ? l.filter((x) => !fora.has(x.id)) : l));
                    return ok;
                  }
                : undefined
            }
          />
        ) : (
          <SkeletonLinhas />
        )}
      </div>
    </Modal>
  );
}

/** A célula RESULTADO de um passo: a conferência da página com o banco, em tempo real (novos e alterados serão gravados;
 * iguais e sem vínculo, não). */
function ResultadoPagina({ r }: { r: Pick<PassoLote, "resNovos" | "resAlterados" | "resIguais" | "resSemVinculo"> }) {
  if (textoResultado(r) == null) return <span className="text-muted">—</span>;
  const parte = (n: number | null, rotulo: string, cor?: string) => (
    <span className={(n ?? 0) > 0 && cor ? cor : "text-muted"}>
      {num(n ?? 0)} {rotulo}
    </span>
  );
  return (
    <span className="inline-flex gap-1.5 tabular-nums" title="Conferido com o banco nesta leitura: novos e alterados vão ser gravados; iguais e sem vínculo, não.">
      {parte(r.resNovos, "novos", "text-[color:var(--ok)]")}·{parte(r.resAlterados, "alterados", "text-[color:var(--warn)]")}·{parte(r.resIguais, "iguais")}·
      {parte(r.resSemVinculo, "sem vínculo")}
    </span>
  );
}

/** O RESULTADO ATÉ AGORA do lote (a soma dos passos lidos), em tempo real — o que a conclusão vai gravar. */
function ResultadoAteAgora({ passos }: { passos: readonly PassoLote[] }) {
  const r = resultadoDosPassos(passos);
  if (!r.paginas) return null;
  return (
    <div className="grid grid-cols-2 gap-[var(--gap-block)] sm:grid-cols-4">
      <StatMini label="Novos" value={num(r.resNovos)} tone={r.resNovos ? "ok" : "default"} hint="Ainda não estão no banco — serão gravados" />
      <StatMini label="Alterados" value={num(r.resAlterados)} tone={r.resAlterados ? "warn" : "default"} hint="Mudaram na Centi — serão regravados" />
      <StatMini label="Iguais" value={num(r.resIguais)} hint="Iguais ao gravado — nada é escrito" />
      <StatMini label="Sem vínculo" value={num(r.resSemVinculo)} hint="Nenhum vínculo cobre — não gravados" />
    </div>
  );
}
