"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { OrgaoVinculo, UnidadeVinculo } from "@/lib/empenho-cards";
import { idCenti, motivoOrgaosInvalidos, type OrgaoDoCard } from "@/lib/liquidacoes-core";
import { num } from "@/lib/format";
import { FerramentasAba } from "./AbasEspaco";
import { Ajuda } from "./Ajuda";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { useConfirmacao } from "./Confirmacao";
import { type Column, DataTable } from "./DataTable";
import { SelectField } from "./Field";
import { IconTrash } from "./icons";
import { Selecao } from "./Selecao";
import { toast } from "./Toast";

type Linha = OrgaoDoCard & { orgao: OrgaoVinculo | undefined; id: number | null };

/**
 * A aba ÓRGÃOS de um card de LIQUIDAÇÕES: os órgãos da Centi que o card importa — um por importação (a API exige o
 * `idOrgao` = o "ID na Centi" do órgão do cadastro) — e, opcional, a unidade de destino das liquidações de cada um. Tudo o
 * que a Centi devolve para o órgão é gravado com ele (independente dos empenhos). Cada mudança grava a lista INTEIRA, pela
 * regra única (`motivoOrgaosInvalidos`); tirar um órgão tira as liquidações dele (confirma).
 */
export function LiquidacaoCardOrgaos({
  cardId,
  orgaos: iniciais,
  cadastro,
  podeEditar,
}: {
  cardId: number;
  orgaos: OrgaoDoCard[];
  cadastro: { orgaos: OrgaoVinculo[]; unidades: UnidadeVinculo[] };
  podeEditar: boolean;
}) {
  const router = useRouter();
  const [lista, setLista] = useState<OrgaoDoCard[]>(iniciais);
  const [gravando, setGravando] = useState(false);
  const [novo, setNovo] = useState("");
  const { confirmar, confirmacao } = useConfirmacao();
  const porId = useMemo(() => new Map(cadastro.orgaos.map((o) => [o.id, o])), [cadastro.orgaos]);
  const regra = useMemo(
    () => ({ orgaos: new Map(cadastro.orgaos.map((o) => [o.id, { nome: o.nome, centi: o.centi }])), unidades: new Map(cadastro.unidades.map((u) => [u.id, u.orgaoId])) }),
    [cadastro],
  );
  const disponiveis = cadastro.orgaos.filter((o) => idCenti(o.centi) != null && !lista.some((l) => l.orgaoId === o.id));
  const semId = cadastro.orgaos.filter((o) => idCenti(o.centi) == null).length;
  const rotulo = (o: OrgaoVinculo | undefined) => (o ? (o.sigla ? `${o.sigla} — ${o.nome}` : o.nome) : "—");

  async function gravar(nova: OrgaoDoCard[], aviso: string) {
    const motivo = motivoOrgaosInvalidos(nova, regra);
    if (motivo) {
      toast.error(motivo);
      return;
    }
    setGravando(true);
    try {
      const r = await fetch(`/api/empenhos/cards/${cardId}/orgaos`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orgaos: nova }) });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; orgaos?: OrgaoDoCard[] };
      if (!r.ok || !j.ok || !j.orgaos) throw new Error(j.error ?? "Não foi possível gravar os órgãos.");
      setLista(j.orgaos);
      toast.success(aviso);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível gravar os órgãos.");
    } finally {
      setGravando(false);
    }
  }

  async function tirar(o: OrgaoDoCard) {
    const ok = await confirmar({
      titulo: `Tirar ${rotulo(porId.get(o.orgaoId))} do card?`,
      texto: "As liquidações já importadas deste órgão saem do banco junto. Para trazê-las de volta, acrescente o órgão e importe de novo.",
      confirmar: "Tirar",
      perigo: true,
    });
    if (ok) await gravar(lista.filter((l) => l.orgaoId !== o.orgaoId), "Órgão retirado do card.");
  }

  const linhas: Linha[] = lista.map((o) => ({ ...o, orgao: porId.get(o.orgaoId), id: idCenti(porId.get(o.orgaoId)?.centi) }));
  const colunas: Column<Linha>[] = [
    { key: "id", header: "ID na Centi", nowrap: true, total: false, value: (l) => String(l.id ?? "—"), render: (l) => <span className="tabular-nums">{l.id ?? "—"}</span> },
    { key: "orgao", header: "Órgão", align: "left", minWidth: 260, value: (l) => rotulo(l.orgao) },
    {
      key: "unidade",
      header: "Unidade de destino",
      align: "left",
      minWidth: 260,
      value: (l) => cadastro.unidades.find((u) => u.id === l.reparticaoId)?.nome ?? "O próprio órgão",
      render: (l) => {
        const unidades = cadastro.unidades.filter((u) => u.orgaoId === l.orgaoId);
        const atual = cadastro.unidades.find((u) => u.id === l.reparticaoId);
        if (!podeEditar) return atual ? `${atual.codigo} — ${atual.nome}` : "O próprio órgão";
        return (
          <Selecao
            aria-label={`Unidade de destino de ${rotulo(l.orgao)}`}
            value={l.reparticaoId == null ? "" : String(l.reparticaoId)}
            disabled={gravando}
            onChange={(e) =>
              void gravar(
                lista.map((x) => (x.orgaoId === l.orgaoId ? { ...x, reparticaoId: e.target.value ? Number(e.target.value) : null } : x)),
                "Unidade de destino gravada — as liquidações do órgão acompanham.",
              )
            }
          >
            <option value="">O próprio órgão</option>
            {unidades.map((u) => (
              <option key={u.id} value={u.id}>
                {u.codigo} — {u.nome}
              </option>
            ))}
          </Selecao>
        );
      },
    },
    ...(podeEditar
      ? [
          {
            key: "acoes",
            header: "",
            filter: "none" as const,
            nowrap: true,
            total: false as const,
            value: () => "",
            render: (l: Linha) => (
              <Button size="xs" variant="ghost" disabled={gravando} aria-label={`Tirar ${rotulo(l.orgao)} do card`} title="Tirar do card" icon={<IconTrash className="h-4 w-4" />} onClick={() => void tirar(l)} />
            ),
          },
        ]
      : []),
  ];

  return (
    <>
      <FerramentasAba>
        {podeEditar && disponiveis.length > 0 && (
          <>
            <SelectField compacto label="Órgão" value={novo} onChange={(e) => setNovo(e.target.value)} disabled={gravando}>
              <option value="">Escolha…</option>
              {disponiveis.map((o) => (
                <option key={o.id} value={o.id}>
                  {idCenti(o.centi)} · {rotulo(o)}
                </option>
              ))}
            </SelectField>
            <Button
              size="sm"
              disabled={!novo || gravando}
              loading={gravando}
              onClick={() => {
                const id = Number(novo);
                setNovo("");
                void gravar([...lista, { orgaoId: id, reparticaoId: null }], "Órgão acrescentado — importe as liquidações dele na aba Importação.");
              }}
            >
              Acrescentar
            </Button>
          </>
        )}
        <Ajuda titulo="Órgãos do card" botao="sm">
          <p>
            A Centi entrega as liquidações de <strong>um órgão por vez</strong> (o “ID na Centi” cadastrado em Órgãos e Unidades). Aqui ficam os
            órgãos que este card importa — cada um vira uma importação própria na aba Importação.
          </p>
          <p>
            Tudo o que a Centi devolve para o órgão é dele: as liquidações são gravadas com o órgão e, se escolhida, a <strong>unidade de destino</strong>{" "}
            (senão, o próprio órgão) — independente dos empenhos. Quem vê a unidade (ou o órgão) vê as liquidações.
          </p>
          <p>Tirar um órgão tira as liquidações dele do banco; mudar a unidade de destino leva as já gravadas junto.</p>
        </Ajuda>
      </FerramentasAba>
      {semId > 0 && (
        <Callout kind="info">
          {num(semId)} {semId === 1 ? "órgão do cadastro não tem" : "órgãos do cadastro não têm"} o “ID na Centi” e não aparecem para escolha — cadastre em Órgãos e Unidades.
        </Callout>
      )}
      <DataTable
        columns={colunas}
        rows={linhas}
        getKey={(l) => l.orgaoId}
        density="compact"
        exportar={{ nome: "Órgãos do card de liquidações" }}
        vazio={podeEditar ? "Nenhum órgão ainda — escolha um órgão e toque em Acrescentar (no topo)." : "Nenhum órgão neste card."}
        resumo={(l) => `${num(l.length)} ${l.length === 1 ? "órgão" : "órgãos"}`}
      />
      {confirmacao}
    </>
  );
}
