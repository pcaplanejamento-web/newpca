"use client";

import { useMemo, useState } from "react";
import { comportamentoNo, type RegrasAvaliacao, regrasPadrao } from "@/lib/avaliacao-core";
import { type ConferenciaItem, ROTULO_FALTA_CATALOGO, rotulosDivergencia } from "@/lib/catalogo-conferencia";
import {
  acharSecao,
  corVeredictoCatalogo,
  ESTADO_ITEM_ROTULO,
  estadoItem,
  estadoItemCor,
  itemComErro,
  mensagensItem,
  resumoEstado,
  SECOES_OBRIGATORIAS,
  setTextoSecao,
  situacaoSecao,
  veredictoLinhaCatalogo,
} from "@/lib/dfd-tratamento";
import { brl, dataBR, num } from "@/lib/format";
import { normalizarCodigo } from "@/lib/parse-catalogo-comum";
import { type Assinatura, buracosSequencia, tipoCurtoDfd } from "@/lib/parse-dfd-comum";
import { type Nomeacao, type Solicitante, TIPOS_ATO } from "@/lib/reparticao-responsaveis";
import { Badge } from "./Badge";
import { AutoTextarea, CadeadoBotao } from "./CampoCadeado";
import { type Column, DataTable } from "./DataTable";
import { EstadoPonto, EstadoResumo } from "./EstadoCelula";
import { IconFile, IconShield } from "./icons";
import { LinkExterno } from "./LinkExterno";
import { StatMini } from "./StatMini";

/** URL oficial de verificação da assinatura digital (site da Prefeitura). */
const URL_VERIFICACAO = "https://servicos.rioverde.go.gov.br/servicos/autenticacaorelatorios";

/** Rótulo do tipo de ato (Portaria/Decreto/Lei). */
function rotuloAto(n: Nomeacao): string {
  return n.tipo ? (TIPOS_ATO.find((t) => t.valor === n.tipo)?.rotulo ?? n.tipo) : "ato";
}

/** Texto do ato de nomeação (ex.: "Portaria nº 123"). */
function atoTexto(n: Nomeacao): string {
  if (!n.tipo) return "—";
  return n.numero ? `${rotuloAto(n)} nº ${n.numero}` : rotuloAto(n);
}

/**
 * Visão COMPLETA do DFD — fonte única usada no banner flutuante tanto na
 * IMPORTAÇÃO (prévia do arquivo lido) quanto na VISUALIZAÇÃO (DFD já gravado).
 * Recebe uma forma estrutural (`DfdVisual`) satisfeita por `DfdParseado`
 * (com a repartição escolhida) e por `DfdDetalhe`.
 */
export type DfdVisualItem = {
  item: number | null;
  codigo: string | null;
  descricao: string | null;
  unidade: string | null;
  quantidade: number | null;
  valorUnitario: number | null;
  valorTotal: number | null;
};

export type DfdVisual = {
  numero: string;
  planejamento: string | null;
  tipo: string | null;
  objeto: string | null;
  orgaoEntidade: string | null;
  setorRequisitante: string | null;
  responsavel: string | null;
  matricula: string | null;
  email: string | null;
  telefone: string | null;
  anoPca: number | null;
  numeroContrato: string | null;
  numeroAta: string | null;
  numeroLicitacao: string | null;
  valorTotal: number | null;
  reparticaoCodigo: string | null;
  reparticaoNome: string | null;
  totalItens: number | null;
  itens: DfdVisualItem[];
  secoes: { numero: number; titulo: string; texto: string }[];
  assinaturas: {
    lista: Assinatura[];
    solicitante: Solicitante | null;
    /** Assinatura VALIDADA e por quem: "auto" (o sistema conferiu) ou "equipe" (validada à mão). */
    validada?: { assinatura: Assinatura; origem: "auto" | "equipe" } | null;
  };
};

type ItemK = DfdVisualItem & { _k: number };

