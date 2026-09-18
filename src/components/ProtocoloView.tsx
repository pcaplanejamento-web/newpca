"use client";

import type { ReactNode } from "react";
import { classificarAssunto, nivelDe, type RegrasAvaliacao, regrasPadrao } from "@/lib/avaliacao-core";
import { dfdRSemReferencia, FALTA_REFERENCIA_RENOVACAO, type GrupoAssinatura, resumoEstado } from "@/lib/dfd-tratamento";
import { brl, dataBR, num } from "@/lib/format";
import { valoresBatem } from "@/lib/normalize";
import { tipoCurtoDfd } from "@/lib/parse-dfd-comum";
import { CampoNumero, CampoTexto, useCadeados } from "./CampoCadeado";
import { Callout } from "./Callout";
import { TextField } from "./Field";
import { inputCls, labelCls } from "./formStyles";
import { IconAlert } from "./icons";
import { type LinhaDfd, PlanilhaDfds } from "./PlanilhaDfds";
import { StatMini } from "./StatMini";

/** Campos da CAPA do protocolo (a MESMA grade na importação e no gravado).
 * - **modo `"criar"`** (protocolo manual): campos de texto viram inputs simples.
 * - **modo `"cadeado"`** (importação de PDF / gravado destravado): os campos de **CONTEÚDO**
 *   (interessado/assunto/observação/CPF-CNPJ/valor/local) têm **cadeado por campo** (mesma
 *   lógica dos itens); os **IDENTIFICADORES** (número/Id/data) ficam SEMPRE só-leitura.
 * - **modo `"leitura"`** (gravado travado / catálogo): tudo só-leitura.
 * O controle de repartição/PCA entra por `children`. */
export type CampoCapa = "numero" | "data" | "documento" | "interessado" | "assunto" | "observacao" | "localReparticao";
/** Campos de CONTEÚDO (editáveis com cadeado); os identificadores nunca entram aqui. */
export type CampoCapaEditavel = "documento" | "interessado" | "assunto" | "observacao" | "valorCapa" | "localReparticao";
export type ModoCapa = "leitura" | "criar" | "cadeado";
const naoOp = () => {};
export function CapaCampos({
  numero,
  idExterno,
  data,
  documento,
  interessado,
  assunto,
  observacao,
  valorCapa,
  localReparticao,
  modo = "leitura",
  onChange,
  onChangeValorCapa,
  onEditandoChange,
  children,
}: {
  numero: string;
  idExterno: string | null;
  data: string;
  documento: string;
  interessado: string;
  assunto: string;
  observacao: string;
  valorCapa: number | null;
  localReparticao: string | null;
  modo?: ModoCapa;
  onChange?: (campo: CampoCapa, valor: string) => void;
  onChangeValorCapa?: (valor: number | null) => void;
  onEditandoChange?: (editando: boolean) => void;
  children?: ReactNode;
}) {
  const { abertos, alternar } = useCadeados<CampoCapaEditavel>(onEditandoChange);
  const podeEditar = modo === "cadeado";
  const props = (campo: CampoCapaEditavel) => ({
    editavel: podeEditar,
    aberto: abertos.has(campo),
    bloqueado: false,
    onLock: () => alternar(campo),
  });

  // Modo CRIAR (protocolo manual): campos de texto viram inputs simples (como antes).
  if (modo === "criar") {
    const set = (c: CampoCapa) => (e: { target: { value: string } }) => onChange?.(c, e.target.value);
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="Número do processo" value={numero} onChange={set("numero")} placeholder="Ex.: 144756/2026" />
        <TextField label="Id do processo" value={idExterno ?? ""} disabled readOnly placeholder="—" />
        <TextField label="Data/Hora" value={data} onChange={set("data")} placeholder="—" />
        <TextField label="CPF/CNPJ" value={documento} onChange={set("documento")} placeholder="—" />
        <div className="sm:col-span-2">
          <TextField label="Interessado" value={interessado} onChange={set("interessado")} />
        </div>
        <TextField label="Assunto" value={assunto} onChange={set("assunto")} />
        <TextField label="Observação" value={observacao} onChange={set("observacao")} />
        <TextField label="Valor (capa)" value={valorCapa != null ? brl(valorCapa) : "—"} disabled readOnly />
        <TextField label="Local (capa)" value={localReparticao ?? ""} disabled readOnly placeholder="—" />
        {children}
      </div>
    );
  }

  // Modo LEITURA / CADEADO: só-leitura com cadeado por campo nos de CONTEÚDO. Os
  // IDENTIFICADORES (número/Id/data) ficam sempre travados (só-leitura, sem cadeado).
  return (
    <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      <CampoTexto label="Número do processo" valor={numero} editavel={false} aberto={false} bloqueado onLock={naoOp} onChange={naoOp} />
      <CampoTexto label="Id do processo" valor={idExterno ?? ""} mono editavel={false} aberto={false} bloqueado onLock={naoOp} onChange={naoOp} />
      <CampoTexto label="Data/Hora" valor={data} editavel={false} aberto={false} bloqueado onLock={naoOp} onChange={naoOp} />
      <CampoTexto label="CPF/CNPJ" valor={documento} {...props("documento")} onChange={(v) => onChange?.("documento", v)} />
      <CampoTexto label="Interessado" valor={interessado} span multi {...props("interessado")} onChange={(v) => onChange?.("interessado", v)} />
      <CampoTexto label="Assunto" valor={assunto} {...props("assunto")} onChange={(v) => onChange?.("assunto", v)} />
      <CampoTexto label="Observação" valor={observacao} multi {...props("observacao")} onChange={(v) => onChange?.("observacao", v)} />
      <CampoNumero label="Valor (capa)" valor={valorCapa} moeda {...props("valorCapa")} onChange={(v) => onChangeValorCapa?.(v)} />
      <CampoTexto label="Local (capa)" valor={localReparticao ?? ""} {...props("localReparticao")} onChange={(v) => onChange?.("localReparticao", v)} />
      {children}
    </div>
  );
}

