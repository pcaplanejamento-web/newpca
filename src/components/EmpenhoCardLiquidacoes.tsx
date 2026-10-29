"use client";

import { jaGuardado, lerDado, momentoDoDado, useGuardadoNoDesenho } from "@/lib/dados-cliente";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { rotuloTipoExecucao, type TipoExecucao, tipoDaExecucao } from "@/lib/execucao-empenho-core";
import { ANO_TODOS, anosDoRecorte, rotuloRecorteAno } from "@/lib/empenhos-tela-core";
import { brl, dataBR, num, pct } from "@/lib/format";
import { FerramentasAba } from "./AbasEspaco";
import { useAbrirLinhaDaUrl } from "./AbrirDaUrl";
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
import { IndicadoresKpi } from "./IndicadoresKpi";
import { useAtalhoImportacoes } from "./EmpenhosView";

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
  /** O card que gravou o registro (o banner pede por ele; a coluna Card da tabela única). */
  cardId: number;
  /** O ano do registro (o da importação — a coluna Ano de "Todos os anos"). */
  ano: number;
};

const daTupla = (t: unknown[], ano: number): Liquidacao => ({
  id: Number(t[0]),
  ano,
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
  cardId: Number(t[17] ?? 0),
});

/**
 * A coluna TIPO (liquidações e pagamentos): Nota de Empenho × Restos a Pagar pelo ano do empenho × o do registro; o erro
 * (sem número de empenho, empenho de ano posterior) no lugar do tipo. O filtro junta o Restos a Pagar presumido ao comum.
 */
export function colunaTipoExecucao<T extends { tipo: TipoExecucao }>(): Column<T> {
  return { key: "tipo", header: "Tipo", nowrap: true, total: false, value: (x) => rotuloTipoExecucao(x.tipo), render: (x) => <SeloTipoExecucao tipo={x.tipo} /> };
}

/** A coluna ANO (o ano do registro — "Todos os anos" junta vários): filtrável, ordenável. */
export function colunaAno<T extends { ano?: number }>(): Column<T> {
  return { key: "ano", header: "Ano", nowrap: true, total: false, value: (x) => (x.ano != null ? String(x.ano) : "—"), render: (x) => <span className="tabular-nums">{x.ano ?? "—"}</span> };
}

/**
 * A coluna CARD da TABELA ÚNICA (empenhos, liquidações e pagamentos de todos os cards): o nome do card que gravou o registro.
 */
