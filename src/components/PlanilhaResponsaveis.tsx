"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { resumoEstado } from "@/lib/dfd-tratamento";
import { hojeISO } from "@/lib/reparticao-responsaveis";
import {
  alvoDoValor,
  alvosParaVincular,
  alvoVale,
  conferenciaDaPessoa,
  estadoDoVinculo,
  type MensagemConferencia,
  motivoAlvoNaoVale,
  type PessoaResponsavel,
  type PlanilhaResponsaveis as Planilha,
  porAlvo,
  rotuloAlvo,
  type TipoVinculo,
  type VinculoComPessoa,
} from "@/lib/responsaveis-planilha-core";
import { Ajuda, TopicoAjuda } from "./Ajuda";
import { Button } from "./Button";
import { LinhaCampo, useCadeados } from "./CampoCadeado";
import { CelulaLista } from "./CelulaLista";
import { useConfirmacao } from "./Confirmacao";
import { type Column, DataTable } from "./DataTable";
import { EstadoResumo } from "./EstadoCelula";
import { cellCls } from "./formStyles";
import { IconPlus, IconSave, IconTrash, IconUserCheck } from "./icons";
import { Modal } from "./Modal";
import { SecaoBanner, ValorCampo } from "./SecaoBanner";
import { toast } from "./Toast";
import { type AberturaVinculo, dadosDoVinculo, dadosVazios, EditorVinculo, type EnvioVinculo, ListaVinculos } from "./VinculosResponsaveis";

/**
 * A PLANILHA ÚNICA dos responsáveis por DFDs (Órgãos e Unidades → aba Responsáveis): o hook com os dados e as gravações
 * (`usePlanilhaResponsaveis` — o MESMO nas telas de órgãos e de unidades), a tabela das pessoas no padrão da Mesa, o
 * banner da PESSOA e a seção de responsáveis de UM órgão/unidade (`ResponsaveisDoAlvo`).
 */

type Resposta = { ok?: boolean; error?: string; id?: number; planilha?: Planilha };

export function usePlanilhaResponsaveis() {
  const [planilha, setPlanilha] = useState<Planilha | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const { confirmar, confirmacao } = useConfirmacao();
  const hoje = hojeISO();

  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/responsaveis");
      const j = (await r.json().catch(() => ({}))) as Resposta;
      if (!r.ok || !j.ok || !j.planilha) throw new Error(j.error ?? "Não foi possível carregar os responsáveis.");
      setPlanilha(j.planilha);
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar os responsáveis.");
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const grupos = useMemo(() => porAlvo(planilha?.vinculos ?? []), [planilha]);

  /** Grava (o banner fica travado), diz o desfecho num aviso flutuante e relê a planilha. */
  async function chamar(url: string, init: RequestInit, sucesso: string): Promise<Resposta | null> {
    setOcupado(true);
    try {
      const r = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
      const j = (await r.json().catch(() => ({}))) as Resposta;
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Não foi possível concluir — tente de novo.");
      toast.success(sucesso);
      await carregar();
      return j;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível concluir — tente de novo.");
      return null;
    } finally {
      setOcupado(false);
    }
  }

  const acoes = {
    async criarPessoa(nome: string, matricula: string): Promise<number | null> {
      const j = await chamar("/api/admin/responsaveis", { method: "POST", body: JSON.stringify({ nome, matricula }) }, `${nome.trim()} cadastrado(a) na planilha.`);
      return j?.id ?? null;
    },
    async salvarPessoa(id: number, patch: { nome?: string; matricula?: string }): Promise<boolean> {
      return !!(await chamar(`/api/admin/responsaveis/${id}`, { method: "PATCH", body: JSON.stringify(patch) }, "Pessoa atualizada — vale em todos os vínculos."));
    },
    async excluirPessoa(p: PessoaResponsavel): Promise<boolean> {
      const n = planilha?.vinculos.filter((v) => v.responsavelId === p.id).length ?? 0;
      const ok = await confirmar({
        titulo: `Excluir ${p.nome} da planilha?`,
        texto: n ? `Ela responde em ${n} lugar(es): os vínculos saem junto e deixam de valer na conferência das assinaturas.` : "A pessoa não tem vínculos.",
        confirmar: "Excluir",
        perigo: true,
      });
      if (!ok) return false;
      return !!(await chamar(`/api/admin/responsaveis/${p.id}?confirmar=1`, { method: "DELETE" }, `${p.nome} excluído(a) da planilha.`));
    },
    async salvarVinculo(e: EnvioVinculo, id?: number): Promise<boolean> {
      if (id != null)
        return !!(await chamar(`/api/admin/responsaveis/vinculos/${id}`, { method: "PATCH", body: JSON.stringify({ responsavelId: e.responsavelId, ...e.dados }) }, "Vínculo atualizado."));
      const alvo = alvoDoValor(e.alvo);
      if (!alvo) return false;
      return !!(await chamar("/api/admin/responsaveis/vinculos", { method: "POST", body: JSON.stringify({ responsavelId: e.responsavelId, ...alvo, ...e.dados }) }, "Vínculo criado."));
    },
    async removerVinculo(v: VinculoComPessoa): Promise<boolean> {
      const onde = planilha ? rotuloAlvo(v, planilha).texto : "";
      const ok = await confirmar({ titulo: `Remover ${v.nome} de ${onde}?`, texto: "A pessoa continua na planilha.", confirmar: "Remover", perigo: true });
      if (!ok) return false;
      return !!(await chamar(`/api/admin/responsaveis/vinculos/${v.id}`, { method: "DELETE" }, "Vínculo removido."));
    },
  };

  return { planilha, erro, carregar, grupos, hoje, ocupado, acoes, confirmacao };
}

