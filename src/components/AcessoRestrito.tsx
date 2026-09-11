import { IconShield } from "./icons";

/** Card padrão para páginas sem permissão para o papel atual. */
export function AcessoRestrito({
  mensagem = "Você não tem permissão para acessar esta área.",
}: {
  mensagem?: string;
}) {
  return (
    <div className="mx-auto max-w-lg rounded-card border border-border bg-surface p-8 text-center shadow-ring">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-card bg-surface-2 text-faint">
        <IconShield className="h-7 w-7" />
      </div>
      <h2 className="mt-4 text-lg font-bold text-text">Acesso restrito</h2>
      <p className="mt-2 text-sm text-muted">{mensagem}</p>
    </div>
  );
}