export function colunaCard<T extends { cardId?: number }>(nomes: Record<number, string>): Column<T> {
  const nome = (x: T) => (x.cardId != null ? (nomes[x.cardId] ?? `Card ${x.cardId}`) : "—");
  return { key: "card", header: "Card", nowrap: true, total: false, value: nome, render: (x) => <span className="text-text-2">{nome(x)}</span> };
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
  colunaAno<Liquidacao>(),
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
export function EmpenhoCardLiquidacoes({
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
  const rota = cardId == null ? "/api/empenhos/liquidacoes" : `/api/empenhos/cards/${cardId}/liquidacoes`;
  const colunas = useMemo(() => (cardId == null ? [COLUNAS[0], colunaCard<Liquidacao>(cards ?? {}), ...COLUNAS.slice(1)] : COLUNAS), [cardId, cards]);
  // Voltar à tela: o que já está na memória da aba desenha no 1º quadro (sem o esqueleto); a versão confere depois.
  const noDesenho = useGuardadoNoDesenho();
  const [inicio] = useState(() => {
    const a = noDesenho && versao ? jaGuardado<{ anos?: { ano: number; n: number }[] }>("liquidacoes", rota, versao)?.anos : undefined;
    if (!a?.length) return null;
    const partes = anosDoRecorte(ANO_TODOS, a).map((ano) => {
      const j = jaGuardado<{ linhas?: unknown[][] }>("liquidacoes", `${rota}?ano=${ano}`, versao);
      return j ? (j.linhas ?? []).map((t) => daTupla(t, ano)) : null;
    });
    return { anos: a, linhas: partes.every(Boolean) ? (partes as Liquidacao[][]).flat() : null };
  });
  const [anos, setAnos] = useState<{ ano: number; n: number }[] | null>(inicio?.anos ?? null);
  const [recorte, setRecorte] = useState<{ ano: number; removidos: boolean } | null>(null);
  const [linhas, setLinhas] = useState<Liquidacao[] | null>(inicio?.linhas ?? null);
  const [vista, setVista] = useState<Liquidacao[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [aberto, setAberto] = useState<Liquidacao | null>(null);
  // O link da PESQUISA DO SISTEMA (`?abrir=<id>`): abre a linha quando a tabela chega.
  useAbrirLinhaDaUrl(linhas, setAberto);
  const pedido = useRef(0);
  const anosRef = useRef<{ ano: number; n: number }[]>(inicio?.anos ?? []);
  const [completo, setCompleto] = useState<LiquidacaoCompleta | null | undefined>(undefined);

  // O detalhe: o que a tabela tem na hora; o registro e o empenho ligado chegam depois.
  useEffect(() => {
    if (!aberto) return;
    let vivo = true;
    setCompleto(undefined);
    fetch(`/api/empenhos/cards/${aberto.cardId}/liquidacoes/${aberto.id}`)
      .then((r) => r.json() as Promise<{ ok?: boolean; liquidacao?: LiquidacaoCompleta }>)
      .then((j) => vivo && setCompleto(j.ok && j.liquidacao ? j.liquidacao : null))
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
        const j = await lerDado("liquidacoes", rota, versao, async (r) => {
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
        if (vivo) setErro(e instanceof Error ? e.message : "Não foi possível carregar as liquidações.");
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
        const emDe: (number | null)[] = [];
        // "Todos os anos" = um pedido POR ANO (cada um com o próprio limite do servidor), juntos — nenhum ano fica de fora:
        // a falha de um é a falha da carga.
        const partes = await Promise.all(
          anosDoRecorte(rc.ano, anosRef.current).map(async (ano) => {
            const j = await lerDado(
              "liquidacoes",
              `${rota}?ano=${ano}${rc.removidos ? "&removidos=1" : ""}`,
              versao,
              async (r) => {
                const j = (await r.json()) as { ok?: boolean; error?: string; linhas?: unknown[][] };
                if (!r.ok || !j.ok) throw new Error(j.error ?? `Falha (${r.status}).`);
                return j;
              },
              fresco,
            );
            emDe.push(momentoDoDado("liquidacoes", `${rota}?ano=${ano}${rc.removidos ? "&removidos=1" : ""}`, versao));
            return (j.linhas ?? []).map((t) => daTupla(t, ano));
          }),
        );
        if (n !== pedido.current) return;
        const novas = partes.flat();
        setDadosDe(emDe.every((x) => x != null) && emDe.length ? Math.min(...(emDe as number[])) : null);
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
    [rota, versao],
  );
  // A VERSÃO dos dados da execução (importação promovida, vínculos, cards) vem da página: mudou, relê — o tipo (Nota de
  // Empenho × Restos a Pagar), o órgão e a unidade vêm do empenho ligado, lido na hora pelo número.
  // A releitura pela versão nova passa pelos anos (acima): eles chegam primeiro e o recorte novo pede as linhas.
  useEffect(() => {
    if (recorte) void carregar(recorte);
  }, [recorte, carregar]);

  const base = vista ?? linhas ?? [];
  const tot = useMemo(() => ({ n: base.length, valor: soma(base, "valor"), anulado: soma(base, "valorAnulado"), liquido: soma(base, "valorLiquido"), pago: soma(base, "valorPago"), saldo: soma(base, "saldo") }), [base]);
  const filtrado = vista != null && linhas != null && vista.length !== linhas.length;
  const atalho = useAtalhoImportacoes();
  const [dadosDe, setDadosDe] = useState<number | null>(null);

  return (
    <>
      {recorte && linhas != null && (
        <IndicadoresKpi
          chave="liquidacoes:indicadores"
          cartoes={[
            { label: "Liquidado líquido", value: brl(tot.liquido), cor: "var(--accent)", hint: filtrado ? "com os filtros da tabela" : undefined, detalhes: [{ rotulo: "Valor", valor: brl(tot.valor) }, { rotulo: "Anulado", valor: brl(tot.anulado) }] },
            { label: "Pago", value: brl(tot.pago), cor: "var(--ok)", detalhes: [{ rotulo: "Do liquidado", valor: pct(tot.pago, tot.liquido) }, { rotulo: "A pagar", valor: brl(Math.max(0, tot.liquido - tot.pago)) }] },
            { label: "Saldo", value: brl(tot.saldo), detalhes: [{ rotulo: "Do liquidado", valor: pct(tot.saldo, tot.liquido) }, { rotulo: "Liquidações", valor: num(tot.n) }] },
            { label: "Liquidações", value: num(tot.n), detalhes: [{ rotulo: "Média", valor: tot.n ? brl(tot.liquido / tot.n) : "—" }, { rotulo: "Recorte", valor: recorte?.removidos ? "Removidas na Centi" : "Vigentes" }] },
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
        {recorte && <BotaoAtualizar ativo={carregando} rotulo="Recarregar" detalhe="Carregando as liquidações…" dadosDe={dadosDe} onClick={() => void carregar(recorte, true)} />}
        <Avisos avisos={[...avisoSemEmpenho(linhas, "liquidação", "liquidações"), ...avisoDeFalha(erro, linhas != null, () => (recorte ? void carregar(recorte) : window.location.reload()))]} />
        {atalho}
        <Ajuda titulo={cardId == null ? "Liquidações" : "Liquidações do card"} botao="sm">
          <p>
            {cardId == null
              ? "Todas as liquidações importadas, de todos os cards, numa tabela só (a mesma liquidação em dois cards aparece uma vez; a coluna Card diz de onde veio). Só leitura — as importações ficam em “Importações”."
              : "As liquidações que o card importou da Centi (aba Importação) — exatamente o que está gravado. Só leitura."}
          </p>
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
        <Callout kind="info">
          {cardId == null
            ? "Nenhuma liquidação importada ainda. Abra “Importações” para criar um card e importar."
            : "Nenhuma liquidação importada neste card ainda. Importe na aba Importação — todos os órgãos com o “ID na Centi” de uma vez."}
        </Callout>
      ) : !recorte || linhas == null ? (
        !erro && <EsqueletoTabela cheia />
      ) : (
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
            exportar={{ nome: `${nome} - liquidações ${rotuloRecorteAno(recorte.ano)}${recorte.removidos ? " - removidas" : ""}` }}
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
            vazio={recorte.removidos ? `Nenhuma liquidação removida na Centi${recorte.ano === ANO_TODOS ? "" : " neste ano"}.` : `Nenhuma liquidação${recorte.ano === ANO_TODOS ? "" : " neste ano"}.`}
            resumo={(l) => `${num(l.length)} ${l.length === 1 ? "liquidação" : "liquidações"} · Valor ${brl(soma(l, "valor"))} · Pago ${brl(soma(l, "valorPago"))}`}
          />
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
