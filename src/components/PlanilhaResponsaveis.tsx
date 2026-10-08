"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { resumoEstado } from "@/lib/dfd-tratamento";
import { hojeISO } from "@/lib/reparticao-responsaveis";
import {
  alvoDoValor,
  alvoQueVale,
  alvosParaVincular,
  alvoVale,
  avisoRedirecionado,
  conferenciaDaPessoa,
  estadoDoVinculo,
  exonerado,
  type MensagemConferencia,
  motivoAlvoNaoVale,
  motivoNaoVincular,
  ordenarPorPrioridade,
  type PessoaResponsavel,
  type PlanilhaResponsaveis as Planilha,
  porAlvo,
  rotuloAlvo,
  type TipoVinculo,
  usuarioSugerido,
  type VinculoComPessoa,
} from "@/lib/responsaveis-planilha-core";
import { Ajuda, TopicoAjuda } from "./Ajuda";
import { Avatar } from "./Avatar";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { LinhaCampo, useCadeados } from "./CampoCadeado";
import { CelulaLista } from "./CelulaLista";
import { useConfirmacao } from "./Confirmacao";
import { type Column, DataTable } from "./DataTable";
import { EstadoResumo } from "./EstadoCelula";
import { TextField } from "./Field";
import { cellCls } from "./formStyles";
import { IconArquivar, IconPlus, IconSave, IconTrash, IconUserCheck, IconUserX } from "./icons";
import { Modal } from "./Modal";
import { SecaoBanner, ValorCampo } from "./SecaoBanner";
import { SeletorPessoa } from "./SeletorPessoa";
import { toast } from "./Toast";
import {
  type AberturaVinculo,
  dadosDoVinculo,
  dadosVazios,
  EditorVinculo,
  type EnvioVinculo,
  ListaVinculos,
  type NovaPessoa,
  OpcoesCargo,
} from "./VinculosResponsaveis";

/**
 * A PLANILHA ÚNICA dos responsáveis por DFDs (Órgãos e Unidades → aba Responsáveis): o hook com os dados e as gravações
 * (`usePlanilhaResponsaveis` — o MESMO nas telas de órgãos e de unidades), a tabela das pessoas no padrão da Mesa, o
 * banner da PESSOA (com o cargo da lista e o usuário ligado — a foto) e a seção de responsáveis de UM órgão/unidade
 * (`ResponsaveisDoAlvo`).
 */

