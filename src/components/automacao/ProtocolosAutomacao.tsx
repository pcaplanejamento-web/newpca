"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { ProtocoloAutomacao } from "@/lib/automacao-centi-core";
import type { EstadoDfd, LinhaDfd } from "@/lib/automacao-dfds-motor";
import { brl, dataHoraBR, numeroSemAno } from "@/lib/format";
import { type Pessoa, rotuloOpcaoPessoa } from "@/lib/pessoa";
import { CelulaCopiavel } from "../BotaoCopiar";
import type { Column } from "../DataTable";
import { EstadoPonto } from "../EstadoCelula";
import { IconPasta, IconUserX } from "../icons";
import { Progress } from "../Progress";
import { type OpcaoCelula, SeletorCelula } from "../SeletorCelula";
import { type ExtraPessoa, SeletorPessoa } from "../SeletorPessoa";
import { toast } from "../Toast";

/*
 * As peças da AUTOMAÇÃO de DFDs usadas pelos componentes de fluxo: as colunas dos protocolos do sistema (+ a gestão da
 * Mesa — Situação e Responsável na célula) e a ANÁLISE de cada DFD (prévia, andamento ao vivo e resultado).
 */

type Estado = EstadoDfd;
type Linha = LinhaDfd;
const COR: Record<Estado, string> = { fila: "var(--muted)", baixando: "var(--info)", ok: "var(--ok)", falha: "var(--danger)", pulado: "var(--warn)", repetido: "var(--warn)" };
const ROTULO: Record<Estado, string> = { fila: "Na fila", baixando: "Baixando…", ok: "Salvo", falha: "Falhou", pulado: "Sem planejamento", repetido: "Não baixado" };

const semPlan = (p: ProtocoloAutomacao) => p.dfds.filter((d) => !/[1-9]/.test(d.planejamento ?? "")).length;
const texto1 = (v: string | null) => (
  <span className="line-clamp-1" title={v ?? ""}>
    {v || "—"}
  </span>
);

export const COLUNAS_PROTOCOLOS: Column<ProtocoloAutomacao>[] = [
  {
    key: "numero",
    header: "Nº protocolo",
    nowrap: true,
    value: (p) => p.numero,
    render: (p) => (
      <CelulaCopiavel copiar={numeroSemAno(p.numero)} rotulo="nº do protocolo">
        <span className="font-semibold text-text">{p.numero}</span>
      </CelulaCopiavel>
    ),
  },
  {
    key: "id",
    header: "Id",
    nowrap: true,
    value: (p) => p.idExterno ?? "—",
    render: (p) => <CelulaCopiavel copiar={p.idExterno} rotulo="Id do protocolo">{p.idExterno ?? "—"}</CelulaCopiavel>,
  },
  { key: "data", header: "Data", nowrap: true, value: (p) => dataHoraBR(p.criadoEm), render: (p) => dataHoraBR(p.criadoEm) || "—" },
  { key: "sigla", header: "Sigla", nowrap: true, value: (p) => p.sigla ?? "—", render: (p) => p.sigla ?? "—" },
  { key: "assunto", header: "Assunto", minWidth: 180, align: "left", value: (p) => p.assunto ?? "—", render: (p) => texto1(p.assunto) },
  { key: "interessado", header: "Interessado", minWidth: 220, align: "left", value: (p) => p.interessado ?? "—", render: (p) => texto1(p.interessado) },
  { key: "pca", header: "PCA", nowrap: true, value: (p) => (p.anoPca ? String(p.anoPca) : "—"), render: (p) => (p.anoPca ? String(p.anoPca) : "—") },
  { key: "local", header: "Local", nowrap: true, value: (p) => p.pca ?? "Mesa do sistema", render: (p) => p.pca ?? "Mesa do sistema" },
  {
    key: "dfds",
    header: "DFDs",
    nowrap: true,
    filter: "range",
    numero: (p) => p.dfds.length,
    formatarFaixa: (n) => String(n),
    value: (p) => String(p.dfds.length),
    render: (p) => <span className="tabular-nums">{p.dfds.length}</span>,
  },
  {
    key: "semplan",
    header: "Sem planej.",
    nowrap: true,
    value: (p) => (semPlan(p) ? "Com DFD sem planejamento" : "Todos com planejamento"),
    render: (p) => (semPlan(p) ? <span className="font-semibold text-[var(--warn)]">{semPlan(p)}</span> : <span className="text-muted">0</span>),
  },
  {
    key: "itens",
    header: "Itens",
    nowrap: true,
    filter: "range",
    numero: (p) => p.itens,
    formatarFaixa: (n) => String(n),
    value: (p) => String(p.itens),
    render: (p) => <span className="tabular-nums">{p.itens}</span>,
  },
  {
    key: "valor",
    header: "Valor",
    nowrap: true,
    align: "right",
    filter: "range",
    numero: (p) => p.valor,
    value: (p) => brl(p.valor),
    render: (p) => <span className="tabular-nums">{brl(p.valor)}</span>,
  },
];


