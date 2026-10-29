"use client";

import { jaGuardado, lerDado, momentoDoDado, useGuardadoNoDesenho } from "@/lib/dados-cliente";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EdicaoTabela } from "@/lib/edicoes-tabela-core";
import {
  ANO_TODOS,
  type AnoEmpenhos,
  anosDoRecorte,
  type EmpenhoNaTela,
  type EscopoEmpenhos,
  escopoVazio,
  juntarAnos,
  type PacoteEmpenhos,
  PROBLEMAS_EMPENHO,
  problemasDoEmpenho,
  REGULAR_EMPENHO,
  resumoEmpenhos,
  rotuloRecorteAno,
} from "@/lib/empenhos-tela-core";
import { brl, dataBR, num, pct } from "@/lib/format";
import { FerramentasAba } from "./AbasEspaco";
import { useAbrirLinhaDaUrl } from "./AbrirDaUrl";
import { Ajuda } from "./Ajuda";
import { Avisos } from "./Avisos";
import { avisoDeFalha, colunaAno, colunaCard } from "./EmpenhoCardLiquidacoes";
import { BotaoAtualizar } from "./BotaoAtualizar";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { CelulaCopiavel } from "./BotaoCopiar";
import { CelulaTexto } from "./CelulaLista";
import { type Column, DataTable } from "./DataTable";
import { EsqueletoTabela } from "./DataTableEsqueleto";
import { EmpenhoBanner } from "./EmpenhoDetalhe";
import { ErroCarga } from "./ErroCarga";
import { EstadoPonto } from "./EstadoCelula";
import { SelectField } from "./Field";
import { IndicadoresKpi } from "./IndicadoresKpi";
import { useAtalhoImportacoes } from "./EmpenhosView";

/** A chave das edições salvas da tabela (publicar para todos = Configurar em Empenhos). */
export const CHAVE_TABELA_EMPENHOS = "empenhos:tabela";

/** As colunas que a tabela abre ESCONDIDAS (a edição da tabela as mostra). */
const OCULTAS = ["cpfCnpj", "licitacao", "funcao", "subfuncao", "programa", "subelemento", "unidadeOrcamentaria"];

const colTexto = (key: keyof EmpenhoNaTela, header: string, minWidth: number): Column<EmpenhoNaTela> => ({
  key,
  header,
  minWidth,
  value: (e) => String(e[key] ?? ""),
  render: (e) => <CelulaTexto texto={e[key] as string | null} />,
});

const colValor = (key: "valorEmpenhado" | "valorAnulado" | "valorLiquidado" | "valorPago" | "saldoPagar", header: string, forte = false): Column<EmpenhoNaTela> => ({
  key,
  header,
  align: "right",
  nowrap: true,
  filter: "range",
  numero: (e) => e[key],
  render: (e) => <span className={`tabular-nums ${forte ? "font-semibold text-text" : "text-text-2"}`}>{brl(e[key])}</span>,
});

