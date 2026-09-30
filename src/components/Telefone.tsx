"use client";

import type { FocusEventHandler } from "react";
import { filtrarTelefone, formatarTelefone, linkWhatsapp } from "@/lib/cadastro-core";
import { Ajuda } from "./Ajuda";
import { TextField } from "./Field";
import { IconTelefone, IconWhatsapp } from "./icons";
import { LinkExterno } from "./LinkExterno";

/**
 * TELEFONE DE CONTATO INSTITUCIONAL — o campo (cadastro e ADM) e o botão de conversa no WhatsApp. O valor é SÓ os dígitos
 * (`filtrarTelefone`); a tela mostra a máscara "(64) 99999-0000". O botão do WhatsApp fica DENTRO do campo, no fim: tocar
 * marca/desmarca que o número tem WhatsApp (`aria-pressed`, verde quando marcado). O "(?)" diz por que o telefone importa.
 */
export function CampoTelefone({
  valor,
  onValor,
  whatsapp,
  onWhatsapp,
  error,
  onBlur,
  denso = true,
  ajuda = true,
  id,
}: {
  /** Só os dígitos. */
  valor: string;
  onValor: (digitos: string) => void;
  whatsapp: boolean;
  onWhatsapp: (tem: boolean) => void;
  error?: string;
  onBlur?: FocusEventHandler<HTMLInputElement>;
  denso?: boolean;
  /** Mostra o "(?)" ao lado do rótulo (a explicação da importância do telefone). */
  ajuda?: boolean;
  id?: string;
}) {
  return (
    <TextField
      id={id}
      label="Telefone"
      rotuloExtra={
        ajuda ? (
          <Ajuda titulo="Por que o telefone?" rotulo="Ajuda do telefone" compacta>
            <p>
              É o telefone de <strong className="text-text">contato institucional</strong>: a equipe do Planejamento e Custos usa esse número para falar
              com você sobre as suas demandas — um DFD a corrigir, um prazo, uma dúvida sobre o PCA.
            </p>
            <p>Informe o DDD. Se o número tem WhatsApp, toque no ícone do WhatsApp dentro do campo: a equipe poderá chamar você por lá.</p>
          </Ajuda>
        ) : undefined
      }
      icon={<IconTelefone className="h-5 w-5" />}
      trailing={
        <button
          type="button"
          onClick={() => onWhatsapp(!whatsapp)}
          aria-pressed={whatsapp}
          aria-label="Este telefone tem WhatsApp"
          title={whatsapp ? "Tem WhatsApp — tocar desmarca" : "Tocar marca que o telefone tem WhatsApp"}
          className={`relative -mr-2 grid h-9 w-9 shrink-0 place-items-center rounded-control transition-colors duration-[var(--motion-duration)] after:absolute after:-inset-1 after:content-[''] ${
            whatsapp ? "bg-[color-mix(in_oklab,var(--ok)_14%,transparent)] text-[var(--ok)]" : "text-faint hover:bg-surface-2 hover:text-text-2"
          }`}
        >
          <IconWhatsapp className="h-5 w-5" />
        </button>
      }
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
    <span className="inline-flex" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <LinkExterno href={href} size={size} titulo={`Conversar no WhatsApp — ${formatarTelefone(telefone)}`} icon={<IconWhatsapp className="h-4 w-4 text-[var(--ok)]" />}>
        {comNumero ? <span className="tabular-nums">{formatarTelefone(telefone)}</span> : <span className="hidden sm:inline">WhatsApp</span>}
      </LinkExterno>
    </span>
  );
}
