"use client";

import { type ReactNode, useState } from "react";
import { type ChaveAvaliacao, editavelDe, opcoesAssunto, type RegrasAvaliacao, regrasPadrao, TIPO_DFD_ROTULO, TIPOS_DFD } from "@/lib/avaliacao-core";
import { type AcaoMassa, buildPrevisao, type CampoMassa } from "@/lib/dfd-tratamento";
import type { AcaoMassaProtocolo } from "@/lib/dfd-validation";
import type { AcaoMassaItem, CampoMassaItem } from "@/lib/massa-itens";
import { MESES, type Prioridade, parseNumberBR } from "@/lib/normalize";
import { Button } from "./Button";
import { Checkbox, TextField } from "./Field";
import { inputCls } from "./formStyles";
import { Segmented } from "./Segmented";

type Rep = { id: number; codigo: string; nome: string; oculto?: boolean | null };

/**
 * Moldura COMUM dos editores de massa: em cima o controle do valor (altura fixa — não "pula" ao trocar
 * de campo); embaixo o seletor do CAMPO + Aplicar. Vai dentro da `BarraSelecao` (que mostra o registro
 * das seleções, a contagem/somatório e o "Limpar seleção").
 */
function Moldura<C extends string>({
  controle,
  campos,
  campo,
  onCampo,
  pronto,
  aplicando,
  onAplicar,
  perigo = false,
  rotulo = "Aplicar",
}: {
  controle: ReactNode;
  campos: { value: C; label: string }[];
  campo: C;
  onCampo: (c: C) => void;
  pronto: boolean;
  aplicando: boolean;
  onAplicar: () => void;
  perigo?: boolean;
  rotulo?: string;
}) {
  return (
    <div>
      <div className="flex min-h-[42px] flex-wrap items-center gap-2">{controle}</div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Segmented<C> value={campo} options={campos} onChange={onCampo} />
        <Button variant={perigo ? "danger" : "primary"} onClick={onAplicar} disabled={!pronto || aplicando} loading={aplicando}>
          {rotulo}
        </Button>
      </div>
    </div>
  );
}

/** Nota explicativa no lugar do controle (ações sem valor a informar). */
const Nota = ({ children }: { children: ReactNode }) => <p className="text-[12.5px] text-muted">{children}</p>;

/** Seletor de UNIDADE (as ocultas não aparecem para uso novo). */
function SeletorUnidade({ value, onChange, reparticoes }: { value: number | null; onChange: (id: number | null) => void; reparticoes: Rep[] }) {
  return (
    <select
      aria-label="Unidade"
      className={inputCls}
      style={{ width: "auto", minWidth: 200, flex: "1 1 200px" }}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
    >
      <option value="">— Unidade —</option>
      {reparticoes
        .filter((r) => !r.oculto)
        .map((r) => (
          <option key={r.id} value={r.id}>
            {r.codigo} · {r.nome}
          </option>
        ))}
    </select>
  );
}

const CAMPOS: { value: CampoMassa; label: string; chave: ChaveAvaliacao }[] = [
  { value: "reparticao", label: "Unidade", chave: "dfd.reparticao" },
  { value: "tipo", label: "Tipo", chave: "dfd.tipo" },
  { value: "prioridade", label: "Prioridade", chave: "dfd.prioridade" },
  { value: "previsao", label: "Previsão", chave: "dfd.previsao" },
  { value: "fundamentacao", label: "Fund. legal", chave: "dfd.fundamentacao" },
];

/**
 * Edição EM MASSA dos DFDs selecionados — a MESMA na análise do protocolo, no protocolo gravado e na
 * lista de DFDs da Mesa. Só oferece os campos que o ADM deixou editáveis (`editavelDe`). Emite uma
 * `AcaoMassa` (a aplicação é do host: rascunho na análise/protocolo; servidor na Mesa).
 */
