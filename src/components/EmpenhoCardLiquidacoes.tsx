"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { brl, dataBR, num } from "@/lib/format";
import { FerramentasAba } from "./AbasEspaco";
import { Ajuda } from "./Ajuda";
import { CelulaCopiavel } from "./BotaoCopiar";
import { BotaoAtualizar } from "./BotaoAtualizar";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { CelulaTexto } from "./CelulaLista";
import { type Column, DataTable } from "./DataTable";
import { EsqueletoTabela } from "./DataTableEsqueleto";
import { ErroCarga } from "./ErroCarga";
import { SelectField } from "./Field";
import type { LiquidacaoCompleta } from "@/lib/liquidacoes-tela";
import { LiquidacaoDetalhe } from "./LiquidacaoDetalhe";
import { Modal } from "./Modal";
import { StatMini } from "./StatMini";

/** Uma LIQUIDAÇÃO na tela (a ordem das tuplas = `COLUNAS_LIQUIDACAO` de `liquidacoes-tela.ts`). */
type Liquidacao = {
  id: number;
  data: string | null;
  numero: string | null;
  numeroEmpenho: string;
  credor: string | null;
  cpfCnpj: string | null;
  historico: string | null;
  valor: number;
  valorAnulado: number;
  valorLiquido: number;
  valorPago: number;
  saldo: number;
  /** O órgão como a Centi o escreveu. */
  orgaoCenti: string;
  /** O órgão e a unidade do CADASTRO (a sigla) = os do empenho de mesmo número. */
  orgao: string | null;
  unidade: string | null;
  /** O ANO do empenho ligado pelo número (de qualquer ano — restos a pagar); null = o empenho não está no sistema. */
  anoEmpenho: number | null;
};

const daTupla = (t: unknown[]): Liquidacao => ({
  id: Number(t[0]),
  data: (t[1] as string | null) ?? null,
  numero: (t[2] as string | null) ?? null,
  numeroEmpenho: String(t[3] ?? ""),
  credor: (t[4] as string | null) ?? null,
  cpfCnpj: (t[5] as string | null) ?? null,
  historico: (t[6] as string | null) ?? null,
  valor: Number(t[7] ?? 0),
  valorAnulado: Number(t[8] ?? 0),
  valorLiquido: Number(t[9] ?? 0),
  valorPago: Number(t[10] ?? 0),
  saldo: Number(t[11] ?? 0),
  orgaoCenti: String(t[12] ?? ""),
  orgao: (t[13] as string | null) ?? null,
  unidade: (t[14] as string | null) ?? null,
  anoEmpenho: t[16] == null ? null : Number(t[16]),
});

const soma = (l: Liquidacao[], k: "valor" | "valorAnulado" | "valorLiquido" | "valorPago" | "saldo") => l.reduce((s, x) => s + x[k], 0);

const colValor = (key: "valor" | "valorAnulado" | "valorLiquido" | "valorPago" | "saldo", header: string): Column<Liquidacao> => ({
  key,
  header,
  align: "right",
  nowrap: true,
  filter: "range",
  numero: (x) => x[key],
  render: (x) => <span className="tabular-nums">{brl(x[key])}</span>,
});