export type CtxPlanilha = ReturnType<typeof usePlanilhaResponsaveis>;

/** A célula "Conferência": o problema principal (+N) na cor, ou "Regular". */
export function CelulaConferencia({ msgs }: { msgs: MensagemConferencia[] }) {
  if (msgs.length === 0) return <span className="whitespace-nowrap text-[12px] font-medium text-[color:var(--ok)]">Regular</span>;
  return <EstadoResumo res={resumoEstado(msgs)} />;
}

/** Os rótulos de todos os problemas (o filtro da coluna acha qualquer um). */
export const rotulosConferencia = (msgs: MensagemConferencia[]) => (msgs.length ? msgs.map((m) => m.rotulo) : ["Regular"]);

type LinhaPessoa = PessoaResponsavel & { vinculos: VinculoComPessoa[]; vigenteEm: string[]; conf: MensagemConferencia[] };

/**
 * A TABELA das pessoas (padrão da Mesa: compacta, rolagem interna, filtros por coluna, exportar): nome, matrícula, onde
 * responde, onde vale HOJE e a conferência. Dentro de um órgão (`orgaoId`), só quem responde nele ou nas unidades dele.
 * Tocar abre o banner da pessoa; "Nova pessoa" no rodapé.
 */
export function PlanilhaResponsaveis({ ctx, orgaoId }: { ctx: CtxPlanilha; orgaoId?: number }) {
  const { planilha, grupos, hoje } = ctx;
  const [aberta, setAberta] = useState<number | "nova" | null>(null);
  const linhas = useMemo<LinhaPessoa[]>(() => {
    if (!planilha) return [];
    const doEscopo = (v: VinculoComPessoa) =>
      orgaoId == null || v.orgaoId === orgaoId || (v.reparticaoId != null && planilha.unidades.find((u) => u.id === v.reparticaoId)?.orgaoId === orgaoId);
    const out: LinhaPessoa[] = [];
    for (const p of planilha.pessoas) {
      const vinculos = planilha.vinculos.filter((v) => v.responsavelId === p.id);
      if (orgaoId != null && !vinculos.some(doEscopo)) continue;
      const vigenteEm = vinculos
        .filter((v) => alvoVale(v, planilha) && estadoDoVinculo(v, grupos.get(v.orgaoId != null ? `o${v.orgaoId}` : `u${v.reparticaoId}`) ?? [], hoje) === "vigente")
        .map((v) => rotuloAlvo(v, planilha).sigla);
      out.push({ ...p, vinculos, vigenteEm, conf: conferenciaDaPessoa(p, planilha, hoje) });
    }
    return out;
  }, [planilha, grupos, hoje, orgaoId]);

  if (!planilha) return null;
  const onde = (l: LinhaPessoa) => l.vinculos.map((v) => `${rotuloAlvo(v, planilha).sigla}${v.tipo === "temporario" ? " (temp.)" : ""}`);
  const colunas: Column<LinhaPessoa>[] = [
    { key: "nome", header: "Nome", align: "left", minWidth: 220, value: (l) => l.nome, render: (l) => <span className="font-medium text-text">{l.nome}</span> },
    {
      key: "matricula",
      header: "Matrícula",
      nowrap: true,
      value: (l) => l.matricula || "—",
      render: (l) => (l.matricula ? <span className="font-mono text-[12px] text-text-2">{l.matricula}</span> : <span className="text-faint">—</span>),
    },
    { key: "vinculos", header: "Responde em", nowrap: true, value: (l) => onde(l).join(", "), valores: onde, render: (l) => <CelulaLista valores={onde(l)} mono max={3} /> },
    { key: "vigente", header: "Vigente hoje em", nowrap: true, value: (l) => l.vigenteEm.join(", "), valores: (l) => l.vigenteEm, render: (l) => <CelulaLista valores={l.vigenteEm} mono destaque max={3} /> },
    {
      key: "conf",
      header: "Conferência",
      nowrap: true,
      value: (l) => rotulosConferencia(l.conf)[0],
      valores: (l) => rotulosConferencia(l.conf),
      render: (l) => <CelulaConferencia msgs={l.conf} />,
    },
  ];
  const pessoa = typeof aberta === "number" ? (planilha.pessoas.find((p) => p.id === aberta) ?? null) : null;

  return (
    <>
      <DataTable
        columns={colunas}
        rows={linhas}
        getKey={(l) => l.id}
        onRowClick={(l) => setAberta(l.id)}
        activeKey={typeof aberta === "number" ? aberta : null}
        scrollInterno
        density="compact"
        exportar={{ nome: "Responsáveis por DFDs" }}
        vazio={orgaoId != null ? "Ninguém responde neste órgão ou nas unidades dele ainda." : "Nenhuma pessoa na planilha ainda — use “Nova pessoa”."}
        acoesRodape={
          <>
            <Button size="sm" icon={<IconPlus className="h-4 w-4" />} onClick={() => setAberta("nova")}>
              Nova pessoa
            </Button>
            <AjudaResponsaveis />
          </>
        }
      />
      <ResponsavelDetalhe
        ctx={ctx}
        pessoa={aberta === "nova" ? "nova" : pessoa}
        orgaoId={orgaoId}
        onFechar={() => setAberta(null)}
        onCriada={(id) => setAberta(id)}
      />
    </>
  );
}

