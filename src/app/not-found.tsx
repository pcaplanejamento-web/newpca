import { Button } from "@/components/Button";
import { IconSearch } from "@/components/icons";

// 404 amigável (App Router): renderizado para rotas inexistentes e `notFound()`.
export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-surface-2 px-6 py-16 text-center">
      <div className="grid h-16 w-16 place-items-center rounded-card bg-accent-soft text-accent">
        <IconSearch className="h-8 w-8" />
      </div>
      <p className="mt-5 text-3xl font-black tracking-tight text-text">404</p>
      <h1 className="mt-1 text-lg font-bold text-text">Página não encontrada</h1>
      <p className="mt-2 max-w-md text-sm text-muted">
        O endereço acessado não existe ou foi movido.
      </p>
      <Button href="/" className="mt-6">
        Ir para o início
      </Button>
    </div>
  );
}
