"use client";

import { useState } from "react";
import {
  contarMensagens,
  linhasRelatorioDfd,
  type MensagemDfd,
  STATUS_MENSAGEM_COR,
  STATUS_MENSAGEM_ROTULO,
  type StatusMensagem,
} from "@/lib/dfd-tratamento";
import { Button } from "./Button";
import { IconCheck, IconClipboard, IconLayers } from "./icons";

const ORDEM: StatusMensagem[] = ["erro", "atencao", "acerto"];

/**
 * Botão "Ver mensagens" + a numeração por status (erro/atenção/acerto) — vai no RODAPÉ
 * FIXO do banner do DFD, à esquerda do botão de fechar. Abre o painel `MensagensDfd`.
 */
export function BotaoVerMensagens({
  mensagens,
  aberto = false,
  onToggle,
}: {
  mensagens: MensagemDfd[];
  aberto?: boolean;
  onToggle: () => void;
}) {
  const cont = contarMensagens(mensagens);
  return (
    <div className="flex items-center gap-3">
      <div className="flex flex-wrap gap-2.5 text-[12px] font-semibold">
        {ORDEM.map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5" style={{ color: STATUS_MENSAGEM_COR[s] }}>
            <span className="h-2 w-2 rounded-full" style={{ background: STATUS_MENSAGEM_COR[s] }} />
            {cont[s]}
          </span>
        ))}
      </div>
      <Button variant="secondary" onClick={onToggle} icon={<IconLayers className="h-4 w-4" />}>
        {aberto ? "Ocultar mensagens" : "Ver mensagens"}
      </Button>
    </div>
  );
}

/**
 * Painel LATERAL de mensagens de um DFD — lista TODAS as conferências (erro · atenção ·
 * acerto), agrupadas por status. Clicar numa mensagem rola o banner do DFD até o
 * componente correspondente e o destaca na cor do status (`onIrPara`). Um botão
 * "Copiar pendências" gera o relatório copiável do DFD (`linhasRelatorioDfd`). Só
 * componentes/tokens do design-system; corpo de um `Modal` (não abre modal próprio).
 */
export function MensagensDfd({
  mensagens,
  numero,
  tipo,
  onIrPara,
}: {
  mensagens: MensagemDfd[];
  numero?: string;
  tipo?: string | null;
  onIrPara: (m: MensagemDfd) => void;
}) {
  const cont = contarMensagens(mensagens);
  const [copiado, setCopiado] = useState(false);
  // Pendências (erro + atenção) → relatório copiável (mesmo formato do despacho por DFD).
  const pendencias = mensagens.filter((m) => m.status !== "acerto").map((m) => m.texto);

  async function copiar() {
    const texto = linhasRelatorioDfd({ numero: numero ?? "", tipo, faltas: pendencias }).join("\n");
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Ambiente sem permissão de clipboard: silencioso (o painel segue exibindo tudo).
    }
  }

  return (
    <div className="space-y-4">
      {/* Resumo dos contadores + copiar pendências */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {ORDEM.map((s) => (
            <span
              key={s}
              className="inline-flex items-center gap-1.5 rounded-control border border-border-2 bg-surface-2 px-2.5 py-1 text-[12px] font-semibold"
              style={{ color: STATUS_MENSAGEM_COR[s] }}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: STATUS_MENSAGEM_COR[s] }} />
              {cont[s]} {STATUS_MENSAGEM_ROTULO[s].toLowerCase()}
              {cont[s] === 1 ? "" : "s"}
            </span>
          ))}
        </div>
        {pendencias.length > 0 && (
          <Button
            variant="ghost"
            onClick={copiar}
            icon={copiado ? <IconCheck className="h-4 w-4" /> : <IconClipboard className="h-4 w-4" />}
          >
            {copiado ? "Copiado!" : "Copiar pendências"}
          </Button>
        )}
      </div>

      {mensagens.length === 0 ? (
        <p className="rounded-card border border-border bg-surface p-6 text-center text-sm text-muted">
          Nenhuma conferência para este DFD.
        </p>
      ) : (
        ORDEM.map((s) => {
          const grupo = mensagens.filter((m) => m.status === s);
          if (grupo.length === 0) return null;
          return (
            <section key={s}>
              <h4
                className="mb-1.5 flex items-center gap-1.5 text-[13px] font-bold"
                style={{ color: STATUS_MENSAGEM_COR[s] }}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: STATUS_MENSAGEM_COR[s] }} />
                {STATUS_MENSAGEM_ROTULO[s]}s ({grupo.length})
              </h4>
              <ul className="space-y-1.5">
                {grupo.map((m) => (
                  <li key={m.chave}>
                    <button
                      type="button"
                      onClick={() => onIrPara(m)}
                      className="flex min-h-[44px] w-full items-start gap-2.5 rounded-card border border-border bg-surface px-3 py-2.5 text-left text-[13px] text-text-2 transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                      title="Ir para o item no banner do DFD"
                    >
                      <span
                        className="mt-1 h-2 w-2 shrink-0 rounded-full"
                        style={{ background: STATUS_MENSAGEM_COR[m.status] }}
                      />
                      <span className="min-w-0 break-words leading-snug">{m.texto}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}
