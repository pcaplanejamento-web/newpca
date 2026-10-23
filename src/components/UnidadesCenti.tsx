"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { OrgaoDoCadastro, UnidadeDoCadastro } from "@/lib/centi-apis-core";
import { rotuloUnidadeCenti, sugestoesPorSigla, type UnidadeCenti } from "@/lib/centi-unidades-core";
import { dataHoraBR } from "@/lib/format";
import { Ajuda } from "./Ajuda";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { CelulaTexto } from "./CelulaLista";
import { useConfirmacao } from "./Confirmacao";
import { type Column, DataTable } from "./DataTable";
import { ErroCarga } from "./ErroCarga";
import { SecaoBanner } from "./SecaoBanner";
import { type OpcaoCelula, SeletorCelula } from "./SeletorCelula";
import { SkeletonLinhas } from "./Skeleton";
import { StatMini } from "./StatMini";
import { toast } from "./Toast";

/**
 * UNIDADES DA CENTI × CADASTRO (contêiner, no editor das APIs importáveis): cada par "Órgão gestor" + "Unidade
 * orçamentária" que as leituras trouxeram é VINCULADO a um órgão de Órgãos e Unidades (o órgão inteiro) ou a UMA unidade
 * dele. Só os registros de unidade vinculada são gravados; tirar o vínculo APAGA os gravados dela (confirma antes). O
 * mesmo registro vale para empenhos, liquidações e pagamentos.
 *
 * No seletor da célula, o ÓRGÃO inteiro é o id NEGATIVO e a unidade, o positivo (o `SeletorCelula` só leva números).
 */

const num = (n: number) => n.toLocaleString("pt-BR");

type Dados = UnidadeCenti[];

async function gravar(vinculos: { id: number; orgaoId: number | null; reparticaoId: number | null }[]): Promise<{ unidades: Dados; alterados: number; apagados: number }> {
  const r = await fetch("/api/admin/centi-unidades", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vinculos }) });
  const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; unidades?: Dados; alterados?: number; apagados?: number };
  if (!r.ok || !j.ok) throw new Error(j.error ?? `Falha (${r.status}).`);
  return { unidades: j.unidades ?? [], alterados: j.alterados ?? 0, apagados: j.apagados ?? 0 };
}

