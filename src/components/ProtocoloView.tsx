"use client";

import type { ReactNode } from "react";
import { type RegrasAvaliacao, regrasPadrao } from "@/lib/avaliacao-core";
import type { ConciliacaoCapa } from "@/lib/dfd-tratamento";
import { brl, num } from "@/lib/format";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { CampoNumero, CampoSelecao, CampoTexto, useCadeados } from "./CampoCadeado";
import { Callout } from "./Callout";
import { TextField } from "./Field";
import { inputCls, labelCls, selectCls } from "./formStyles";
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
export type CampoCapaEditavel = "numero" | "documento" | "interessado" | "assunto" | "observacao" | "valorCapa" | "localReparticao";
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
  assuntos,
  numeroEditavel = false,
  modo = "leitura",
  onChange,
  onChangeValorCapa,
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
  /** Opções do ASSUNTO (`opcoesAssunto`) — com elas o assunto é escolhido numa SELEÇÃO. */
  assuntos?: string[];
  /** A capa do PDF veio SEM número → o número (identificador) pode ser informado (cadeado). */
  numeroEditavel?: boolean;
  modo?: ModoCapa;
  onChange?: (campo: CampoCapa, valor: string) => void;
  onChangeValorCapa?: (valor: number | null) => void;
  children?: ReactNode;
}) {
  const { abertos, alternar } = useCadeados<CampoCapaEditavel>();
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
        {assuntos && assuntos.length > 0 ? (
          <div>
            <label className={labelCls} htmlFor="capa-assunto">
              Assunto
            </label>
            <select id="capa-assunto" className={selectCls} value={assunto} onChange={set("assunto")}>
              <option value="">— Selecione o assunto —</option>
              {assuntos.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <TextField label="Assunto" value={assunto} onChange={set("assunto")} />
        )}
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
      {numeroEditavel && podeEditar ? (
        <CampoTexto label="Número do processo (não lido da capa)" valor={numero} {...props("numero")} onChange={(v) => onChange?.("numero", v)} />
      ) : (
        <CampoTexto label="Número do processo" valor={numero} editavel={false} aberto={false} bloqueado onLock={naoOp} onChange={naoOp} />
      )}
      <CampoTexto label="Id do processo" valor={idExterno ?? ""} mono editavel={false} aberto={false} bloqueado onLock={naoOp} onChange={naoOp} />
      <CampoTexto label="Data/Hora" valor={data} editavel={false} aberto={false} bloqueado onLock={naoOp} onChange={naoOp} />
      <CampoTexto label="CPF/CNPJ" valor={documento} {...props("documento")} onChange={(v) => onChange?.("documento", v)} />
      <CampoTexto label="Interessado" valor={interessado} span multi {...props("interessado")} onChange={(v) => onChange?.("interessado", v)} />
      {assuntos && assuntos.length > 0 ? (
        <CampoSelecao label="Assunto" valor={assunto} opcoes={assuntos} {...props("assunto")} onChange={(v) => onChange?.("assunto", v)} />
      ) : (
        <CampoTexto label="Assunto" valor={assunto} {...props("assunto")} onChange={(v) => onChange?.("assunto", v)} />
      )}
      <CampoTexto label="Observação" valor={observacao} multi {...props("observacao")} onChange={(v) => onChange?.("observacao", v)} />
      <CampoNumero label="Valor (capa)" valor={valorCapa} moeda {...props("valorCapa")} onChange={(v) => onChangeValorCapa?.(v)} />
      <CampoTexto label="Local (capa)" valor={localReparticao ?? ""} {...props("localReparticao")} onChange={(v) => onChange?.("localReparticao", v)} />
      {children}
    </div>
  );
}

/** Valores da CAPA do protocolo — a MESMA forma na análise (PDF/manual) e no protocolo gravado. */
export type CapaValores = {
  numero: string;
  idExterno: string | null;
  data: string;
  documento: string;
  interessado: string;
  assunto: string;
  observacao: string;
  valorCapa: number | null;
  localReparticao: string | null;
};

/**
 * Cabeçalho FIXO do banner do protocolo (topo do `Modal`, não o corpo): nº do processo +
 * as infos mais importantes ao lado — **Id do protocolo** e **Assunto** (trunca no mobile).
 */
