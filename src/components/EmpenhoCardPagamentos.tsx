"use client";

import { jaGuardado, lerDado, useGuardadoNoDesenho } from "@/lib/dados-cliente";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type TipoExecucao, tipoDaExecucao } from "@/lib/execucao-empenho-core";
import { ANO_TODOS, anosDoRecorte, rotuloRecorteAno } from "@/lib/empenhos-tela-core";
import { brl, dataBR, num, pct } from "@/lib/format";
import type { PagamentoCompleto } from "@/lib/pagamentos-tela";
import { FerramentasAba } from "./AbasEspaco";
import { useAbrirLinhaDaUrl } from "./AbrirDaUrl";
import { Ajuda } from "./Ajuda";
import { Badge } from "./Badge";
import { CelulaCopiavel } from "./BotaoCopiar";
import { BotaoAtualizar } from "./BotaoAtualizar";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { avisoDeFalha, avisoSemEmpenho, colunaAno, colunaCard, colunaTipoExecucao } from "./EmpenhoCardLiquidacoes";
import { Avisos } from "./Avisos";
import { CelulaTexto } from "./CelulaLista";
import { type Column, DataTable } from "./DataTable";
import { EsqueletoTabela } from "./DataTableEsqueleto";
import { ErroCarga } from "./ErroCarga";
import { SelectField } from "./Field";
import { Modal } from "./Modal";
import { PagamentoDetalhe } from "./PagamentoDetalhe";
import { IndicadoresKpi } from "./IndicadoresKpi";
import { useAtalhoImportacoes } from "./EmpenhosView";

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
  /** O card que gravou o registro (o banner pede por ele; a coluna Card da tabela única). */
  cardId: number;
  /** O ano do registro (o da importação — a coluna Ano de "Todos os anos"). */
  ano: number;
};

