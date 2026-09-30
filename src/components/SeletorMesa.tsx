"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { SelectField } from "./Field";
import { IconSpinner } from "./icons";

export type OpcaoMesa = { id: number; nome: string; ano: number | null };

/**
 * SELETOR DE MESA — o 1º item da barra da Mesa principal: "Mesa do sistema" ou a MESA DE UM PCA (fonte Protocolos), a
 * MESMA da aba Mesa do espaço do PCA (colunas, escopo, ações e os marcados conforme a Configuração dele). As mesas seguem
 * independentes — é só a troca de visão (`/painel/mesa?pca=<id>`). Troca navegando, com o spinner até chegar. Só lista as
 * Mesas que o papel ABRE (quem não visualiza o PCA não vê os PCAs; quem não visualiza a Mesa do sistema, só os PCAs); com
 * uma só, não aparece.
 */
export function SeletorMesa({
  pcas,
  atual,
  sistema = true,
  onEscolher,
}: {
  pcas: OpcaoMesa[];
  /** O PCA à vista (`null` = Mesa do sistema). */
  atual: number | null;
  /** A Mesa do sistema está entre as opções (o papel a visualiza). */
  sistema?: boolean;
  /** Troca sem navegar (a demonstração do catálogo); sem ela, navega para `/painel/mesa[?pca=]`. */
  onEscolher?: (pcaId: number | null) => void;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  if ((sistema ? 1 : 0) + pcas.length <= 1) return null;
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <div className="min-w-0 max-w-[16rem]">
        <SelectField
          compacto
          label="Mesa"
          aria-label="Mesa à vista"
          value={atual ?? ""}
          disabled={pendente}
          onChange={(e) => {
            const v = e.target.value;
            if (onEscolher) return onEscolher(v ? Number(v) : null);
            iniciar(() => router.push(v ? `/painel/mesa?pca=${v}` : "/painel/mesa", { scroll: false }));
          }}
        >
          {sistema && <option value="">Mesa do sistema</option>}
          {pcas.map((p) => (
            <option key={p.id} value={p.id}>
              {`PCA · ${p.nome}${p.ano != null ? ` (${p.ano})` : ""}`}
            </option>
          ))}
        </SelectField>
      </div>
      {pendente && <IconSpinner className="h-4 w-4 shrink-0 text-muted" aria-label="Carregando a Mesa" />}
    </div>
  );
}