const COLUNAS: Column<Liquidacao>[] = [
  { key: "data", header: "Data", nowrap: true, filter: "date", value: (x) => x.data ?? "", render: (x) => <span className="tabular-nums">{x.data ? dataBR(x.data) : "—"}</span> },
  { key: "numero", header: "Nº liquidação", nowrap: true, total: false, value: (x) => x.numero ?? "", render: (x) => <CelulaCopiavel copiar={x.numero} rotulo="nº da liquidação">
          <span className="tabular-nums">{x.numero ?? "—"}</span>
        </CelulaCopiavel> },
  { key: "numeroEmpenho", header: "Empenho", nowrap: true, total: false, value: (x) => x.numeroEmpenho, render: (x) => <CelulaCopiavel copiar={x.numeroEmpenho} rotulo="nº do empenho">
          <span className="tabular-nums">{x.numeroEmpenho}</span>
        </CelulaCopiavel> },
  { key: "anoEmpenho", header: "Ano do empenho", nowrap: true, total: false, value: (x) => (x.anoEmpenho != null ? String(x.anoEmpenho) : "Sem empenho"), render: (x) => x.anoEmpenho != null ? <span className="tabular-nums">{x.anoEmpenho}</span> : <span className="text-faint" title="Nenhum empenho com este número importado no sistema (de nenhum ano)">—</span> },
  { key: "orgaoSistema", header: "Órgão", nowrap: true, value: (x) => x.orgao ?? "—", render: (x) => <span className="font-mono text-[12px] font-semibold text-text-2">{x.orgao ?? "—"}</span> },
  { key: "unidade", header: "Unidade", nowrap: true, value: (x) => x.unidade ?? "—", render: (x) => <span className="font-mono text-[12px] font-semibold text-text-2">{x.unidade ?? "—"}</span> },
  { key: "credor", header: "Credor", minWidth: 220, value: (x) => x.credor ?? "", render: (x) => <CelulaTexto texto={x.credor} /> },
  { key: "cpfCnpj", header: "CPF/CNPJ", nowrap: true, total: false, value: (x) => x.cpfCnpj ?? "" },
  { key: "historico", header: "Histórico", minWidth: 320, value: (x) => x.historico ?? "", render: (x) => <CelulaTexto texto={x.historico} /> },
  colValor("valor", "Valor"),
  colValor("valorAnulado", "Anulado"),
  colValor("valorLiquido", "Líquido"),
  colValor("valorPago", "Pago"),
  colValor("saldo", "Saldo"),
  { key: "orgaoCenti", header: "Órgão (Centi)", minWidth: 200, value: (x) => x.orgaoCenti, render: (x) => <CelulaTexto texto={x.orgaoCenti} /> },
];

/**
 * A aba LIQUIDAÇÕES de um card de liquidações: o que está gravado, com o órgão e a unidade do CADASTRO de cada liquidação
 * (os do EMPENHO de mesmo número — o número do empenho liga empenhos, liquidações e pagamentos), por ano, no escopo da pessoa. Os números do topo acompanham os filtros; "Removidas na Centi" no rodapé.
 */
