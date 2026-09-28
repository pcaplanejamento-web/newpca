"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { chamarPadronizacao as chamar } from "@/lib/padronizacao-cliente";
import {
  chaveVinculo,
  COR_ESTADO_PRAZO,
  estadoPrazo,
  hrefVinculo,
  MAX_VINCULOS,
  ROTULO_VINCULO,
  rotuloData,
  rotuloDoVinculo,
  TIPOS_VINCULO,
  type TipoVinculo,
  type VinculoTarefa as Vinculo,
} from "@/lib/tarefas-core";
import { Button } from "./Button";
import { IconCirculo, IconCirculoCheck, IconClose, IconLink } from "./icons";
import { Segmented } from "./Segmented";
import { type OpcaoBusca, SeletorBusca } from "./SeletorBusca";

/**
 * Os VÍNCULOS de uma tarefa (vários): PROTOCOLOS, DFDs, PCAs, ORÇAMENTOS e OUTRAS TAREFAS — a ligação entre tarefas vale
 * nos dois sentidos (aparece também na outra). Cada vínculo é um cartão compacto que leva ao alvo (protocolo/DFD abrem o
 * banner na Mesa; a tarefa, o quadro dela com a tarefa aberta) — a tarefa mostra quadro › lista, prazo e se está concluída
 * — com "Desvincular". "Vincular" abre o tipo (`Segmented`) e a busca (`SeletorBusca` — no servidor, até 50, no escopo do
 * usuário). `tarefaId` = a tarefa aberta (não se vincula a ela mesma).
 */
export function VinculosTarefa({
  valor,
  onChange,
  disabled = false,
  tarefaId = null,
  hoje,
}: {
  valor: Vinculo[];
  onChange: (v: Vinculo[]) => void;
  disabled?: boolean;
  tarefaId?: number | null;
  hoje: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [tipo, setTipo] = useState<TipoVinculo>("protocolo");
  const [q, setQ] = useState("");
  const [opcoes, setOpcoes] = useState<(OpcaoBusca & { r: string })[]>([]);
  const [carregando, setCarregando] = useState(false);
  const pedido = useRef(0);

  // A busca vai ao servidor (com uma pausa curta enquanto digita); só vale a resposta MAIS RECENTE.
  useEffect(() => {
    if (!aberto) return;
    const n = ++pedido.current;
    setCarregando(true);
    const t = window.setTimeout(() => {
      chamar<{ opcoes: { id: number; rotulo: string; detalhe: string }[] }>(`/api/tarefas/vinculos?tipo=${tipo}&q=${encodeURIComponent(q)}`)
        .then(
          (j) =>
            n === pedido.current &&
            setOpcoes(j.opcoes.filter((o) => !(tipo === "tarefa" && o.id === tarefaId)).map((o) => ({ valor: String(o.id), rotulo: o.rotulo, detalhe: o.detalhe, r: o.rotulo }))),
        )
        .catch(() => n === pedido.current && setOpcoes([]))
        .finally(() => n === pedido.current && setCarregando(false));
    }, 250);
    return () => window.clearTimeout(t);
  }, [aberto, tipo, q, tarefaId]);

  const cheio = valor.length >= MAX_VINCULOS;
  const ja = new Set(valor.map(chaveVinculo));
  const lista = (
    <ul className="space-y-1.5">
      {valor.map((v) => (
        <li key={chaveVinculo(v)} className="flex items-center gap-2 rounded-control border border-border bg-surface px-2 py-1.5">
          {v.tipo === "tarefa" ? (
            v.concluida ? (
              <IconCirculoCheck className="h-4 w-4 shrink-0" style={{ color: "var(--ok)" }} aria-label="Concluída" />
            ) : (
              <IconCirculo className="h-4 w-4 shrink-0 text-faint" aria-label="Aberta" />
            )
          ) : (
            <IconLink className="h-4 w-4 shrink-0 text-accent" />
          )}
          <Link href={hrefVinculo(v)} className="min-h-11 min-w-0 flex-1 py-1 hover:underline lg:min-h-0">
            <span className={`block truncate text-[13px] font-semibold ${v.rotulo ? "text-text" : "text-muted"} ${v.concluida ? "line-through decoration-faint" : ""}`}>{rotuloDoVinculo(v)}</span>
            {(v.detalhe || v.prazo) && (
              <span className="flex flex-wrap items-center gap-x-2 text-[11.5px] text-muted">
                {v.detalhe && <span className="truncate">{v.detalhe}</span>}
                {v.prazo && (
                  <span className="tabular-nums" style={{ color: COR_ESTADO_PRAZO[estadoPrazo(v.prazo, hoje, !!v.concluida)] }}>
                    {rotuloData(v.prazo, hoje)}
                  </span>
                )}
              </span>
            )}
          </Link>
          {!disabled && (
            <Button
              variant="ghost"
              size="xs"
              aria-label={`Desvincular ${rotuloDoVinculo(v)}`}
              icon={<IconClose className="h-4 w-4" />}
              onClick={() => onChange(valor.filter((x) => chaveVinculo(x) !== chaveVinculo(v)))}
            />
          )}
        </li>
      ))}
    </ul>
  );
  if (disabled) return valor.length ? lista : <p className="text-[12.5px] text-muted">Sem vínculos.</p>;
  if (!aberto)
    return (
      <div className="space-y-2">
        {valor.length > 0 && lista}
        <Button variant="secondary" size="sm" icon={<IconLink className="h-4 w-4" />} disabled={cheio} onClick={() => setAberto(true)}>
          {cheio ? `Até ${MAX_VINCULOS} vínculos` : "Vincular a tarefa, protocolo, DFD, PCA ou orçamento"}
        </Button>
      </div>
    );
  return (
    <div className="space-y-2">
      {valor.length > 0 && lista}
    <div className="space-y-2 rounded-card border border-border p-2">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<TipoVinculo>
          ariaLabel="Vincular a"
          value={tipo}
          onChange={(t) => {
            setTipo(t);
            setQ("");
            setOpcoes([]);
          }}
          options={TIPOS_VINCULO.map((t) => ({ value: t, label: ROTULO_VINCULO[t] }))}
        />
        <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setAberto(false)}>
          Cancelar
        </Button>
      </div>
      <SeletorBusca
        key={tipo}
        opcoes={opcoes}
        valor=""
        ariaLabel={`Escolher ${ROTULO_VINCULO[tipo]}`}
        placeholder={tipo === "protocolo" ? "Nº, Id ou assunto" : tipo === "dfd" ? "Nº do DFD, planejamento ou objeto" : tipo === "tarefa" ? "Título ou nº do ticket" : "Nome ou ano"}
        vazio={carregando ? "Buscando…" : "Nada encontrado"}
        onBusca={setQ}
        onChange={(v) => {
          const o = opcoes.find((x) => x.valor === v);
          if (!o) return;
          const novo: Vinculo = { tipo, id: Number(v), rotulo: tipo === "dfd" ? o.r.replace(/^DFD /, "") : o.r, detalhe: tipo === "tarefa" ? o.detalhe : null };
          if (!ja.has(chaveVinculo(novo))) onChange([...valor, novo]);
          setAberto(false);
        }}
      />
    </div>
    </div>
  );
}