// Colunas da tabela de itens (Seção 4) — com ESTADO por item e filtro/ordenação em
// todas (via `value`), igual às demais tabelas do sistema.
const COLS: Column<ItemK>[] = [
  {
    key: "estado",
    header: "Estado",
    nowrap: true,
    value: (r) => resumoEstado(mensagensItem(r)).rotulo || ESTADO_ITEM_ROTULO[estadoItem(r)],
    render: (r) => {
      // Com erro: aponta a falta ESPECÍFICA (valor/quantidade) + "+N" + tooltip; senão "Regular".
      const res = resumoEstado(mensagensItem(r));
      if (res.rotulo) return <EstadoResumo res={res} />;
      const e = estadoItem(r);
      return <EstadoPonto cor={estadoItemCor(e)} rotulo={ESTADO_ITEM_ROTULO[e]} />;
    },
  },
  { key: "item", header: "Item", align: "center", nowrap: true, value: (r) => String(r.item ?? ""), render: (r) => r.item ?? "—" },
  {
    key: "codigo",
    header: "Código",
    nowrap: true,
    value: (r) => r.codigo ?? "",
    render: (r) => <span className="font-mono text-[12px]">{r.codigo ?? "—"}</span>,
  },
  {
    key: "descricao",
    header: "Descrição",
    minWidth: 260,
    value: (r) => r.descricao ?? "",
    render: (r) => <span className="line-clamp-2">{r.descricao ?? "—"}</span>,
  },
  { key: "unidade", header: "Unidade", nowrap: true, value: (r) => r.unidade ?? "", render: (r) => r.unidade ?? "—" },
  {
    key: "quantidade",
    header: "Qtd.",
    align: "center",
    nowrap: true,
    value: (r) => String(r.quantidade ?? ""),
    render: (r) => (r.quantidade != null ? num(r.quantidade) : "—"),
  },
  {
    key: "vunit",
    header: "Vlr. unit.",
    align: "right",
    nowrap: true,
    value: (r) => String(r.valorUnitario ?? ""),
    render: (r) => (r.valorUnitario != null ? brl(r.valorUnitario) : "—"),
  },
  {
    key: "vtot",
    header: "Vlr. total",
    align: "right",
    nowrap: true,
    value: (r) => String(r.valorTotal ?? ""),
    render: (r) =>
      r.valorTotal != null ? <span className="font-semibold">{brl(r.valorTotal)}</span> : "—",
  },
];

/**
 * Cabeçalho FIXO do banner do DFD (vai no topo do `Modal`, não no corpo): nº do DFD +
 * as infos mais importantes ao lado — **tipo** (badge DFD-S/R/O/E) e **nº de
 * planejamento**. Uma linha só (o planejamento trunca no mobile).
 */
export function DfdCabecalho({
  numero,
  tipo,
  planejamento,
}: {
  numero: string;
  tipo: string | null;
  planejamento: string | null;
}) {
  const cod = tipoCurtoDfd(tipo);
  return (
    <div className="flex min-w-0 items-center gap-2 overflow-hidden">
      <span className="shrink-0 text-base font-bold text-text">DFD {numero}</span>
      {cod && (
        <span className="shrink-0 rounded-control bg-accent-soft px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-accent">
          {cod}
        </span>
      )}
      {planejamento && (
        <span className="truncate text-[12.5px] text-muted">
          Planejamento <span className="font-semibold text-text-2">{planejamento}</span>
        </span>
      )}
    </div>
  );
}

/** Seção como EXIBIDA: a real (`idx` no array) ou o espaço de uma OBRIGATÓRIA ausente (`idx: null`,
 * criada com `cfg` ao preencher). `chave` é ESTÁVEL (obrigatórias por palavra-chave; demais pelo índice)
 * — o cadeado aberto e o foco sobrevivem quando a seção ausente passa a existir. */
type SecaoExib = {
  chave: string;
  idx: number | null;
  numero: number;
  titulo: string;
  texto: string;
  obrig?: (typeof SECOES_OBRIGATORIAS)[number];
};

