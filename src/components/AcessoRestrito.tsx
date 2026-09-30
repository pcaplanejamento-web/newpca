import { Button } from "./Button";
import { IconShield } from "./icons";

/** Card padrão para uma tela fechada ao papel/grupo atual — com o caminho de volta (`voltar`: a porta de entrada). */
export function AcessoRestrito({
  mensagem = "Você não tem permissão para acessar esta área.",
  voltar,
}: {
  mensagem?: string;
  /** Link para onde a pessoa pode ir (ex.: a 1ª tela que ela abre); sem ele, nada. */
  voltar?: { href: string; rotulo: string };
}) {
  return (
    <div className="mx-auto max-w-lg rounded-card border border-border bg-surface p-8 text-center shadow-ring">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-card bg-surface-2 text-faint">
        <IconShield className="h-7 w-7" />
      </div>
      <h2 className="mt-4 text-lg font-bold text-text">Acesso restrito</h2>
      <p className="mt-2 text-sm text-muted">{mensagem}</p>
      {voltar && (
        <div className="mt-5 flex justify-center">
          <Button href={voltar.href} variant="secondary" size="sm">
            {voltar.rotulo}
          </Button>
        </div>
      )}
    </div>
  );
}
