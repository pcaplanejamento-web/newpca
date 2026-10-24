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
  orgao: string;
  unidade: string | null;
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
  orgao: String(t[12] ?? ""),
  unidade: (t[13] as string | null) ?? null,
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
  { key: "unidade", header: "Unidade", nowrap: true, value: (x) => x.unidade ?? "—" },
  { key: "credor", header: "Credor", minWidth: 220, value: (x) => x.credor ?? "", render: (x) => <CelulaTexto texto={x.credor} /> },
  { key: "cpfCnpj", header: "CPF/CNPJ", nowrap: true, total: false, value: (x) => x.cpfCnpj ?? "" },
  { key: "historico", header: "Histórico", minWidth: 320, value: (x) => x.historico ?? "", render: (x) => <CelulaTexto texto={x.historico} /> },
  colValor("valor", "Valor"),
  colValor("valorAnulado", "Anulado"),
  colValor("valorLiquido", "Líquido"),
  colValor("valorPago", "Pago"),
  colValor("saldo", "Saldo"),
  { key: "orgao", header: "Órgão (Centi)", minWidth: 200, value: (x) => x.orgao, render: (x) => <CelulaTexto texto={x.orgao} /> },
];

/**
 * A aba LIQUIDAÇÕES de um card de liquidações: o que está gravado (as liquidações dos órgãos do card, cada uma com o órgão e
 * a unidade de destino — independente dos empenhos),
 * por ano, no escopo da pessoa. Os números do topo acompanham os filtros; "Removidas na Centi" no rodapé.
 */
export function EmpenhoCardLiquidacoes({ cardId, nome }: { cardId: number; nome: string }) {
  const [anos, setAnos] = useState<{ ano: number; n: number }[] | null>(null);
  const [recorte, setRecorte] = useState<{ ano: number; removidos: boolean } | null>(null);
  const [linhas, setLinhas] = useState<Liquidacao[] | null>(null);
  const [vista, setVista] = useState<Liquidacao[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

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
            Cada liquidação é do <strong>órgão</strong> que a Centi informou e vai para a unidade de destino escolhida na aba Órgãos (senão, o
            próprio órgão). Você vê as liquidações da sua unidade (ou do seu órgão).
          </p>
          <p>Os números do topo acompanham os filtros da tabela. “Removidas na Centi” (rodapé) = as que a Centi não traz mais (pela regra do card).</p>
        </Ajuda>
      </FerramentasAba>

      {erro && <ErroCarga msg={erro} kind={linhas ? "warn" : "danger"} onTentar={() => (recorte ? void carregar(recorte) : window.location.reload())} />}

      {anos && !anos.length ? (
        <Callout kind="info">Nenhuma liquidação importada neste card ainda. Escolha os órgãos (aba Órgãos) e importe na aba Importação — um órgão por vez.</Callout>
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
    </>
  );
}
