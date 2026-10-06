"use client";

import type { FocusEventHandler } from "react";
import { filtrarTelefone, formatarTelefone, linkWhatsapp } from "@/lib/cadastro-core";
import { Ajuda } from "./Ajuda";
import { TextField } from "./Field";
import { IconWhatsapp } from "./icons";
import { LinkExterno } from "./LinkExterno";

/**
 * CONTATO INSTITUCIONAL (cadastro) — o número de WHATSAPP com DDD pelo qual a equipe do Planejamento e Custos fala com a
 * pessoa. O valor é SÓ os dígitos (`filtrarTelefone`); a tela mostra a máscara "(64) 99999-0000". O ícone do WhatsApp à
 * esquerda diz que é o contato de WhatsApp que pedimos; o "(?)" explica por quê.
 */
export function CampoTelefone({
  valor,
  onValor,
  error,
  onBlur,
  denso = true,
  ajuda = true,
  id,
}: {
  /** Só os dígitos. */
  valor: string;
  onValor: (digitos: string) => void;
  error?: string;
  onBlur?: FocusEventHandler<HTMLInputElement>;
  denso?: boolean;
  /** Mostra o "(?)" ao lado do rótulo (a explicação da importância do contato). */
  ajuda?: boolean;
  id?: string;
}) {
  return (
    <TextField
      id={id}
      label="Contato institucional"
      rotuloExtra={
        ajuda ? (
          <Ajuda titulo="Por que o contato institucional?" rotulo="Ajuda do contato institucional" compacta>
            <p>
              É o seu número de <strong className="text-text">WhatsApp</strong>, com DDD: a equipe do Planejamento e Custos usa esse contato para falar com
              você sobre as suas demandas — um DFD a corrigir, um prazo, uma dúvida sobre o PCA.
            </p>
            <p>Use um número em que você responda durante o expediente.</p>
          </Ajuda>
        ) : undefined
      }
      icon={<IconWhatsapp className="h-5 w-5 text-[var(--ok)]" />}
      // Números tabulares um pouco menores: "(64) 99999-0000" cabe inteiro na meia coluna do cadastro.
      classeEntrada="!text-[14px] tabular-nums"
      inputMode="tel"
      autoComplete="tel-national"
      placeholder="(64) 99999-0000"
      value={formatarTelefone(valor)}
      onChange={(e) => onValor(filtrarTelefone(e.target.value))}
      onBlur={onBlur}
      error={error}
      maxLength={16}
      denso={denso}
      required
    />
  );
}

/**
 * CONVERSAR NO WHATSAPP — o link `wa.me` do telefone (abre em nova aba), no tamanho de ação de linha (`xs`) ou padrão. Sem
 * telefone válido, nada. Numa linha clicável de tabela, o toque no botão não abre a linha.
 */
export function BotaoWhatsapp({ telefone, size = "xs", comNumero = true }: { telefone: string | null; size?: "md" | "xs"; /** Sem o número: "WhatsApp" (só o ícone no celular). */ comNumero?: boolean }) {
  const href = linkWhatsapp(telefone);
  if (!href) return null;
  return (
    <span role="none" className="inline-flex" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <LinkExterno href={href} size={size} titulo={`Conversar no WhatsApp — ${formatarTelefone(telefone)}`} icon={<IconWhatsapp className="h-4 w-4 text-[var(--ok)]" />}>
        {comNumero ? <span className="tabular-nums">{formatarTelefone(telefone)}</span> : <span className="hidden sm:inline">WhatsApp</span>}
      </LinkExterno>
    </span>
  );
}