export function EmpenhoCardLiquidacoes({ cardId, nome }: { cardId: number; nome: string }) {
  const [anos, setAnos] = useState<{ ano: number; n: number }[] | null>(null);
  const [recorte, setRecorte] = useState<{ ano: number; removidos: boolean } | null>(null);
  const [linhas, setLinhas] = useState<Liquidacao[] | null>(null);
  const [vista, setVista] = useState<Liquidacao[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [aberto, setAberto] = useState<Liquidacao | null>(null);
  const [completo, setCompleto] = useState<LiquidacaoCompleta | null | undefined>(undefined);

  // O detalhe: o que a tabela tem na hora; o registro e o empenho ligado chegam depois.
  useEffect(() => {
    if (!aberto) return;
    let vivo = true;
    setCompleto(undefined);
    fetch(`/api/empenhos/cards/${cardId}/liquidacoes/${aberto.id}`)
      .then((r) => r.json() as Promise<{ ok?: boolean; liquidacao?: LiquidacaoCompleta }>)
      .then((j) => vivo && setCompleto(j.ok && j.liquidacao ? j.liquidacao : null))
      .catch(() => vivo && setCompleto(null));
    return () => {
      vivo = false;
    };
  }, [aberto, cardId]);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const r = await fetch(`/api/empenhos/cards/${cardId}/liquidacoes`);
        const j = (await r.json()) as { ok?: boolean; error?: string; anos?: { ano: number; n: number }[] };
        if (!vivo) return;
        if (!r.ok || !j.ok) throw new Error(j.error ?? `Falha (${r.status}).`);
        setAnos(j.anos ?? []);
        if (j.anos?.length) setRecorte({ ano: j.anos[0].ano, removidos: false });
      } catch (e) {
        if (vivo) setErro(e instanceof Error ? e.message : "Não foi possível carregar as liquidações.");
      }
    })();
    return () => {
      vivo = false;
    };
  }, [cardId]);

  const carregar = useCallback(
    async (rc: { ano: number; removidos: boolean }) => {
      setCarregando(true);
      setErro(null);
      try {
        const r = await fetch(`/api/empenhos/cards/${cardId}/liquidacoes?ano=${rc.ano}${rc.removidos ? "&removidos=1" : ""}`);
        const j = (await r.json()) as { ok?: boolean; error?: string; linhas?: unknown[][] };
        if (!r.ok || !j.ok) throw new Error(j.error ?? `Falha (${r.status}).`);
        setLinhas((j.linhas ?? []).map(daTupla));
        setVista(null);
        setAberto(null);
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Não foi possível carregar as liquidações.");
      } finally {
        setCarregando(false);
      }
    },
    [cardId],
  );
  useEffect(() => {
    if (recorte) void carregar(recorte);
  }, [recorte, carregar]);

  const base = vista ?? linhas ?? [];
  const tot = useMemo(() => ({ n: base.length, valor: soma(base, "valor"), anulado: soma(base, "valorAnulado"), liquido: soma(base, "valorLiquido"), pago: soma(base, "valorPago"), saldo: soma(base, "saldo") }), [base]);
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
        {recorte && <BotaoAtualizar ativo={carregando} rotulo="Recarregar" detalhe="Carregando as liquidações…" onClick={() => void carregar(recorte)} />}
        <Ajuda titulo="Liquidações do card" botao="sm">
          <p>As liquidações que o card importou da Centi (aba Importação) — exatamente o que está gravado. Só leitura.</p>
          <p>
            A Centi não informa a unidade da liquidação: o <strong>número do empenho</strong> liga a liquidação ao empenho, e as colunas
            Órgão e Unidade são as do empenho no sistema (o vínculo dele) — procurado em TODA a tabela de empenhos, de qualquer ano
            (restos a pagar); a coluna “Ano do empenho” diz de que ano ele é. Sem o empenho importado, fica o órgão do cadastro com o “ID
            na Centi”, sem unidade. Você vê as liquidações da sua unidade (ou do seu órgão).
          </p>
          <p>Toque numa linha para ver a liquidação inteira e o empenho ligado. Os números do topo acompanham os filtros da tabela. “Removidas na Centi” (rodapé) = as que a Centi não traz mais (pela regra do card).</p>
        </Ajuda>
      </FerramentasAba>

      {erro && <ErroCarga msg={erro} kind={linhas ? "warn" : "danger"} onTentar={() => (recorte ? void carregar(recorte) : window.location.reload())} />}

      {anos && !anos.length ? (
        <Callout kind="info">Nenhuma liquidação importada neste card ainda. Importe na aba Importação — todos os órgãos com o “ID na Centi” de uma vez.</Callout>
      ) : !recorte || linhas == null ? (
        !erro && <EsqueletoTabela cheia />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-[var(--gap-block)] sm:grid-cols-3 xl:grid-cols-6">
            <StatMini label="Liquidações" value={num(tot.n)} hint={filtrado ? "com os filtros da tabela" : recorte.removidos ? "removidas na Centi" : undefined} />
            <StatMini label="Valor" value={brl(tot.valor)} tone="accent" />
            <StatMini label="Anulado" value={brl(tot.anulado)} tone={tot.anulado ? "warn" : "default"} />
            <StatMini label="Líquido" value={brl(tot.liquido)} />
            <StatMini label="Pago" value={brl(tot.pago)} tone="ok" />
            <StatMini label="Saldo" value={brl(tot.saldo)} />
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
            exportar={{ nome: `${nome} - liquidações ${recorte.ano}${recorte.removidos ? " - removidas" : ""}` }}
            acoesRodape={
              <Button
                size="sm"
                variant={recorte.removidos ? "primary" : "secondary"}
                aria-pressed={recorte.removidos}
                title={recorte.removidos ? "Voltar às liquidações vigentes" : "As liquidações que a Centi não traz mais"}
                onClick={() => setRecorte({ ano: recorte.ano, removidos: !recorte.removidos })}
              >
                Removidas na Centi
              </Button>
            }
            vazio={recorte.removidos ? "Nenhuma liquidação removida na Centi neste ano." : "Nenhuma liquidação neste ano."}
            resumo={(l) => `${num(l.length)} ${l.length === 1 ? "liquidação" : "liquidações"} · Valor ${brl(soma(l, "valor"))} · Pago ${brl(soma(l, "valorPago"))}`}
          />
        </>
      )}

      <Modal open={aberto != null} onClose={() => setAberto(null)} titulo={aberto ? `Liquidação ${aberto.numero ?? aberto.id}` : "Liquidação"} size="lg">
        {aberto ? <LiquidacaoDetalhe key={aberto.id} liquidacao={aberto} completo={completo} /> : <div />}
      </Modal>
    </>
  );
}
