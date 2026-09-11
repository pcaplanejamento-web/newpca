"use client";

import { useState, type ComponentProps } from "react";
import { ProtocolosView } from "./ProtocolosView";
import { TabelasIndex } from "./TabelasIndex";
import { IconFile, IconLayers } from "./icons";

type Aba = "protocolos" | "tabelas";

type Props = ComponentProps<typeof ProtocolosView> & {
  abaInicial?: Aba;
};

/** Página de Protocolos com duas visões:
 *  - "Protocolos": módulo curado (ProtocolosView)
 *  - "Tabelas": construtor de tabelas personalizadas (TabelasIndex), como antes. */
export function ProtocolosTabs({ abaInicial = "protocolos", ...viewProps }: Props) {
  const [aba, setAba] = useState<Aba>(abaInicial);

  const opcoesAba: { id: Aba; label: string; Icon: typeof IconFile }[] = [
    { id: "protocolos", label: "Protocolos", Icon: IconFile },
    { id: "tabelas", label: "Tabelas", Icon: IconLayers },
  ];

  return (
    <div className="space-y-5">
      {/* Seletor de abas (touch-friendly, largura total no mobile) */}
      <div className="flex w-full rounded-xl border border-slate-200 bg-slate-100 p-1 sm:w-auto sm:inline-flex dark:border-slate-800 dark:bg-slate-800/50">
        {opcoesAba.map(({ id, label, Icon }) => {
          const ativo = aba === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setAba(id)}
              aria-pressed={ativo}
              className={`inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition sm:flex-none ${
                ativo
                  ? "bg-white text-emerald-700 shadow-sm dark:bg-slate-900 dark:text-emerald-300"
                  : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              <Icon className="h-[18px] w-[18px]" />
              {label}
            </button>
          );
        })}
      </div>

      {aba === "protocolos" ? (
        <ProtocolosView {...viewProps} />
      ) : (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-bold text-slate-800 dark:text-white">
              Tabelas e listas personalizadas
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Crie tabelas com colunas próprias (texto, seleção, data, número) e edite na
              própria linha.
            </p>
          </div>
          <TabelasIndex podeEditar={viewProps.podeEditar} />
        </div>
      )}
    </div>
  );
}
