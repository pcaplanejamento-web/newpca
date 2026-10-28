"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { brl, dataBR, dataIsoBrasilia, num } from "@/lib/format";
import {
  CAMPOS,
  type CampoMesa,
  chaveColuna,
  ENTIDADES_DA_TABELA,
  type EntidadeCampos,
  GRUPO_ENTIDADE,
  lerChaveColuna,
  MAX_CAMPOS_PEDIDO,
  MAX_IDS_CAMPOS,
} from "@/lib/mesa-campos-core";
import type { TabelaMesa } from "@/lib/papeis-detalhes-core";
import { CelulaTexto } from "./CelulaLista";
import type { Column } from "./DataTable";

type Valor = string | number | null;
/** O que já chegou de cada linha: campo → valor (ausente = ainda não pedido). */
type Guardados = Map<number, Map<string, Valor>>;

/**
 * Os CAMPOS EXTRAS de uma entidade (protocolo ou DFD) para as colunas LIGADAS: pede ao servidor (`POST /api/mesa/campos`)
 * só os campos que faltam dos ids dados, em fatias de 500 — sem coluna extra ligada, nada é pedido. `versao` = a carga
 * das listas (recarregou, os guardados recomeçam). Devolve o lido (`undefined` = ainda chegando).
 */
export function useCamposMesa(entidade: EntidadeCampos, ids: readonly number[], campos: readonly string[], versao: unknown) {
  const guardados = useRef<{ versao: unknown; dados: Guardados }>({ versao, dados: new Map() });
  if (guardados.current.versao !== versao) guardados.current = { versao, dados: new Map() };
  const [rodada, setRodada] = useState(0);
  const chaveCampos = campos.join("|");
  // biome-ignore lint/correctness/useExhaustiveDependencies: pede quando os ids, os campos ou a carga MUDAM.
  useEffect(() => {
    if (!campos.length || !ids.length) return;
    const dados = guardados.current.dados;
    const faltam = ids.filter((id) => {
      const m = dados.get(id);
      return !m || campos.some((c) => !m.has(c));
    });
    if (!faltam.length) return;
    let vivo = true;
    const pedir = campos.slice(0, MAX_CAMPOS_PEDIDO);
    void (async () => {
      for (let i = 0; i < faltam.length && vivo; i += MAX_IDS_CAMPOS) {
        const fatia = faltam.slice(i, i + MAX_IDS_CAMPOS);
        const r = await fetch("/api/mesa/campos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entidade, ids: fatia, campos: pedir }),
        }).catch(() => null);
        const j = (await r?.json().catch(() => null)) as { ok?: boolean; campos?: string[]; linhas?: [number, ...Valor[]][] } | null;
        if (!vivo || !j?.ok) return;
        const recebidos = j.campos ?? [];
        // O que não voltou (o papel não recebe ou a linha não é legível) fica vazio — não é pedido de novo.
        for (const id of fatia) {
          const m = dados.get(id) ?? new Map<string, Valor>();
          for (const c of pedir) if (!m.has(c)) m.set(c, null);
          dados.set(id, m);
        }
        for (const [id, ...vals] of j.linhas ?? []) {
          const m = dados.get(id) as Map<string, Valor>;
          for (const [k, c] of recebidos.entries()) m.set(c, vals[k] ?? null);
        }
        setRodada((n) => n + 1);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [entidade, ids, chaveCampos, versao]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a `rodada` marca a chegada de dados novos.
  return useMemo(() => {
    const dados = guardados.current.dados;
    return (id: number | null | undefined, campo: string): Valor | undefined => (id == null ? null : dados.get(id)?.get(campo));
  }, [rodada, versao]);
}

/** As colunas extras LIGADAS de uma tabela, separadas por entidade (o que pedir ao servidor). */
export function camposLigados(visiveis: readonly string[]): Record<EntidadeCampos, string[]> {
  const out: Record<EntidadeCampos, string[]> = { protocolo: [], dfd: [] };
  for (const k of visiveis) {
    const c = lerChaveColuna(k);
    if (c) out[c.entidade].push(c.campo);
  }
  return out;
}

const texto = (v: Valor | undefined) => (v == null ? "" : String(v));

function coluna<R>(e: EntidadeCampos, c: CampoMesa, ler: (r: R) => Valor | undefined): Column<R> {
  const base = { key: chaveColuna(e, c.chave), header: c.rotulo, grupo: GRUPO_ENTIDADE[e] };
  const carregando = <span className="text-faint">…</span>;
  const vazio = <span className="text-faint">—</span>;
  if (c.tipo === "moeda" || c.tipo === "numero") {
    const n = (r: R) => {
      const v = ler(r);
      return typeof v === "number" ? v : null;
    };
    return {
      ...base,
      align: c.tipo === "moeda" ? "right" : "center",
      nowrap: true,
      filter: "range",
      numero: (r: R) => n(r),
      formatarFaixa: c.tipo === "moeda" ? undefined : num,
      value: (r: R) => texto(ler(r)),
      ...(c.tipo === "moeda" ? {} : { total: false as const }),
      render: (r: R) => {
        const v = ler(r);
        return v === undefined ? carregando : n(r) == null ? vazio : c.tipo === "moeda" ? brl(n(r)) : String(n(r));
      },
    };
  }
  if (c.tipo === "data")
    return {
      ...base,
      nowrap: true,
      filter: "date",
      value: (r: R) => {
        const v = ler(r);
        return typeof v === "string" ? dataIsoBrasilia(v) : "";
      },
      render: (r: R) => {
        const v = ler(r);
        return v === undefined ? carregando : typeof v === "string" && v ? dataBR(dataIsoBrasilia(v)) : vazio;
      },
    };
  return {
    ...base,
    minWidth: c.tipo === "longo" ? 260 : 160,
    value: (r: R) => texto(ler(r)) || "—",
    render: (r: R) => {
      const v = ler(r);
      return v === undefined ? carregando : <CelulaTexto texto={texto(v)} />;
    },
  };
}

/**
 * As COLUNAS EXTRAS de uma tabela da Mesa (todas — abrem ocultas; o seletor de colunas as liga): as da entidade da linha e
 * as das relações (DFD → protocolo de origem; item → DFD e protocolo). `idDe` dá o id da entidade de cada linha.
 */
export function colunasCamposMesa<R>(
  tabela: TabelaMesa,
  idDe: (r: R, e: EntidadeCampos) => number | null | undefined,
  valor: Record<EntidadeCampos, (id: number | null | undefined, campo: string) => Valor | undefined>,
  semCampos: ReadonlySet<string>,
): Column<R>[] {
  return (ENTIDADES_DA_TABELA[tabela] ?? []).flatMap((e) =>
    CAMPOS[e].filter((c) => !semCampos.has(chaveColuna(e, c.chave))).map((c) => coluna<R>(e, c, (r) => valor[e](idDe(r, e), c.chave))),
  );
}