type Resposta = { ok?: boolean; error?: string; id?: number; aviso?: string; planilha?: Planilha };

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
    async criarPessoa(d: NovaPessoa & { usuarioId?: number | null }): Promise<number | null> {
      const j = await chamar("/api/admin/responsaveis", { method: "POST", body: JSON.stringify(d) }, `${d.nome.trim()} cadastrado(a) na planilha.`);
      return j?.id ?? null;
    },
    async salvarPessoa(id: number, patch: PatchPessoa): Promise<boolean> {
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
    async salvarVinculo(e: EnvioVinculo, _id?: number): Promise<boolean> {
      // EDITANDO (a nomeação — 1 ou mais vínculos): os lugares que ficam são atualizados; os que saem vão para os lugares
      // novos (o mesmo vínculo muda de lugar) e, sem lugar novo para eles, são REMOVIDOS (confirma); os lugares novos que
      // sobram são criados. CRIANDO: um vínculo por lugar. Tudo com a mesma nomeação, em ordem; a 1ª recusa para.
      const grupo = e.grupo ?? [];
      const ficam = grupo.filter((g) => e.alvos.includes(g.alvo));
      const novos = e.alvos.filter((a) => !grupo.some((g) => g.alvo === a));
      const saem = grupo.filter((g) => !e.alvos.includes(g.alvo));
      const movidos = saem.slice(0, novos.length).map((g, i) => ({ id: g.id, alvo: novos[i] }));
      const removidos = saem.slice(novos.length);
      const criados = novos.slice(movidos.length);
      const nome = (valor: string) => {
        const alvo = alvoDoValor(valor);
        return planilha && alvo ? rotuloAlvo(alvo, planilha).texto : valor;
      };
      if (
        removidos.length > 0 &&
        !(await confirmar({
          titulo: `Remover ${removidos.length === 1 ? "o vínculo" : `${removidos.length} vínculos`} desta nomeação?`,
          texto: `Deixa de responder em: ${removidos.map((g) => nome(g.alvo)).join(" · ")}.`,
          confirmar: "Remover e salvar",
          perigo: true,
        }))
      )
        return false;
      const passos: { metodo: "PATCH" | "POST" | "DELETE"; id?: number; alvo: string }[] = [
        ...ficam.map((g) => ({ metodo: "PATCH" as const, id: g.id, alvo: g.alvo })),
        ...movidos.map((m) => ({ metodo: "PATCH" as const, id: m.id, alvo: m.alvo })),
        ...criados.map((alvo) => ({ metodo: "POST" as const, alvo })),
        ...removidos.map((g) => ({ metodo: "DELETE" as const, id: g.id, alvo: g.alvo })),
      ];
      setOcupado(true);
      let feitos = 0;
      const avisos = new Set<string>();
      try {
        for (const p of passos) {
          const alvo = alvoDoValor(p.alvo);
          if (!alvo) continue;
          const r = await fetch(p.id != null ? `/api/admin/responsaveis/vinculos/${p.id}` : "/api/admin/responsaveis/vinculos", {
            method: p.metodo,
            headers: { "Content-Type": "application/json" },
            body: p.metodo === "DELETE" ? undefined : JSON.stringify({ responsavelId: e.responsavelId, ...alvo, ...e.dados }),
          });
          const j = (await r.json().catch(() => ({}))) as Resposta;
          if (!r.ok || !j.ok) throw new Error(`${feitos ? `${feitos} alteração(ões) gravada(s); ` : ""}${nome(p.alvo)}: ${j.error ?? "não foi possível gravar o vínculo."}`);
          if (j.aviso) avisos.add(j.aviso);
          feitos++;
        }
        const feito =
          grupo.length === 0
            ? feitos > 1
              ? `${feitos} vínculos criados com a mesma nomeação.`
              : "Vínculo criado."
            : grupo.length > 1 || criados.length || removidos.length
              ? `Nomeação atualizada em ${ficam.length + movidos.length + criados.length} lugar(es)${removidos.length ? ` · ${removidos.length} removido(s)` : ""}.`
              : "Vínculo atualizado.";
        // O servidor grava no LUGAR QUE VALE pela regra de assinatura do órgão — o aviso diz quando mudou.
        toast.success([feito, ...avisos].join(" "), avisos.size ? 9000 : undefined);
        return true;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Não foi possível concluir — tente de novo.");
        return false;
      } finally {
        await carregar();
        setOcupado(false);
      }
    },
    /** EXONERA a pessoa na data (null = desfaz). Os vínculos dela continuam valendo; a partir da data, nenhum novo. */
    async exonerar(p: PessoaResponsavel, data: string | null): Promise<boolean> {
      const ok = await confirmar(
        data
          ? {
              titulo: `Exonerar ${p.nome} em ${data.split("-").reverse().join("/")}?`,
              texto: "Os vínculos cadastrados continuam valendo (inclusive na conferência das assinaturas). A partir desta data, a pessoa não recebe vínculos novos e vai para os Exonerados.",
              confirmar: "Exonerar",
              perigo: true,
            }
          : { titulo: `Desfazer a exoneração de ${p.nome}?`, texto: "A pessoa volta às pessoas em exercício e pode receber vínculos novos.", confirmar: "Desfazer" },
      );
      if (!ok) return false;
      return !!(await chamar(`/api/admin/responsaveis/${p.id}`, { method: "PATCH", body: JSON.stringify({ exoneradoEm: data }) }, data ? `${p.nome} exonerado(a).` : "Exoneração desfeita."));
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

/** O que muda numa pessoa (só o que mudou vai ao servidor). */
type PatchPessoa = { nome?: string; matricula?: string; cargo?: string; usuarioId?: number | null };

/** A célula "Conferência": o problema principal (+N) na cor, ou "Regular". */
export function CelulaConferencia({ msgs }: { msgs: MensagemConferencia[] }) {
  if (msgs.length === 0) return <span className="whitespace-nowrap text-[12px] font-medium text-[color:var(--ok)]">Regular</span>;
  return <EstadoResumo res={resumoEstado(msgs)} />;
}

/** Os rótulos de todos os problemas (o filtro da coluna acha qualquer um). */
export const rotulosConferencia = (msgs: MensagemConferencia[]) => (msgs.length ? msgs.map((m) => m.rotulo) : ["Regular"]);

type LinhaPessoa = PessoaResponsavel & { vinculos: VinculoComPessoa[]; vigenteEm: string[]; encerradoEm: string[]; conf: MensagemConferencia[] };

const dataBR = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "");
const valorAlvo = (v: { orgaoId: number | null; reparticaoId: number | null }) => (v.orgaoId != null ? `o${v.orgaoId}` : `u${v.reparticaoId}`);

/** Quantos estão EXONERADOS (a data já chegou) — o número do botão "Exonerados". */
export const contarExonerados = (ctx: CtxPlanilha) => ctx.planilha?.pessoas.filter((p) => exonerado(p, ctx.hoje)).length ?? 0;

/** O botão "Exonerados (N)" (alinhado à direita, na linha das abas): alterna a planilha entre quem está em exercício e
 * os EXONERADOS — arquivados, em cinza, com os vínculos ainda valendo. */
export function BotaoExonerados({ ctx, ativo, onAlternar, className }: { ctx: CtxPlanilha; ativo: boolean; onAlternar: () => void; className?: string }) {
  const n = contarExonerados(ctx);
  return (
    <Button
      size="sm"
      variant={ativo ? "primary" : "secondary"}
      className={className}
      aria-pressed={ativo}
      title={ativo ? "Voltar às pessoas em exercício" : "Ver os responsáveis exonerados (arquivados)"}
      icon={<IconArquivar className="h-4 w-4" />}
      onClick={onAlternar}
    >
      Exonerados ({n})
    </Button>
  );
}

/**
 * A TABELA das pessoas (padrão da Mesa: compacta, rolagem interna, filtros por coluna, exportar): a foto + o nome (a foto
 * do usuário ligado), a matrícula, o cargo/função padrão, onde responde, onde vale HOJE e a conferência. Dentro de um órgão (`orgaoId`), só quem responde nele ou nas unidades dele.
 * Tocar abre o banner da pessoa; "Nova pessoa" no rodapé.
 */
export function PlanilhaResponsaveis({ ctx, orgaoId, exonerados = false }: { ctx: CtxPlanilha; orgaoId?: number; exonerados?: boolean }) {
  const { planilha, grupos, hoje } = ctx;
  const [aberta, setAberta] = useState<number | "nova" | null>(null);
  const linhas = useMemo<LinhaPessoa[]>(() => {
    if (!planilha) return [];
    const doEscopo = (v: VinculoComPessoa) =>
      orgaoId == null || v.orgaoId === orgaoId || (v.reparticaoId != null && planilha.unidades.find((u) => u.id === v.reparticaoId)?.orgaoId === orgaoId);
    const out: LinhaPessoa[] = [];
    // A ordem inicial: a prioridade do cargo (Configurações → Cargos e funções), depois o nome.
    for (const p of ordenarPorPrioridade(planilha.pessoas, planilha.cargos)) {
      if (exonerado(p, hoje) !== exonerados) continue;
      const vinculos = planilha.vinculos.filter((v) => v.responsavelId === p.id);
      if (orgaoId != null && !vinculos.some(doEscopo)) continue;
      const estado = (v: VinculoComPessoa) => estadoDoVinculo(v, grupos.get(valorAlvo(v)) ?? [], hoje);
      const vigenteEm = vinculos.filter((v) => alvoVale(v, planilha) && estado(v) === "vigente").map((v) => rotuloAlvo(v, planilha).sigla);
      const encerradoEm = vinculos.filter((v) => estado(v) === "encerrado").map((v) => rotuloAlvo(v, planilha).sigla);
      out.push({ ...p, vinculos: vinculos.filter((v) => estado(v) !== "encerrado"), vigenteEm, encerradoEm, conf: conferenciaDaPessoa(p, planilha, hoje) });
    }
    return out;
  }, [planilha, grupos, hoje, orgaoId, exonerados]);

  if (!planilha) return null;
  const onde = (l: LinhaPessoa) => l.vinculos.map((v) => `${rotuloAlvo(v, planilha).sigla}${v.tipo === "temporario" ? " (temp.)" : ""}`);
  const colunas: Column<LinhaPessoa>[] = [
    {
      key: "nome",
      header: "Nome",
      align: "left",
      minWidth: 240,
      value: (l) => l.nome,
      render: (l) => (
        <span className="flex min-w-0 items-center gap-2">
          <span className={exonerados ? "opacity-50 grayscale" : undefined}>
            <Avatar nome={l.nome} foto={l.foto} size="sm" />
          </span>
          <span className={`truncate font-medium ${exonerados ? "text-faint" : "text-text"}`}>{l.nome}</span>
        </span>
      ),
    },
    {
      key: "matricula",
      header: "Matrícula",
      nowrap: true,
      value: (l) => l.matricula || "—",
      render: (l) => (l.matricula ? <span className={`font-mono text-[12px] ${exonerados ? "text-faint" : "text-text-2"}`}>{l.matricula}</span> : <span className="text-faint">—</span>),
    },
    {
      key: "cargo",
      header: "Cargo/função padrão",
      align: "left",
      minWidth: 180,
      value: (l) => l.cargo || "—",
      render: (l) => (l.cargo ? <span className={exonerados ? "text-faint" : "text-text-2"}>{l.cargo}</span> : <span className="text-[color:var(--warn)]">Sem cargo</span>),
    },
    ...(exonerados
      ? [
          {
            key: "exonerado",
            header: "Exonerado em",
            nowrap: true,
            value: (l: LinhaPessoa) => l.exoneradoEm ?? "",
            render: (l: LinhaPessoa) => <span className="tabular-nums text-faint">{dataBR(l.exoneradoEm)}</span>,
          } satisfies Column<LinhaPessoa>,
        ]
      : []),
    { key: "vinculos", header: "Responde em", nowrap: true, value: (l) => onde(l).join(", "), valores: onde, render: (l) => <CelulaLista valores={onde(l)} mono max={3} /> },
    { key: "vigente", header: "Vigente hoje em", nowrap: true, value: (l) => l.vigenteEm.join(", "), valores: (l) => l.vigenteEm, render: (l) => <CelulaLista valores={l.vigenteEm} mono destaque={!exonerados} max={3} /> },
    // O que já ENCERROU não é problema — fica aqui, em cinza.
    { key: "encerrados", header: "Encerrados", nowrap: true, value: (l) => l.encerradoEm.join(", "), valores: (l) => l.encerradoEm, render: (l) => <CelulaLista valores={l.encerradoEm} mono esmaecido max={3} /> },
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
        exportar={{ nome: exonerados ? "Responsáveis exonerados" : "Responsáveis por DFDs" }}
        vazio={
          exonerados
            ? "Nenhum responsável exonerado."
            : orgaoId != null
              ? "Ninguém responde neste órgão ou nas unidades dele ainda."
              : "Nenhuma pessoa na planilha ainda — use “Nova pessoa”."
        }
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
        Cada pessoa é cadastrada UMA vez (nome, matrícula e o cargo/função padrão — da lista de Configurações → Cargos e
        funções) e VINCULADA a unidades ou órgãos — a mesma pessoa pode responder em vários lugares. Ligada a um usuário da
        plataforma, ganha a foto dele. O vínculo guarda a nomeação (portaria, decreto ou lei, com o link) e o período.
      </p>
      <TopicoAjuda titulo="Assinatura única × por unidade">
        No órgão de assinatura ÚNICA, os responsáveis são os do órgão (valem para todas as unidades). No órgão “por unidade”,
        cada unidade tem os seus. Só se vincula onde vale; vínculos antigos onde não valem aparecem como “sem efeito”.
      </TopicoAjuda>
      <TopicoAjuda titulo="Padrão × temporário">
        O padrão responde com o cargo da pessoa, desde a data inicial — sem data final, segue em aberto até alguém informar.
        O temporário tem o cargo próprio do período, com início e fim: no período dele, ele é quem responde e os padrões
        ficam inativos; fora do período, os padrões voltam. A assinatura do DFD só confere com quem respondia na data dela.
      </TopicoAjuda>
      <TopicoAjuda titulo="Conferência">
        Aponta o que está mal cadastrado: sem matrícula, sem cargo, padrão sem data inicial, temporário sem cargo, sem
        nomeação, nomes repetidos com matrículas diferentes e unidades ou órgãos sem responsável vigente (a assinatura dos
        DFDs deles não é conferida). O vínculo ENCERRADO não é problema: aparece em cinza na coluna “Encerrados”.
      </TopicoAjuda>
      <TopicoAjuda titulo="Ordem">
        A planilha abre pela PRIORIDADE do cargo — a ordem da lista em Configurações → Cargos e funções (mais acima = mais
        prioridade); depois, pelo nome. Os vínculos de cada lugar seguem a mesma ordem.
      </TopicoAjuda>
      <TopicoAjuda titulo="Vários lugares na mesma nomeação">
        Ao vincular, escolha VÁRIAS unidades e órgãos de uma vez: cada um ganha o vínculo com a mesma nomeação e o mesmo
        período. No banner da pessoa, os vínculos com o MESMO ato (decreto, portaria ou lei de mesmo número) aparecem num
        cartão só, e editar vale para todos os lugares. Editando um vínculo, dá para trocar a pessoa, os dados e onde ele responde — e acrescentar lugares (viram
        vínculos novos com a mesma nomeação).
      </TopicoAjuda>
      <TopicoAjuda titulo="Exonerados">
        No banner da pessoa, “Exonerar” informa a data da exoneração. Os vínculos já cadastrados continuam valendo (assinaturas
        e conferência), mas a pessoa não recebe vínculos novos e nenhum vínculo pode começar depois dessa data. Os exonerados
        ficam no botão “Exonerados”, à direita, com as linhas em cinza; “Desfazer exoneração” volta.
      </TopicoAjuda>
    </Ajuda>
  );
}

type CampoPessoa = "nome" | "matricula" | "cargo" | "usuario";
type RascunhoPessoa = { nome: string; matricula: string; cargo: string; usuarioId: number | null };
const NENHUM = "";

/** O banner de UMA pessoa: nome, matrícula, cargo/função padrão e o usuário ligado por cadeado; onde responde (padrão e
 * temporários separados — editar/remover/vincular) e excluir. */
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
  const base: RascunhoPessoa =
    nova || !pessoa ? { nome: "", matricula: "", cargo: "", usuarioId: null } : { nome: pessoa.nome, matricula: pessoa.matricula, cargo: pessoa.cargo, usuarioId: pessoa.usuarioId };
  const chave = nova ? "nova" : pessoa ? `${pessoa.id}:${pessoa.nome}:${pessoa.matricula}:${pessoa.cargo}:${pessoa.usuarioId}` : "";
  const [r, setR] = useState(base);
  const [chaveR, setChaveR] = useState(chave);
  const { abertos, alternar, setAbertos } = useCadeados<CampoPessoa>();
  const [editor, setEditor] = useState<AberturaVinculo | null>(null);
  const [dataExon, setDataExon] = useState(hoje);
  if (chave !== chaveR) {
    setChaveR(chave);
    setR(base);
    setAbertos(new Set());
  }
  if (!planilha) return null;
  const patch: PatchPessoa = {};
  if (r.nome.trim() !== base.nome) patch.nome = r.nome.trim();
  if (r.matricula.trim() !== base.matricula) patch.matricula = r.matricula.trim();
  if (r.cargo !== base.cargo) patch.cargo = r.cargo;
  if (r.usuarioId !== base.usuarioId) patch.usuarioId = r.usuarioId;
  const sujo = Object.keys(patch).length > 0;
  const aberto = (c: CampoPessoa) => nova || abertos.has(c);
  const lock = (c: CampoPessoa) => ({ editavel: !nova, aberto: abertos.has(c), bloqueado: false, onLock: () => alternar(c) });
  const vinculos = nova || !pessoa ? [] : planilha.vinculos.filter((v) => v.responsavelId === pessoa.id);
  const alvos = alvosParaVincular(planilha, orgaoId);
  // Um usuário em UMA pessoa: a lista oferece os livres (e o desta pessoa).
  const ligados = new Set(planilha.pessoas.filter((p) => p.usuarioId != null && (nova || p.id !== (pessoa as PessoaResponsavel | null)?.id)).map((p) => p.usuarioId));
  const usuarios = planilha.usuarios.filter((u) => !ligados.has(u.id));
  const usuario = planilha.usuarios.find((u) => u.id === r.usuarioId) ?? null;
  const sugerido = r.usuarioId == null ? usuarioSugerido(r.matricula, usuarios) : null;
  const foto = usuario?.foto ?? null;

  async function salvar() {
    if (nova) {
      const id = await acoes.criarPessoa(r);
      if (id != null) onCriada(id);
    } else if (pessoa && typeof pessoa !== "string" && (await acoes.salvarPessoa(pessoa.id, patch))) setAbertos(new Set());
  }

  const semVinculoNovo = pessoa && typeof pessoa !== "string" ? motivoNaoVincular(pessoa, { inicio: null }, hoje, true) : null;
  const novoVinculo = (tipo: TipoVinculo) =>
    pessoa && typeof pessoa !== "string" && (
      <Button
        size="sm"
        variant="secondary"
        disabled={ocupado || alvos.orgaos.length + alvos.unidades.length === 0 || !!semVinculoNovo}
        title={semVinculoNovo ?? undefined}
        icon={<IconPlus className="h-4 w-4" />}
        onClick={() => setEditor({ responsavelId: pessoa.id, alvo: "", dados: dadosVazios(tipo) })}
      >
        {tipo === "padrao" ? "Vincular padrão" : "Vincular temporário"}
      </Button>
    );

  return (
    <>
      <Modal
        open={!!pessoa}
        onClose={onFechar}
        bloqueado={ocupado}
        size="xl"
        titulo={nova ? "Nova pessoa na planilha" : (pessoa?.nome ?? "Responsável")}
        cabecalho={
          !nova && pessoa ? (
            <div className="flex min-w-0 items-center gap-3">
              <Avatar nome={pessoa.nome} foto={pessoa.foto} size="lg" />
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold text-text">{pessoa.nome}</p>
                <p className="truncate text-[12.5px] text-muted">{[pessoa.cargo || "Sem cargo", pessoa.matricula ? `Matrícula ${pessoa.matricula}` : ""].filter(Boolean).join(" · ")}</p>
                {pessoa.exoneradoEm && (
                  <Badge tone="slate" className="mt-1">
                    {exonerado(pessoa, hoje) ? "Exonerado" : "Exoneração"} em {dataBR(pessoa.exoneradoEm)}
                  </Badge>
                )}
              </div>
            </div>
          ) : undefined
        }
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
              <LinhaCampo label="Cargo ou função padrão" {...lock("cargo")}>
                {aberto("cargo") ? (
                  <OpcoesCargo label="Cargo ou função padrão" oculto valor={r.cargo} cargos={planilha.cargos} onChange={(c) => setR({ ...r, cargo: c })} />
                ) : (
                  <ValorCampo>{r.cargo || <span className="text-[color:var(--warn)]">Sem cargo</span>}</ValorCampo>
                )}
              </LinhaCampo>
              <LinhaCampo label="Usuário da plataforma" {...lock("usuario")}>
                {aberto("usuario") ? (
                  <div className="space-y-1.5">
                    <SeletorPessoa
                      variante="campo"
                      rotulo="Usuário da plataforma"
                      pessoas={usuarios}
                      valor={r.usuarioId == null ? NENHUM : String(r.usuarioId)}
                      onChange={(v) => setR({ ...r, usuarioId: v === NENHUM ? null : Number(v) })}
                      extras={[{ valor: NENHUM, rotulo: "Sem usuário", icone: <IconUserX className="h-3.5 w-3.5" /> }]}
                      vazio="Sem usuário"
                    />
                    {sugerido && (
                      <Button size="xs" variant="ghost" onClick={() => setR({ ...r, usuarioId: sugerido.id })}>
                        Ligar a {sugerido.nome} (mesma matrícula)
                      </Button>
                    )}
                  </div>
                ) : (
                  <ValorCampo>
                    {usuario ? (
                      <span className="inline-flex items-center gap-2">
                        <Avatar nome={usuario.nome} foto={foto} size="xs" />
                        {usuario.nome}
                      </span>
                    ) : (
                      "—"
                    )}
                  </ValorCampo>
                )}
              </LinhaCampo>
            </div>
            {!nova && (
              <p className="text-[12px] text-muted">
                Vale em todos os lugares em que a pessoa responde (o nome confere a assinatura dos DFDs; o cargo é o dos vínculos padrão). Ligada a um usuário,
                ganha a foto dele.
              </p>
            )}
          </SecaoBanner>
          {!nova && pessoa && (
            <SecaoBanner titulo="Exoneração">
              {pessoa.exoneradoEm ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[13px] text-text-2">
                    {exonerado(pessoa, hoje) ? "Exonerado" : "Exoneração marcada"} em <strong>{dataBR(pessoa.exoneradoEm)}</strong> — os vínculos cadastrados
                    continuam valendo; a partir desta data, nenhum vínculo novo.
                  </p>
                  <Button size="sm" variant="secondary" disabled={ocupado} onClick={() => void acoes.exonerar(pessoa, null)}>
                    Desfazer exoneração
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap items-end gap-2">
                  <div className="w-44">
                    <TextField label="Data da exoneração" type="date" value={dataExon} onChange={(e) => setDataExon(e.target.value)} denso />
                  </div>
                  <Button size="sm" variant="secondary" disabled={ocupado || !dataExon} icon={<IconArquivar className="h-4 w-4" />} onClick={() => void acoes.exonerar(pessoa, dataExon)}>
                    Exonerar
                  </Button>
                </div>
              )}
            </SecaoBanner>
          )}
          {!nova && pessoa && (
            <SecaoBanner titulo={`Onde responde (${vinculos.length})`}>
              <ListaVinculos
                vinculos={vinculos}
                irmaos={(v) => grupos.get(v.orgaoId != null ? `o${v.orgaoId}` : `u${v.reparticaoId}`) ?? []}
                hoje={hoje}
                titulo={(v) => ({
                  texto: rotuloAlvo(v, planilha).texto,
                  detalhe: rotuloAlvo(v, planilha).orgao ? "Órgão" : "Unidade",
                  aviso: alvoVale(v, planilha) ? undefined : textoRevisar(v, planilha),
                })}
                vazio={{ padrao: "Não é padrão em nenhuma unidade ou órgão.", temporario: "Sem períodos temporários." }}
                cargos={planilha.cargos}
                acoes={{ padrao: novoVinculo("padrao"), temporario: novoVinculo("temporario") }}
                desabilitado={ocupado}
                agrupar
                onEditar={(v, grupo) =>
                  setEditor({
                    id: v.id,
                    responsavelId: v.responsavelId,
                    alvo: valorDoAlvo(v),
                    dados: dadosDoVinculo(v),
                    grupo: grupo.map((g) => ({ id: g.id, alvo: valorDoAlvo(g) })),
                    ...abrirNoLugarQueVale(grupo, planilha),
                  })
                }
                onRemover={(v) => void acoes.removerVinculo(v)}
              />
            </SecaoBanner>
          )}
        </div>
      </Modal>
      <EditorVinculo
        abertura={editor}
        pessoas={planilha.pessoas}
        cargos={planilha.cargos}
        alvos={alvos}
        pessoaFixa
        ocupado={ocupado}
        onCriarPessoa={acoes.criarPessoa}
        onSalvar={acoes.salvarVinculo}
        onFechar={() => setEditor(null)}
      />
    </>
  );
}

