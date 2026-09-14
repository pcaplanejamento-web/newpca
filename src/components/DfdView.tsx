"use client";

import { brl, dataBR, num } from "@/lib/format";
import { type Assinatura, buracosSequencia } from "@/lib/parse-dfd-comum";
import { type Nomeacao, type Solicitante, TIPOS_ATO } from "@/lib/reparticao-responsaveis";
import { type Column, DataTable } from "./DataTable";
import { IconFile, IconShield } from "./icons";
import { LinkExterno } from "./LinkExterno";

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

const COLS: Column<ItemK>[] = [
  { key: "item", header: "Item", align: "right", render: (r) => r.item ?? "—" },
  {
    key: "codigo",
    header: "Código",
    render: (r) => <span className="font-mono text-[12px]">{r.codigo ?? "—"}</span>,
  },
  {
    key: "descricao",
    header: "Descrição",
    minWidth: 300,
    render: (r) => <span className="line-clamp-2">{r.descricao ?? "—"}</span>,
  },
  { key: "unidade", header: "Unidade", render: (r) => r.unidade ?? "—" },
  {
    key: "quantidade",
    header: "Qtd.",
    align: "right",
    render: (r) => (r.quantidade != null ? num(r.quantidade) : "—"),
  },
  {
    key: "vunit",
    header: "Vlr. unit.",
    align: "right",
    render: (r) => (r.valorUnitario != null ? brl(r.valorUnitario) : "—"),
  },
  {
    key: "vtot",
    header: "Vlr. total",
    align: "right",
    render: (r) =>
      r.valorTotal != null ? <span className="font-semibold">{brl(r.valorTotal)}</span> : "—",
  },
];

export function DfdView({ dfd }: { dfd: DfdVisual }) {
  const rep =
    dfd.reparticaoCodigo || dfd.reparticaoNome
      ? `${dfd.reparticaoCodigo ?? ""}${dfd.reparticaoNome ? ` · ${dfd.reparticaoNome}` : ""}`
      : "Sem repartição";
  const rows: ItemK[] = dfd.itens.map((it, i) => ({ ...it, _k: i }));
  // Texto de apoio da Seção 4 (abaixo da tabela) e as demais seções (sem a 4).
  const apoioItens = dfd.secoes.find((s) => s.numero === 4)?.texto ?? "";
  const secoesGerais = dfd.secoes.filter((s) => s.numero !== 4);
  // Buracos na sequência de ITEM (normal: itens removidos) — só APONTA, não é erro.
  const buracos = buracosSequencia(dfd.itens);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-text">DFD {dfd.numero}</h2>
        <p className="mt-0.5 text-sm text-muted">
          {[dfd.tipo, dfd.objeto].filter(Boolean).join(" · ") ||
            "Documento de Formalização da Demanda"}
        </p>
      </div>

      {/* Seção 1 — Área requisitante */}
      <section className="rounded-card border border-border bg-surface p-5 shadow-ring">
        <h3 className="mb-4 text-sm font-bold text-text">1 · Área requisitante da demanda</h3>
        <dl className="grid gap-x-6 gap-y-3.5 sm:grid-cols-2">
          <Campo label="Nº DFD" valor={dfd.numero} />
          <Campo label="Planejamento" valor={dfd.planejamento ?? "—"} />
          <Campo label="Órgão/Entidade" valor={dfd.orgaoEntidade ?? "—"} span />
          <Campo label="Setor Requisitante" valor={dfd.setorRequisitante ?? "—"} span />
          <Campo label="Repartição" valor={rep} span />
          <Campo label="Responsável" valor={dfd.responsavel ?? "—"} />
          <Campo label="Matrícula" valor={dfd.matricula ?? "—"} />
          <Campo label="E-mail" valor={dfd.email ?? "—"} span />
          <Campo label="Telefone" valor={dfd.telefone ?? "—"} />
        </dl>
      </section>

      {/* Valores */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-card border border-border bg-surface p-4 shadow-ring">
          <div className="text-xs text-muted">Valor estimado (nota)</div>
          <div className="text-lg font-bold text-text">
            {dfd.valorEstimado != null ? brl(dfd.valorEstimado) : "—"}
          </div>
        </div>
        <div className="rounded-card border border-border bg-surface p-4 shadow-ring">
          <div className="text-xs text-muted">Valor total (tabela)</div>
          <div className="text-lg font-bold text-text">
            {dfd.valorTotal != null ? brl(dfd.valorTotal) : "—"}
          </div>
        </div>
      </div>

      {/* Seção 4 — Itens */}
      <section>
        <h3 className="mb-2 text-sm font-bold text-text">
          4 · Itens ({num(dfd.totalItens ?? dfd.itens.length)})
        </h3>
        <DataTable
          columns={COLS}
          rows={rows}
          getKey={(r) => r._k}
          minWidth={820}
          pageSize={20}
          footer={`${dfd.itens.length} ${dfd.itens.length === 1 ? "item" : "itens"}`}
        />
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
