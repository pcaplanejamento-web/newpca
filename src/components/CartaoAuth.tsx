import type { FormEvent, ReactNode } from "react";
import { Button } from "./Button";
import { AvisoFlutuante } from "./AvisoFlutuante";
import { IconCheck } from "./icons";

// As peças do FORMULÁRIO das telas de acesso (entrar, criar conta, redefinir a senha) — o cabeçalho (etapa, título e
// subtítulo), a mensagem de erro e o fim de um fluxo. A moldura (marca + vitrine) é a `TelaAcesso`. 100% por token.

/** Um passo do formulário de acesso (um `<form>` quando há `onSubmit` — sem a validação nativa do navegador: as mensagens
 * em pt-BR são as do formulário e do servidor). `etapa` = "Etapa 1 de 2" acima do título. */
export function CartaoAuth({
  titulo,
  subtitulo,
  etapa,
  onSubmit,
  denso = false,
  children,
}: {
  /** DENSO: cabeçalho mais baixo (formulários longos que têm de caber na tela — o cadastro). */
  denso?: boolean;
  titulo: string;
  subtitulo?: ReactNode;
  etapa?: string;
  onSubmit?: (e: FormEvent) => void;
  children: ReactNode;
}) {
  const conteudo = (
    <>
      {/* DENSO em tela BAIXA do desktop (≤ 720px de altura): sem o título — o seletor Entrar | Criar conta já diz onde se está. */}
      <div className={denso ? "mb-3 lg:[@media(max-height:720px)]:sr-only" : "mb-6"}>
        {etapa && !denso && <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">{etapa}</p>}
        {/* DENSO: a etapa vai na MESMA linha do título, à direita. */}
        <div className="flex items-baseline justify-between gap-3">
          <h1 className={`font-bold leading-tight tracking-tight text-text ${denso ? "text-[24px]" : "text-[26px] sm:text-[28px]"}`}>{titulo}</h1>
          {etapa && denso && <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">{etapa}</span>}
        </div>
        {/* DENSO em tela baixa: sem o subtítulo (o formulário cabe sem rolar). */}
        {subtitulo && (
          <p className={`${denso ? "mt-1 text-[13px] leading-snug [@media(max-height:820px)]:hidden" : "mt-2 text-[14px] leading-relaxed"} text-muted`}>{subtitulo}</p>
        )}
      </div>
      {children}
    </>
  );
  return onSubmit ? (
    <form onSubmit={onSubmit} noValidate className="w-full animate-fade-in-up">
      {conteudo}
    </form>
  ) : (
    <div className="w-full animate-fade-in-up">{conteudo}</div>
  );
}

/**
 * A mensagem de erro das telas de acesso — FLUTUANTE (o `AvisoFlutuante` do sistema, no canto do display): nunca empurra os
 * campos nem o botão. `onFechar` limpa o erro no dono (X ou depois de alguns segundos).
 */
export function ErroAuth({ children, onFechar }: { children: ReactNode; onFechar: () => void }) {
  return (
    <AvisoFlutuante kind="danger" onClose={onFechar} duracao={9000}>
      {children}
    </AvisoFlutuante>
  );
}

/** O fim de um fluxo de acesso (conta criada, senha salva): o selo, a mensagem e a volta para "Entrar". */
export function ConcluidoAuth({ titulo, children, onVoltar }: { titulo: string; children: ReactNode; onVoltar: () => void }) {
  return (
    <div className="w-full animate-fade-in-up">
      <div className="grid h-12 w-12 place-items-center rounded-full bg-accent-soft text-accent">
        <IconCheck className="h-6 w-6" />
      </div>
      <h1 className="mt-5 text-[26px] font-bold leading-tight tracking-tight text-text">{titulo}</h1>
      <p className="mt-2 text-[14px] leading-relaxed text-muted">{children}</p>
      <Button variant="secondary" onClick={onVoltar} className="mt-6 h-[52px] w-full text-[15px]">
        Voltar para entrar
      </Button>
    </div>
  );
}