/** O "(?)" da planilha: como funciona a pessoa × o vínculo e a regra de assinatura do órgão. */
export function AjudaResponsaveis() {
  return (
    <Ajuda titulo="Responsáveis por DFDs">
      <p>
        Cada pessoa é cadastrada UMA vez (nome + matrícula) e VINCULADA a unidades ou órgãos — a mesma pessoa pode responder
        em vários lugares. O vínculo guarda a função, a nomeação (portaria, decreto ou lei, com o link) e, no temporário, o
        período.
      </p>
      <TopicoAjuda titulo="Assinatura única × por unidade">
        No órgão de assinatura ÚNICA, os responsáveis são os do órgão (valem para todas as unidades). No órgão “por unidade”,
        cada unidade tem os seus. Só se vincula onde vale; vínculos antigos onde não valem aparecem como “sem efeito”.
      </TopicoAjuda>
      <TopicoAjuda titulo="Padrão × temporário">
        No período de um temporário, ele é quem responde e os padrões ficam inativos; fora do período, os padrões voltam.
      </TopicoAjuda>
      <TopicoAjuda titulo="Conferência">
        Aponta o que está mal cadastrado: sem matrícula, sem função, sem nomeação, temporário encerrado, nomes repetidos com
        matrículas diferentes e unidades ou órgãos sem responsável vigente (a assinatura dos DFDs deles não é conferida).
      </TopicoAjuda>
    </Ajuda>
  );
}