/**
 * Campos editáveis do protocolo (banner destravado). Os **IDENTIFICADORES** da capa
 * (número/Id/data) são IMUTÁVEIS; os campos de **CONTEÚDO** (interessado/assunto/
 * observação/CPF-CNPJ/valor/local) e a **repartição** (roteamento) são editáveis
 * com cadeado por campo.
 */
export type ProtocoloEdicaoValores = {
  reparticaoId: number | null;
  interessado?: string | null;
  assunto?: string | null;
  observacao?: string | null;
  documento?: string | null;
  valorCapa?: number | null;
  localReparticao?: string | null;
};
export type ProtocoloEdicao = {
  trancado: boolean;
  reparticoes: { id: number; codigo: string; nome: string }[];
  valores: ProtocoloEdicaoValores;
  onChange: (patch: Partial<ProtocoloEdicaoValores>) => void;
};

/**
 * Visão COMPLETA (read-only) do protocolo — metadados da capa + a lista dos DFDs
 * que ele reúne. Componente presentacional (forma estrutural satisfeita por
 * `ProtocoloDetalhe`); o "Ver" de cada DFD é delegado via `onVerDfd` (opcional,
 * para catalogar com mock sem buscar dados).
 */
export type ProtocoloVisualDfd = {
  id: number;
  numero: string;
  planejamento: string | null;
  tipo: string | null;
  setorRequisitante: string | null;
  reparticaoCodigo: string | null;
  totalItens: number | null;
  valorTotal: number | null;
  valorEstimado: number | null;
  // Referências de renovação (DFD-R) — para sinalizar ATENÇÃO na lista.
  numeroContrato?: string | null;
  numeroAta?: string | null;
  numeroLicitacao?: string | null;
  // Tipos de assinatura (Centi/Dropsigner/Adobe) — coluna "Assinatura" (vem do DfdResumo).
  assinaturaGrupos?: GrupoAssinatura[];
};

export type ProtocoloVisual = {
  numero: string;
  idExterno: string | null;
  anoPca: number | null;
  data: string | null;
  interessado: string | null;
  documento: string | null;
  assunto: string | null;
  observacao: string | null;
  localReparticao: string | null;
  valorCapa: number | null;
  reparticaoCodigo: string | null;
  reparticaoNome: string | null;
  criadoEm?: string | null;
  totalDfds: number;
  totalItens: number;
  valorTotal: number;
  dfds: ProtocoloVisualDfd[];
};