/** A ANÁLISE ao lado: cada DFD do que vai ser baixado (por pasta), com o estado — antes, durante e depois. */
export function AnaliseDfds({ linhas, rodando, destino }: { linhas: Linha[]; rodando: boolean; destino: string | null }) {
  const rotuloOk = destino ? "Anexado" : ROTULO.ok;
  const grupos = useMemo(() => {
    const m = new Map<string, Linha[]>();
    for (const l of linhas) m.set(l.grupo, [...(m.get(l.grupo) ?? []), l]);
    return [...m.entries()];
  }, [linhas]);
  const validas = linhas.filter((l) => l.estado !== "pulado" && l.estado !== "repetido");
  const feitos = validas.filter((l) => l.estado === "ok" || l.estado === "falha").length;
  const ok = validas.filter((l) => l.estado === "ok").length;
  const falhas = validas.length - ok - validas.filter((l) => l.estado === "fila" || l.estado === "baixando").length;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="min-w-0 truncate text-sm font-semibold text-text" title={destino ?? undefined}>
          DFDs{destino ? ` · ${destino}` : ""}
        </h3>
        <span className="text-sm tabular-nums text-muted">
          {validas.length} DFD(s){falhas ? ` · ${falhas} falha(s)` : ""}
        </span>
      </div>
      {(rodando || feitos > 0) && (
        <Progress value={validas.length ? (feitos / validas.length) * 100 : 0} label={`${ok} ${destino ? "anexado(s)" : "salvo(s)"} de ${validas.length}`} />
      )}
      {linhas.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">Nada escolhido.</p>
      ) : (
        <ul className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          {grupos.map(([g, ls]) => (
            <li key={g} className="space-y-1">
              {g && (
                <div className="flex items-center gap-2 text-sm">
                  <IconPasta className="h-4 w-4 shrink-0 text-muted" />
                  <span className="min-w-0 flex-1 truncate font-semibold text-text" title={g}>
                    {g}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted">
                    {ls.filter((l) => l.estado === "ok").length}/{ls.filter((l) => l.estado !== "pulado" && l.estado !== "repetido").length}
                  </span>
                </div>
              )}
              {ls.map((l) => (
                <div key={l.chave} className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm ${g ? "pl-6" : ""}`}>
                  <span className="font-medium tabular-nums text-text">{l.id ? `Planej. ${l.id}` : "—"}</span>
                  {l.dfd && <span className="tabular-nums text-muted">DFD {l.dfd}</span>}
                  {l.orgaoNome && (
                    <span className="min-w-0 max-w-40 truncate text-xs text-muted" title={l.orgaoNome}>
                      {l.orgaoNome}
                      {l.entidade ? ` · ${l.entidade}` : ""}
                    </span>
                  )}
                  <span className="ml-auto">
                    <EstadoPonto cor={COR[l.estado]} rotulo={l.estado === "ok" ? rotuloOk : ROTULO[l.estado]} />
                  </span>
                  {l.erro && <span className="w-full text-xs text-muted">{l.erro}</span>}
                  {l.amostra && <code className="w-full break-all rounded bg-surface-2 p-2 text-[12px] text-text-2">{l.amostra}</code>}
                </div>
              ))}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}


/** A gestão do protocolo na tabela (a MESMA da Mesa): as pessoas do grupo ativo (designáveis), as gravadas de fora dele
 * (só exibidas), as situações do ADM e quem está usando. */
export type GestaoAutomacao = { pessoas: Pessoa[]; outras: Pessoa[]; situacoes: OpcaoCelula[]; usuarioId: number };
type ValoresGestao = { responsavelId?: number | null; situacaoId?: number | null };
const EXTRAS_CELULA: ExtraPessoa[] = [{ valor: "", rotulo: "Sem responsável", icone: <IconUserX className="h-4 w-4" /> }];

/** As colunas Situação e Responsável da Mesa: na célula, gravam na hora (otimista; falhou, volta e avisa). */
export function useColunasGestao(gestao: GestaoAutomacao): Column<ProtocoloAutomacao>[] {
  const router = useRouter();
  const [mudado, setMudado] = useState<Map<number, ValoresGestao>>(new Map());
  const [salvando, setSalvando] = useState<Set<string>>(new Set());
  // Recarregou do servidor: os valores otimistas saem (vale o gravado).
  // biome-ignore lint/correctness/useExhaustiveDependencies: zera só quando as listas do servidor mudam.
  useEffect(() => setMudado(new Map()), [gestao]);
  const dir = useMemo(() => new Map([...gestao.outras, ...gestao.pessoas].map((p) => [p.id, p])), [gestao]);
  const situacaoPorId = useMemo(() => new Map(gestao.situacoes.map((x) => [x.id, x])), [gestao]);
  const valor = (p: ProtocoloAutomacao, campo: keyof ValoresGestao) => {
    const m = mudado.get(p.id);
    return m && campo in m ? (m[campo] ?? null) : p[campo];
  };
  const pessoa = (id: number | null): Pessoa | null => (id == null ? null : (dir.get(id) ?? { id, nome: `#${id}`, apelido: null, foto: null }));

  async function alterar(p: ProtocoloAutomacao, campo: keyof ValoresGestao, v: number | null) {
    const k = `${p.id}:${campo}`;
    setSalvando((s) => new Set(s).add(k));
    setMudado((m) => new Map(m).set(p.id, { ...m.get(p.id), [campo]: v }));
    try {
      const res = await fetch(`/api/protocolo/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [campo]: v, origem: "celula" }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error ?? `falha ao salvar (HTTP ${res.status})`);
      router.refresh();
    } catch (e) {
      setMudado((m) => {
        const n = new Map(m);
        const g = { ...n.get(p.id) };
        delete g[campo];
        n.set(p.id, g);
        return n;
      });
      toast.error(`Protocolo ${p.numero}: ${e instanceof TypeError ? "sem conexão com o servidor" : e instanceof Error ? e.message : "falha ao salvar"}.`);
    } finally {
      setSalvando((s) => {
        const n = new Set(s);
        n.delete(k);
        return n;
      });
    }
  }

  return [
    {
      key: "situacao",
      header: "Situação",
      nowrap: true,
      value: (r) => {
        const id = valor(r, "situacaoId");
        return id == null ? "Sem situação" : (situacaoPorId.get(id)?.nome ?? "Sem situação");
      },
      render: (r) => (
        <SeletorCelula
          valor={valor(r, "situacaoId")}
          opcoes={gestao.situacoes}
          onChange={gestao.situacoes.length > 0 ? (v) => alterar(r, "situacaoId", v) : undefined}
          vazio="Sem situação"
          salvando={salvando.has(`${r.id}:situacaoId`)}
          ariaLabel={`Situação do protocolo ${r.numero}`}
        />
      ),
    },
    {
      key: "responsavel",
      header: "Responsável",
      nowrap: true,
      // Filtro/ordem pelo "apelido — nome" (duas pessoas com o mesmo apelido não viram uma só opção).
      value: (r) => {
        const p = pessoa(valor(r, "responsavelId"));
        return p ? rotuloOpcaoPessoa(p) : "Sem responsável";
      },
      render: (r) => {
        const p = pessoa(valor(r, "responsavelId"));
        return (
          <SeletorPessoa
            variante="celula"
            rotulo="Responsável"
            ariaLabel={`Responsável pelo protocolo ${r.numero}`}
            pessoas={gestao.pessoas}
            usuarioId={gestao.usuarioId}
            valor={p ? String(p.id) : ""}
            atual={p}
            extras={EXTRAS_CELULA}
            salvando={salvando.has(`${r.id}:responsavelId`)}
            onChange={(v) => alterar(r, "responsavelId", v ? Number(v) : null)}
          />
        );
      },
    },
  ];
}