export function ProtocoloCabecalho({
  numero,
  idExterno,
  assunto,
  reenvio = false,
}: {
  numero: string;
  idExterno: string | null;
  assunto: string | null;
  /** Banner do REENVIO (PDF corrigido × gravado) — selo "Reenvio" ao lado do nº. */
  reenvio?: boolean;
}) {
  return (
    // Quebra de linha (não corta) quando falta espaço — no celular o Id segue visível ao lado do selo.
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 overflow-hidden">
      <span className="shrink-0 text-base font-bold text-text">Protocolo {numero}</span>
      {reenvio && (
        <Badge tone="blue" className="shrink-0">
          Reenvio
        </Badge>
      )}
      {idExterno && (
        <span className="shrink-0 rounded-control bg-accent-soft px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-accent">
          Id {idExterno}
        </span>
      )}
      {assunto && <span className="max-w-full truncate text-[12.5px] text-muted">{assunto}</span>}
    </div>
  );
}

/**
 * CORPO ÚNICO do banner do protocolo — o MESMO na ANÁLISE (importação do PDF / criação manual) e no
 * protocolo GRAVADO: mini banners (DFDs · itens · somatória), a CONCILIAÇÃO do valor da capa ×
 * somatória dos DFDs (com "Substituir pela somatória"), os dados da capa (`CapaCampos` — cadeado por
 * campo nos de conteúdo; identificadores sempre travados) + unidade/PCA e a planilha de DFDs
 * (`PlanilhaDfds`, com seleção para a edição em massa). Na análise os DFDs com erro/atenção ficam em
 * tabelas separadas; no gravado (`unica`) é UMA tabela só. Presentacional: o host é dono do estado.
 */