export function BarraEdicaoMassa({
  reparticoes,
  anoPadrao = null,
  regras = regrasPadrao(),
  aplicando = false,
  onAplicar,
}: {
  reparticoes: Rep[];
  /** Ano padrão da previsão (o do PCA do processo). */
  anoPadrao?: number | null;
  regras?: RegrasAvaliacao;
  aplicando?: boolean;
  onAplicar: (acao: AcaoMassa) => void;
}) {
  const campos = CAMPOS.filter((c) => editavelDe(regras, c.chave));
  const [campo, setCampo] = useState<CampoMassa>(campos[0]?.value ?? "reparticao");
  const [rep, setRep] = useState<number | null>(null);
  const [tipo, setTipo] = useState("");
  const [prio, setPrio] = useState<Prioridade | "">("");
  const [mes, setMes] = useState("");
  const [ano, setAno] = useState(anoPadrao != null ? String(anoPadrao) : "");
  const [anual, setAnual] = useState(false);
  const [fund, setFund] = useState("Lei 14.133/2021");
  if (campos.length === 0) return <Nota>Os campos editáveis em massa estão travados nas Configurações → Avaliação.</Nota>;

  const previsao = buildPrevisao(mes, ano, anual);
  const acao: AcaoMassa | null =
    campo === "reparticao"
      ? rep != null
        ? { campo, reparticaoId: rep }
        : null
      : campo === "tipo"
        ? tipo
          ? { campo, valor: TIPO_DFD_ROTULO[tipo as (typeof TIPOS_DFD)[number]] }
          : null
        : campo === "prioridade"
          ? prio
            ? { campo, valor: prio }
            : null
          : campo === "previsao"
            ? previsao
              ? { campo, valor: previsao }
              : null
            : fund.trim()
              ? { campo, valor: fund.trim() }
              : null;

  return (
    <Moldura
      campos={campos.map(({ value, label }) => ({ value, label }))}
      campo={campo}
      onCampo={setCampo}
      pronto={!!acao}
      aplicando={aplicando}
      onAplicar={() => acao && onAplicar(acao)}
      controle={
        <>
          {campo === "reparticao" && <SeletorUnidade value={rep} onChange={setRep} reparticoes={reparticoes} />}
          {campo === "tipo" && (
            <select
              aria-label="Tipo do DFD"
              className={inputCls}
              style={{ width: "auto", minWidth: 200, flex: "1 1 200px" }}
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
            >
              <option value="">— Tipo do DFD —</option>
              {TIPOS_DFD.map((t) => (
                <option key={t} value={t}>
                  {TIPO_DFD_ROTULO[t]}
                </option>
              ))}
            </select>
          )}
          {campo === "prioridade" && (
            <Segmented<Prioridade | "">
              value={prio}
              options={[
                { value: "ALTA", label: "Alta" },
                { value: "MÉDIA", label: "Média" },
                { value: "BAIXA", label: "Baixa" },
              ]}
              onChange={setPrio}
            />
          )}
          {campo === "previsao" && (
            <>
              <select
                aria-label="Mês"
                className={inputCls}
                style={{ width: "auto", flex: "0 1 140px" }}
                value={mes}
                disabled={anual}
                onChange={(e) => setMes(e.target.value)}
              >
                <option value="">— Mês —</option>
                {MESES.map((m) => (
                  <option key={m} value={m}>
                    {m[0] + m.slice(1).toLowerCase()}
                  </option>
                ))}
              </select>
              <input
                aria-label="Ano"
                className={inputCls}
                style={{ width: 84 }}
                inputMode="numeric"
                maxLength={4}
                placeholder="Ano"
                value={ano}
                onChange={(e) => setAno(e.target.value.replace(/\D/g, "").slice(0, 4))}
              />
              <Checkbox label="Anual" checked={anual} onChange={(e) => setAnual(e.target.checked)} />
            </>
          )}
          {campo === "fundamentacao" && (
            <div className="min-w-[220px] flex-1">
              <TextField aria-label="Fundamentação legal" value={fund} onChange={(e) => setFund(e.target.value)} />
            </div>
          )}
        </>
      }
    />
  );
}

type CampoProto = AcaoMassaProtocolo["campo"];

/**
 * Edição EM MASSA dos PROTOCOLOS selecionados (Mesa): RESPONSÁVEL, SITUAÇÃO (só as cadastradas pelo ADM),
 * UNIDADE, ASSUNTO (as mesmas opções do seletor da capa: categorias fixas + assuntos cadastrados) ou VALOR
 * DA CAPA = somatória dos DFDs (conciliação em lote). A unidade respeita o "editável" do ADM.
 */