/** `o<id>` | `u<id>` do lugar do vínculo. */
const valorDoAlvo = (v: { orgaoId: number | null; reparticaoId: number | null }) => (v.orgaoId != null ? `o${v.orgaoId}` : `u${v.reparticaoId}`);

/** O vínculo FORA do lugar que vale (sobrou porque cruza com outro período da mesma pessoa no destino — o realinhamento
 * automático não o move): o que fazer. */
function textoRevisar(v: { orgaoId: number | null; reparticaoId: number | null }, planilha: Planilha): string {
  const vale = alvoQueVale(v, planilha);
  return vale
    ? `A revisar: pela regra de assinatura este vínculo vale em ${rotuloAlvo(vale, planilha).sigla} — lá já há um período desta pessoa que se cruza com ele. Ajuste as datas e salve (ele vai para lá).`
    : `A revisar: ${motivoAlvoNaoVale(v)}`;
}

/** Ao EDITAR, a nomeação abre já no LUGAR QUE VALE (o vínculo antigo fora do lugar é corrigido ao salvar) + o aviso. */
function abrirNoLugarQueVale(grupo: readonly { orgaoId: number | null; reparticaoId: number | null }[], planilha: Planilha): { grupo?: { id: number; alvo: string }[]; aviso?: string } {
  const avisos = grupo.map((g) => avisoRedirecionado(g, planilha)).filter((a): a is string => !!a);
  if (!avisos.length) return {};
  return { aviso: `${avisos[0].replace(/^Gravado/, "Será gravado")} Salve para corrigir.` };
}

