"use client";

import { useRef } from "react";
import { definirEscopo, vigiarGravacoes } from "@/lib/dados-cliente";

/**
 * O ESCOPO dos dados guardados no navegador (sem UI; layout do painel): a pessoa e a ASSINATURA do acesso dela (papel,
 * grupo, unidades, telas — calculada no servidor). Definido NO DESENHO (antes de qualquer tela filha pedir dados);
 * outra pessoa = o guardado das demais sai. `guardar` = o interruptor do ADM (Configurações → Tabelas).
 */
export function EscopoCliente({ pessoa, assinatura, guardar }: { pessoa: number; assinatura: string; guardar: boolean }) {
  const visto = useRef("");
  const k = `${pessoa}|${assinatura}|${guardar ? 1 : 0}`;
  if (typeof window !== "undefined" && visto.current !== k) {
    visto.current = k;
    definirEscopo({ pessoa, assinatura }, guardar);
    vigiarGravacoes();
  }
  return null;
}
