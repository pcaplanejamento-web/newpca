"use client";

import { useState } from "react";
import { type ChaveAvaliacao, editavelDe, type RegrasAvaliacao, regrasPadrao, TIPO_DFD_ROTULO, TIPOS_DFD } from "@/lib/avaliacao-core";
import { type AcaoMassa, buildPrevisao, type CampoMassa } from "@/lib/dfd-tratamento";
import { MESES, type Prioridade } from "@/lib/normalize";
import { Button } from "./Button";
import { Checkbox, TextField } from "./Field";
import { inputCls } from "./formStyles";
import { Segmented } from "./Segmented";

const CAMPOS: { value: CampoMassa; label: string; chave: ChaveAvaliacao }[] = [
  { value: "reparticao", label: "Unidade", chave: "dfd.reparticao" },
  { value: "tipo", label: "Tipo", chave: "dfd.tipo" },
  { value: "prioridade", label: "Prioridade", chave: "dfd.prioridade" },
  { value: "previsao", label: "Previsão", chave: "dfd.previsao" },
  { value: "fundamentacao", label: "Fund. legal", chave: "dfd.fundamentacao" },
];

/**
 * Barra de EDIÇÃO EM MASSA dos DFDs selecionados — a MESMA na análise do protocolo, no protocolo
 * gravado e na lista de DFDs da Mesa. Cima = controle do valor (altura fixa); baixo = campo +
 * Aplicar + Limpar + contagem. Só oferece os campos que o ADM deixou editáveis (`editavelDe`).
 * Emite uma `AcaoMassa` (a aplicação é do host: rascunho na análise/protocolo; servidor na Mesa).
 */
export function BarraEdicaoMassa({
  qtd,
  reparticoes,
  anoPadrao = null,
  regras = regrasPadrao(),
  aplicando = false,
  onAplicar,
  onLimpar,
}: {
  qtd: number;
  reparticoes: { id: number; codigo: string; nome: string; oculto?: boolean | null }[];
  /** Ano padrão da previsão (o do PCA do processo). */
  anoPadrao?: number | null;
  regras?: RegrasAvaliacao;
  aplicando?: boolean;
  onAplicar: (acao: AcaoMassa) => void;
  onLimpar: () => void;
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
  if (campos.length === 0) return null; // o ADM travou todos os campos editáveis em massa

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
    <div className="mb-3 rounded-card border border-border bg-surface-2 p-3">
      <div className="flex min-h-[42px] flex-wrap items-center gap-2">
        {campo === "reparticao" && (
          <select
            aria-label="Unidade"
            className={inputCls}
            style={{ width: "auto", minWidth: 200, flex: "1 1 200px" }}
            value={rep ?? ""}
            onChange={(e) => setRep(e.target.value ? Number(e.target.value) : null)}
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
        )}
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
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Segmented<CampoMassa> value={campo} options={campos.map(({ value, label }) => ({ value, label }))} onChange={setCampo} />
        <Button onClick={() => acao && onAplicar(acao)} disabled={!acao || aplicando} loading={aplicando}>
          Aplicar
        </Button>
        <Button variant="ghost" onClick={onLimpar} disabled={aplicando}>
          Limpar
        </Button>
        <span className="ml-auto text-[11px] font-semibold uppercase text-muted">{qtd} selecionado(s)</span>
      </div>
    </div>
  );
}