export function ProtocoloView({
  capa,
  modoCapa = "leitura",
  numeroEditavel = false,
  assuntos,
  onCapaChange,
  onValorCapaChange,
  unidade,
  pca,
  totais,
  conciliacao,
  onSubstituir,
  linhas,
  unica = false,
  selecionavel = false,
  selected,
  onSelected,
  onVerDfd,
  dfdAtivo = null,
  compacta = false,
  regras = regrasPadrao(),
  vazio,
  nota,
  topo,
}: {
  capa: CapaValores;
  modoCapa?: ModoCapa;
  numeroEditavel?: boolean;
  /** Opções do ASSUNTO (seleção). */
  assuntos?: string[];
  onCapaChange?: (campo: CampoCapa, valor: string) => void;
  onValorCapaChange?: (valor: number | null) => void;
  /** Unidade do protocolo: seleção (com `onChange`) ou só-leitura. */
  unidade: {
    id: number | null;
    opcoes: { id: number; codigo: string; nome: string; oculto?: boolean | null }[];
    onChange?: (id: number | null) => void;
    rotulo?: string;
    obrigatoria?: boolean;
    /** Texto só-leitura quando a unidade não está entre as opções (ex.: sem acesso). */
    textoLeitura?: string;
  };
  /** PCA do processo: o `PcaPicker` na análise; só-leitura no gravado (identificador). */
  pca: ReactNode;
  totais: { dfds: number; itens: number; somatorio: number; dica?: string };
  conciliacao: ConciliacaoCapa;
  /** Substitui o valor da capa pela somatória (um clique). Ausente = só aponta. */
  onSubstituir?: () => void;
  linhas: LinhaDfd[];
  unica?: boolean;
  selecionavel?: boolean;
  selected?: Set<string | number>;
  onSelected?: (s: Set<string | number>) => void;
  onVerDfd?: (key: number) => void;
  /** DFD ATIVO (banner aberto ao lado) — linha destacada (mestre-detalhe). */
  dfdAtivo?: number | null;
  compacta?: boolean;
  regras?: RegrasAvaliacao;
  /** Conteúdo quando não há DFDs. */
  vazio?: ReactNode;
  /** Nota ao pé (ex.: "Protocolado em …"). */
  nota?: ReactNode;
  /** Bloco no TOPO do corpo (ex.: a comparação do reenvio com o protocolo gravado). */
  topo?: ReactNode;
}) {
  const repSel = unidade.opcoes.find((r) => r.id === unidade.id) ?? null;
  const c = conciliacao;
  return (
    <div className="space-y-5">
      {topo}
      {/* Head — mini banners (um por informação): DFDs · itens · somatória. 2-up no mobile. */}
      {totais.dfds > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatMini label="Total de DFDs" value={num(totais.dfds)} />
          <StatMini label="Total de itens" value={num(totais.itens)} hint={totais.dica} />
          <StatMini
            label="Somatória dos DFDs"
            value={brl(c.somatorio || totais.somatorio)}
            tone={c.divergente ? (c.bloqueia ? "danger" : "warn") : "default"}
            hint={totais.dica}
            className="col-span-2 sm:col-span-1"
          />
        </div>
      )}

      {/* Conciliação do VALOR DA CAPA × somatória (mesma régua da análise e do gravado). */}
      {c.divergente && (
        <Callout kind={c.bloqueia ? "danger" : "warn"} icon={<IconAlert className="h-5 w-5" />}>
          <p className="font-semibold">
            {c.zerada ? "O valor da capa está ausente/zerado" : "O valor da capa diverge da somatória dos DFDs"}
            {c.bloqueia ? "" : " (atenção — não bloqueia)"}
          </p>
          <p className="mt-1 opacity-90">
            Valor da capa: {capa.valorCapa != null ? brl(capa.valorCapa) : "—"} · Somatória dos DFDs: {brl(c.somatorio)}.
            {onSubstituir ? " Substitua o valor da capa pela somatória para conciliar." : ""}
          </p>
          {onSubstituir && (
            <div className="mt-2">
              <Button variant="secondary" onClick={onSubstituir}>
                Substituir pela somatória ({brl(c.somatorio)})
              </Button>
            </div>
          )}
        </Callout>
      )}

      {/* Dados da capa — MESMA grade (`CapaCampos`); identificadores sempre travados; conteúdo com
          cadeado por campo (análise do PDF / gravado editável) ou inputs simples (criação manual). */}
      <section className="rounded-card border border-border bg-surface p-5 shadow-ring">
        <h3 className="mb-4 text-sm font-bold text-text">Dados do processo</h3>
        <CapaCampos
          numero={capa.numero}
          idExterno={capa.idExterno}
          data={capa.data}
          documento={capa.documento}
          interessado={capa.interessado}
          assunto={capa.assunto}
          observacao={capa.observacao}
          valorCapa={capa.valorCapa}
          localReparticao={capa.localReparticao}
          assuntos={assuntos}
          numeroEditavel={numeroEditavel}
          modo={modoCapa}
          onChange={onCapaChange}
          onChangeValorCapa={onValorCapaChange}
        >
          <div className="sm:col-span-2">
            {unidade.onChange ? (
              <>
                <label className={labelCls} htmlFor="proto-unidade">
                  {unidade.rotulo ?? "Unidade"} {unidade.obrigatoria && <span style={{ color: "var(--danger)" }}>*</span>}
                </label>
                <select
                  id="proto-unidade"
                  className={inputCls}
                  value={unidade.id ?? ""}
                  onChange={(e) => unidade.onChange?.(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">— Selecione a unidade —</option>
                  {unidade.opcoes
                    .filter((r) => !r.oculto || r.id === unidade.id)
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.codigo} · {r.nome}
                      </option>
                    ))}
                </select>
              </>
            ) : (
              <TextField
                label={unidade.rotulo ?? "Unidade"}
                value={repSel ? `${repSel.codigo} · ${repSel.nome}` : (unidade.textoLeitura ?? "Sem unidade")}
                disabled
                readOnly
              />
            )}
          </div>
          <div className="sm:col-span-2">{pca}</div>
        </CapaCampos>
      </section>

      {/* Planilha ÚNICA de DFDs (a mesma da análise, do gravado e da aba DFDs). */}
      {linhas.length === 0 ? (
        (vazio ?? (
          <p className="rounded-card border border-border bg-surface p-6 text-center text-sm text-muted">
            Nenhum DFD vinculado a este protocolo.
          </p>
        ))
      ) : (
        <PlanilhaDfds
          linhas={linhas}
          unica={unica}
          selecionavel={selecionavel}
          selected={selected}
          onSelected={onSelected}
          onRowClick={onVerDfd}
          ativa={dfdAtivo}
          compacta={compacta}
          regras={regras}
        />
      )}

      {nota}
    </div>
  );
}