export function DfdView({
  dfd,
  regras = regrasPadrao(),
  conformidade,
  onItemClick,
  itemAtivo = null,
  ocultarSecao1 = false,
  unica = false,
  onSecoesChange,
  secaoEditavel,
  categoria = null,
}: {
  dfd: DfdVisual;
  regras?: RegrasAvaliacao;
  /** Conformidade dos itens com o CATÁLOGO (veredito por código normalizado). Quando
   * presente, a tabela de itens ganha a coluna "Catálogo". Ausente = sem a coluna
   * (listas leves / catálogo vazio). */
  conformidade?: Map<string, ConferenciaItem>;
  /** Clique numa linha de item da Seção 4 → abre o detalhe do item ao lado (índice do item). */
  onItemClick?: (idx: number) => void;
  /** Índice do item ATIVO (cujo detalhe está aberto ao lado) — destacado na tabela. */
  itemAtivo?: number | null;
  /** Oculta a Seção 1 (só-leitura) quando o `DfdConferir` mostra a versão EDITÁVEL acima
   * (evita duplicar a "Área requisitante da demanda"). */
  ocultarSecao1?: boolean;
  /** Tabela ÚNICA de itens (DFD já protocolado): sem separar os itens com pendência numa tabela à parte. */
  unica?: boolean;
  /** Edição das SEÇÕES com cadeado por seção (todas, inclusive as obrigatórias ausentes). Ausente = só-leitura. */
  onSecoesChange?: (secoes: DfdVisual["secoes"]) => void;
  /** Seção editável? (ADM: `editavelDe` por ponto). Ausente = todas editáveis quando há `onSecoesChange`. */
  secaoEditavel?: (s: { titulo: string; obrig?: string }) => boolean;
  /** Categoria do protocolo (assunto) — as exceções do ADM por categoria valem na pendência das seções. */
  categoria?: string | null;
}) {
  const rep =
    dfd.reparticaoCodigo || dfd.reparticaoNome
      ? `${dfd.reparticaoCodigo ?? ""}${dfd.reparticaoNome ? ` · ${dfd.reparticaoNome}` : ""}`
      : "Sem unidade";
  const rows: ItemK[] = dfd.itens.map((it, i) => ({ ...it, _k: i }));
  // Coluna "Catálogo" (conformidade por item) — só quando o veredito foi carregado. A
  // coluna é INFORMATIVA (o bloqueio, quando o ADM eleva a fundamental, é do nível do DFD);
  // por isso não altera a divisão erro/regular por item (que segue valor/quantidade).
  const dfdTipo = tipoCurtoDfd(dfd.tipo);
  const columns = useMemo<Column<ItemK>[]>(() => {
    if (!conformidade) return COLS;
    const cat: Column<ItemK> = {
      key: "catalogo",
      header: "Catálogo",
      nowrap: true,
      value: (r) => {
        const v = veredictoLinhaCatalogo(conformidade.get(normalizarCodigo(r.codigo)), regras, dfdTipo);
        return v ? (v.falta ? ROTULO_FALTA_CATALOGO[v.falta] : "Conforme") : "";
      },
      render: (r) => {
        const conf = conformidade.get(normalizarCodigo(r.codigo));
        const v = veredictoLinhaCatalogo(conf, regras, dfdTipo);
        if (!v) return <span className="text-muted">—</span>;
        const cor = corVeredictoCatalogo(v.nivel);
        // Detalhe ESPECÍFICO (descrição/unidade/tipo diferentes) no tooltip; o painel do item mostra por extenso.
        const espec = conf ? rotulosDivergencia(conf).join(" · ") : "";
        return <EstadoPonto cor={cor} rotulo={v.falta ? ROTULO_FALTA_CATALOGO[v.falta] : "Conforme"} title={espec || undefined} />;
      },
    };
    const i = COLS.findIndex((c) => c.key === "codigo");
    return [...COLS.slice(0, i + 1), cat, ...COLS.slice(i + 1)];
  }, [conformidade, regras, dfdTipo]);
  // Itens com pendência (falta valor/quantidade) numa tabela SEPARADA na análise; depois de
  // protocolado (`unica`) é UMA tabela só (o filtro da coluna Estado separa).
  const rowsErro = unica ? [] : rows.filter((r) => itemComErro(r));
  const rowsOk = unica ? rows : rows.filter((r) => !itemComErro(r));
  // Texto de apoio da Seção 4 (abaixo da tabela) e as demais seções (sem a 4). As OBRIGATÓRIAS
  // ausentes aparecem como espaço "não preenchida" (aponta a falta e permite preencher com o cadeado).
  const idxApoio = dfd.secoes.findIndex((s) => s.numero === 4);
  const apoio: SecaoExib | null =
    idxApoio >= 0
      ? { chave: `s:${idxApoio}`, idx: idxApoio, numero: 4, titulo: dfd.secoes[idxApoio].titulo, texto: dfd.secoes[idxApoio].texto }
      : null;
  const secoesGerais = useMemo<SecaoExib[]>(() => {
    const obrigPorIdx = new Map<number, (typeof SECOES_OBRIGATORIAS)[number]>();
    const faltando: SecaoExib[] = [];
    for (const o of SECOES_OBRIGATORIAS) {
      const i = acharSecao(dfd.secoes, o.kw);
      if (i >= 0 && dfd.secoes[i].numero !== 4) obrigPorIdx.set(i, o);
      else if (i < 0) faltando.push({ chave: `obr:${o.kw}`, idx: null, numero: o.numero, titulo: o.titulo, texto: "", obrig: o });
    }
    const reais: SecaoExib[] = dfd.secoes
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => s.numero !== 4)
      .map(({ s, i }) => {
        const o = obrigPorIdx.get(i);
        return { chave: o ? `obr:${o.kw}` : `s:${i}`, idx: i, numero: s.numero, titulo: s.titulo, texto: s.texto, obrig: o };
      });
    // Ordem do documento pelo nº da seção (estável: seções de mesmo nº mantêm a ordem lida).
    return [...reais, ...faltando].sort((a, b) => a.numero - b.numero);
  }, [dfd.secoes]);
  const dfdTipoCtx = { dfdTipo: tipoCurtoDfd(dfd.tipo), categoria };
  /** Grava o texto de UMA seção (a real pelo índice; a obrigatória ausente é CRIADA). */
  const gravarSecao = (sx: SecaoExib, texto: string) => {
    if (!onSecoesChange) return;
    if (sx.idx != null) onSecoesChange(dfd.secoes.map((x, i) => (i === sx.idx ? { ...x, texto } : x)));
    else if (sx.obrig) onSecoesChange(setTextoSecao(dfd.secoes, sx.obrig, texto));
  };
  const podeEditarSecao = (sx: SecaoExib) =>
    !!onSecoesChange && (secaoEditavel ? secaoEditavel({ titulo: sx.titulo, obrig: sx.obrig?.chave }) : true);
  /** Pendência de uma seção OBRIGATÓRIA (mesma régua dos erros): rótulo + cor pela importância do ADM. */
  const pendenciaSecao = (sx: SecaoExib): { txt: string; cor: string } | null => {
    if (!sx.obrig) return null;
    const sit = situacaoSecao(dfd.secoes, sx.obrig.kw, dfd.anoPca);
    if (sit === "ok") return null;
    const comp = comportamentoNo(regras, sx.obrig.chave, dfdTipoCtx);
    if (comp === "ignora") return null;
    return { txt: sit === "vazia" ? "não preenchida" : "fora do padrão", cor: comp === "bloqueia" ? "var(--danger)" : "var(--warn)" };
  };
  // Buracos na sequência de ITEM (normal: itens removidos) — só APONTA, não é erro.
  const buracos = buracosSequencia(dfd.itens);
  // DFD de renovação → mostra as referências (contrato/ata/licitação).
  const ehRenovacao = tipoCurtoDfd(dfd.tipo) === "DFD-R";

  return (
    <div className="space-y-5">
      {/* O nº/tipo/planejamento do DFD ficam no cabeçalho FIXO do banner (`DfdCabecalho`),
          não aqui. Nas telas soltas (catálogo) o `DfdCabecalho` é renderizado acima. */}

      {/* Head — mini banners (um por informação): total de itens + valor total.
          O valor total do DFD é a somatória dos valores dos itens (Seção 4); sem valores nos
          itens, fica ZERADO (o sistema não estima nada). */}
      <div className="grid grid-cols-2 gap-3">
        <StatMini label="Total de itens" value={num(dfd.totalItens ?? dfd.itens.length)} />
        <StatMini label="Valor total" value={brl(dfd.valorTotal ?? 0)} />
      </div>

      {/* Seção 1 — Área requisitante (só-leitura). Oculta quando o `DfdConferir` mostra a versão
          EDITÁVEL acima (evita duplicar a seção). */}
      {!ocultarSecao1 && (
        <section className="rounded-card border border-border bg-surface p-5 shadow-ring" data-ancora="anoPca">
          <h3 className="mb-4 text-sm font-bold text-text">1 · Área requisitante da demanda</h3>
          <dl className="grid gap-x-6 gap-y-3.5 sm:grid-cols-2">
            <Campo label="Nº DFD" valor={dfd.numero} />
            <Campo label="Planejamento" valor={dfd.planejamento ?? "—"} />
            <Campo label="Ano do PCA" valor={dfd.anoPca != null ? String(dfd.anoPca) : "—"} />
            <Campo label="Órgão/Entidade" valor={dfd.orgaoEntidade ?? "—"} span />
            <Campo label="Setor Requisitante" valor={dfd.setorRequisitante ?? "—"} span />
            <Campo label="Unidade" valor={rep} span />
            <Campo label="Responsável" valor={dfd.responsavel ?? "—"} />
            <Campo label="Matrícula" valor={dfd.matricula ?? "—"} />
            <Campo label="E-mail" valor={dfd.email ?? "—"} span />
            <Campo label="Telefone" valor={dfd.telefone ?? "—"} />
          </dl>
        </section>
      )}

      {/* Referências da renovação (DFD-R): contrato/ata/licitação */}
      {ehRenovacao && (
        <section className="rounded-card border border-border bg-surface p-5 shadow-ring">
          <h3 className="mb-4 text-sm font-bold text-text">Referências da renovação</h3>
          <dl className="grid gap-x-6 gap-y-3.5 sm:grid-cols-3">
            <Campo label="Nº do contrato" valor={dfd.numeroContrato ?? "—"} />
            <Campo label="Nº da ARP" valor={dfd.numeroAta ?? "—"} />
            <Campo label="Nº da licitação" valor={dfd.numeroLicitacao ?? "—"} />
          </dl>
          {!dfd.numeroContrato && !dfd.numeroAta && !dfd.numeroLicitacao && (
            <p className="mt-3 flex items-center gap-1.5 text-xs font-medium" style={{ color: "var(--warn)" }}>
              <span className="h-2 w-2 rounded-full" style={{ background: "var(--warn)" }} />
              Atenção: DFD-R sem referência de contrato, ARP ou licitação.
            </p>
          )}
        </section>
      )}

      {/* Seção 4 — Itens (os com pendência numa tabela SEPARADA) */}
      <section data-ancora="itens">
        <h3 className="mb-2 text-sm font-bold text-text">
          4 · Itens ({num(dfd.totalItens ?? dfd.itens.length)})
        </h3>
        {rowsErro.length > 0 && (
          <div className="mb-4">
            <h4
              className="mb-1.5 flex items-center gap-1.5 text-[13px] font-bold"
              style={{ color: "var(--danger)" }}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: "var(--danger)" }} />
              Itens com pendência ({num(rowsErro.length)})
            </h4>
            <DataTable
              columns={columns}
              rows={rowsErro}
              getKey={(r) => r._k}
              minWidth={conformidade ? 980 : 860}
              pageSize={10}
              onRowClick={onItemClick ? (r) => onItemClick(r._k) : undefined}
              activeKey={itemAtivo}
              resumo={(l) => {
                const soma = l.reduce((s, it) => s + (it.valorTotal ?? 0), 0);
                return `${l.length} ${l.length === 1 ? "item" : "itens"} · ${brl(soma)}`;
              }}
            />
          </div>
        )}
        {rowsOk.length > 0 && (
          <>
            {rowsErro.length > 0 && (
              <h4 className="mb-1.5 text-[13px] font-bold text-text">Itens regulares ({num(rowsOk.length)})</h4>
            )}
            <DataTable
              columns={columns}
              rows={rowsOk}
              getKey={(r) => r._k}
              minWidth={conformidade ? 980 : 860}
              pageSize={20}
              onRowClick={onItemClick ? (r) => onItemClick(r._k) : undefined}
              activeKey={itemAtivo}
              resumo={(l) => {
                const soma = l.reduce((s, it) => s + (it.valorTotal ?? 0), 0);
                return `${l.length} ${l.length === 1 ? "item" : "itens"} · ${brl(soma)}`;
              }}
            />
          </>
        )}
        {apoio && (apoio.texto || podeEditarSecao(apoio)) && (
          <SecaoCard
            key={apoio.chave}
            titulo="Observações da estimativa"
            texto={apoio.texto}
            editavel={podeEditarSecao(apoio)}
            onChange={(t) => gravarSecao(apoio, t)}
            apoio
          />
        )}
        {buracos.length > 0 && (
          <p className="mt-2 text-xs text-muted">
            Sequência interna com números pulados (normal — itens removidos/fracassados): faltam nº{" "}
            {buracos.slice(0, 40).join(", ")}
            {buracos.length > 40 ? "…" : ""}.
          </p>
        )}
      </section>

      {/* Demais seções (2, 3, 5, 6, 7, 8, 9…) — TODAS editáveis com cadeado por seção (quando o host
          permite); as obrigatórias ausentes aparecem como "não preenchida" (âncora das mensagens). */}
      {secoesGerais.length > 0 && (
        <section className="space-y-3">
          {secoesGerais.map((sx) => (
            <SecaoCard
              key={sx.chave}
              titulo={`${sx.numero} · ${sx.titulo}`}
              texto={sx.texto}
              editavel={podeEditarSecao(sx)}
              onChange={(t) => gravarSecao(sx, t)}
              ancora={sx.obrig ? sx.obrig.chave.replace(/^dfd\./, "") : undefined}
              pendencia={pendenciaSecao(sx)}
            />
          ))}
        </section>
      )}

      {/* Assinaturas Digitais (certificado/sistema, Dropsigner, Adobe) */}
      {dfd.assinaturas.lista.length > 0 && (
        <section className="rounded-card border border-border bg-surface p-5 shadow-ring" data-ancora="assinatura">
          <h3 className="mb-1.5 text-sm font-bold text-text">Assinaturas Digitais</h3>
          <p className="mb-4 text-xs text-muted">
            Quem assina é o responsável que solicitou a consolidação do DFD no PCA. A autenticidade pode ser
            conferida, quando disponível, pelo código verificador (ou no PDF assinado original).
          </p>

          {dfd.assinaturas.solicitante && (
            <div className="mb-4 rounded-card border border-border-2 bg-surface-2 p-4">
              <div className="mb-3 flex items-center gap-2">
                <IconShield className="h-4 w-4" style={{ color: "var(--ok)" }} />
                <span className="text-[13px] font-bold text-text">
                  Responsável pela solicitação
                  {dfd.assinaturas.solicitante.tipo === "temporario" ? " (temporário)" : ""}
                </span>
              </div>
              <dl className="grid gap-x-6 gap-y-3.5 sm:grid-cols-2">
                <Campo label="Nome" valor={dfd.assinaturas.solicitante.nome} span />
                <Campo label="Matrícula" valor={dfd.assinaturas.solicitante.matricula || "—"} />
                <Campo label="Função" valor={dfd.assinaturas.solicitante.funcao || "—"} />
                {dfd.assinaturas.solicitante.tipo === "temporario" && (
                  <Campo
                    label="Período do responsável temporário"
                    valor={`${dataBR(dfd.assinaturas.solicitante.inicio)} — ${dataBR(dfd.assinaturas.solicitante.fim)}`}
                    span
                  />
                )}
                {dfd.assinaturas.solicitante.nomeacao.tipo && (
                  <Campo label="Ato de nomeação" valor={atoTexto(dfd.assinaturas.solicitante.nomeacao)} span />
                )}
              </dl>
              {dfd.assinaturas.solicitante.nomeacao.link && (
                <div className="mt-3">
                  <LinkExterno
                    href={dfd.assinaturas.solicitante.nomeacao.link}
                    icon={<IconFile className="h-4 w-4" />}
                  >
                    Ver {rotuloAto(dfd.assinaturas.solicitante.nomeacao)}
                  </LinkExterno>
                </div>
              )}
            </div>
          )}

          <div className="space-y-3">
            {dfd.assinaturas.lista.map((a, i) => {
              // Certificado/sistema → VERDE (--ok); Dropsigner → AZUL (--info); Adobe → VERMELHO;
              // Foxit (ICP-Brasil lido por OCR) → ÂMBAR (--warn: reconhecida, mas conferir no original).
              const drop = a.fonte === "dropsigner";
              const adobe = a.fonte === "adobe";
              const foxit = a.fonte === "foxit";
              const manual = a.fonte === "manual"; // atestada pela equipe (a leitura não achou a assinatura)
              const cor = adobe ? "var(--danger)" : foxit ? "var(--warn)" : drop || manual ? "var(--info)" : "var(--ok)";
              // Foxit/Adobe/manual não têm código nem link de verificação público (só a aparência é lida).
              const semCodigo = adobe || foxit || manual;
              const validada = dfd.assinaturas.validada?.assinatura === a ? dfd.assinaturas.validada.origem : null;
              const rotulo = manual
                ? "Assinatura atestada pela equipe"
                : adobe
                ? "Assinatura Digital (Adobe)"
                : foxit
                  ? "Assinatura Digital (Foxit / OCR)"
                  : drop
                    ? "Assinatura Dropsigner"
                    : a.fonte === "sistema"
                      ? "Assinatura Eletrônica (Sistema)"
                      : "Assinatura Digital (Certificado Digital)";
              return (
                <div
                  key={`${a.codigo}-${i}`}
                  className="rounded-card border p-4"
                  style={{ borderColor: cor, background: `color-mix(in srgb, ${cor} ${adobe ? 4 : 7}%, var(--surface))` }}
                >
                  <div className="mb-2 flex items-center gap-2 text-xs font-semibold">
                    <span style={{ color: cor }}>{rotulo}</span>
                    {adobe ? (
                      <Badge tone="red" solid>
                        Adobe
                      </Badge>
                    ) : foxit ? (
                      <Badge tone="amber" solid>
                        Foxit
                      </Badge>
                    ) : manual ? null : (
                      <Badge tone={drop ? "blue" : "emerald"}>{drop ? "Dropsigner" : "Certificado"}</Badge>
                    )}
                    {a.ocr && !foxit && <Badge tone="amber">OCR</Badge>}
                    {validada && (
                      <Badge tone={validada === "auto" ? "emerald" : "blue"} solid>
                        {validada === "auto" ? "Validada (auto)" : "Validada (equipe)"}
                      </Badge>
                    )}
                  </div>
                  <dl className="grid gap-x-6 gap-y-3.5 sm:grid-cols-2">
                    <Campo label="Assinante" valor={a.nome || "—"} span />
                    <Campo label="CPF" valor={a.eCpf || "—"} />
                    {!drop && !semCodigo && <Campo label="Usuário" valor={a.usuario || "—"} />}
                    <Campo label="Data/hora da assinatura" valor={a.data || "—"} />
                    {!semCodigo && <Campo label="Código verificador" valor={a.codigo || "—"} mono />}
                  </dl>
                  <div className="mt-3">
                    {/* Adobe/Foxit não têm código/URL público de verificação (só a aparência é lida) →
                        sem botão de verificação; a validação é feita no PDF assinado original. */}
                    {/* Dropsigner lida por OCR sem código legível → sem link (não há URL a verificar). */}
                    {!semCodigo && !(drop && !a.url) && (
                      <LinkExterno
                        href={drop && a.url ? a.url : URL_VERIFICACAO}
                        icon={<IconShield className="h-4 w-4" style={{ color: cor }} />}
                      >
                        Verificar autenticidade{drop ? " (Dropsigner)" : ""}
                      </LinkExterno>
                    )}
                    <p className={`text-xs text-muted ${semCodigo || (drop && !a.url) ? "" : "mt-1.5"}`}>
                      {manual ? (
                        <>
                          A leitura automática não encontrou a assinatura; a equipe conferiu o PDF e atestou o
                          responsável.
                        </>
                      ) : adobe ? (
                        <>
                          Assinatura digital embutida no PDF (Adobe). A autenticidade deve ser conferida no{" "}
                          <strong>PDF assinado original</strong>, em um leitor/validador de sua confiança.
                        </>
                      ) : foxit ? (
                        <>
                          Assinatura ICP-Brasil (Foxit) lida por <strong>OCR</strong> do carimbo do PDF. Confirme o
                          assinante e confira a autenticidade no <strong>PDF assinado original</strong>.
                        </>
                      ) : drop ? (
                        <>
                          Validação oficial no Dropsigner (Lacuna) pelo código{" "}
                          <span className="font-mono">{a.codigo || "—"}</span>.
                          {a.ocr && (
                            <>
                              {" "}
                              Lida por <strong>OCR</strong> do carimbo achatado — confirme o assinante no PDF original.
                            </>
                          )}
                        </>
                      ) : (
                        <>
                          Confira pelo código <span className="font-mono">{a.codigo || "—"}</span> no endereço acima.
                        </>
                      )}
                    </p>
                    {a.validacao?.por === "equipe" && (a.validacao.usuario || a.validacao.em) && (
                      <p className="mt-1 text-xs text-muted">
                        Validada pela equipe{a.validacao.usuario ? ` por ${a.validacao.usuario}` : ""}
                        {a.validacao.em ? ` em ${dataBR(a.validacao.em)}` : ""}.
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

/**
 * Card de UMA seção do DFD: título + texto só-leitura; com `editavel`, um CADEADO destrava a edição
 * direta do texto (textarea que cresce com o conteúdo — mostra o texto inteiro). A pendência de uma
 * seção obrigatória (não preenchida / fora do padrão) aparece no título, na cor da importância.
 */
function SecaoCard({
  titulo,
  texto,
  editavel,
  onChange,
  ancora,
  pendencia = null,
  apoio = false,
}: {
  titulo: string;
  texto: string;
  editavel: boolean;
  onChange: (texto: string) => void;
  ancora?: string;
  pendencia?: { txt: string; cor: string } | null;
  /** Texto de apoio da Seção 4 (abaixo da tabela de itens) — estilo discreto. */
  apoio?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const editando = editavel && aberto;
  return (
    <div
      className={apoio ? "mt-3 rounded-card border border-border-2 bg-surface-2 p-4" : "rounded-card border border-border bg-surface p-5 shadow-ring"}
      data-ancora={ancora}
    >
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <h3 className={apoio ? "text-xs font-semibold text-muted" : "text-sm font-bold text-text"}>
          {titulo}
          {pendencia && (
            <span className="ml-2 text-[10px] font-semibold uppercase" style={{ color: pendencia.cor }}>
              {pendencia.txt}
            </span>
          )}
        </h3>
        {editavel && <CadeadoBotao rotulo={titulo} aberto={aberto} onClick={() => setAberto((v) => !v)} />}
      </div>
      {editando ? (
        <AutoTextarea value={texto} onChange={onChange} />
      ) : texto ? (
        <p className="whitespace-pre-line break-words text-[13.5px] leading-relaxed text-text-2">{texto}</p>
      ) : (
        <p className="text-[13px] text-faint">{editavel ? "Não preenchida — destrave para preencher." : "Não preenchida."}</p>
      )}
    </div>
  );
}

function Campo({
  label,
  valor,
  span,
  mono,
}: {
  label: string;
  valor: string;
  span?: boolean;
  mono?: boolean;
}) {
  return (
    <div className={span ? "sm:col-span-2" : ""}>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`mt-0.5 break-words font-semibold leading-snug text-text ${mono ? "font-mono" : ""}`}>
        {valor}
      </dd>
    </div>
  );
}