const daTupla = (t: unknown[], ano: number): Pagamento => ({
  id: Number(t[0]),
  ano,
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
  cardId: Number(t[16] ?? 0),
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
  colunaAno<Pagamento>(),
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
export function EmpenhoCardPagamentos({
  cardId,
  nome,
  versao,
  cards,
}: {
  /** `null` = a TABELA ÚNICA (todos os cards do tipo — o mesmo registro uma vez). */
  cardId: number | null;
  nome: string;
  versao: string;
  /** O nome de cada card (a coluna Card da tabela única). */
  cards?: Record<number, string>;
}) {
  const rota = cardId == null ? "/api/empenhos/pagamentos" : `/api/empenhos/cards/${cardId}/pagamentos`;
  const colunas = useMemo(() => (cardId == null ? [COLUNAS[0], colunaCard<Pagamento>(cards ?? {}), ...COLUNAS.slice(1)] : COLUNAS), [cardId, cards]);
  // Voltar à tela: o que já está na memória da aba desenha no 1º quadro (sem o esqueleto); a versão confere depois.
  const noDesenho = useGuardadoNoDesenho();
  const [inicio] = useState(() => {
    const a = noDesenho && versao ? jaGuardado<{ anos?: { ano: number; n: number }[] }>("pagamentos", rota, versao)?.anos : undefined;
    if (!a?.length) return null;
    const partes = anosDoRecorte(ANO_TODOS, a).map((ano) => {
      const j = jaGuardado<{ linhas?: unknown[][] }>("pagamentos", `${rota}?ano=${ano}`, versao);
      return j ? (j.linhas ?? []).map((t) => daTupla(t, ano)) : null;
    });
    return { anos: a, linhas: partes.every(Boolean) ? (partes as Pagamento[][]).flat() : null };
  });
  const [anos, setAnos] = useState<{ ano: number; n: number }[] | null>(inicio?.anos ?? null);
  const [recorte, setRecorte] = useState<{ ano: number; removidos: boolean } | null>(null);
  const [linhas, setLinhas] = useState<Pagamento[] | null>(inicio?.linhas ?? null);
  const [vista, setVista] = useState<Pagamento[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [aberto, setAberto] = useState<Pagamento | null>(null);
  // O link da PESQUISA DO SISTEMA (`?abrir=<id>`): abre a linha quando a tabela chega.
  useAbrirLinhaDaUrl(linhas, setAberto);
  const pedido = useRef(0);
  const anosRef = useRef<{ ano: number; n: number }[]>(inicio?.anos ?? []);
  const [completo, setCompleto] = useState<PagamentoCompleto | null | undefined>(undefined);

  // O detalhe: o que a tabela tem na hora; o registro e o empenho ligado chegam depois.
  useEffect(() => {
    if (!aberto) return;
    let vivo = true;
    setCompleto(undefined);
    fetch(`/api/empenhos/cards/${aberto.cardId}/pagamentos/${aberto.id}`)
      .then((r) => r.json() as Promise<{ ok?: boolean; pagamento?: PagamentoCompleto }>)
      .then((j) => vivo && setCompleto(j.ok && j.pagamento ? j.pagamento : null))
      .catch(() => vivo && setCompleto(null));
    return () => {
      vivo = false;
    };
  }, [aberto]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: a versão também relê os anos (importação de outro ano).
  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const j = await lerDado("pagamentos", rota, versao, async (r) => {
          const j = (await r.json()) as { ok?: boolean; error?: string; anos?: { ano: number; n: number }[] };
          if (!r.ok || !j.ok) throw new Error(j.error ?? `Falha (${r.status}).`);
          return j;
        });
        if (!vivo) return;
        setAnos(j.anos ?? []);
        // A 1ª carga abre em "Todos os anos"; uma recarga (versão nova) mantém o recorte escolhido, se o ano ainda existir —
        // um recorte NOVO (mesmo igual) relê as linhas já com a lista de anos nova (um ano novo entra no "Todos os anos").
        const l = j.anos ?? [];
        anosRef.current = l;
        setRecorte((rc) => (rc && (rc.ano === ANO_TODOS || l.some((a) => a.ano === rc.ano)) ? { ...rc } : l.length ? { ano: ANO_TODOS, removidos: false } : null));
      } catch (e) {
        if (vivo) setErro(e instanceof Error ? e.message : "Não foi possível carregar os pagamentos.");
      }
    })();
    return () => {
      vivo = false;
    };
  }, [rota, versao]);

  const carregar = useCallback(
    async (rc: { ano: number; removidos: boolean }, fresco = false) => {
      const n = ++pedido.current;
      setCarregando(true);
      setErro(null);
      try {
        // "Todos os anos" = um pedido POR ANO (cada um com o próprio limite do servidor), juntos — nenhum ano fica de fora:
        // a falha de um é a falha da carga.
        const partes = await Promise.all(
          anosDoRecorte(rc.ano, anosRef.current).map(async (ano) => {
            const j = await lerDado(
              "pagamentos",
              `${rota}?ano=${ano}${rc.removidos ? "&removidos=1" : ""}`,
              versao,
              async (r) => {
                const j = (await r.json()) as { ok?: boolean; error?: string; linhas?: unknown[][] };
                if (!r.ok || !j.ok) throw new Error(j.error ?? `Falha (${r.status}).`);
                return j;
              },
              fresco,
            );
            return (j.linhas ?? []).map((t) => daTupla(t, ano));
          }),
        );
        if (n !== pedido.current) return;
        const novas = partes.flat();
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
    [rota, versao],
  );
  // A VERSÃO dos dados da execução (importação promovida, vínculos, cards) vem da página: mudou, relê — o tipo (Nota de
  // Empenho × Restos a Pagar), o órgão e a unidade vêm do empenho ligado, lido na hora pelo número.
  // A releitura pela versão nova passa pelos anos (acima): eles chegam primeiro e o recorte novo pede as linhas.
  useEffect(() => {
    if (recorte) void carregar(recorte);
  }, [recorte, carregar]);

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
  const atalho = useAtalhoImportacoes();

  return (
    <>
      {recorte && linhas != null && (
        <IndicadoresKpi
          chave="pagamentos:indicadores"
          cartoes={[
            { label: "Pago líquido", value: brl(tot.liquido), cor: "var(--ok)", hint: filtrado ? "com os filtros da tabela" : undefined, detalhes: [{ rotulo: "Valor das ordens", valor: brl(tot.valor) }, { rotulo: "Retenções", valor: brl(tot.retencao) }] },
            { label: "Ordens", value: num(tot.n), detalhes: [{ rotulo: "Empenhos", valor: num(tot.empenhos) }, { rotulo: "Média", valor: tot.n ? brl(tot.liquido / tot.n) : "—" }] },
            { label: "Retenções", value: brl(tot.retencao), detalhes: [{ rotulo: "Das ordens", valor: pct(tot.retencao, tot.valor) }, { rotulo: "Líquido", valor: brl(tot.liquido) }] },
            { label: "Anuladas", value: num(tot.anuladas), cor: tot.anuladas ? "var(--warn)" : undefined, detalhes: [{ rotulo: "Valor anulado", valor: brl(tot.valorAnulado) }, { rotulo: "Recorte", valor: recorte?.removidos ? "Removidos na Centi" : "Vigentes" }] },
          ]}
        />
      )}
      <FerramentasAba>
        {anos && anos.length > 0 && recorte && (
          <SelectField compacto label="Ano" value={String(recorte.ano)} onChange={(e) => setRecorte({ ano: Number(e.target.value), removidos: false })}>
            <option value={ANO_TODOS}>Todos os anos</option>
            {anos.map((a) => (
              <option key={a.ano} value={a.ano}>
                {a.ano}
              </option>
            ))}
          </SelectField>
        )}
        {recorte && <BotaoAtualizar ativo={carregando} rotulo="Recarregar" detalhe="Carregando os pagamentos…" onClick={() => void carregar(recorte, true)} />}
        <Avisos avisos={[...avisoSemEmpenho(linhas, "pagamento", "pagamentos"), ...avisoDeFalha(erro, linhas != null, () => (recorte ? void carregar(recorte) : window.location.reload()))]} />
        {atalho}
        <Ajuda titulo={cardId == null ? "Pagamentos" : "Pagamentos do card"} botao="sm">
          <p>
            {cardId == null
              ? "Todos os pagamentos (ordens de pagamento) importados, de todos os cards, numa tabela só (o mesmo pagamento em dois cards aparece uma vez; a coluna Card diz de onde veio). Só leitura — as importações ficam em “Importações”."
              : "Os pagamentos (ordens de pagamento) que o card importou da Centi (aba Importação) — exatamente o que está gravado. Só leitura."}
          </p>
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
        <Callout kind="info">
          {cardId == null
            ? "Nenhum pagamento importado ainda. Abra “Importações” para criar um card e importar."
            : "Nenhum pagamento importado neste card ainda. Importe na aba Importação — todos os órgãos com o “ID na Centi” de uma vez, mês a mês."}
        </Callout>
      ) : !recorte || linhas == null ? (
        !erro && <EsqueletoTabela cheia />
      ) : (
        <>
          <DataTable
            visao={`${recorte.ano}:${recorte.removidos ? 1 : 0}`}
            columns={colunas}
            rows={linhas}
            getKey={(x) => x.id}
            scrollInterno
            density="compact"
            minWidth={2200}
            ordemInicial={{ key: "data", dir: "desc" }}
            onOrdenadas={setVista}
            onRowClick={setAberto}
            activeKey={aberto?.id ?? null}
            exportar={{ nome: `${nome} - pagamentos ${rotuloRecorteAno(recorte.ano)}${recorte.removidos ? " - removidos" : ""}` }}
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
            vazio={recorte.removidos ? `Nenhum pagamento removido na Centi${recorte.ano === ANO_TODOS ? "" : " neste ano"}.` : `Nenhum pagamento${recorte.ano === ANO_TODOS ? "" : " neste ano"}.`}
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
