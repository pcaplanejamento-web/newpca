"use client";

import type { ReactNode } from "react";
import type { RegrasAvaliacao } from "@/lib/avaliacao-core";
import { type EstadoDfd, estadoCor, estadoRotulo, type MensagemDfd } from "@/lib/dfd-tratamento";
import { Button } from "./Button";
import { BotaoVerMensagens } from "./MensagensDfd";

/**
 * RODAPÉ FIXO do banner de um DFD — o MESMO na análise (DFD ao lado do protocolo / avulso) e no
 * DFD gravado (solto ou ao lado do protocolo gravado). Esquerda: o ESTADO do DFD (cor/rótulo do
 * ADM). Direita: ações do contexto (`acoes` — ex.: manter/restaurar, histórico, ver protocolo),
 * "Ver mensagens" + numeração, Fechar e a ação PRINCIPAL (`principal` — ex.: Salvar alterações).
 */
export function DfdRodape({
  estado = null,
  regras,
  mensagens,
  mensagensAbertas,
  onToggleMensagens,
  onFechar,
  rotuloFechar = "Fechar",
  bloqueado = false,
  acoes,
  principal,
}: {
  estado?: EstadoDfd | null;
  regras?: RegrasAvaliacao;
  mensagens: MensagemDfd[];
  mensagensAbertas: boolean;
  onToggleMensagens: () => void;
  onFechar?: () => void;
  /** Rótulo do botão de fechar (ex.: "Cancelar" na importação avulsa). */
  rotuloFechar?: string;
  /** Gravação em andamento: desabilita o Fechar. */
  bloqueado?: boolean;
  acoes?: ReactNode;
  principal?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {estado ? (
        <span className="inline-flex items-center gap-1.5 text-[12px] font-medium" style={{ color: estadoCor(estado, regras) }}>
          <span className="h-2 w-2 rounded-full" style={{ background: estadoCor(estado, regras) }} />
          {estadoRotulo(estado, regras)}
        </span>
      ) : (
        <span />
      )}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {acoes}
        <BotaoVerMensagens mensagens={mensagens} aberto={mensagensAbertas} onToggle={onToggleMensagens} />
        {onFechar && (
          <Button variant="secondary" onClick={onFechar} disabled={bloqueado}>
            {rotuloFechar}
          </Button>
        )}
        {principal}
      </div>
    </div>
  );
}
