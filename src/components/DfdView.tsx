"use client";

import {
  ESTADO_ITEM_ROTULO,
  estadoItem,
  estadoItemCor,
  itemComErro,
} from "@/lib/dfd-tratamento";
import { brl, dataBR, num } from "@/lib/format";
import { valoresBatem } from "@/lib/normalize";
import { type Assinatura, buracosSequencia, tipoCurtoDfd } from "@/lib/parse-dfd-comum";
import { type Nomeacao, type Solicitante, TIPOS_ATO } from "@/lib/reparticao-responsaveis";
import { type Column, DataTable } from "./DataTable";
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
  valorEstimado: number | null;
  valorTotal: number | null;
  reparticaoCodigo: string | null;
  reparticaoNome: string | null;
  totalItens: number | null;
  itens: DfdVisualItem[];
  secoes: { numero: number; titulo: string; texto: string }[];
  assinaturas: { lista: Assinatura[]; solicitante: Solicitante | null };
};

type ItemK = DfdVisualItem & { _k: number };

// Colunas da tabela de itens (Seção 4) — com ESTADO por item e filtro/ordenação em
// todas (via `value`), igual às demais tabelas do sistema.
const COLS: Column<ItemK>[] = [
  {
    key: "estado",
    header: "Estado",
    value: (r) => ESTADO_ITEM_ROTULO[estadoItem(r)],
    render: (r) => {
      const e = estadoItem(r);
      return (
        <span className="inline-flex items-center gap-1.5 text-[12px] font-medium" style={{ color: estadoItemCor(e) }}>
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: estadoItemCor(e) }} />
          {ESTADO_ITEM_ROTULO[e]}
        </span>
      );
    },
  },
  { key: "item", header: "Item", align: "right", value: (r) => String(r.item ?? ""), render: (r) => r.item ?? "—" },
  {
    key: "codigo",
    header: "Código",
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
  { key: "unidade", header: "Unidade", value: (r) => r.unidade ?? "", render: (r) => r.unidade ?? "—" },
  {
    key: "quantidade",
    header: "Qtd.",
    align: "right",
    value: (r) => String(r.quantidade ?? ""),
    render: (r) => (r.quantidade != null ? num(r.quantidade) : "—"),
  },
  {
    key: "vunit",
    header: "Vlr. unit.",
    align: "right",
    value: (r) => String(r.valorUnitario ?? ""),
    render: (r) => (r.valorUnitario != null ? brl(r.valorUnitario) : "—"),
  },
  {
    key: "vtot",
    header: "Vlr. total",
    align: "right",
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

export function DfdView({ dfd }: { dfd: DfdVisual }) {
  const rep =
    dfd.reparticaoCodigo || dfd.reparticaoNome
      ? `${dfd.reparticaoCodigo ?? ""}${dfd.reparticaoNome ? ` · ${dfd.reparticaoNome}` : ""}`
      : "Sem repartição";
  const rows: ItemK[] = dfd.itens.map((it, i) => ({ ...it, _k: i }));
  // Itens com pendência (falta valor/quantidade) numa tabela SEPARADA (como a de DFDs
  // no protocolo); os regulares na tabela principal.
  const rowsErro = rows.filter((r) => itemComErro(r));
  const rowsOk = rows.filter((r) => !itemComErro(r));
  // Texto de apoio da Seção 4 (abaixo da tabela) e as demais seções (sem a 4).
  const apoioItens = dfd.secoes.find((s) => s.numero === 4)?.texto ?? "";
  const secoesGerais = dfd.secoes.filter((s) => s.numero !== 4);
  // Buracos na sequência de ITEM (normal: itens removidos) — só APONTA, não é erro.
  const buracos = buracosSequencia(dfd.itens);
  // DFD de renovação → mostra as referências (contrato/ata/licitação).
  const ehRenovacao = tipoCurtoDfd(dfd.tipo) === "DFD-R";

  return (
    <div className="space-y-5">
      {/* O nº/tipo/planejamento do DFD ficam no cabeçalho FIXO do banner (`DfdCabecalho`),
          não aqui. Nas telas soltas (catálogo) o `DfdCabecalho` é renderizado acima. */}

      {/* Head — mini banners (um por informação): total de itens + valor total.
          O valor total do DFD é a somatória dos valores dos itens (Seção 4). */}
      <div className="grid grid-cols-2 gap-3">
        <StatMini label="Total de itens" value={num(dfd.totalItens ?? dfd.itens.length)} />
        <StatMini
          label="Valor total"
          value={dfd.valorTotal != null ? brl(dfd.valorTotal) : "—"}
          hint={
            dfd.valorEstimado != null && !valoresBatem(dfd.valorEstimado, dfd.valorTotal)
              ? `Estimado (nota): ${brl(dfd.valorEstimado)}`
              : undefined
          }
        />
      </div>

      {/* Seção 1 — Área requisitante */}
      <section className="rounded-card border border-border bg-surface p-5 shadow-ring">
        <h3 className="mb-4 text-sm font-bold text-text">1 · Área requisitante da demanda</h3>
        <dl className="grid gap-x-6 gap-y-3.5 sm:grid-cols-2">
          <Campo label="Nº DFD" valor={dfd.numero} />
          <Campo label="Planejamento" valor={dfd.planejamento ?? "—"} />
          <Campo label="Ano do PCA" valor={dfd.anoPca != null ? String(dfd.anoPca) : "—"} />
          <Campo label="Órgão/Entidade" valor={dfd.orgaoEntidade ?? "—"} span />
          <Campo label="Setor Requisitante" valor={dfd.setorRequisitante ?? "—"} span />
          <Campo label="Repartição" valor={rep} span />
          <Campo label="Responsável" valor={dfd.responsavel ?? "—"} />
          <Campo label="Matrícula" valor={dfd.matricula ?? "—"} />
          <Campo label="E-mail" valor={dfd.email ?? "—"} span />
          <Campo label="Telefone" valor={dfd.telefone ?? "—"} />
        </dl>
      </section>

      {/* Referências da renovação (DFD-R): contrato/ata/licitação */}
      {ehRenovacao && (
        <section className="rounded-card border border-border bg-surface p-5 shadow-ring">
          <h3 className="mb-4 text-sm font-bold text-text">Referências da renovação</h3>
          <dl className="grid gap-x-6 gap-y-3.5 sm:grid-cols-3">
            <Campo label="Nº do contrato" valor={dfd.numeroContrato ?? "—"} />
            <Campo label="Nº da ata (registro de preços)" valor={dfd.numeroAta ?? "—"} />
            <Campo label="Nº da licitação" valor={dfd.numeroLicitacao ?? "—"} />
          </dl>
        </section>
      )}

      {/* Seção 4 — Itens (os com pendência numa tabela SEPARADA) */}
      <section>
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
              columns={COLS}
              rows={rowsErro}
              getKey={(r) => r._k}
              minWidth={860}
              pageSize={10}
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
              columns={COLS}
              rows={rowsOk}
              getKey={(r) => r._k}
              minWidth={860}
              pageSize={20}
              resumo={(l) => {
                const soma = l.reduce((s, it) => s + (it.valorTotal ?? 0), 0);
                return `${l.length} ${l.length === 1 ? "item" : "itens"} · ${brl(soma)}`;
              }}
            />
          </>
        )}
        {apoioItens && (
          <div className="mt-3 rounded-card border border-border-2 bg-surface-2 p-4">
            <div className="mb-1 text-xs font-semibold text-muted">Observações da estimativa</div>
            <p className="whitespace-pre-line break-words text-[13.5px] leading-relaxed text-text-2">
              {apoioItens}
            </p>
          </div>
        )}
        {buracos.length > 0 && (
          <p className="mt-2 text-xs text-muted">
            Sequência interna com números pulados (normal — itens removidos/fracassados): faltam nº{" "}
            {buracos.slice(0, 40).join(", ")}
            {buracos.length > 40 ? "…" : ""}.
          </p>
        )}
      </section>

      {/* Demais seções (2, 3, 5, 6, 7, 8, 9…) */}
      {secoesGerais.length > 0 && (
        <section className="space-y-3">
          {secoesGerais.map((s) => (
            <div key={s.numero} className="rounded-card border border-border bg-surface p-5 shadow-ring">
              <h3 className="mb-1.5 text-sm font-bold text-text">
                {s.numero} · {s.titulo}
              </h3>
              <p className="whitespace-pre-line break-words text-[13.5px] leading-relaxed text-text-2">
                {s.texto}
              </p>
            </div>
          ))}
        </section>
      )}

      {/* Assinaturas Digitais (Certificado Digital) */}
      {dfd.assinaturas.lista.length > 0 && (
        <section className="rounded-card border border-border bg-surface p-5 shadow-ring">
          <h3 className="mb-1.5 text-sm font-bold text-text">Assinaturas Digitais (Certificado Digital)</h3>
          <p className="mb-4 text-xs text-muted">
            Quem assina é o responsável que solicitou a consolidação do DFD no PCA. A autenticidade pode ser
            conferida pelo código verificador no site oficial da Prefeitura.
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
            {dfd.assinaturas.lista.map((a, i) => (
              <div key={`${a.codigo}-${i}`} className="rounded-card border border-border-2 p-4">
                <div className="mb-2 text-xs font-semibold text-muted">
                  {a.fonte === "sistema"
                    ? "Assinatura Eletrônica (Sistema)"
                    : "Assinatura Digital (Certificado Digital)"}
                </div>
                <dl className="grid gap-x-6 gap-y-3.5 sm:grid-cols-2">
                  <Campo label="Assinante" valor={a.nome || "—"} span />
                  <Campo label="CPF" valor={a.eCpf || "—"} />
                  <Campo label="Usuário" valor={a.usuario || "—"} />
                  <Campo label="Data/hora da assinatura" valor={a.data || "—"} />
                  <Campo label="Código verificador" valor={a.codigo || "—"} mono />
                </dl>
                <div className="mt-3">
                  <LinkExterno href={URL_VERIFICACAO} icon={<IconShield className="h-4 w-4" />}>
                    Verificar autenticidade
                  </LinkExterno>
                  <p className="mt-1.5 text-xs text-muted">
                    Confira pelo código <span className="font-mono">{a.codigo || "—"}</span> no endereço acima.
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
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
