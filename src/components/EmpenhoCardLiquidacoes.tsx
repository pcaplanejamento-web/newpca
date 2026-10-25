"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { rotuloTipoExecucao, type TipoExecucao, tipoDaExecucao } from "@/lib/execucao-empenho-core";
import { brl, dataBR, num } from "@/lib/format";
import { FerramentasAba } from "./AbasEspaco";
import { Ajuda } from "./Ajuda";
import { type Aviso, Avisos } from "./Avisos";
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
import { LiquidacaoDetalhe, SeloTipoExecucao } from "./LiquidacaoDetalhe";
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
  /** Nota de Empenho × Restos a Pagar (`tipoDaExecucao`). */
  tipo: TipoExecucao;
};

const daTupla = (t: unknown[], ano: number): Liquidacao => ({
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
  tipo: tipoDaExecucao(String(t[3] ?? ""), t[16] == null ? null : Number(t[16]), (t[1] as string | null) ?? null, ano),
});

/**
 * A coluna TIPO (liquidações e pagamentos): Nota de Empenho × Restos a Pagar pelo ano do empenho × o do registro; o erro
 * (sem número de empenho, empenho de ano posterior) no lugar do tipo. O filtro junta o Restos a Pagar presumido ao comum.
 */
export function colunaTipoExecucao<T extends { tipo: TipoExecucao }>(): Column<T> {
  return { key: "tipo", header: "Tipo", nowrap: true, total: false, value: (x) => rotuloTipoExecucao(x.tipo), render: (x) => <SeloTipoExecucao tipo={x.tipo} /> };
}

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
  colunaTipoExecucao<Liquidacao>(),
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
export function EmpenhoCardLiquidacoes({ cardId, nome, versao }: { cardId: number; nome: string; versao: string }) {
  const [anos, setAnos] = useState<{ ano: number; n: number }[] | null>(null);
  const [recorte, setRecorte] = useState<{ ano: number; removidos: boolean } | null>(null);
  const [linhas, setLinhas] = useState<Liquidacao[] | null>(null);
  const [vista, setVista] = useState<Liquidacao[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [aberto, setAberto] = useState<Liquidacao | null>(null);
  const pedido = useRef(0);
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: a versão também relê os anos (importação de outro ano).
  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const r = await fetch(`/api/empenhos/cards/${cardId}/liquidacoes`);
        const j = (await r.json()) as { ok?: boolean; error?: string; anos?: { ano: number; n: number }[] };
        if (!vivo) return;
        if (!r.ok || !j.ok) throw new Error(j.error ?? `Falha (${r.status}).`);
        setAnos(j.anos ?? []);
        // A 1ª carga abre no ano mais recente; uma recarga (versão nova) mantém o ano escolhido, se ele ainda existir.
        const l = j.anos ?? [];
        setRecorte((rc) => (rc && l.some((a) => a.ano === rc.ano) ? rc : l.length ? { ano: l[0].ano, removidos: false } : null));
      } catch (e) {
        if (vivo) setErro(e instanceof Error ? e.message : "Não foi possível carregar as liquidações.");
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
        const r = await fetch(`/api/empenhos/cards/${cardId}/liquidacoes?ano=${rc.ano}${rc.removidos ? "&removidos=1" : ""}`);
        const j = (await r.json()) as { ok?: boolean; error?: string; linhas?: unknown[][] };
        if (n !== pedido.current) return;
        if (!r.ok || !j.ok) throw new Error(j.error ?? `Falha (${r.status}).`);
        const novas = (j.linhas ?? []).map((t) => daTupla(t, rc.ano));
        setLinhas(novas);
        setVista(null);
        // Recarregou com os dados novos (uma importação de empenhos muda o tipo e a unidade): o detalhe aberto segue, atualizado.
        setAberto((a) => (a ? (novas.find((x) => x.id === a.id) ?? null) : null));
      } catch (e) {
        if (n === pedido.current) setErro(e instanceof Error ? e.message : "Não foi possível carregar as liquidações.");
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
        <Avisos avisos={[...avisoSemEmpenho(linhas, "liquidação", "liquidações"), ...avisoDeFalha(erro, linhas != null, () => (recorte ? void carregar(recorte) : window.location.reload()))]} />
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

      {erro && !linhas && <ErroCarga msg={erro} kind="danger" onTentar={() => (recorte ? void carregar(recorte) : window.location.reload())} />}

      {anos && !anos.length ? (
        <Callout kind="info">Nenhuma liquidação importada neste card ainda. Importe na aba Importação — todos os órgãos com o “ID na Centi” de uma vez.</Callout>
      ) : !recorte || linhas == null ? (
        !erro && <EsqueletoTabela cheia />
      ) : (
        <>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(9rem,100%),1fr))] gap-[var(--gap-block)]">
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

/** Quantos registros do ano à vista estão SEM o empenho no sistema (em geral, restos a pagar de anos que nenhum card de
 * empenhos importa) — o aviso com o que fazer, para o (!) da barra (`Avisos`). O mesmo nas Liquidações e nos Pagamentos. */
export function avisoSemEmpenho(linhas: readonly { anoEmpenho: number | null }[] | null, um: string, varios: string): Aviso[] {
  const n = (linhas ?? []).reduce((t, x) => t + (x.anoEmpenho == null ? 1 : 0), 0);
  if (!n) return [];
  return [
    {
      id: "sem-empenho",
      tom: "warn",
      texto: `${n === 1 ? `1 ${um}` : `${num(n)} ${varios}`} sem o empenho no sistema — em geral, restos a pagar de anos anteriores. Inclua esses anos no card de empenhos (Configuração → Anos) e importe: ${n === 1 ? "o registro passa" : "os registros passam"} a seguir o órgão e a unidade do empenho. A coluna “Ano do empenho” filtra “Sem empenho”.`,
    },
  ];
}

/** A falha de uma RECARGA com a tabela já à vista, para o (!) da barra (a tabela segue com os dados anteriores). */
export function avisoDeFalha(erro: string | null, temLinhas: boolean, tentar: () => void): Aviso[] {
  if (!erro || !temLinhas) return [];
  return [
    {
      id: "erro",
      tom: "danger",
      texto: (
        <>
          <p>{erro}</p>
          <p className="mt-1">
            A tabela mostra os dados anteriores.{" "}
            <button type="button" className="font-semibold text-accent underline underline-offset-2" onClick={tentar}>
              Tentar de novo
            </button>
          </p>
        </>
      ),
    },
  ];
}
