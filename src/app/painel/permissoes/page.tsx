import { redirect } from "next/navigation";

// A tela Permissões saiu: as telas de cada grupo se escolhem no próprio grupo (o link antigo leva aos Grupos).
export default function PermissoesPage() {
  redirect("/painel/grupos");
}