export function UnidadesCenti({ orgaos, unidades, versao }: { orgaos: OrgaoDoCadastro[]; unidades: UnidadeDoCadastro[]; versao: number }) {
  const [lista, setLista] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState<number | "sugestoes" | null>(null);
  const { confirmar, confirmacao } = useConfirmacao();

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const r = await fetch("/api/admin/centi-unidades");
      const j = (await r.json()) as { ok?: boolean; error?: string; unidades?: Dados };
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Erro ao carregar as unidades da Centi.");
      setLista(j.unidades ?? []);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar as unidades da Centi.");
    }
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `versao` muda quando uma leitura termina — recarrega.
  useEffect(() => {
    void carregar();
  }, [carregar, versao]);

  /** As opções: cada órgão (o inteiro, id negativo) seguido das unidades dele. */
  const opcoes = useMemo<OpcaoCelula[]>(() => {
    const r: OpcaoCelula[] = [];
    for (const o of orgaos) {
      r.push({ id: -o.id, nome: `${o.sigla} — órgão inteiro` });
      for (const u of unidades.filter((x) => x.orgaoId === o.id)) r.push({ id: u.id, nome: `${o.sigla} › ${u.codigo} — ${u.nome}` });
    }
    return r;
  }, [orgaos, unidades]);
  const orgaoDaUnidade = useMemo(() => new Map(unidades.map((u) => [u.id, u.orgaoId])), [unidades]);
  const sugestoes = useMemo(() => (lista ? sugestoesPorSigla(lista, { orgaos, unidades }) : []), [lista, orgaos, unidades]);

  async function aplicar(vinculos: { id: number; orgaoId: number | null; reparticaoId: number | null }[], qual: number | "sugestoes") {
    setSalvando(qual);
    try {
      const r = await gravar(vinculos);
      setLista(r.unidades);
      toast.success(`${num(r.alterados)} vínculo${r.alterados === 1 ? "" : "s"} gravado${r.alterados === 1 ? "" : "s"}${r.apagados ? ` — ${num(r.apagados)} empenho(s) da unidade desvinculada apagado(s)` : ""}. O que entrar agora chega na próxima importação.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gravar o vínculo.");
    } finally {
      setSalvando(null);
    }
  }

  async function escolher(u: UnidadeCenti, valor: number | null) {
    const v = valor == null ? { orgaoId: null, reparticaoId: null } : valor < 0 ? { orgaoId: -valor, reparticaoId: null } : { orgaoId: orgaoDaUnidade.get(valor) ?? null, reparticaoId: valor };
    if (v.orgaoId == null && u.gravados > 0) {
      const ok = await confirmar({
        titulo: "Tirar o vínculo desta unidade?",
        texto: `${rotuloUnidadeCenti(u)}: os ${num(u.gravados)} empenho(s) gravados dela são APAGADOS do banco e as próximas importações não a gravam. Vincular de novo e importar traz tudo de volta.`,
        confirmar: "Tirar o vínculo",
        perigo: true,
      });
      if (!ok) return;
    }
    await aplicar([{ id: u.id, ...v }], u.id);
  }

  const valorDe = (u: UnidadeCenti) => (u.reparticaoId != null ? u.reparticaoId : u.orgaoId != null ? -u.orgaoId : null);
  const rotuloDe = (u: UnidadeCenti) => {
    const v = valorDe(u);
    return v == null ? "Sem vínculo" : (opcoes.find((o) => o.id === v)?.nome ?? `#${v}`);
  };

  const colunas: Column<UnidadeCenti>[] = [
    { key: "og", header: "Órgão gestor (Centi)", nowrap: true, value: (u) => u.orgaoGestor, render: (u) => <span className="font-semibold text-text">{u.orgaoGestor || "—"}</span> },
    { key: "un", header: "Unidade orçamentária (Centi)", align: "left", minWidth: 220, value: (u) => u.unidade || "—", render: (u) => <CelulaTexto texto={u.unidade || "—"} /> },
    {
      key: "vinculo",
      header: "Vínculo no cadastro",
      align: "left",
      minWidth: 220,
      value: rotuloDe,
      render: (u) => (
        <SeletorCelula
          valor={valorDe(u)}
          opcoes={opcoes}
          vazio="Sem vínculo"
          salvando={salvando === u.id}
          atual={valorDe(u) != null ? { id: valorDe(u) as number, nome: `${rotuloDe(u)} (oculto)` } : null}
          onChange={salvando == null ? (v) => void escolher(u, v) : undefined}
          ariaLabel={`Vínculo de ${rotuloUnidadeCenti(u)}`}
        />
      ),
    },
    {
      key: "situacao",
      header: "Situação",
      nowrap: true,
      value: (u) => (u.orgaoId != null ? "Vinculada" : "Sem vínculo"),
      render: (u) => (
        <Badge tone={u.orgaoId != null ? "emerald" : "amber"} dot>
          {u.orgaoId != null ? "Vinculada" : "Sem vínculo"}
        </Badge>
      ),
    },
    { key: "lidos", header: "Lidos (última leitura)", nowrap: true, align: "right", filter: "range", numero: (u) => u.registros, formatarFaixa: num, render: (u) => <span className="tabular-nums">{num(u.registros)}</span> },
    { key: "gravados", header: "Empenhos gravados", nowrap: true, align: "right", filter: "range", numero: (u) => u.gravados, formatarFaixa: num, render: (u) => <span className="tabular-nums">{num(u.gravados)}</span> },
    { key: "ano", header: "Ano visto", nowrap: true, total: false, value: (u) => String(u.ultimoAno ?? "—"), render: (u) => <span className="tabular-nums text-muted">{u.ultimoAno ?? "—"}</span> },
    {
      key: "por",
      header: "Vinculada por",
      nowrap: true,
      value: (u) => u.vinculadoPor ?? "",
      render: (u) => <span className="text-faint">{u.vinculadoPor ? `${u.vinculadoPor} · ${dataHoraBR(u.vinculadoEm)}` : "—"}</span>,
    },
  ];

  const vinculadas = lista?.filter((u) => u.orgaoId != null).length ?? 0;
  return (
    <SecaoBanner
      titulo="Unidades da Centi"
      acao={
        <span className="flex items-center gap-1">
          {sugestoes.length > 0 && (
            <Button size="sm" variant="secondary" loading={salvando === "sugestoes"} disabled={salvando != null} onClick={() => void aplicar(sugestoes.map((s) => ({ ...s, reparticaoId: null })), "sugestoes")}>
              Vincular {num(sugestoes.length)} pela sigla
            </Button>
          )}
          <Ajuda titulo="Unidades da Centi" compacta>
            <p>
              Cada <strong>Órgão gestor</strong> + <strong>Unidade orçamentária</strong> que a Centi devolve é ligado a um órgão de
              Órgãos e Unidades — o órgão inteiro ou uma unidade dele. Só os registros de unidade <strong>vinculada</strong> são
              gravados; os outros são lidos e conferidos com a Centi, mas descartados. O banco fica só com o que o sistema usa.
            </p>
            <p>
              Para trazer as unidades sem gravar nada, use <strong>Puxar unidades</strong> em Importar. Depois de vincular,
              importe o ano: os empenhos das unidades vinculadas entram.
            </p>
            <p>
              <strong>Tirar o vínculo</strong> apaga do banco os empenhos gravados daquela unidade (você confirma antes). Trocar o
              vínculo leva os empenhos ao órgão/unidade novo na hora. Excluir um órgão ou uma unidade do cadastro desfaz os
              vínculos dele e apaga os registros; a unidade que muda de órgão leva os vínculos junto.
            </p>
            <p>“Vincular pela sigla” liga ao órgão inteiro cada unidade cujo Órgão gestor é a sigla de UM órgão cadastrado.</p>
            <p>O mesmo vínculo vale para empenhos, liquidações e pagamentos.</p>
          </Ajuda>
        </span>
      }
    >
      {erro && <ErroCarga kind={lista ? "warn" : "danger"} msg={erro} onTentar={carregar} />}
      {lista === null ? (
        !erro && <SkeletonLinhas linhas={4} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-[var(--gap-block)] sm:grid-cols-4">
            <StatMini label="Unidades da Centi" value={num(lista.length)} />
            <StatMini label="Vinculadas" value={num(vinculadas)} />
            <StatMini label="Sem vínculo" value={num(lista.length - vinculadas)} tone={lista.length - vinculadas ? "warn" : "default"} hint="Não são gravadas" />
            <StatMini label="Empenhos gravados" value={num(lista.reduce((s, u) => s + u.gravados, 0))} />
          </div>
          <DataTable
            columns={colunas}
            rows={lista}
            getKey={(u) => u.id}
            density="compact"
            exportar={{ nome: "Unidades da Centi" }}
            vazio="Nenhuma unidade lida ainda — use “Puxar unidades” em Importar."
            resumo={(l) => `${num(l.length)} unidade${l.length === 1 ? "" : "s"}`}
          />
        </>
      )}
      {confirmacao}
    </SecaoBanner>
  );
}
