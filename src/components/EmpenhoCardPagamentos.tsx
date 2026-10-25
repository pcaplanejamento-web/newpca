"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type TipoExecucao, tipoDaExecucao } from "@/lib/execucao-empenho-core";
import { brl, dataBR, num } from "@/lib/format";
import type { PagamentoCompleto } from "@/lib/pagamentos-tela";
import { FerramentasAba } from "./AbasEspaco";
import { Ajuda } from "./Ajuda";
import { Badge } from "./Badge";
import { CelulaCopiavel } from "./BotaoCopiar";
import { BotaoAtualizar } from "./BotaoAtualizar";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { avisoDeFalha, avisoSemEmpenho, colunaTipoExecucao } from "./EmpenhoCardLiquidacoes";
import { Avisos } from "./Avisos";
import { CelulaTexto } from "./CelulaLista";
import { type Column, DataTable } from "./DataTable";
import { EsqueletoTabela } from "./DataTableEsqueleto";
import { ErroCarga } from "./ErroCarga";
import { SelectField } from "./Field";
import { Modal } from "./Modal";
import { PagamentoDetalhe } from "./PagamentoDetalhe";
import { StatMini } from "./StatMini";

/** Um PAGAMENTO na tela (a ordem das tuplas = `COLUNAS_PAGAMENTO` de `pagamentos-tela.ts`). */
export type Pagamento = {
  id: number;
  data: string | null;
  numeroEmpenho: string;
  credor: string | null;
  cpfCnpj: string | null;
  historico: string | null;
  valor: number;
  valorRetencao: number;
  valorLiquido: number;
  anulado: boolean;
  motivoAnulacao: string | null;
  /** O órgão como a Centi o escreveu. */
  orgaoCenti: string;
  /** O órgão e a unidade do CADASTRO (a sigla) = os do empenho de mesmo número. */
  orgao: string | null;
  unidade: string | null;
  /** O ANO do empenho ligado pelo número (de qualquer ano — restos a pagar); null = o empenho não está no sistema. */
  anoEmpenho: number | null;
  /** Nota de Empenho × Restos a Pagar (`tipoDaExecucao`). */
  tipo: TipoExecucao;
};

const daTupla = (t: unknown[], ano: number): Pagamento => ({
  id: Number(t[0]),
  data: (t[1] as string | null) ?? null,
  numeroEmpenho: String(t[2] ?? ""),
  credor: (t[3] as string | null) ?? null,
  cpfCnpj: (t[4] as string | null) ?? null,
  historico: (t[5] as string | null) ?? null,
  valor: Number(t[6] ?? 0),
  valorRetencao: Number(t[7] ?? 0),
  valorLiquido: Number(t[8] ?? 0),
  anulado: Number(t[9] ?? 0) === 1,
  motivoAnulacao: (t[10] as string | null) ?? null,
  orgaoCenti: String(t[11] ?? ""),
  orgao: (t[12] as string | null) ?? null,
  unidade: (t[13] as string | null) ?? null,
  anoEmpenho: t[15] == null ? null : Number(t[15]),
  tipo: tipoDaExecucao(String(t[2] ?? ""), t[15] == null ? null : Number(t[15]), (t[1] as string | null) ?? null, ano),
});

/** As somas do pago: só as ordens NÃO anuladas (a anulada fica guardada, fora do pago). */
const somaPaga = (l: Pagamento[], k: "valor" | "valorRetencao" | "valorLiquido") => l.reduce((s, x) => s + (x.anulado ? 0 : x[k]), 0);

const colValor = (key: "valor" | "valorRetencao" | "valorLiquido", header: string): Column<Pagamento> => ({
  key,
  header,
  align: "right",
  nowrap: true,
  filter: "range",
  numero: (x) => x[key],
  render: (x) => <span className={`tabular-nums ${x.anulado ? "text-faint line-through" : ""}`}>{brl(x[key])}</span>,
});