/**
 * Os RESPONSÁVEIS de UM órgão ou UMA unidade (a seção do banner dele): o PADRÃO e os TEMPORÁRIOS separados, com o estado
 * de hoje e, onde vale pela regra do órgão, "Adicionar padrão" / "Adicionar temporário" no topo de cada seção (a pessoa da
 * planilha, ou cadastrada ali). Onde NÃO vale, a `nota` diz de onde vêm os responsáveis e os vínculos antigos aparecem só
 * para remover.
 */
export function ResponsaveisDoAlvo({ ctx, alvo, nota }: { ctx: CtxPlanilha; alvo: { orgaoId: number } | { reparticaoId: number }; nota?: string }) {
  const { planilha, grupos, hoje, ocupado, acoes } = ctx;
  const [editor, setEditor] = useState<AberturaVinculo | null>(null);
  if (!planilha) return <p className="text-[13px] text-muted">Carregando os responsáveis…</p>;
  const a = "orgaoId" in alvo ? { orgaoId: alvo.orgaoId, reparticaoId: null } : { orgaoId: null, reparticaoId: alvo.reparticaoId };
  const valor = a.orgaoId != null ? `o${a.orgaoId}` : `u${a.reparticaoId}`;
  const vinculos = grupos.get(valor) ?? [];
  const vale = alvoVale(a, planilha);
  const pessoaDe = (id: number) => planilha.pessoas.find((p) => p.id === id);
  const novo = (tipo: TipoVinculo) =>
    vale && (
      <Button size="sm" variant="secondary" disabled={ocupado} icon={<IconPlus className="h-4 w-4" />} onClick={() => setEditor({ responsavelId: null, alvo: valor, dados: dadosVazios(tipo) })}>
        {tipo === "padrao" ? "Adicionar padrão" : "Adicionar temporário"}
      </Button>
    );
  return (
    <div className="space-y-3">
      {!vale && <p className="text-[13px] text-muted">{nota ?? motivoAlvoNaoVale(a)}</p>}
      {(vale || vinculos.length > 0) && (
        <ListaVinculos
          vinculos={vinculos}
          irmaos={() => vinculos}
          hoje={hoje}
          titulo={(v) => ({
            texto: v.nome,
            detalhe: v.matricula ? `Matrícula ${v.matricula}` : "Sem matrícula",
            aviso: vale ? undefined : textoRevisar(v, planilha),
            avatar: { nome: v.nome, foto: pessoaDe(v.responsavelId)?.foto ?? null },
            exonerado: pessoaDe(v.responsavelId)?.exoneradoEm ?? null,
          })}
          cargos={planilha.cargos}
          vazio={{ padrao: "Nenhum responsável padrão — a assinatura dos DFDs não é conferida.", temporario: "Sem períodos temporários." }}
          acoes={{ padrao: novo("padrao"), temporario: novo("temporario") }}
          desabilitado={ocupado}
          onEditar={vale ? (v) => setEditor({ id: v.id, responsavelId: v.responsavelId, alvo: valor, dados: dadosDoVinculo(v) }) : undefined}
          onRemover={(v) => void acoes.removerVinculo(v)}
        />
      )}
      <EditorVinculo
        abertura={editor}
        pessoas={planilha.pessoas}
        cargos={planilha.cargos}
        alvos={alvosParaVincular(planilha)}
        alvoFixo={{ rotulo: rotuloAlvo(a, planilha).texto }}
        ocupado={ocupado}
        onCriarPessoa={acoes.criarPessoa}
        onSalvar={acoes.salvarVinculo}
        onFechar={() => setEditor(null)}
      />
    </div>
  );
}