const valorDfd = (d: ProtocoloVisualDfd) => d.valorTotal ?? d.valorEstimado ?? 0;

/**
 * Cabeçalho FIXO do banner do protocolo (topo do `Modal`, não o corpo): nº do processo +
 * as infos mais importantes ao lado — **Id do protocolo** e **Assunto** (trunca no mobile).
 */
export function ProtocoloCabecalho({
  numero,
  idExterno,
  assunto,
}: {
  numero: string;
  idExterno: string | null;
  assunto: string | null;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 overflow-hidden">
      <span className="shrink-0 text-base font-bold text-text">Protocolo {numero}</span>
      {idExterno && (
        <span className="shrink-0 rounded-control bg-accent-soft px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-accent">
          Id {idExterno}
        </span>
      )}
      {assunto && <span className="truncate text-[12.5px] text-muted">{assunto}</span>}
    </div>
  );
}

export function ProtocoloView({
  protocolo,
  onVerDfd,
  dfdAtivo = null,
  edicao,
  regras = regrasPadrao(),
}: {
  protocolo: ProtocoloVisual;
  onVerDfd?: (id: number) => void;
  /** DFD ATIVO (banner aberto ao lado) — linha destacada na tabela (mestre-detalhe). */
  dfdAtivo?: number | null;
  edicao?: ProtocoloEdicao;
  regras?: RegrasAvaliacao;
}) {
  const editando = !!edicao && !edicao.trancado;
  // Destravado → a capa mostra o RASCUNHO (`edicao.valores`); senão, o gravado.
  const capaVals = editando && edicao ? edicao.valores : null;
  const rep =
    protocolo.reparticaoCodigo || protocolo.reparticaoNome
      ? `${protocolo.reparticaoCodigo ?? ""}${protocolo.reparticaoNome ? ` · ${protocolo.reparticaoNome}` : ""}`
      : "Sem unidade";
  const categoria = classificarAssunto(protocolo.assunto);
  // Valor da capa × somatória dos valores dos DFDs (o valor de cada DFD é a soma dos
  // seus itens). A capa é imutável; aqui a divergência é só APONTADA (a conciliação
  // acontece uma única vez, na importação, antes de gravar). "ignorar" desliga a nota.
  const capaDivergente =
    nivelDe(regras, "protocolo.valorCapa", { categoria }) !== "ignorar" &&
    protocolo.valorCapa != null &&
    !valoresBatem(protocolo.valorCapa, protocolo.valorTotal);

  // Planilha ÚNICA de DFDs (a mesma da importação e da aba DFDs). Um DFD gravado já
  // passou pela validação → estado "regular" (sem tabela de erro).
  const linhasDfd: LinhaDfd[] = protocolo.dfds.map((d) => ({
    key: d.id,
    numero: d.numero,
    planejamento: d.planejamento,
    sigla: d.reparticaoCodigo ?? "—",
    tipo: tipoCurtoDfd(d.tipo),
    itens: d.totalItens,
    valor: valorDfd(d),
    // DFD-R sem referência (contrato/ata/licitação) → ATENÇÃO (nível do ADM; "ignorar" oculta).
    estado:
      dfdRSemReferencia(d) &&
      nivelDe(regras, "dfd.referenciaRenovacao", { dfdTipo: tipoCurtoDfd(d.tipo), categoria }) !== "ignorar"
        ? "atencao"
        : "regular",
    // Gravados já validados → único apontamento na lista é o DFD-R sem referência (atenção).
    resumo: resumoEstado(
      dfdRSemReferencia(d) && nivelDe(regras, "dfd.referenciaRenovacao", { dfdTipo: tipoCurtoDfd(d.tipo), categoria }) !== "ignorar"
        ? [{ status: "atencao", chave: "dfd.referenciaRenovacao", texto: FALTA_REFERENCIA_RENOVACAO }]
        : [],
    ),
    assinaturas: d.assinaturaGrupos ?? [],
  }));

  return (
    <div className="space-y-5">
      {/* O nº/Id/Assunto do processo ficam no cabeçalho FIXO do banner (`ProtocoloCabecalho`),
          não aqui. Nas telas soltas (catálogo) o `ProtocoloCabecalho` é renderizado acima. */}

      {/* Head — mini banners (um por informação): total de DFDs + somatória dos valores.
          2-up no mobile (a somatória em R$ cabe inteira) → 3-up a partir de sm. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatMini label="Total de DFDs" value={num(protocolo.totalDfds)} />
        <StatMini label="Total de itens" value={num(protocolo.totalItens)} />
        <StatMini
          label="Somatória dos DFDs"
          value={brl(protocolo.valorTotal)}
          tone={capaDivergente ? "warn" : "default"}
          className="col-span-2 sm:col-span-1"
        />
      </div>

      {capaDivergente && (
        <Callout kind="warn" icon={<IconAlert className="h-5 w-5" />}>
          <p className="font-semibold">O valor da capa diverge da somatória dos DFDs</p>
          <p className="mt-1 opacity-90">
            Valor da capa: {brl(protocolo.valorCapa)} · Somatória dos DFDs: {brl(protocolo.valorTotal)}.
          </p>
        </Callout>
      )}

      {/* Dados da capa — MESMA grade (`CapaCampos`) da importação. Os IDENTIFICADORES
          (número/Id/data) ficam sempre travados; os campos de CONTEÚDO ganham cadeado por
          campo quando destravado. Quando editando, mostra o RASCUNHO (`edicao.valores`). */}
      <section className="rounded-card border border-border bg-surface p-5 shadow-ring">
        <h3 className="mb-4 text-sm font-bold text-text">Dados do processo</h3>
        <CapaCampos
          numero={protocolo.numero}
          idExterno={protocolo.idExterno}
          data={protocolo.data ?? ""}
          documento={(capaVals ? capaVals.documento : protocolo.documento) ?? ""}
          interessado={(capaVals ? capaVals.interessado : protocolo.interessado) ?? ""}
          assunto={(capaVals ? capaVals.assunto : protocolo.assunto) ?? ""}
          observacao={(capaVals ? capaVals.observacao : protocolo.observacao) ?? ""}
          valorCapa={capaVals ? (capaVals.valorCapa ?? null) : protocolo.valorCapa}
          localReparticao={capaVals ? (capaVals.localReparticao ?? null) : protocolo.localReparticao}
          modo={editando ? "cadeado" : "leitura"}
          onChange={
            editando && edicao
              ? (campo, v) => edicao.onChange({ [campo]: v || null } as Partial<ProtocoloEdicaoValores>)
              : undefined
          }
          onChangeValorCapa={editando && edicao ? (v) => edicao.onChange({ valorCapa: v }) : undefined}
        >
          <div>
            <TextField label="PCA (ano)" value={protocolo.anoPca != null ? String(protocolo.anoPca) : "—"} disabled readOnly />
          </div>
          {editando && edicao ? (
            <div className="sm:col-span-2">
              <label className={labelCls} htmlFor="proto-edit-rep">
                Unidade
              </label>
              <select
                id="proto-edit-rep"
                className={inputCls}
                value={edicao.valores.reparticaoId ?? ""}
                onChange={(e) => edicao.onChange({ reparticaoId: e.target.value ? Number(e.target.value) : null })}
              >
                <option value="">— Selecione a unidade —</option>
                {edicao.reparticoes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.codigo} · {r.nome}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="sm:col-span-2">
              <TextField label="Unidade" value={rep} disabled readOnly />
            </div>
          )}
        </CapaCampos>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-bold text-text">DFDs do protocolo ({protocolo.dfds.length})</h3>
        {protocolo.dfds.length === 0 ? (
          <p className="rounded-card border border-border bg-surface p-6 text-center text-sm text-muted">
            Nenhum DFD vinculado a este protocolo ainda.
          </p>
        ) : (
          <PlanilhaDfds linhas={linhasDfd} onRowClick={onVerDfd} ativa={dfdAtivo} />
        )}
      </section>

      {protocolo.criadoEm && (
        <p className="text-[11px] text-faint">Protocolado em {dataBR(protocolo.criadoEm)}.</p>
      )}
    </div>
  );
}


