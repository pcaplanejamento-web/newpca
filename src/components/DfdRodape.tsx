"use client";

import type { ReactNode } from "react";
import type { RegrasAvaliacao } from "@/lib/avaliacao-core";
import { contarMensagens, type EstadoDfd, estadoCor, estadoRotulo, type MensagemDfd } from "@/lib/dfd-tratamento";
import { IndicadorPendencias } from "./IndicadorPendencias";

/**
 * RODAPÉ FIXO do banner de um DFD — o MESMO na análise (DFD ao lado do protocolo / avulso) e no DFD gravado (solto ou
 * ao lado do protocolo gravado), em UMA linha: à esquerda o `IndicadorPendencias` (o ESTADO do DFD na cor do ADM + as
 * contagens de erro/atenção — alterna o painel de MENSAGENS); à direita as ações do contexto (`acoes` — `BotaoAcao`, só
 * ícone) e a ação PRINCIPAL (`principal` — ex.: Salvar alterações). Fechar = o X do cabeçalho.
 */
export function DfdRodape({
  estado = null,
  regras,
  mensagens,
  mensagensAbertas,
  onToggleMensagens,
  aviso,
  acoes,
  principal,
}: {
  estado?: EstadoDfd | null;
  regras?: RegrasAvaliacao;
  mensagens: MensagemDfd[];
  mensagensAbertas: boolean;
  onToggleMensagens: () => void;
  /** Um aviso curto do contexto (ex.: por que a importação está travada) — uma linha, o texto inteiro na dica. */
  aviso?: string | null;
  acoes?: ReactNode;
  principal?: ReactNode;
}) {
  const cont = contarMensagens(mensagens);
  return (
    <div className="flex flex-nowrap items-center gap-2">
      <IndicadorPendencias
        erros={cont.erro}
        atencoes={cont.atencao}
        rotulo={estado ? estadoRotulo(estado, regras) : undefined}
        cor={estado ? estadoCor(estado, regras) : undefined}
        alvo={mensagensAbertas ? "ocultar as mensagens" : "ver as mensagens"}
        aberto={mensagensAbertas}
        onClick={onToggleMensagens}
      />
      {aviso ? (
        <span className="min-w-0 flex-1 truncate text-[12px]" style={{ color: "var(--danger)" }} title={aviso}>
          {aviso}
        </span>
      ) : null}
      <div className="ml-auto flex min-w-0 flex-nowrap items-center justify-end gap-1.5 -my-1.5 overflow-x-auto py-1.5 pr-1.5 pl-1">
        {acoes}
        {principal}
      </div>
    </div>
  );
}
