import Link from "next/link";
import type { FormEvent, ReactNode } from "react";
import { IconAlert, IconCheck } from "./icons";

// A MOLDURA das telas de acesso (login, cadastro, "Esqueci a senha"): o cartão centrado com a marca, o título e o
// subtítulo — a MESMA em todas; o conteúdo vem de cada formulário. 100% por token.

/** O cartão de acesso (um `<form>` quando há `onSubmit` — sem a validação nativa do navegador: as mensagens em pt-BR são
 * as do formulário e do servidor). `etapa` = "Etapa 1 de 2" acima do título. */
export function CartaoAuth({
  titulo,
  subtitulo = "PCA — Prefeitura de Rio Verde",
  etapa,
  onSubmit,
  children,
  largo = false,
}: {
  titulo: string;
  subtitulo?: string;
  etapa?: string;
  onSubmit?: (e: FormEvent) => void;
  children: ReactNode;
  /** Cadastro (mais campos): um pouco mais largo e em 2 colunas a partir do `sm`. */
  largo?: boolean;
}) {
  const cls = `w-full ${largo ? "max-w-lg" : "max-w-sm"} rounded-2xl border border-border bg-surface p-6 shadow-soft sm:p-8`;
  const conteudo = (
    <>
      <div className="mb-6 flex flex-col items-center text-center">
        <div className="grid h-12 w-12 place-items-center rounded-xl bg-text text-base font-black text-surface">RV</div>
        {etapa && <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-faint">{etapa}</p>}
        <h1 className={`${etapa ? "mt-1" : "mt-3"} text-lg font-bold text-text`}>{titulo}</h1>
        <p className="text-xs text-muted">{subtitulo}</p>
      </div>
      {children}
    </>
  );
  return onSubmit ? (
    <form onSubmit={onSubmit} className={cls} noValidate>
      {conteudo}
    </form>
  ) : (
    <div className={cls}>{conteudo}</div>
  );
}

/** A mensagem de erro das telas de acesso. */
export function ErroAuth({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="mt-4 flex items-start gap-2 rounded-control p-3 text-sm"
      style={{
        color: "var(--sit-devolvido)",
        background: "color-mix(in srgb, var(--sit-devolvido) 10%, transparent)",
        border: "1px solid color-mix(in srgb, var(--sit-devolvido) 30%, transparent)",
      }}
    >
      <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

/** O fim de um fluxo de acesso (conta criada, senha redefinida): o selo, a mensagem e o link de volta ao login. */
export function ConcluidoAuth({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 text-center shadow-soft">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-accent-soft text-accent">
        <IconCheck className="h-6 w-6" />
      </div>
      <h2 className="mt-4 text-lg font-bold text-text">{titulo}</h2>
      <p className="mt-2 text-sm text-muted">{children}</p>
      <Link href="/login" className="mt-5 inline-flex min-h-11 items-center text-sm font-semibold text-accent hover:underline">
        Voltar para o login
      </Link>
    </div>
  );
}
