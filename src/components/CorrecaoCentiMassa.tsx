"use client";

import { useMemo, useState } from "react";
import { aceiteVale, lerAceite, type RetratoCenti, tiposDoMotivo } from "@/lib/conferencia-dfd-centi";
import { aplicarCentiPorTipos, planoCorrecao } from "@/lib/correcao-centi-core";
import type { DfdDetalhe } from "@/lib/dfd";
import { detalheParaParseado, diffDfdGravado } from "@/lib/dfd-edicao";
import { num } from "@/lib/format";
import { semMarcas } from "@/lib/sobrescrita-dfd";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { Checkbox } from "./Field";
import { IconAlert, IconCheck, IconMerge } from "./icons";
import { Modal } from "./Modal";
import { Progress } from "./Progress";
import { toast } from "./Toast";

/** Os tipos que a Centi NÃO corrige no DFD (identidade, situação, órgão): tratados um a um no painel da coluna Centi. */
const NAO_CORRIGIVEIS = new Set(["Situação", "Órgão", "Nº do DFD", "Não encontrado na Centi", "Outras"]);

export type DfdCorrecaoMassa = { id: number; numero: string; planejamento: string | null; status: string | null; motivo: string | null; aceite: string | null };

type Falha = { numero: string; motivo: string };

/**
 * CORREÇÃO EM MASSA pela Centi (barra de seleção da Mesa → DFDs): escolhe os TIPOS de divergência e, DFD a DFD, aplica os
 * dados da Centi guardados na conferência só nesses tipos (a MESMA régua do banner), grava o que mudou e refaz a
 * conferência. DFDs convergentes, aceitos (com ressalva) ou sem os tipos escolhidos ficam como estão.
 */
