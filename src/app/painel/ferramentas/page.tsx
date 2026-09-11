import { IconLayers } from "@/components/icons";
import { LinkCard } from "@/components/LinkCard";

export const dynamic = "force-dynamic";

const FERRAMENTAS = [
  {
    href: "/painel/ferramentas/tabelas",
    titulo: "Tabelas dinâmicas",
    descricao: "Crie listas com colunas personalizáveis (texto, seleção, data, número).",
    Icon: IconLayers,
  },
];

export default function FerramentasPage() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {FERRAMENTAS.map(({ href, titulo, descricao, Icon }) => (
        <LinkCard key={href} href={href} titulo={titulo} descricao={descricao} icon={<Icon className="h-6 w-6" />} />
      ))}
    </div>
  );
}