export function BarraEdicaoMassaProtocolos({
  reparticoes,
  pessoas = [],
  situacoes = [],
  regras = regrasPadrao(),
  aplicando = false,
  onAplicar,
}: {
  reparticoes: Rep[];
  /** Usuários ativos (responsável). */
  pessoas?: { id: number; nome: string }[];
  /** Situações cadastradas pelo ADM. */
  situacoes?: { id: number; nome: string }[];
  regras?: RegrasAvaliacao;
  aplicando?: boolean;
  onAplicar: (acao: AcaoMassaProtocolo) => void;
}) {
  const campos: { value: CampoProto; label: string }[] = [
    { value: "responsavel", label: "Responsável" },
    ...(situacoes.length > 0 ? [{ value: "situacao" as const, label: "Situação" }] : []),
    ...(editavelDe(regras, "protocolo.reparticao") ? [{ value: "reparticao" as const, label: "Unidade" }] : []),
    { value: "assunto", label: "Assunto" },
    { value: "valorCapa", label: "Valor da capa" },
  ];
  const [campo, setCampo] = useState<CampoProto>(campos[0].value);
  const [rep, setRep] = useState<number | null>(null);
  const [assunto, setAssunto] = useState("");
  // Responsável/situação: "" = ainda não escolhido; "0" = LIMPAR (sem responsável/situação).
  const [pessoa, setPessoa] = useState("");
  const [situacao, setSituacao] = useState("");
  const idOuNulo = (v: string) => (v === "0" ? null : Number(v));
  const acao: AcaoMassaProtocolo | null =
    campo === "reparticao"
      ? rep != null
        ? { campo, reparticaoId: rep }
        : null
      : campo === "assunto"
        ? assunto
          ? { campo, valor: assunto }
          : null
        : campo === "responsavel"
          ? pessoa
            ? { campo, responsavelId: idOuNulo(pessoa) }
            : null
          : campo === "situacao"
            ? situacao
              ? { campo, situacaoId: idOuNulo(situacao) }
              : null
            : { campo };

  return (
    <Moldura
      campos={campos}
      campo={campo}
      onCampo={setCampo}
      pronto={!!acao}
      aplicando={aplicando}
      onAplicar={() => acao && onAplicar(acao)}
      controle={
        campo === "responsavel" ? (
          <select
            aria-label="Responsável"
            className={inputCls}
            style={{ width: "auto", minWidth: 220, flex: "1 1 220px" }}
            value={pessoa}
            onChange={(e) => setPessoa(e.target.value)}
          >
            <option value="">— Responsável —</option>
            <option value="0">Sem responsável (limpar)</option>
            {pessoas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        ) : campo === "situacao" ? (
          <select
            aria-label="Situação"
            className={inputCls}
            style={{ width: "auto", minWidth: 200, flex: "1 1 200px" }}
            value={situacao}
            onChange={(e) => setSituacao(e.target.value)}
          >
            <option value="">— Situação —</option>
            <option value="0">Sem situação (limpar)</option>
            {situacoes.map((x) => (
              <option key={x.id} value={x.id}>
                {x.nome}
              </option>
            ))}
          </select>
        ) : campo === "reparticao" ? (
          <SeletorUnidade value={rep} onChange={setRep} reparticoes={reparticoes} />
        ) : campo === "assunto" ? (
          <select
            aria-label="Assunto"
            className={inputCls}
            style={{ width: "auto", minWidth: 220, flex: "1 1 220px" }}
            value={assunto}
            onChange={(e) => setAssunto(e.target.value)}
          >
            <option value="">— Assunto —</option>
            {opcoesAssunto(regras).map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        ) : (
          <Nota>Substitui o valor da capa de cada protocolo pela somatória dos seus DFDs (os que já conferem ficam como estão).</Nota>
        )
      }
    />
  );
}

/**
 * Edição EM MASSA dos ITENS selecionados (Mesa): PADRONIZAR pelo catálogo, UNIDADE de medida,
 * QUANTIDADE, VALOR UNITÁRIO (o total do item é recalculado) ou REMOVER — com as mesmas travas do item
 * a item (aplicadas no servidor: unidade igual à do catálogo fica travada; o DFD nunca fica sem itens).
 */
export function BarraEdicaoMassaItens({ aplicando = false, onAplicar }: { aplicando?: boolean; onAplicar: (acao: AcaoMassaItem) => void }) {
  const [campo, setCampo] = useState<CampoMassaItem>("catalogo");
  const [unidade, setUnidade] = useState("");
  const [numero, setNumero] = useState("");
  const n = parseNumberBR(numero);
  const acao: AcaoMassaItem | null =
    campo === "catalogo" || campo === "remover"
      ? { campo }
      : campo === "unidade"
        ? unidade.trim()
          ? { campo, valor: unidade.trim().toUpperCase() }
          : null
        : n != null && n > 0
          ? { campo, valor: n }
          : null;

  return (
    <Moldura
      campos={[
        { value: "catalogo", label: "Padronizar" },
        { value: "unidade", label: "Unidade" },
        { value: "quantidade", label: "Quantidade" },
        { value: "valorUnitario", label: "Valor unit." },
        { value: "remover", label: "Remover" },
      ]}
      campo={campo}
      onCampo={(c) => {
        setCampo(c);
        setNumero("");
      }}
      pronto={!!acao}
      aplicando={aplicando}
      onAplicar={() => acao && onAplicar(acao)}
      perigo={campo === "remover"}
      rotulo={campo === "remover" ? "Remover itens" : "Aplicar"}
      controle={
        campo === "catalogo" ? (
          <Nota>Descrição e unidade passam a ser as do catálogo (só o que diverge; item fora do catálogo não muda).</Nota>
        ) : campo === "unidade" ? (
          <div className="min-w-[160px] flex-1">
            <TextField aria-label="Unidade de medida" placeholder="Ex.: UN, CX, KG" value={unidade} onChange={(e) => setUnidade(e.target.value)} />
          </div>
        ) : campo === "remover" ? (
          <Nota>Remove os itens selecionados dos DFDs (o total do DFD é recalculado; um DFD nunca fica sem itens).</Nota>
        ) : (
          <div className="min-w-[160px] flex-1">
            <TextField
              aria-label={campo === "quantidade" ? "Quantidade" : "Valor unitário (R$)"}
              placeholder={campo === "quantidade" ? "Quantidade" : "Valor unitário (R$)"}
              inputMode="decimal"
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
            />
          </div>
        )
      }
    />
  );
}