export function CorrecaoCentiMassa({ dfds, onConcluido }: { dfds: DfdCorrecaoMassa[]; onConcluido: () => void }) {
  const [aberto, setAberto] = useState(false);
  const [escolhidos, setEscolhidos] = useState<Set<string>>(new Set());
  const [andamento, setAndamento] = useState<{ feito: number; total: number } | null>(null);
  const [fim, setFim] = useState<{ corrigidos: number; sem: number; falhas: Falha[] } | null>(null);
  // Só os divergentes não aceitos — e, de cada um, os tipos que a Centi corrige.
  const alvos = useMemo(
    () =>
      dfds
        .filter((d) => d.status === "divergente" && !aceiteVale(d.status, d.motivo, lerAceite(d.aceite)))
        .map((d) => ({ ...d, tipos: tiposDoMotivo(d.motivo).filter((t) => !NAO_CORRIGIVEIS.has(t)) }))
        .filter((d) => d.tipos.length),
    [dfds],
  );
  const contagem = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of alvos) for (const t of d.tipos) m.set(t, (m.get(t) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]);
  }, [alvos]);
  const afetados = alvos.filter((d) => d.tipos.some((t) => escolhidos.has(t)));
  const rodando = andamento != null;

  function abrir() {
    setEscolhidos(new Set(contagem.map(([t]) => t)));
    setFim(null);
    setAberto(true);
  }

  async function corrigirUm(d: DfdCorrecaoMassa, tipos: string[]): Promise<"ok" | "sem" | string> {
    const r1 = await fetch(`/api/dfd/${d.id}`);
    const j1 = (await r1.json().catch(() => ({}))) as { ok?: boolean; error?: string; dfd?: DfdDetalhe };
    if (!r1.ok || !j1.ok || !j1.dfd) return j1.error ?? "não foi possível ler o DFD";
    const r2 = await fetch(`/api/dfd/${d.id}/conferencia-centi?retrato=1`);
    const j2 = (await r2.json().catch(() => ({}))) as { ok?: boolean; error?: string; retrato?: RetratoCenti | null };
    if (!r2.ok || !j2.ok) return j2.error ?? "não foi possível ler os dados da Centi";
    if (!j2.retrato) return "sem os dados da Centi guardados — reconfira na Centi";
    const o = j1.dfd;
    const g = detalheParaParseado(o);
    const plano = planoCorrecao(g, j2.retrato, o.anoPca ?? o.protocoloAnoPca ?? null);
    const corrigido = semMarcas(aplicarCentiPorTipos(g, plano, tipos));
    const itensMudaram = JSON.stringify(corrigido.itens) !== JSON.stringify(g.itens);
    const body = diffDfdGravado(o, corrigido, o.reparticaoId, itensMudaram);
    if (!Object.keys(body).length) return "sem";
    if (itensMudaram && corrigido.itens.length === 0) return "a Centi não tem itens — corrija no banner do DFD";
    const r3 = await fetch(`/api/dfd/${d.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...body, atualizadoEmLido: o.atualizadoEm ?? undefined }),
    });
    const j3 = (await r3.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!r3.ok || !j3.ok) return j3.error ?? `não foi possível gravar (HTTP ${r3.status})`;
    await fetch(`/api/dfd/${d.id}/conferencia-centi`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ acao: "recalcular" }),
    }).catch(() => undefined);
    return "ok";
  }

  async function corrigir() {
    const lista = afetados;
    if (!lista.length) return;
    const tipos = [...escolhidos];
    const falhas: Falha[] = [];
    let corrigidos = 0;
    let sem = 0;
    setAndamento({ feito: 0, total: lista.length });
    for (let i = 0; i < lista.length; i++) {
      const d = lista[i];
      try {
        const r = await corrigirUm(d, tipos);
        if (r === "ok") corrigidos++;
        else if (r === "sem") sem++;
        else falhas.push({ numero: d.numero, motivo: r });
      } catch {
        falhas.push({ numero: d.numero, motivo: "sem conexão com o sistema" });
      }
      setAndamento({ feito: i + 1, total: lista.length });
    }
    setAndamento(null);
    setFim({ corrigidos, sem, falhas });
    if (corrigidos) toast.success(`${num(corrigidos)} DFD(s) corrigido(s) pela Centi.`);
    onConcluido();
  }

  if (!contagem.length) return null;
  return (
    <>
      <Button size="sm" variant="secondary" icon={<IconMerge className="h-4 w-4" />} onClick={abrir} title="Aplicar os dados da Centi nos DFDs selecionados, por tipo de divergência">
        Usar a Centi em…
      </Button>
      <Modal
        open={aberto}
        onClose={() => !rodando && setAberto(false)}
        titulo="Corrigir pela Centi em massa"
        size="md"
        bloqueado={rodando}
        rodape={
          rodando ? (
            <Progress value={(andamento.feito / Math.max(1, andamento.total)) * 100} label={`Corrigindo ${num(andamento.feito)} de ${num(andamento.total)} DFDs…`} />
          ) : fim ? (
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setAberto(false)}>
                Fechar
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[12.5px] text-muted">{num(afetados.length)} DFD(s) serão corrigidos</span>
              <div className="flex gap-1.5">
                <Button size="sm" variant="ghost" onClick={() => setAberto(false)}>
                  Cancelar
                </Button>
                <Button size="sm" icon={<IconCheck className="h-4 w-4" />} disabled={!afetados.length} onClick={() => void corrigir()}>
                  Corrigir {num(afetados.length)} DFD(s)
                </Button>
              </div>
            </div>
          )
        }
      >
        {fim ? (
          <div className="space-y-3">
            <Callout kind={fim.falhas.length ? "warn" : "ok"} icon={fim.falhas.length ? <IconAlert className="h-5 w-5" /> : <IconCheck className="h-5 w-5" />}>
              {num(fim.corrigidos)} corrigido(s){fim.sem ? ` · ${num(fim.sem)} já sem diferença nos tipos escolhidos` : ""}
              {fim.falhas.length ? ` · ${num(fim.falhas.length)} não corrigido(s)` : ""}.
            </Callout>
            {fim.falhas.length > 0 && (
              <ul className="max-h-[40vh] space-y-1 overflow-y-auto text-[12.5px]">
                {fim.falhas.map((f) => (
                  <li key={f.numero} className="rounded-control bg-surface-2 px-2 py-1.5">
                    <strong className="text-text">DFD {f.numero}</strong> — <span className="text-text-2">{f.motivo}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-[13px] text-text-2">
              Escolha os tipos de divergência em que os dados da Centi (os guardados na última conferência) substituem os do sistema. O restante de cada
              DFD fica como está; o histórico registra a correção e a conferência é refeita.
            </p>
            <fieldset className="flex flex-col items-start gap-1">
              <legend className="mb-1 text-[13px] font-semibold text-text">Tipos de divergência</legend>
              {contagem.map(([t, n]) => (
                <Checkbox
                  key={t}
                  label={`${t} (${num(n)} DFD${n === 1 ? "" : "s"})`}
                  checked={escolhidos.has(t)}
                  disabled={rodando}
                  onChange={(e) =>
                    setEscolhidos((s) => {
                      const x = new Set(s);
                      if (e.target.checked) x.add(t);
                      else x.delete(t);
                      return x;
                    })
                  }
                />
              ))}
            </fieldset>
            {dfds.length > alvos.length && (
              <p className="text-[12px] text-muted">
                {num(dfds.length - alvos.length)} selecionado(s) fora: convergentes, aceitos, não conferidos ou só com divergências tratadas no painel da
                coluna Centi (situação, órgão, nº do DFD).
              </p>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