/** O banner de UMA pessoa: nome e matrícula por cadeado, onde responde (editar/remover/vincular) e excluir. */
function ResponsavelDetalhe({
  ctx,
  pessoa,
  orgaoId,
  onFechar,
  onCriada,
}: {
  ctx: CtxPlanilha;
  pessoa: PessoaResponsavel | "nova" | null;
  orgaoId?: number;
  onFechar: () => void;
  onCriada: (id: number) => void;
}) {
  const { planilha, grupos, hoje, ocupado, acoes } = ctx;
  const nova = pessoa === "nova";
  const base = nova || !pessoa ? { nome: "", matricula: "" } : { nome: pessoa.nome, matricula: pessoa.matricula };
  const chave = nova ? "nova" : pessoa ? `${pessoa.id}:${pessoa.nome}:${pessoa.matricula}` : "";
  const [r, setR] = useState(base);
  const [chaveR, setChaveR] = useState(chave);
  const { abertos, alternar, setAbertos } = useCadeados<"nome" | "matricula">();
  const [editor, setEditor] = useState<AberturaVinculo | null>(null);
  if (chave !== chaveR) {
    setChaveR(chave);
    setR(base);
    setAbertos(new Set());
  }
  if (!planilha) return null;
  const patch: { nome?: string; matricula?: string } = {};
  if (r.nome.trim() !== base.nome) patch.nome = r.nome.trim();
  if (r.matricula.trim() !== base.matricula) patch.matricula = r.matricula.trim();
  const sujo = Object.keys(patch).length > 0;
  const aberto = (c: "nome" | "matricula") => nova || abertos.has(c);
  const lock = (c: "nome" | "matricula") => ({ editavel: !nova, aberto: abertos.has(c), bloqueado: false, onLock: () => alternar(c) });
  const vinculos = nova || !pessoa ? [] : planilha.vinculos.filter((v) => v.responsavelId === pessoa.id);
  const alvos = alvosParaVincular(planilha, orgaoId);

  async function salvar() {
    if (nova) {
      const id = await acoes.criarPessoa(r.nome, r.matricula);
      if (id != null) onCriada(id);
    } else if (pessoa && typeof pessoa !== "string" && (await acoes.salvarPessoa(pessoa.id, patch))) setAbertos(new Set());
  }

  return (
    <>
      <Modal
        open={!!pessoa}
        onClose={onFechar}
        bloqueado={ocupado}
        size="xl"
        titulo={nova ? "Nova pessoa na planilha" : (pessoa?.nome ?? "Responsável")}
        rodape={
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            {!nova && pessoa ? (
              <Button size="sm" variant="danger" disabled={ocupado} icon={<IconTrash className="h-4 w-4" />} onClick={() => void acoes.excluirPessoa(pessoa).then((ok) => ok && onFechar())}>
                Excluir pessoa
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" disabled={ocupado} onClick={onFechar}>
                Fechar
              </Button>
              <Button
                size="sm"
                loading={ocupado}
                disabled={nova ? !r.nome.trim() : !sujo || !r.nome.trim()}
                icon={nova ? <IconUserCheck className="h-4 w-4" /> : <IconSave className="h-4 w-4" />}
                onClick={() => void salvar()}
              >
                {nova ? "Cadastrar" : "Salvar alterações"}
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-[var(--gap-block)]">
          <SecaoBanner titulo="Dados da pessoa" acao={nova ? undefined : <span className="text-[12px] text-muted">Toque no cadeado para editar</span>}>
            <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
              <LinhaCampo label="Nome completo" {...lock("nome")}>
                {aberto("nome") ? (
                  <input className={cellCls} value={r.nome} onChange={(e) => setR({ ...r, nome: e.target.value })} maxLength={160} aria-label="Nome completo" />
                ) : (
                  <ValorCampo>{r.nome}</ValorCampo>
                )}
              </LinhaCampo>
              <LinhaCampo label="Matrícula" {...lock("matricula")}>
                {aberto("matricula") ? (
                  <input className={cellCls} value={r.matricula} onChange={(e) => setR({ ...r, matricula: e.target.value })} maxLength={60} inputMode="numeric" aria-label="Matrícula" />
                ) : (
                  <ValorCampo>{r.matricula || "—"}</ValorCampo>
                )}
              </LinhaCampo>
            </div>
            {!nova && <p className="text-[12px] text-muted">Alterar aqui vale em todos os lugares em que a pessoa responde (o nome confere a assinatura dos DFDs).</p>}
          </SecaoBanner>
          {!nova && pessoa && (
            <SecaoBanner
              titulo={`Onde responde (${vinculos.length})`}
              acao={
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={ocupado || alvos.length === 0}
                  icon={<IconPlus className="h-4 w-4" />}
                  onClick={() => setEditor({ responsavelId: pessoa.id, alvo: "", dados: dadosVazios("padrao") })}
                >
                  Vincular
                </Button>
              }
            >
              <ListaVinculos
                vinculos={vinculos}
                irmaos={(v) => grupos.get(v.orgaoId != null ? `o${v.orgaoId}` : `u${v.reparticaoId}`) ?? []}
                hoje={hoje}
                titulo={(v) => ({
                  texto: rotuloAlvo(v, planilha).texto,
                  detalhe: rotuloAlvo(v, planilha).orgao ? "Órgão" : "Unidade",
                  aviso: alvoVale(v, planilha) ? undefined : `Sem efeito: ${motivoAlvoNaoVale(v)}`,
                })}
                vazio="A pessoa ainda não responde em nenhuma unidade ou órgão."
                desabilitado={ocupado}
                onEditar={(v) => setEditor({ id: v.id, responsavelId: v.responsavelId, alvo: v.orgaoId != null ? `o${v.orgaoId}` : `u${v.reparticaoId}`, dados: dadosDoVinculo(v) })}
                onRemover={(v) => void acoes.removerVinculo(v)}
              />
            </SecaoBanner>
          )}
        </div>
      </Modal>
      <EditorVinculo
        abertura={editor}
        pessoas={planilha.pessoas}
        alvos={editor?.id ? [{ valor: editor.alvo, rotulo: rotuloAlvo(alvoDoValor(editor.alvo) ?? { orgaoId: null, reparticaoId: null }, planilha).texto }] : alvos}
        pessoaFixa
        ocupado={ocupado}
        onCriarPessoa={acoes.criarPessoa}
        onSalvar={acoes.salvarVinculo}
        onFechar={() => setEditor(null)}
      />
    </>
  );
}

/**
 * Os RESPONSÁVEIS de UM órgão ou UMA unidade (a seção do banner dele): os vínculos com o estado de hoje e, onde vale pela
 * regra do órgão, "Adicionar padrão" / "Adicionar temporário" escolhendo a pessoa da planilha (ou cadastrando-a). Onde
 * NÃO vale, a `nota` diz de onde vêm os responsáveis e os vínculos antigos aparecem só para remover.
 */
export function ResponsaveisDoAlvo({ ctx, alvo, nota }: { ctx: CtxPlanilha; alvo: { orgaoId: number } | { reparticaoId: number }; nota?: string }) {
  const { planilha, grupos, hoje, ocupado, acoes } = ctx;
  const [editor, setEditor] = useState<AberturaVinculo | null>(null);
  if (!planilha) return <p className="text-[13px] text-muted">Carregando os responsáveis…</p>;
  const a = "orgaoId" in alvo ? { orgaoId: alvo.orgaoId, reparticaoId: null } : { orgaoId: null, reparticaoId: alvo.reparticaoId };
  const valor = a.orgaoId != null ? `o${a.orgaoId}` : `u${a.reparticaoId}`;
  const vinculos = grupos.get(valor) ?? [];
  const vale = alvoVale(a, planilha);
  const novo = (tipo: TipoVinculo) => setEditor({ responsavelId: null, alvo: valor, dados: dadosVazios(tipo) });
  return (
    <div className="space-y-3">
      {!vale && <p className="text-[13px] text-muted">{nota ?? motivoAlvoNaoVale(a)}</p>}
      {(vale || vinculos.length > 0) && (
        <ListaVinculos
          vinculos={vinculos}
          irmaos={() => vinculos}
          hoje={hoje}
          titulo={(v) => ({ texto: v.nome, detalhe: v.matricula ? `Matrícula ${v.matricula}` : "Sem matrícula", aviso: vale ? undefined : "Sem efeito pela regra de assinatura do órgão." })}
          vazio="Nenhum responsável — a assinatura dos DFDs não é conferida."
          desabilitado={ocupado}
          onEditar={vale ? (v) => setEditor({ id: v.id, responsavelId: v.responsavelId, alvo: valor, dados: dadosDoVinculo(v) }) : undefined}
          onRemover={(v) => void acoes.removerVinculo(v)}
        />
      )}
      {vale && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" disabled={ocupado} icon={<IconPlus className="h-4 w-4" />} onClick={() => novo("padrao")}>
            Adicionar padrão
          </Button>
          <Button size="sm" variant="secondary" disabled={ocupado} icon={<IconPlus className="h-4 w-4" />} onClick={() => novo("temporario")}>
            Adicionar temporário
          </Button>
        </div>
      )}
      <EditorVinculo
        abertura={editor}
        pessoas={planilha.pessoas}
        alvos={[]}
        alvoFixo={{ rotulo: rotuloAlvo(a, planilha).texto }}
        ocupado={ocupado}
        onCriarPessoa={acoes.criarPessoa}
        onSalvar={acoes.salvarVinculo}
        onFechar={() => setEditor(null)}
      />
    </div>
  );
}