const COLUNAS: Column<Pagamento>[] = [
  { key: "data", header: "Data", nowrap: true, filter: "date", value: (x) => x.data ?? "", render: (x) => <span className="tabular-nums">{x.data ? dataBR(x.data) : "—"}</span> },
  {
    key: "id",
    header: "Ordem",
    nowrap: true,
    total: false,
    value: (x) => String(x.id),
    render: (x) => <span className="tabular-nums text-muted">{x.id}</span>,
  },
  {
    key: "numeroEmpenho",
    header: "Empenho",
    nowrap: true,
    total: false,
    value: (x) => x.numeroEmpenho,
    render: (x) => (
      <CelulaCopiavel copiar={x.numeroEmpenho} rotulo="nº do empenho">
        <span className="tabular-nums">{x.numeroEmpenho}</span>
      </CelulaCopiavel>
    ),
  },
  {
    key: "anoEmpenho",
    header: "Ano do empenho",
    nowrap: true,
    total: false,
    value: (x) => (x.anoEmpenho != null ? String(x.anoEmpenho) : "Sem empenho"),
    render: (x) =>
      x.anoEmpenho != null ? (
        <span className="tabular-nums">{x.anoEmpenho}</span>
      ) : (
        <span className="text-faint" title="Nenhum empenho com este número importado no sistema (de nenhum ano)">
          —
        </span>
      ),
  },
  colunaTipoExecucao<Pagamento>(),
  { key: "orgaoSistema", header: "Órgão", nowrap: true, value: (x) => x.orgao ?? "—", render: (x) => <span className="font-mono text-[12px] font-semibold text-text-2">{x.orgao ?? "—"}</span> },
  { key: "unidade", header: "Unidade", nowrap: true, value: (x) => x.unidade ?? "—", render: (x) => <span className="font-mono text-[12px] font-semibold text-text-2">{x.unidade ?? "—"}</span> },
  { key: "credor", header: "Credor", minWidth: 220, value: (x) => x.credor ?? "", render: (x) => <CelulaTexto texto={x.credor} /> },
  { key: "cpfCnpj", header: "CPF/CNPJ", nowrap: true, total: false, value: (x) => x.cpfCnpj ?? "" },
  { key: "historico", header: "Histórico", minWidth: 320, value: (x) => x.historico ?? "", render: (x) => <CelulaTexto texto={x.historico} /> },
  colValor("valor", "Valor da ordem"),
  colValor("valorRetencao", "Retenção"),
  colValor("valorLiquido", "Pago líquido"),
  {
    key: "anulado",
    header: "Anulação",
    nowrap: true,
    total: false,
    value: (x) => (x.anulado ? "Anulada" : "Sem anulação"),
    render: (x) =>
      x.anulado ? (
        <Badge tone="red" title={x.motivoAnulacao ?? undefined}>
          Anulada
        </Badge>
      ) : (
        <span className="text-faint">—</span>
      ),
  },
  { key: "motivoAnulacao", header: "Motivo da anulação", minWidth: 220, value: (x) => x.motivoAnulacao ?? "", render: (x) => <CelulaTexto texto={x.motivoAnulacao} /> },
  { key: "orgaoCenti", header: "Órgão (Centi)", minWidth: 200, value: (x) => x.orgaoCenti, render: (x) => <CelulaTexto texto={x.orgaoCenti} /> },
];

/**
 * A aba PAGAMENTOS de um card de pagamentos: o que está gravado (as ordens de pagamento), com o órgão e a unidade do CADASTRO
 * de cada uma (os do EMPENHO de mesmo número — o número do empenho liga empenhos, liquidações e pagamentos), por ano, no escopo
 * da pessoa. Os números do topo acompanham os filtros e somam só as ordens NÃO anuladas; "Removidos na Centi" no rodapé.
 */
