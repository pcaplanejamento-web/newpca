"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EdicaoTabela } from "@/lib/edicoes-tabela-core";
import type { EmpenhoCompleto } from "@/lib/empenhos-tela";
import { type AnoEmpenhos, type EmpenhoNaTela, empenhosDoPacote, type EscopoEmpenhos, escopoVazio, type PacoteEmpenhos, resumoEmpenhos } from "@/lib/empenhos-tela-core";
import { brl, dataBR, num } from "@/lib/format";
import { FerramentasAba } from "./AbasEspaco";
import { Ajuda } from "./Ajuda";
import { BotaoAtualizar } from "./BotaoAtualizar";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { CelulaCopiavel } from "./BotaoCopiar";
import { CelulaTexto } from "./CelulaLista";
import { type Column, DataTable } from "./DataTable";
import { EsqueletoTabela } from "./DataTableEsqueleto";
import { EmpenhoDetalhe } from "./EmpenhoDetalhe";
import { ErroCarga } from "./ErroCarga";
import { SelectField } from "./Field";
import { Modal } from "./Modal";
import { StatMini } from "./StatMini";

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
export function EmpenhosTabela({
  cardId,
  nome,
  anos,
  anoInicial,
  edicoes,
  podePublicar,
  escopo = null,
}: {
  cardId: number;
  /** O nome do card (o nome do arquivo exportado). */
  nome: string;
  anos: AnoEmpenhos[];
  anoInicial: number | null;
  edicoes: { lista: EdicaoTabela[]; padroes: Record<string, unknown> };
  /** Configurar em Empenhos: publicar edições da tabela para todos. */
  podePublicar: boolean;
  /** As unidades e os órgãos à vista (`null` = todos). */
  escopo?: EscopoEmpenhos;
}) {
  const [recorte, setRecorte] = useState<Recorte | null>(anoInicial != null ? { ano: anoInicial, removidos: false } : null);
  const [linhas, setLinhas] = useState<EmpenhoNaTela[] | null>(null);
  const [vista, setVista] = useState<EmpenhoNaTela[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [aberto, setAberto] = useState<EmpenhoNaTela | null>(null);
  const [completo, setCompleto] = useState<EmpenhoCompleto | null | undefined>(undefined);
  const [eds, setEds] = useState(edicoes);
  const guardados = useRef(new Map<string, EmpenhoNaTela[]>());
  const pedido = useRef(0);

  const carregar = useCallback(async (r: Recorte, fresco = false) => {
    const k = chaveRecorte(r);
    const n = ++pedido.current;
    setErro(null);
    const guardado = fresco ? undefined : guardados.current.get(k);
    if (guardado) {
      setLinhas(guardado);
      return;
    }
    setCarregando(true);
    if (!fresco) setLinhas(null);
    try {
      const resp = await fetch(`/api/empenhos?card=${cardId}&ano=${r.ano}${r.removidos ? "&removidos=1" : ""}`, { cache: "no-store" });
      const j = (await resp.json()) as { ok?: boolean; error?: string; pacote?: PacoteEmpenhos };
      if (!resp.ok || !j.ok || !j.pacote) throw new Error(j.error ?? "Não foi possível carregar os empenhos.");
      const lista = empenhosDoPacote(j.pacote);
      guardados.current.set(k, lista);
      if (n === pedido.current) setLinhas(lista);
    } catch (e) {
      if (n === pedido.current) setErro(e instanceof Error ? e.message : "Não foi possível carregar os empenhos.");
    } finally {
      if (n === pedido.current) setCarregando(false);
    }
  }, [cardId]);

  useEffect(() => {
    if (recorte) void carregar(recorte);
  }, [recorte, carregar]);

  // O ano na URL (voltar/compartilhar abre no mesmo) — sem pedir a página de novo.
  useEffect(() => {
    if (!recorte) return;
    const u = new URL(window.location.href);
    u.searchParams.set("ano", String(recorte.ano));
    window.history.replaceState(window.history.state, "", u);
  }, [recorte]);

  // O detalhe: o que a tabela tem na hora; o histórico e o registro chegam depois.
  useEffect(() => {
    if (!aberto) return;
    let vivo = true;
    setCompleto(undefined);
    fetch(`/api/empenhos/${aberto.id}`)
      .then((r) => r.json() as Promise<{ ok?: boolean; empenho?: EmpenhoCompleto }>)
      .then((j) => vivo && setCompleto(j.ok && j.empenho ? j.empenho : null))
      .catch(() => vivo && setCompleto(null));
    return () => {
      vivo = false;
    };
  }, [aberto]);

  const ano = anos.find((a) => a.ano === recorte?.ano);
  const r = useMemo(() => resumoEmpenhos(vista ?? linhas ?? []), [vista, linhas]);
  const filtrado = vista != null && linhas != null && vista.length !== linhas.length;

  return (
    <>
      <FerramentasAba>
        {anos.length > 0 && recorte && (
          <SelectField compacto label="Ano" value={String(recorte.ano)} onChange={(e) => setRecorte({ ano: Number(e.target.value), removidos: false })}>
            {anos.map((a) => (
              <option key={a.ano} value={a.ano}>
                {a.ano}
              </option>
            ))}
          </SelectField>
        )}
        {recorte && <BotaoAtualizar ativo={carregando} rotulo="Recarregar" detalhe="Carregando os empenhos…" onClick={() => void carregar(recorte, true)} />}
        <Ajuda titulo="Empenhos do card" botao="sm">
          <p>A tabela que o card importou da Centi — exatamente o que está gravado no banco. Só leitura: para atualizar, importe de novo (aba Importação) ou ligue a atualização automática (Configuração).</p>
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
              : "Nenhum empenho vinculado à sua unidade foi importado neste card ainda."
            : "Nenhum empenho importado neste card ainda. Defina os vínculos e importe na aba Importação."}
        </Callout>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-[var(--gap-block)] sm:grid-cols-3 xl:grid-cols-6">
            <StatMini label="Empenhos" value={linhas ? num(r.n) : "…"} hint={filtrado ? "com os filtros da tabela" : recorte.removidos ? "removidos na Centi" : undefined} />
            <StatMini label="Empenhado" value={linhas ? brl(r.empenhado) : "…"} tone="accent" />
            <StatMini label="Anulado" value={linhas ? brl(r.anulado) : "…"} tone={r.anulado ? "warn" : "default"} />
            <StatMini label="Liquidado" value={linhas ? brl(r.liquidado) : "…"} />
            <StatMini label="Pago" value={linhas ? brl(r.pago) : "…"} tone="ok" />
            <StatMini label="A pagar" value={linhas ? brl(r.aPagar) : "…"} />
          </div>

          {erro && <ErroCarga msg={erro} kind={linhas ? "warn" : "danger"} onTentar={() => void carregar(recorte, true)} />}

          {linhas == null ? (
            !erro && <EsqueletoTabela cheia />
          ) : (
            <DataTable
              visao={chaveRecorte(recorte)}
              columns={COLUNAS}
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
              exportar={{ nome: `${nome} ${recorte.ano}${recorte.removidos ? " - removidos" : ""}` }}
              acoesRodape={
                ano && ano.removidos > 0 ? (
                  <Button
                    size="sm"
                    variant={recorte.removidos ? "primary" : "secondary"}
                    aria-pressed={recorte.removidos}
                    title={recorte.removidos ? "Voltar aos empenhos vigentes" : "Os empenhos que a Centi não traz mais"}
                    onClick={() => setRecorte({ ano: recorte.ano, removidos: !recorte.removidos })}
                  >
                    Removidos na Centi ({num(ano.removidos)})
                  </Button>
                ) : undefined
              }
              vazio={recorte.removidos ? "Nenhum empenho removido na Centi neste ano." : "Nenhum empenho neste ano."}
              resumo={(l) => {
                const s = resumoEmpenhos(l);
                return `${num(s.n)} ${s.n === 1 ? "empenho" : "empenhos"} · Empenhado ${brl(s.empenhado)} · Pago ${brl(s.pago)}`;
              }}
            />
          )}
        </>
      )}

      <Modal open={aberto != null} onClose={() => setAberto(null)} titulo={aberto ? `Empenho ${aberto.numero}` : "Empenho"} size="lg">
        {aberto ? <EmpenhoDetalhe key={aberto.id} empenho={aberto} completo={completo} /> : <div />}
      </Modal>
    </>
  );
}