const COLUNAS: Column<EmpenhoNaTela>[] = [
  {
    key: "numero",
    header: "Nº",
    nowrap: true,
    value: (e) => e.numero,
    render: (e) => (
      <CelulaCopiavel copiar={e.numero} rotulo="Copiar nº do empenho">
        <span className="font-mono text-[13px] text-text">{e.numero}</span>
      </CelulaCopiavel>
    ),
  },
  { key: "data", header: "Data", nowrap: true, filter: "date", value: (e) => e.data ?? "", render: (e) => <span className="tabular-nums">{dataBR(e.data)}</span> },
  colunaAno<EmpenhoNaTela>(),
  {
    key: "unidade",
    header: "Unidade",
    nowrap: true,
    value: (e) => e.unidade ?? "—",
    render: (e) => <span className="font-mono text-[12px] font-semibold text-text-2">{e.unidade ?? "—"}</span>,
  },
  colTexto("orgaoGestor", "Órgão gestor", 200),
  colTexto("unidadeOrcamentaria", "Unidade orçamentária", 200),
  colTexto("fornecedor", "Fornecedor", 220),
  { key: "cpfCnpj", header: "CPF/CNPJ", nowrap: true, value: (e) => e.cpfCnpj ?? "", render: (e) => <span className="font-mono text-[13px] text-muted">{e.cpfCnpj || "—"}</span> },
  colTexto("modalidade", "Modalidade", 170),
  { key: "licitacao", header: "Licitação", nowrap: true, value: (e) => e.licitacao ?? "", render: (e) => <span className="tabular-nums text-text-2">{e.licitacao || "—"}</span> },
  colTexto("funcao", "Função", 140),
  colTexto("subfuncao", "Subfunção", 170),
  colTexto("programa", "Programa", 210),
  colTexto("acao", "Ação", 230),
  colTexto("elemento", "Elemento", 220),
  colTexto("subelemento", "Subelemento", 190),
  colTexto("fonte", "Fonte", 230),
  colValor("valorEmpenhado", "Empenhado", true),
  colValor("valorAnulado", "Anulado"),
  colValor("valorLiquidado", "Liquidado"),
  colValor("valorPago", "Pago"),
  colValor("saldoPagar", "A pagar"),
  {
    key: "conferencia",
    header: "Conferência",
    nowrap: true,
    total: false,
    valores: (e) => {
      const p = problemasDoEmpenho(e);
      return p.length ? p.map((x) => PROBLEMAS_EMPENHO[x]) : [REGULAR_EMPENHO];
    },
    value: (e) => problemasDoEmpenho(e).map((x) => PROBLEMAS_EMPENHO[x]).join("; ") || REGULAR_EMPENHO,
    corPdf: (e) => (problemasDoEmpenho(e).length ? "var(--warn)" : null),
    render: (e) => {
      const p = problemasDoEmpenho(e);
      return p.length ? (
        <EstadoPonto cor="var(--warn)" rotulo={`${PROBLEMAS_EMPENHO[p[0]]}${p.length > 1 ? ` +${p.length - 1}` : ""}`} title={p.map((x) => PROBLEMAS_EMPENHO[x]).join("\n")} />
      ) : (
        <EstadoPonto cor="var(--ok)" rotulo={REGULAR_EMPENHO} />
      );
    },
  },
];

type Recorte = { ano: number; removidos: boolean };
const chaveRecorte = (r: Recorte) => `${r.ano}:${r.removidos ? 1 : 0}`;

/**
 * A aba EMPENHOS de um card: a tabela importada de um ANO — EXATAMENTE o que está no banco (só os do escopo da pessoa: a
 * unidade do cabeçalho; `escopo` null = todos). SÓ LEITURA. Os KPIs acompanham os filtros da tabela (`onOrdenadas`); a
 * tabela é a padrão (`scrollInterno` + `compact`, filtros conectados, edições salvas `empenhos:`, XLSX/PDF). O ano chega
 * COMPACTO (`empenhos-tela-core.ts`) e fica guardado nesta aba — trocar de ano e voltar não pede de novo; "Recarregar"
 * pede. Tocar numa linha = o detalhe. O ano e o Recarregar ficam na barra das abas (`FerramentasAba`).
 */
/** O endereço de UM ano de empenhos (a mesma chave do armazém em toda leitura). */
function urlAno(cardId: number | null, ano: number, removidos: boolean): string {
  return `/api/empenhos?${cardId == null ? "" : `card=${cardId}&`}ano=${ano}${removidos ? "&removidos=1" : ""}`;
}