export function EmpenhoCardPagamentos({ cardId, nome, versao }: { cardId: number; nome: string; versao: string }) {
  const [anos, setAnos] = useState<{ ano: number; n: number }[] | null>(null);
  const [recorte, setRecorte] = useState<{ ano: number; removidos: boolean } | null>(null);
  const [linhas, setLinhas] = useState<Pagamento[] | null>(null);
  const [vista, setVista] = useState<Pagamento[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [aberto, setAberto] = useState<Pagamento | null>(null);
  const pedido = useRef(0);
  const [completo, setCompleto] = useState<PagamentoCompleto | null | undefined>(undefined);

  // O detalhe: o que a tabela tem na hora; o registro e o empenho ligado chegam depois.
  useEffect(() => {
    if (!aberto) return;
    let vivo = true;
    setCompleto(undefined);
    fetch(`/api/empenhos/cards/${cardId}/pagamentos/${aberto.id}`)
      .then((r) => r.json() as Promise<{ ok?: boolean; pagamento?: PagamentoCompleto }>)
      .then((j) => vivo && setCompleto(j.ok && j.pagamento ? j.pagamento : null))
      .catch(() => vivo && setCompleto(null));
    return () => {
      vivo = false;
    };
  }, [aberto, cardId]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: a versão também relê os anos (importação de outro ano).
  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const r = await fetch(`/api/empenhos/cards/${cardId}/pagamentos`);
        const j = (await r.json()) as { ok?: boolean; error?: string; anos?: { ano: number; n: number }[] };
        if (!vivo) return;
        if (!r.ok || !j.ok) throw new Error(j.error ?? `Falha (${r.status}).`);
        setAnos(j.anos ?? []);
        // A 1ª carga abre no ano mais recente; uma recarga (versão nova) mantém o ano escolhido, se ele ainda existir.
        const l = j.anos ?? [];
        setRecorte((rc) => (rc && l.some((a) => a.ano === rc.ano) ? rc : l.length ? { ano: l[0].ano, removidos: false } : null));
      } catch (e) {
        if (vivo) setErro(e instanceof Error ? e.message : "Não foi possível carregar os pagamentos.");
      }
    })();
    return () => {
      vivo = false;
    };
  }, [cardId, versao]);

  const carregar = useCallback(
    async (rc: { ano: number; removidos: boolean }) => {
      const n = ++pedido.current;
      setCarregando(true);
      setErro(null);
      try {
        const r = await fetch(`/api/empenhos/cards/${cardId}/pagamentos?ano=${rc.ano}${rc.removidos ? "&removidos=1" : ""}`);
        const j = (await r.json()) as { ok?: boolean; error?: string; linhas?: unknown[][] };
        if (n !== pedido.current) return;
        if (!r.ok || !j.ok) throw new Error(j.error ?? `Falha (${r.status}).`);
        const novas = (j.linhas ?? []).map((t) => daTupla(t, rc.ano));
        setLinhas(novas);
        setVista(null);
        // Recarregou com os dados novos (uma importação de empenhos muda o tipo e a unidade): o detalhe aberto segue, atualizado.
        setAberto((a) => (a ? (novas.find((x) => x.id === a.id) ?? null) : null));
      } catch (e) {
        if (n === pedido.current) setErro(e instanceof Error ? e.message : "Não foi possível carregar os pagamentos.");
      } finally {
        if (n === pedido.current) setCarregando(false);
      }
    },
    [cardId],
  );
  // A VERSÃO dos dados da execução (importação promovida, vínculos, cards) vem da página: mudou, relê — o tipo (Nota de
  // Empenho × Restos a Pagar), o órgão e a unidade vêm do empenho ligado, lido na hora pelo número.
  // biome-ignore lint/correctness/useExhaustiveDependencies: a versão também relê (importação nova de empenhos).
  useEffect(() => {
    if (recorte) void carregar(recorte);
  }, [recorte, carregar, versao]);

  const base = vista ?? linhas ?? [];
  const tot = useMemo(
    () => ({
      n: base.length,
      anuladas: base.filter((x) => x.anulado).length,
      valorAnulado: base.reduce((s, x) => s + (x.anulado ? x.valor : 0), 0),
      valor: somaPaga(base, "valor"),
      retencao: somaPaga(base, "valorRetencao"),
      liquido: somaPaga(base, "valorLiquido"),
      empenhos: new Set(base.map((x) => x.numeroEmpenho)).size,
    }),
    [base],
  );
  const filtrado = vista != null && linhas != null && vista.length !== linhas.length;

  return (
    <>
      <FerramentasAba>
        {anos && anos.length > 0 && recorte && (
          <SelectField compacto label="Ano" value={String(recorte.ano)} onChange={(e) => setRecorte({ ano: Number(e.target.value), removidos: false })}>
            {anos.map((a) => (
              <option key={a.ano} value={a.ano}>
                {a.ano}
              </option>
            ))}
          </SelectField>
        )}
        {recorte && <BotaoAtualizar ativo={carregando} rotulo="Recarregar" detalhe="Carregando os pagamentos…" onClick={() => void carregar(recorte)} />}
        <Avisos avisos={[...avisoSemEmpenho(linhas, "pagamento", "pagamentos"), ...avisoDeFalha(erro, linhas != null, () => (recorte ? void carregar(recorte) : window.location.reload()))]} />
        <Ajuda titulo="Pagamentos do card" botao="sm">
          <p>Os pagamentos (ordens de pagamento) que o card importou da Centi (aba Importação) — exatamente o que está gravado. Só leitura.</p>
          <p>
            A Centi não informa a unidade do pagamento: o <strong>número do empenho</strong> liga o pagamento ao empenho, e as colunas Órgão e
            Unidade são as do empenho no sistema (o vínculo dele) — procurado em TODA a tabela de empenhos, de qualquer ano (restos a pagar); a
            coluna “Ano do empenho” diz de que ano ele é. Sem o empenho importado, fica o órgão do cadastro com o “ID na Centi”, sem unidade.
            Você vê os pagamentos da sua unidade (ou do seu órgão).
          </p>
          <p>
            <strong>Valor da ordem</strong> − <strong>Retenção</strong> = <strong>Pago líquido</strong>. As ordens com <strong>anulação</strong> ficam
            guardadas (riscadas, com o motivo) e fora das somas do topo.
          </p>
          <p>Toque numa linha para ver o pagamento inteiro e o empenho ligado. Os números do topo acompanham os filtros da tabela. “Removidos na Centi” (rodapé) = os que a Centi não traz mais (pela regra do card).</p>
        </Ajuda>
      </FerramentasAba>

      {erro && !linhas && <ErroCarga msg={erro} kind="danger" onTentar={() => (recorte ? void carregar(recorte) : window.location.reload())} />}

      {anos && !anos.length ? (
        <Callout kind="info">Nenhum pagamento importado neste card ainda. Importe na aba Importação — todos os órgãos com o “ID na Centi” de uma vez, mês a mês.</Callout>
      ) : !recorte || linhas == null ? (
        !erro && <EsqueletoTabela cheia />
      ) : (
        <>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(9rem,100%),1fr))] gap-[var(--gap-block)]">
            <StatMini label="Pagamentos" value={num(tot.n)} hint={filtrado ? "com os filtros da tabela" : recorte.removidos ? "removidos na Centi" : `${num(tot.empenhos)} empenhos`} />
            <StatMini label="Valor das ordens" value={brl(tot.valor)} tone="accent" hint="sem as anuladas" />
            <StatMini label="Retenções" value={brl(tot.retencao)} />
            <StatMini label="Pago líquido" value={brl(tot.liquido)} tone="ok" />
            <StatMini label="Anuladas" value={num(tot.anuladas)} tone={tot.anuladas ? "warn" : "default"} hint={tot.anuladas ? brl(tot.valorAnulado) : undefined} />
          </div>
          <DataTable
            visao={`${recorte.ano}:${recorte.removidos ? 1 : 0}`}
            columns={COLUNAS}
            rows={linhas}
            getKey={(x) => x.id}
            scrollInterno
            density="compact"
            minWidth={2200}
            ordemInicial={{ key: "data", dir: "desc" }}
            onOrdenadas={setVista}
            onRowClick={setAberto}
            activeKey={aberto?.id ?? null}
            exportar={{ nome: `${nome} - pagamentos ${recorte.ano}${recorte.removidos ? " - removidos" : ""}` }}
            acoesRodape={
              <Button
                size="sm"
                variant={recorte.removidos ? "primary" : "secondary"}
                aria-pressed={recorte.removidos}
                title={recorte.removidos ? "Voltar aos pagamentos vigentes" : "Os pagamentos que a Centi não traz mais"}
                onClick={() => setRecorte({ ano: recorte.ano, removidos: !recorte.removidos })}
              >
                Removidos na Centi
              </Button>
            }
            vazio={recorte.removidos ? "Nenhum pagamento removido na Centi neste ano." : "Nenhum pagamento neste ano."}
            resumo={(l) => `${num(l.length)} ${l.length === 1 ? "pagamento" : "pagamentos"} · Pago líquido ${brl(somaPaga(l, "valorLiquido"))}`}
          />
        </>
      )}

      <Modal open={aberto != null} onClose={() => setAberto(null)} titulo={aberto ? `Ordem de pagamento ${aberto.id}` : "Pagamento"} size="lg">
        {aberto ? <PagamentoDetalhe key={aberto.id} pagamento={aberto} completo={completo} /> : <div />}
      </Modal>
    </>
  );
}
