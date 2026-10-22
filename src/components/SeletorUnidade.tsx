"use client";

import { useState } from "react";
import { Dropdown } from "./Dropdown";
import { IconBuilding, IconCheck, IconLock, IconSpinner } from "./icons";
import { SetaDropdown } from "./SetaDropdown";

export type UnidadeOpcao = { id: number; codigo: string; nome: string };

function semAcento(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * O SELETOR DE UNIDADE do cabeçalho — o MESMO no painel (a unidade ativa) e na tela pública (o filtro do PCA): gatilho na
 * altura dos controles do cabeçalho e a lista com busca (acima de 8), a SIGLA em cima e o NOME embaixo. `todas` = a opção
 * "todas as unidades" no topo (id `null`).
 */
export function SeletorUnidade({
  unidades,
  ativaId,
  onEscolher,
  trocando = false,
  todas,
  travado,
}: {
  unidades: UnidadeOpcao[];
  ativaId: number | null;
  onEscolher: (id: number | null, fechar: () => void) => void;
  trocando?: boolean;
  todas?: string;
  /** O grupo pôs esta aba na SOMA das unidades da pessoa: o seletor não escolhe — mostra o texto (o motivo na dica). */
  travado?: string;
}) {
  const ativa = unidades.find((u) => u.id === ativaId);
  if (travado)
    return (
      <span
        className="inline-flex h-11 items-center gap-1.5 rounded-chip border border-border-2 bg-surface-2 px-3 text-[13px] font-medium text-muted lg:h-[var(--h-control-sm)]"
        title="Nesta tela, os dados somam todas as suas unidades (definido no grupo)."
      >
        <IconLock className="h-3.5 w-3.5 opacity-70" />
        <span className="whitespace-nowrap">{travado}</span>
      </span>
    );
  const rotulo = ativa?.nome ?? todas ?? unidades[0]?.nome ?? "";
  return (
    <Dropdown
      align="start"
      ariaLabel={`Unidade: ${rotulo}`}
      triggerClassName="gap-1.5 rounded-chip border border-border-2 bg-surface px-3 h-11 text-[13px] font-medium text-text-2 hover:bg-surface-2 lg:h-[var(--h-control-sm)]"
      width={340}
      trigger={
        <>
          {trocando ? <IconSpinner className="h-3.5 w-3.5" /> : <IconBuilding className="h-3.5 w-3.5 opacity-70" />}
          <span className="max-w-[9rem] truncate sm:max-w-none sm:whitespace-nowrap" title={rotulo}>
            {ativa?.codigo && todas ? ativa.codigo : rotulo}
          </span>
          <SetaDropdown className="h-3.5 w-3.5 opacity-60" />
        </>
      }
    >
      {(fechar) => <ListaUnidades unidades={unidades} ativaId={ativa ? ativa.id : todas ? null : (unidades[0]?.id ?? null)} todas={todas} onEscolher={(id) => onEscolher(id, fechar)} />}
    </Dropdown>
  );
}

function ListaUnidades({
  unidades,
  ativaId,
  todas,
  onEscolher,
}: {
  unidades: UnidadeOpcao[];
  ativaId: number | null;
  todas?: string;
  onEscolher: (id: number | null) => void;
}) {
  const [q, setQ] = useState("");
  const termo = semAcento(q.trim());
  const visiveis = termo ? unidades.filter((r) => semAcento(`${r.codigo} ${r.nome}`).includes(termo)) : unidades;
  const linha = (ativa: boolean) =>
    `flex min-h-11 w-full items-center gap-2.5 rounded-control px-2.5 py-1.5 text-left lg:min-h-0 ${ativa ? "bg-accent-soft text-accent" : "text-text-2 hover:bg-surface-2"}`;
  return (
    <div className="flex max-h-[min(70vh,440px)] w-full flex-col">
      {unidades.length > 8 && (
        <div className="border-b border-border p-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && visiveis.length === 1) onEscolher(visiveis[0].id);
            }}
            aria-label="Buscar unidade por sigla ou nome"
            placeholder="Buscar sigla ou nome"
            className="h-11 w-full rounded-control border border-border-2 bg-surface px-2.5 text-[13px] text-text outline-none focus-visible:ring-2 focus-visible:ring-accent/40 lg:h-[var(--h-control-sm)]"
          />
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        {todas && !termo && (
          <button type="button" onClick={() => onEscolher(null)} className={linha(ativaId == null)}>
            <span className={`min-w-0 flex-1 break-words text-[13px] ${ativaId == null ? "font-semibold" : "font-medium text-text"}`}>{todas}</span>
            {ativaId == null && <IconCheck className="h-4 w-4 shrink-0" />}
          </button>
        )}
        {visiveis.map((r) => {
          const ativa = r.id === ativaId;
          const mesmo = semAcento(r.codigo) === semAcento(r.nome);
          return (
            <button key={r.id} type="button" onClick={() => onEscolher(r.id)} className={linha(ativa)}>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className={`break-words text-[13px] ${ativa ? "font-semibold" : "font-medium text-text"}`}>{r.codigo}</span>
                {!mesmo && <span className={`break-words text-[11px] leading-snug ${ativa ? "text-accent/80" : "text-faint"}`}>{r.nome}</span>}
              </span>
              {ativa && <IconCheck className="h-4 w-4 shrink-0" />}
            </button>
          );
        })}
        {visiveis.length === 0 && <div className="px-3 py-4 text-center text-[12px] text-faint">Nenhuma unidade encontrada</div>}
      </div>
    </div>
  );
}