export function EmpenhosTabela({
  cardId,
  nome,
  anos,
  anoInicial,
  edicoes,
  podePublicar,
  escopo = null,
  versao = "",
  cards,
}: {
  /** `null` = a TABELA ÚNICA (todos os cards de empenhos — o mesmo empenho uma vez; a coluna Card diz de onde veio). */
  cardId: number | null;
  /** O nome do card (o nome do arquivo exportado). */
  nome: string;
  anos: AnoEmpenhos[];
  anoInicial: number | null;
  edicoes: { lista: EdicaoTabela[]; padroes: Record<string, unknown> };
  /** Configurar em Empenhos: publicar edições da tabela para todos. */
  podePublicar: boolean;
  /** As unidades e os órgãos à vista (`null` = todos). */
  escopo?: EscopoEmpenhos;
  /** A versão dos dados da execução (importação promovida, vínculos, cards): mudou, os anos guardados saem e a tabela relê. */
  versao?: string;
  /** O nome de cada card (a coluna Card da tabela única). */
  cards?: Record<number, string>;
}) {
  const colunas = useMemo(() => (cardId == null ? [COLUNAS[0], colunaCard<EmpenhoNaTela>(cards ?? {}), ...COLUNAS.slice(1)] : COLUNAS), [cardId, cards]);
  const [recorte, setRecorte] = useState<Recorte | null>(anoInicial != null ? { ano: anoInicial, removidos: false } : null);
  // Voltar à tela: o que já está na memória da aba desenha no 1º quadro (sem o esqueleto).
  const noDesenho = useGuardadoNoDesenho();
  const [linhas, setLinhas] = useState<EmpenhoNaTela[] | null>(() => {
    if (!noDesenho || anoInicial == null || !versao) return null;
    const partes = anosDoRecorte(anoInicial, anos).map((a) => jaGuardado<EmpenhoNaTela[]>("empenhos", urlAno(cardId, a, false), versao));
    return partes.every(Boolean) ? (partes as EmpenhoNaTela[][]).flat() : null;
  });
  const [vista, setVista] = useState<EmpenhoNaTela[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [aberto, setAberto] = useState<EmpenhoNaTela | null>(null);
  // O link da PESQUISA DO SISTEMA (`?abrir=<id>`): abre a linha quando a tabela chega.
  useAbrirLinhaDaUrl(linhas, setAberto);
  const [eds, setEds] = useState(edicoes);
  const guardados = useRef(new Map<string, EmpenhoNaTela[]>());
  const pedido = useRef(0);
  const versaoRef = useRef(versao);
  versaoRef.current = versao;

  // Um ano lido (e guardado nesta aba) — "Todos os anos" junta um pedido por ano, cada um com o próprio limite do servidor.
  const lerAno = useCallback(
    async (ano: number, removidos: boolean, fresco: boolean): Promise<EmpenhoNaTela[]> => {
      const k = `${ano}:${removidos ? 1 : 0}`;
      const guardado = fresco ? undefined : guardados.current.get(k);
      if (guardado) return guardado;
      // Guardado no NAVEGADOR pela versão: sair e voltar à tela não pede de novo.
      const lista = await lerDado(
        "empenhos",
        urlAno(cardId, ano, removidos),
        versaoRef.current ?? "",
        async (resp) => {
          const j = (await resp.json()) as { ok?: boolean; error?: string; pacote?: PacoteEmpenhos };
          if (!resp.ok || !j.ok || !j.pacote) throw new Error(j.error ?? "Não foi possível carregar os empenhos.");
          return juntarAnos([{ ano, pacote: j.pacote }]);
        },
        fresco,
      );
      guardados.current.set(k, lista);
      return lista;
    },
    [cardId],
  );

  const carregar = useCallback(
    async (r: Recorte, fresco = false) => {
      const n = ++pedido.current;
      setErro(null);
      const lidos = anosDoRecorte(r.ano, anos).map((ano) => guardados.current.get(`${ano}:${r.removidos ? 1 : 0}`));
      if (!fresco && lidos.every(Boolean)) {
        setLinhas((lidos as EmpenhoNaTela[][]).flat());
        return;
      }
      setCarregando(true);
      try {
        // Nenhum ano fica de fora: a falha de um é a falha da carga (com "Tentar de novo").
        const partes = await Promise.all(anosDoRecorte(r.ano, anos).map((ano) => lerAno(ano, r.removidos, fresco)));
        if (n === pedido.current) {
          const em = anosDoRecorte(r.ano, anos).map((ano) => momentoDoDado("empenhos", urlAno(cardId, ano, r.removidos), versaoRef.current ?? ""));
          setDadosDe(em.length && em.every((x) => x != null) ? Math.min(...(em as number[])) : null);
          setLinhas(partes.flat());
        }
      } catch (e) {
        if (n === pedido.current) setErro(e instanceof Error ? e.message : "Não foi possível carregar os empenhos.");
      } finally {
        if (n === pedido.current) setCarregando(false);
      }
    },
    [anos, lerAno, cardId],
  );

  useEffect(() => {
    if (recorte) void carregar(recorte);
  }, [recorte, carregar]);

  // Importação nova (ou vínculos/cards alterados): o que estava guardado de cada ano fica velho — relê o ano aberto, sem
  // apagar a tabela da tela enquanto chega.
  const versaoVista = useRef(versao);
  useEffect(() => {
    if (versaoVista.current === versao) return;
    versaoVista.current = versao;
    guardados.current.clear();
    if (recorte) void carregar(recorte, true);
  }, [versao, recorte, carregar]);

  // O ano na URL (voltar/compartilhar abre no mesmo) — sem pedir a página de novo.
  useEffect(() => {
    if (!recorte) return;
    const u = new URL(window.location.href);
    u.searchParams.set("ano", recorte.ano === ANO_TODOS ? "todos" : String(recorte.ano));
    window.history.replaceState(window.history.state, "", u);
  }, [recorte]);


  // Os removidos do recorte: "Todos os anos" soma os de cada ano.
  const removidosNoRecorte = recorte ? anos.filter((a) => recorte.ano === ANO_TODOS || a.ano === recorte.ano).reduce((t, a) => t + a.removidos, 0) : 0;
  const r = useMemo(() => resumoEmpenhos(vista ?? linhas ?? []), [vista, linhas]);
  const filtrado = vista != null && linhas != null && vista.length !== linhas.length;
  const atalho = useAtalhoImportacoes();
  const [dadosDe, setDadosDe] = useState<number | null>(null);

  return (
    <>
      {recorte && (
        <IndicadoresKpi
          chave="empenhos:indicadores"
          cartoes={[
            { label: "Empenhado", value: linhas ? brl(r.empenhado - r.anulado) : "…", cor: "var(--accent)", hint: filtrado ? "com os filtros da tabela" : undefined, detalhes: [{ rotulo: "Anulado", valor: linhas ? brl(r.anulado) : "…" }, { rotulo: "Empenhos", valor: linhas ? num(r.n) : "…" }] },
            { label: "Liquidado", value: linhas ? brl(r.liquidado) : "…", detalhes: [{ rotulo: "Do empenhado", valor: linhas ? pct(r.liquidado, r.empenhado - r.anulado) : "…" }, { rotulo: "A liquidar", valor: linhas ? brl(Math.max(0, r.empenhado - r.anulado - r.liquidado)) : "…" }] },
            { label: "Pago", value: linhas ? brl(r.pago) : "…", cor: "var(--ok)", detalhes: [{ rotulo: "Do empenhado", valor: linhas ? pct(r.pago, r.empenhado - r.anulado) : "…" }, { rotulo: "Do liquidado", valor: linhas ? pct(r.pago, r.liquidado) : "…" }] },
            { label: "A pagar", value: linhas ? brl(r.aPagar) : "…", detalhes: [{ rotulo: "Liquidado a pagar", valor: linhas ? brl(Math.max(0, r.liquidado - r.pago)) : "…" }, { rotulo: "Removidos na Centi", valor: num(removidosNoRecorte) }] },
          ]}
        />
      )}
      <FerramentasAba>
        {anos.length > 0 && recorte && (
          <div className="mr-auto">
            <SelectField compacto label="Ano" value={String(recorte.ano)} onChange={(e) => setRecorte({ ano: Number(e.target.value), removidos: false })}>
              <option value={ANO_TODOS}>Todos os anos</option>
              {anos.map((a) => (
                <option key={a.ano} value={a.ano}>
                  {a.ano}
                </option>
              ))}
            </SelectField>
          </div>
        )}
        {recorte && <BotaoAtualizar ativo={carregando} rotulo="Recarregar" detalhe="Carregando os empenhos…" dadosDe={dadosDe} onClick={() => void carregar(recorte, true)} />}
        <Avisos avisos={avisoDeFalha(erro, linhas != null, () => recorte && void carregar(recorte, true))} />
        {atalho}
        <Ajuda titulo={cardId == null ? "Empenhos" : "Empenhos do card"} botao="sm">
          <p>
            {cardId == null
              ? "Todos os empenhos importados, de todos os cards, numa tabela só — o mesmo empenho em dois cards aparece uma vez (a coluna Card diz de onde veio). Só leitura: as importações ficam em “Importações”."
              : "A tabela que o card importou da Centi — exatamente o que está gravado no banco. Só leitura: para atualizar, importe de novo (aba Importação) ou ligue a atualização automática (Configuração)."}
          </p>
          <p>Os números do topo acompanham os filtros da tabela. Toque numa linha para ver o empenho inteiro, com o histórico.</p>
          <p>“Removidos na Centi” (rodapé) = os que a Centi não traz mais: ficam guardados, fora das somas (pela regra do card).</p>
          <p>Só os empenhos que os VÍNCULOS do card cobrem são gravados. Você vê os vinculados à unidade escolhida no cabeçalho (na “Geral”, a todas as suas); o vinculado só ao órgão aparece para as unidades daquele órgão.</p>
        </Ajuda>
      </FerramentasAba>

      {!recorte ? (
        <Callout kind="info">
          {escopo
            ? escopoVazio(escopo)
              ? "Nenhum empenho para a unidade escolhida no cabeçalho."
              : cardId == null
                ? "Nenhum empenho vinculado à sua unidade foi importado ainda."
                : "Nenhum empenho vinculado à sua unidade foi importado neste card ainda."
            : cardId == null
              ? "Nenhum empenho importado ainda. Abra “Importações” para criar um card, definir os vínculos e importar."
              : "Nenhum empenho importado neste card ainda. Defina os vínculos e importe na aba Importação."}
        </Callout>
      ) : (
        <>

          {erro && !linhas && <ErroCarga msg={erro} kind="danger" onTentar={() => void carregar(recorte, true)} />}

          {linhas == null ? (
            !erro && <EsqueletoTabela cheia />
          ) : (
            <DataTable
              visao={chaveRecorte(recorte)}
              columns={colunas}
              rows={linhas}
              getKey={(e) => e.id}
              scrollInterno
              density="compact"
              minWidth={3400}
              ocultasPadrao={OCULTAS}
              ordemInicial={{ key: "data", dir: "desc" }}
              onRowClick={setAberto}
              activeKey={aberto?.id ?? null}
              onOrdenadas={setVista}
              edicoes={{ chave: CHAVE_TABELA_EMPENHOS, lista: eds.lista, padroes: eds.padroes, podePublicar, onMudar: (lista, padroes) => setEds({ lista, padroes }) }}
              exportar={{ nome: `${nome} ${rotuloRecorteAno(recorte.ano)}${recorte.removidos ? " - removidos" : ""}` }}
              acoesRodape={
                removidosNoRecorte > 0 ? (
                  <Button
                    size="sm"
                    variant={recorte.removidos ? "primary" : "secondary"}
                    aria-pressed={recorte.removidos}
                    title={recorte.removidos ? "Voltar aos empenhos vigentes" : "Os empenhos que a Centi não traz mais"}
                    onClick={() => setRecorte({ ano: recorte.ano, removidos: !recorte.removidos })}
                  >
                    Removidos na Centi ({num(removidosNoRecorte)})
                  </Button>
                ) : undefined
              }
              vazio={recorte.removidos ? `Nenhum empenho removido na Centi${recorte.ano === ANO_TODOS ? "" : " neste ano"}.` : `Nenhum empenho${recorte.ano === ANO_TODOS ? "" : " neste ano"}.`}
              resumo={(l) => {
                const s = resumoEmpenhos(l);
                return `${num(s.n)} ${s.n === 1 ? "empenho" : "empenhos"} · Empenhado ${brl(s.empenhado)} · Pago ${brl(s.pago)}`;
              }}
            />
          )}
        </>
      )}

      <EmpenhoBanner empenho={aberto} onClose={() => setAberto(null)} />
    </>
  );
}
