import { redirect } from "next/navigation";

// Endereço antigo: a biblioteca mora no painel do ADM (o layout do /painel pede o login).
export default function DesignSystemAntigo() {
  redirect("/painel/design-system");
}
