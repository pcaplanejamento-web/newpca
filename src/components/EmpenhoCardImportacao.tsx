"use client";

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { anosDoCard, type CardEmpenho, pendenciasDoCard, type ResumoCard } from "@/lib/empenho-cards-core";
import {
  anoInteiro,
  diaBR,
  diasDoPeriodo,
  LEITOR_EMPENHOS,
  type LoteCenti,
  type PassoLote,
  periodosLidos,
  ROTULO_ESTADO_LOTE,
  ROTULO_ESTADO_PASSO,
  rotuloPeriodo,
  usaPeriodo,
} from "@/lib/empenhos-core";
import { brl, dataHoraBR, dataIsoBrasilia, formatBytes } from "@/lib/format";
import { type Agora, lerAnoNaCenti, lerPassos, pedirImportacao, RecusaImportacao } from "@/lib/leitura-centi-cliente";
import { FerramentasAba } from "./AbasEspaco";
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
const tempo = (ms: number | null) => (ms == null ? "—" : `${(ms / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} s`);

/** Quanto do ano já foi lido (pelos períodos concluídos) — o andamento real, mesmo com meses divididos. */
function fracaoDoAno(ano: number, passos: PassoLote[]): number {
  const dias = periodosLidos(passos).reduce((s, p) => s + diasDoPeriodo(p), 0);
  return Math.min(1, dias / diasDoPeriodo(anoInteiro(ano)));
}


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
  const anos = anosDoCard(card.anos, anoAtual());
  /** A configuração vem antes de importar (`pendenciasDoCard` — o aviso fica no cabeçalho do card). */
  const bloqueado = pendenciasDoCard(card, card.vinculos).length > 0;
  const [ano, setAno] = useState(anos[0]);
  const [lotes, setLotes] = useState<LoteCenti[] | null>(null);
  const [emAndamento, setEmAndamento] = useState<LoteCenti | null>(null);
  const [atual, setAtual] = useState<LoteCenti | null>(null);
  const [passos, setPassos] = useState<PassoLote[]>([]);
  const [agora, setAgora] = useState<Agora | null>(null);
  const [rodando, setRodando] = useState(false);
  const [historico, setHistorico] = useState<LoteCenti | null>(null);
  const [selLotes, setSelLotes] = useState<Set<number>>(new Set());
  const [desatualizados, setDesatualizados] = useState<{ ano: number; n: number }[]>([]);
  const parar = useRef(false);
  /** O token DESTA aba — o servidor deixa uma aba por vez conduzir o lote. */
  const condutor = useRef("");
  const local = useRef(-1);
  const { confirmar, confirmacao } = useConfirmacao();
  const comPeriodo = usaPeriodo(api.parametros);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch(`/api/empenhos/cards/${api.id}/importar`);
      const j = (await r.json()) as { ok?: boolean; lotes?: LoteCenti[]; emAndamento?: LoteCenti | null; desatualizados?: { ano: number; n: number }[] };
      if (j.ok) {
        setLotes(j.lotes ?? []);
        setEmAndamento(j.emAndamento ?? null);
        setDesatualizados(j.desatualizados ?? []);
      }
    } catch {
      setLotes((l) => l ?? []);
    }
  }, [api.id]);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    if (!rodando) return;
    const aviso = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [rodando]);

  const anotar = (p: PassoLote) => setPassos((l) => [...l, p]);

  async function importar(retomar: LoteCenti | null) {
    parar.current = false;
    condutor.current = crypto.randomUUID();
    setRodando(true);
    setPassos([]);
    let lote = retomar;
    let onde = "";
    try {
      if (!lote) lote = (await pedirImportacao<{ lote: LoteCenti }>(api.id, { acao: "iniciar", ano, condutor: condutor.current })).lote;
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
        toast.info("Importação interrompida — nada foi gravado nos empenhos do card.");
        return;
      }
      let conclusao = await pedirImportacao<{ lote: LoteCenti; queda?: string }>(api.id, { acao: "concluir", lote: lote.id, condutor: condutor.current });
      if (conclusao.queda) {
        // A QUEDA em relação à última importação concluída: só grava com a confirmação de quem importa.
        const seguir = await confirmar({ titulo: "Os números caíram — gravar mesmo assim?", texto: `${conclusao.queda} Confira a Centi antes: se for um erro de leitura, cancele (nada é gravado).`, confirmar: "Gravar", cancelar: "Cancelar importação", perigo: true });
        if (!seguir) {
          await pedirImportacao(api.id, { acao: "cancelar", lote: lote.id, condutor: condutor.current, motivo: `Cancelada: ${conclusao.queda}`.slice(0, 300) });
          toast.info("Importação cancelada — os empenhos ficam como estavam.");
          return;
        }
        conclusao = await pedirImportacao<{ lote: LoteCenti; queda?: string }>(api.id, { acao: "concluir", lote: lote.id, condutor: condutor.current, aceitarQueda: true });
      }
      const fim = conclusao.lote;
      setAtual(fim);
      if (fim.estado === "unidades") {
        toast.success(fim.mensagem ?? "Catálogo da Centi atualizado.");
      } else if (fim.estado === "promovido") {
        toast.success(`Empenhos ${fim.ano} importados e conferidos (${brl(fim.soma)} empenhados): ${num(fim.inseridos)} novos, ${num(fim.atualizados)} atualizados, ${num(semMudanca(fim))} sem mudança, ${num(fim.removidos)} ${card.removidos === "apagar" ? "apagados" : "marcados como removidos"}${fim.fora ? `, ${num(fim.fora)} sem vínculo no card (não gravados)` : ""}.`);
        router.refresh();
      } else {
        toast.error(`Importação parcial — nada foi gravado. ${fim.mensagem ?? ""}`);
      }
    } catch (e) {
      setAgora(null);
      const msg = e instanceof Error ? e.message : "Falha na importação.";
      if (e instanceof RecusaImportacao) {
        // Recusado pelo sistema (ex.: outra aba conduz o lote) — o lote é de quem o conduz: não cancela.
        toast.error(msg);
      } else if (lote && parar.current) {
        await pedirImportacao(api.id, { acao: "cancelar", lote: lote.id, condutor: condutor.current, motivo: "Interrompida por quem importava." }).catch(() => {});
        toast.info("Importação interrompida — nada foi gravado nos empenhos do card.");
      } else if (lote) {
        await pedirImportacao(api.id, { acao: "cancelar", lote: lote.id, condutor: condutor.current, falhou: true, motivo: `${onde ? `${onde}: ` : ""}${msg}`.slice(0, 300) }).catch(() => {});
        toast.error(`A importação falhou${onde ? ` em ${onde}` : ""}: ${msg} Nada foi gravado nos empenhos — veja os passos.`);
      } else {
        toast.error(msg);
      }
    } finally {
      setRodando(false);
      void carregar();
    }
  }

  async function interromper() {
    if (await confirmar({ titulo: "Interromper a importação?", texto: "O que já foi lido é descartado; os empenhos ficam como estavam.", confirmar: "Interromper", perigo: true })) {
      parar.current = true;
    }
  }

  async function cancelarParada(l: LoteCenti) {
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
  const colunas: Column<LoteCenti>[] = [
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
    { key: "soma", header: "Soma empenhada", nowrap: true, align: "right", filter: "range", numero: (l) => l.soma, render: (l) => <span className="tabular-nums">{l.soma != null ? brl(l.soma) : "—"}</span> },
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
          <Button size="sm" onClick={() => void importar(null)} disabled={!!emAndamento || !anos.length || bloqueado} title={bloqueado ? "Configure o card antes de importar (Configuração e Vínculos)" : undefined} icon={<IconDownload className="h-4 w-4" />}>
            Importar {ano}
          </Button>
        )}
        <Ajuda titulo="Importação" botao="sm">
          <p>
            Lê o ano <strong>semana a semana</strong> (o período que vier grande demais é dividido ao meio), página a página, com a
            configuração salva do card, e guarda tudo num lote separado. Cada pedido aparece na hora em <strong>Passos</strong> — toque
            num para ver o detalhe (o pedido enviado, a resposta, o tempo, o erro).
          </p>
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
          <p>Toque numa importação do histórico para ver os passos dela; marque e use Excluir para tirá-las do banco (os empenhos gravados continuam).</p>
        </Ajuda>
      </FerramentasAba>
      {!comPeriodo && (
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
          A importação de {emAndamento.ano} está em andamento em outra aba ({num(emAndamento.unicos)} registros lidos). Acompanhe por lá — se aquela aba
          foi fechada, ela fica livre para continuar aqui em até 2 minutos.
        </Callout>
      )}
      {emAndamento && !rodando && !emAndamento.conduzido && (
        <Callout kind="warn">
          <span className="flex flex-wrap items-center justify-between gap-2">
            Há uma importação de {emAndamento.ano} parada ({num(emAndamento.unicos)} registros lidos).
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
          {rodando && (
            <Progress
              value={fracaoDoAno(atual.ano, passos) * 100}
              label={
                agora
                  ? `${rotuloPeriodo(agora.periodo)} · página ${agora.pagina}${agora.tentativa > 1 ? ` · tentativa ${agora.tentativa}` : ""}${agora.espera ? ` · nova tentativa em ${agora.espera / 1000} s` : ""}`
                  : "Conferindo…"
              }
            />
          )}
          <div className="grid grid-cols-2 gap-[var(--gap-block)] sm:grid-cols-3 xl:grid-cols-5">
            <StatMini label="Registros distintos" value={num(atual.unicos)} hint={`${num(atual.recebidos)} recebidos`} />
            <StatMini label="Total informado" value={num(atual.totalInformado)} hint="Soma dos períodos lidos" />
            <StatMini label="Ano lido" value={`${Math.floor(fracaoDoAno(atual.ano, passos) * 100)}%`} hint={`${num(atual.paginas)} páginas`} />
            <StatMini label="Soma empenhada" value={atual.soma != null ? brl(atual.soma) : "—"} hint="Dos registros distintos" />
            <StatMini label="Erros" value={num(erros)} tone={erros ? "danger" : "default"} hint={atual.recusados ? `${num(atual.recusados)} recusados` : undefined} />
          </div>
          <PassosDoLote passos={passos} nome={`Passos ${api.nome} ${atual.ano}`} onExcluir={rodando || !podeExcluir ? undefined : (ps) => excluirPassos(atual, ps)} />
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
  nome,
  onExcluir,
  selecao,
}: {
  passos: PassoLote[];
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
    { key: "pagina", header: "Página", nowrap: true, total: false, value: (p) => String(p.pagina), render: (p) => <span className="tabular-nums">{p.pagina}</span> },
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
    { key: "novos", header: "Novos", nowrap: true, value: (p) => String(p.novos), render: (p) => <span className="tabular-nums">{num(p.novos)}</span> },
    { key: "total", header: "Total do período", nowrap: true, total: false, value: (p) => num(p.total), render: (p) => <span className="tabular-nums">{num(p.total)}</span> },
    { key: "soma", header: "Soma empenhada", nowrap: true, align: "right", filter: "range", numero: (p) => p.soma, render: (p) => <span className="tabular-nums">{p.soma != null ? brl(p.soma) : "—"}</span> },
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
          <StatMini label="Soma empenhada" value={lote.soma != null ? brl(lote.soma) : "—"} hint={`Leitor v${lote.leitor}`} />
          <StatMini label="Erros" value={passos ? num(passos.filter((p) => p.estado === "erro").length) : "…"} />
        </div>
        {lote.mensagem && <Callout kind={lote.estado === "falhou" ? "danger" : "warn"}>{lote.mensagem}</Callout>}
        {falha ? (
          <ErroCarga msg={falha} onTentar={carregar} />
        ) : passos ? (
          <PassosDoLote
            passos={passos}
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
