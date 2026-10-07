"use client";

import { type ReactNode, useState } from "react";
import { hojeISO, TIPOS_ATO } from "@/lib/reparticao-responsaveis";
import {
  agruparPorNomeacao,
  type DadosVinculo,
  type EstadoVinculo,
  estadoDoVinculo,
  exonerado,
  funcaoDoVinculo,
  lerTipoAto,
  motivoNaoVincular,
  motivoVinculoInvalido,
  type PessoaResponsavel,
  periodoVinculo,
  ROTULO_ESTADO_VINCULO,
  separarVinculos,
  type TipoVinculo,
  type VinculoComPessoa,
} from "@/lib/responsaveis-planilha-core";
import { Avatar } from "./Avatar";
import { Badge, type Tone } from "./Badge";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { SelectField, TextField } from "./Field";
import { cellCls } from "./formStyles";
import { IconLink, IconPencil, IconPlus, IconTrash, IconUserCheck } from "./icons";
import { LinkExterno } from "./LinkExterno";
import { Modal } from "./Modal";
import { type OpcaoBusca, SeletorBusca } from "./SeletorBusca";
import { SeletorMultiplo } from "./SeletorMultiplo";
import { Segmented } from "./Segmented";

/**
 * RESPONSÁVEIS POR DFDs — as peças de tela da PLANILHA ÚNICA (pessoas vinculadas a unidades/órgãos): a célula dos
 * vigentes, a lista de vínculos (do alvo ou da pessoa — PADRÃO e TEMPORÁRIOS separados) e o editor do vínculo (escolher a
 * pessoa da planilha ou cadastrá-la na hora; o cargo — da pessoa no padrão, da lista no temporário —, a nomeação e o
 * período). Só apresentação — as gravações ficam com quem usa (`PlanilhaResponsaveis`).
 */

const TOM_ESTADO: Record<EstadoVinculo, Tone> = { vigente: "emerald", agendado: "blue", encerrado: "slate", inativo: "slate" };

/** A célula dos responsáveis VIGENTES de um órgão/unidade (ou a nota — "Pelo órgão", "Por unidade"). */
export function CelulaResponsaveis({ nomes, temporario, nota }: { nomes: readonly string[]; temporario: boolean; nota?: string }) {
  if (nota) return <span className="whitespace-nowrap text-[12px] text-faint">{nota}</span>;
  if (nomes.length === 0) return <span className="text-faint">—</span>;
  const texto = nomes.join(", ");
  return (
    <span className="inline-flex max-w-[18rem] items-center gap-1.5 whitespace-nowrap" title={texto}>
      <span className="truncate text-text-2">{texto}</span>
      {temporario && <Badge tone="blue">Temp.</Badge>}
    </span>
  );
}

/** O ato de nomeação por extenso ("Portaria 123/2026") — vazio quando não há. */
export function textoAto(v: { atoTipo: string | null; atoNumero: string }): string {
  const tipo = TIPOS_ATO.find((t) => t.valor === v.atoTipo)?.rotulo ?? "";
  return [tipo, v.atoNumero.trim()].filter(Boolean).join(" ");
}

/** O texto principal do cartão (a pessoa ou o alvo), o detalhe e o aviso; `avatar` = a foto da pessoa no cartão. */
/** `exonerado` = a data da exoneração da pessoa ("AAAA-MM-DD") — o selo cinza no cartão (o vínculo segue valendo). */
export type TituloVinculo = { texto: string; detalhe?: string; aviso?: string; avatar?: { nome: string; foto: string | null }; exonerado?: string | null };

/**
 * A LISTA de vínculos em DUAS seções — **Padrão** (o cargo da pessoa, o período com o fim em aberto) e **Temporários** (o
 * cargo do período, início e fim) —, um cartão por vínculo: a pessoa (com a foto) ou o alvo, o estado hoje, o cargo, a
 * nomeação com o link e o período. `irmaos` = os vínculos do MESMO alvo de cada um (o padrão fica inativo com um
 * temporário vigente). `acoes` = o botão de cada seção (ex.: "Adicionar padrão"). Sem `onEditar`/`onRemover`, só leitura.
 */
export function ListaVinculos({
  vinculos,
  irmaos,
  hoje,
  titulo,
  vazio,
  acoes,
  onEditar,
  onRemover,
  desabilitado = false,
  cargos,
  agrupar = false,
}: {
  vinculos: readonly VinculoComPessoa[];
  irmaos: (v: VinculoComPessoa) => readonly VinculoComPessoa[];
  hoje: string;
  titulo: (v: VinculoComPessoa) => TituloVinculo;
  /** O texto de cada seção vazia. */
  vazio: Record<TipoVinculo, string>;
  acoes?: Partial<Record<TipoVinculo, ReactNode>>;
  /** Editar: o vínculo e — com `agrupar` — todos os da mesma nomeação. */
  onEditar?: (v: VinculoComPessoa, grupo: VinculoComPessoa[]) => void;
  onRemover?: (v: VinculoComPessoa) => void;
  desabilitado?: boolean;
  /** Os cargos na ordem de Configurações (a prioridade): cada seção vai por ela e depois pelo nome. */
  cargos?: readonly string[];
  /** UNIFICA os vínculos de mesma nomeação (a pessoa + o tipo + o ato de mesmo nº): um cartão com os lugares — o banner
   * da pessoa. */
  agrupar?: boolean;
}) {
  const { padroes, temporarios } = separarVinculos(vinculos, cargos);
  const secao = (tipo: TipoVinculo, rotulo: string, lista: VinculoComPessoa[]) => (
    <section className="space-y-2" aria-label={rotulo}>
      <div className="flex min-h-9 flex-wrap items-center justify-between gap-2">
        <h4 className="text-[12px] font-semibold uppercase tracking-wide text-muted">
          {rotulo} <span className="tabular-nums">({lista.length})</span>
        </h4>
        {acoes?.[tipo]}
      </div>
      {lista.length === 0 ? (
        <p className="text-[13px] text-muted">{vazio[tipo]}</p>
      ) : (
        <ul className="space-y-2">
          {(agrupar ? agruparPorNomeacao(lista) : lista.map((v) => [v])).map((g) =>
            g.length > 1 ? (
              <CartaoNomeacao
                key={g[0].id}
                grupo={g}
                estado={(v) => estadoDoVinculo(v, irmaos(v), hoje)}
                titulo={titulo}
                onEditar={onEditar}
                onRemover={onRemover}
                desabilitado={desabilitado}
              />
            ) : (
              <CartaoVinculo
                key={g[0].id}
                v={g[0]}
                estado={estadoDoVinculo(g[0], irmaos(g[0]), hoje)}
                t={titulo(g[0])}
                onEditar={onEditar && ((v) => onEditar(v, [v]))}
                onRemover={onRemover}
                desabilitado={desabilitado}
              />
            ),
          )}
        </ul>
      )}
    </section>
  );
  return (
    <div className="space-y-[var(--gap-block)]">
      {secao("padrao", "Padrão", padroes)}
      {secao("temporario", "Temporários", temporarios)}
    </div>
  );
}

/** UMA nomeação (o mesmo ato) com VÁRIOS lugares: o cargo, o ato com o link e editar tudo de uma vez no topo; cada lugar
 * com o estado, o período (quando difere) e remover. */
function CartaoNomeacao({
  grupo,
  estado,
  titulo,
  onEditar,
  onRemover,
  desabilitado,
}: {
  grupo: VinculoComPessoa[];
  estado: (v: VinculoComPessoa) => EstadoVinculo;
  titulo: (v: VinculoComPessoa) => TituloVinculo;
  onEditar?: (v: VinculoComPessoa, grupo: VinculoComPessoa[]) => void;
  onRemover?: (v: VinculoComPessoa) => void;
  desabilitado: boolean;
}) {
  const v0 = grupo[0];
  const ato = textoAto(v0);
  const funcao = funcaoDoVinculo(v0);
  const temp = v0.tipo === "temporario";
  const periodos = new Set(grupo.map((v) => periodoVinculo(v)));
  const link = grupo.find((v) => v.atoLink)?.atoLink ?? "";
  const t0 = titulo(v0);
  return (
    <li className="space-y-2 rounded-control border border-border p-3">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="break-words text-[13.5px] font-semibold text-text">
            {ato} <span className="font-normal text-muted">· {grupo.length} lugares</span>
          </p>
          <p className="text-[12.5px] text-text-2">
            {funcao || <span className="text-[color:var(--warn)]">{temp ? "Sem cargo do período" : "Pessoa sem cargo"}</span>}
            {periodos.size === 1 && <span className="tabular-nums"> · {periodoVinculo(v0)}</span>}
          </p>
          {t0.exonerado && <Badge tone="slate">Exonerado em {t0.exonerado.split("-").reverse().join("/")}</Badge>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {link && (
            <LinkExterno href={link} size="xs" icon={<IconLink className="h-4 w-4" />} titulo={`Abrir ${ato}`}>
              Ato
            </LinkExterno>
          )}
          {onEditar && (
            <Button
              variant="ghost"
              size="xs"
              disabled={desabilitado}
              aria-label={`Editar a nomeação (${ato}) nos ${grupo.length} lugares`}
              title="Editar a nomeação e os lugares"
              icon={<IconPencil className="h-4 w-4" />}
              onClick={() => onEditar(v0, grupo)}
            />
          )}
        </div>
      </div>
      <ul className="divide-y divide-border border-t border-border">
        {grupo.map((v) => {
          const t = titulo(v);
          const e = estado(v);
          const apagado = e === "encerrado" || e === "inativo";
          return (
            <li key={v.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-2 [&:not(:first-child)]:mt-2">
              <span className={`min-w-0 flex-1 break-words text-[13px] ${apagado ? "text-muted" : "text-text"}`}>
                {t.texto}
                {t.detalhe && <span className="text-[12px] text-muted"> · {t.detalhe}</span>}
              </span>
              <Badge tone={TOM_ESTADO[e]}>{ROTULO_ESTADO_VINCULO[e]}</Badge>
              {periodos.size > 1 && <span className="text-[12px] tabular-nums text-text-2">{periodoVinculo(v)}</span>}
              {t.aviso && <span className="w-full text-[12px] text-[color:var(--warn)]">{t.aviso}</span>}
              {onRemover && (
                <Button
                  variant="ghost"
                  size="xs"
                  disabled={desabilitado}
                  aria-label={`Remover o vínculo em ${t.texto}`}
                  style={{ color: "var(--danger)" }}
                  icon={<IconTrash className="h-4 w-4" />}
                  onClick={() => onRemover(v)}
                />
              )}
            </li>
          );
        })}
      </ul>
    </li>
  );
}

function CartaoVinculo({
  v,
  estado,
  t,
  onEditar,
  onRemover,
  desabilitado,
}: {
  v: VinculoComPessoa;
  estado: EstadoVinculo;
  t: TituloVinculo;
  onEditar?: (v: VinculoComPessoa) => void;
  onRemover?: (v: VinculoComPessoa) => void;
  desabilitado: boolean;
}) {
  const ato = textoAto(v);
  const funcao = funcaoDoVinculo(v);
  const apagado = estado === "encerrado" || estado === "inativo";
  const temp = v.tipo === "temporario";
  return (
    <li className={`flex flex-wrap items-start gap-x-3 gap-y-2 rounded-control border border-border p-3 ${apagado ? "bg-surface-2" : ""}`}>
      {t.avatar && <Avatar nome={t.avatar.nome} foto={t.avatar.foto} size="sm" />}
      <div className="min-w-0 flex-1 space-y-1">
        <p className={`break-words text-[13.5px] font-semibold ${apagado ? "text-muted" : "text-text"}`}>{t.texto}</p>
        {t.detalhe && <p className="break-words text-[12px] text-muted">{t.detalhe}</p>}
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={TOM_ESTADO[estado]}>{ROTULO_ESTADO_VINCULO[estado]}</Badge>
          {t.exonerado && <Badge tone="slate">Exonerado em {t.exonerado.split("-").reverse().join("/")}</Badge>}
          <span className={`text-[12px] tabular-nums ${!temp && !v.inicio ? "text-[color:var(--warn)]" : "text-text-2"}`}>{periodoVinculo(v)}</span>
        </div>
        <p className="text-[12.5px] text-text-2">
          {funcao || <span className="text-[color:var(--warn)]">{temp ? "Sem cargo do período" : "Pessoa sem cargo"}</span>}
          {" · "}
          {ato || <span className="text-[color:var(--warn)]">Sem nomeação</span>}
        </p>
        {t.aviso && <p className="text-[12px] text-[color:var(--warn)]">{t.aviso}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {v.atoLink && (
          <LinkExterno href={v.atoLink} size="xs" icon={<IconLink className="h-4 w-4" />} titulo={`Abrir ${ato || "a nomeação"}`}>
            Ato
          </LinkExterno>
        )}
        {onEditar && (
          <Button variant="ghost" size="xs" disabled={desabilitado} aria-label={`Editar o vínculo de ${v.nome}`} icon={<IconPencil className="h-4 w-4" />} onClick={() => onEditar(v)} />
        )}
        {onRemover && (
          <Button
            variant="ghost"
            size="xs"
            disabled={desabilitado}
            aria-label={`Remover o vínculo de ${v.nome}`}
            style={{ color: "var(--danger)" }}
            icon={<IconTrash className="h-4 w-4" />}
            onClick={() => onRemover(v)}
          />
        )}
      </div>
    </li>
  );
}

/** O que o editor manda gravar: a pessoa, os alvos (`o<id>` | `u<id>` — vários: a mesma nomeação vincula a pessoa a
 * várias unidades/órgãos de uma vez; EDITANDO, o 1º é onde o próprio vínculo passa a responder e os demais viram vínculos
 * novos) e os dados. */
export type EnvioVinculo = { responsavelId: number; alvos: string[]; dados: DadosVinculo; grupo?: { id: number; alvo: string }[] };

/** Como o editor abre: novo (com o tipo e, quando já se sabe, a pessoa ou o alvo) ou editando um vínculo. */
export type AberturaVinculo = {
  id?: number;
  responsavelId: number | null;
  alvo: string;
  dados: DadosVinculo;
  /** A NOMEAÇÃO unificada: os vínculos dela (id + lugar) — editar vale para todos; desmarcar um lugar o remove. */
  grupo?: { id: number; alvo: string }[];
};

export const dadosVazios = (tipo: TipoVinculo): DadosVinculo => ({ tipo, funcao: "", atoTipo: null, atoNumero: "", atoLink: "", inicio: null, fim: null });

export const dadosDoVinculo = (v: VinculoComPessoa): DadosVinculo => ({
  tipo: v.tipo,
  funcao: v.funcao,
  atoTipo: v.atoTipo,
  atoNumero: v.atoNumero,
  atoLink: v.atoLink,
  inicio: v.inicio,
  fim: v.fim,
});

/**
 * O EDITOR do vínculo (num banner): a PESSOA escolhida da planilha (busca por nome ou matrícula) — ou cadastrada ali, com
 * o cargo —, o ALVO (unidade ou órgão; só os que valem pela regra do órgão), padrão (o cargo é o da pessoa; início e o fim
 * opcional) ou temporário (o cargo do período, da lista; início e fim) e a nomeação (ato + nº + link). A pessoa e o alvo podem vir fixos (o banner da pessoa fixa a pessoa; o do órgão/da
 * unidade, o alvo). A mesma régua do servidor trava o Salvar (`motivoVinculoInvalido`).
 */
export function EditorVinculo({
  abertura,
  pessoas,
  cargos,
  alvos,
  pessoaFixa,
  alvoFixo,
  ocupado,
  onCriarPessoa,
  onSalvar,
  onFechar,
}: {
  abertura: AberturaVinculo | null;
  pessoas: readonly PessoaResponsavel[];
  /** Os cargos cadastrados (o do temporário e o da pessoa nova). */
  cargos: readonly string[];
  /** Os alvos que se podem escolher (`valor` = `o<id>` | `u<id>`). */
  alvos: OpcaoBusca[];
  pessoaFixa?: boolean;
  alvoFixo?: { rotulo: string };
  ocupado: boolean;
  /** Cadastra a pessoa na planilha e devolve o id (ou `null`). */
  onCriarPessoa: (d: NovaPessoa) => Promise<number | null>;
  onSalvar: (e: EnvioVinculo, id?: number) => Promise<boolean>;
  onFechar: () => void;
}) {
  return (
    <Modal open={!!abertura} onClose={onFechar} bloqueado={ocupado} size="md" titulo={abertura?.id ? ((abertura.grupo?.length ?? 0) > 1 ? "Editar nomeação" : "Editar vínculo") : "Novo vínculo"}>
      {abertura && (
        <CorpoEditor
          key={`${abertura.id ?? "novo"}:${abertura.alvo}:${abertura.responsavelId ?? ""}`}
          abertura={abertura}
          pessoas={pessoas}
          cargos={cargos}
          alvos={alvos}
          pessoaFixa={pessoaFixa}
          alvoFixo={alvoFixo}
          ocupado={ocupado}
          onCriarPessoa={onCriarPessoa}
          onSalvar={onSalvar}
          onFechar={onFechar}
        />
      )}
    </Modal>
  );
}

function CorpoEditor({
  abertura,
  pessoas,
  cargos,
  alvos,
  pessoaFixa,
  alvoFixo,
  ocupado,
  onCriarPessoa,
  onSalvar,
  onFechar,
}: {
  abertura: AberturaVinculo;
  pessoas: readonly PessoaResponsavel[];
  cargos: readonly string[];
  alvos: OpcaoBusca[];
  pessoaFixa?: boolean;
  alvoFixo?: { rotulo: string };
  ocupado: boolean;
  onCriarPessoa: (d: NovaPessoa) => Promise<number | null>;
  onSalvar: (e: EnvioVinculo, id?: number) => Promise<boolean>;
  onFechar: () => void;
}) {
  const [pessoa, setPessoa] = useState(abertura.responsavelId == null ? "" : String(abertura.responsavelId));
  const originais = abertura.grupo?.map((g) => g.alvo) ?? (abertura.alvo ? [abertura.alvo] : []);
  const [alvosEscolhidos, setAlvos] = useState<string[]>(originais);
  const [d, setD] = useState<DadosVinculo>(abertura.dados);
  const [nova, setNova] = useState<NovaPessoa | null>(null);
  const set = <K extends keyof DadosVinculo>(k: K, v: DadosVinculo[K]) => setD((x) => ({ ...x, [k]: v }));
  const escolhida = pessoas.find((p) => String(p.id) === pessoa) ?? null;
  // A EXONERAÇÃO: quem já foi exonerado não recebe vínculo novo e nenhum começa depois dela.
  const novoParaPessoa = !abertura.id || String(abertura.responsavelId) !== pessoa || alvosEscolhidos.some((a) => !originais.includes(a));
  const exoneracao = escolhida ? motivoNaoVincular(escolhida, d, hojeISO(), novoParaPessoa) : null;
  const motivo = motivoVinculoInvalido(d) ?? exoneracao;
  const falta = !pessoa ? "Escolha a pessoa." : alvosEscolhidos.length === 0 ? "Escolha a unidade ou o órgão." : motivo;
  const temp = d.tipo === "temporario";
  const rotuloDe = (v: string) => alvos.find((a) => a.valor === v)?.rotulo ?? v;
  const opcoesPessoas: OpcaoBusca[] = pessoas.filter((p) => String(p.id) === pessoa || !exonerado(p, hojeISO())).map((p) => ({
    valor: String(p.id),
    rotulo: p.nome,
    detalhe: [p.matricula ? `Matrícula ${p.matricula}` : "Sem matrícula", p.cargo].filter(Boolean).join(" · "),
    icone: <Avatar nome={p.nome} foto={p.foto} size="sm" />,
  }));

  async function cadastrar() {
    if (!nova?.nome.trim()) return;
    const id = await onCriarPessoa(nova);
    if (id != null) {
      setPessoa(String(id));
      setNova(null);
    }
  }

  async function salvar() {
    if (falta || !pessoa) return;
    // Editando: o próprio vínculo fica onde já respondia (se continua escolhido) — senão vai ao 1º escolhido.
    const ordem = abertura.id && alvosEscolhidos.includes(abertura.alvo) ? [abertura.alvo, ...alvosEscolhidos.filter((a) => a !== abertura.alvo)] : alvosEscolhidos;
    if (await onSalvar({ responsavelId: Number(pessoa), alvos: ordem, dados: d, grupo: abertura.grupo ?? (abertura.id ? [{ id: abertura.id, alvo: abertura.alvo }] : undefined) }, abertura.id))
      onFechar();
  }

  return (
    <div className="space-y-[var(--gap-block)]">
      <section className="space-y-2">
        <span className="block text-[13px] font-semibold text-text">Pessoa</span>
        {pessoaFixa ? (
          <p className="text-sm font-semibold text-text">
            {escolhida?.nome ?? "—"} <span className="font-normal text-muted">{escolhida?.matricula ? `· Matrícula ${escolhida.matricula}` : "· Sem matrícula"}</span>
          </p>
        ) : nova ? (
          <div className="space-y-2 rounded-control border border-border p-3">
            <TextField label="Nome completo" value={nova.nome} onChange={(e) => setNova({ ...nova, nome: e.target.value })} maxLength={160} autoFocus denso />
            <TextField label="Matrícula" value={nova.matricula} onChange={(e) => setNova({ ...nova, matricula: e.target.value })} maxLength={60} inputMode="numeric" denso />
            <OpcoesCargo label="Cargo ou função padrão" valor={nova.cargo} cargos={cargos} onChange={(c) => setNova({ ...nova, cargo: c })} />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" disabled={ocupado} onClick={() => setNova(null)}>
                Voltar à planilha
              </Button>
              <Button size="sm" loading={ocupado} disabled={!nova.nome.trim()} icon={<IconUserCheck className="h-4 w-4" />} onClick={() => void cadastrar()}>
                Cadastrar pessoa
              </Button>
            </div>
          </div>
        ) : (
          <>
            <SeletorBusca
              opcoes={opcoesPessoas}
              valor={pessoa}
              onChange={setPessoa}
              ariaLabel="Pessoa da planilha"
              placeholder="Buscar por nome ou matrícula…"
              vazio="Ninguém na planilha com esse nome — cadastre abaixo."
              disabled={ocupado}
            />
            <Button size="sm" variant="secondary" disabled={ocupado} icon={<IconPlus className="h-4 w-4" />} onClick={() => setNova({ nome: "", matricula: "", cargo: "" })}>
              Cadastrar pessoa nova
            </Button>
          </>
        )}
      </section>

      <section className="space-y-2">
        <span className="block text-[13px] font-semibold text-text">Onde responde</span>
        {alvoFixo && !abertura.id ? (
          <p className="text-sm font-semibold text-text">{alvoFixo.rotulo}</p>
        ) : alvos.length === 0 ? (
          <Callout kind="info">Nenhuma unidade ou órgão recebe responsáveis aqui pela regra de assinatura.</Callout>
        ) : (
          <>
            <SeletorMultiplo
              rotulo="Unidades e órgãos"
              opcoes={alvos.map((a) => ({ valor: a.valor, rotulo: a.rotulo }))}
              selecionados={alvosEscolhidos}
              onChange={setAlvos}
              disabled={ocupado}
              suspenso
              textoVazio="Escolha…"
            />
            {abertura.grupo && abertura.grupo.length > 1 && originais.some((a) => !alvosEscolhidos.includes(a)) && (
              <p className="text-[12px] text-[color:var(--warn)]">
                Sai desta nomeação: {originais.filter((a) => !alvosEscolhidos.includes(a)).map(rotuloDe).join(" · ")}.
              </p>
            )}
            {abertura.id && (abertura.grupo?.length ?? 1) <= 1 && !alvosEscolhidos.includes(abertura.alvo) && alvosEscolhidos.length > 0 && (
              <p className="text-[12px] text-muted">
                Este vínculo deixa {rotuloDe(abertura.alvo)} e passa a responder em {rotuloDe(alvosEscolhidos[0])}.
              </p>
            )}
            {alvosEscolhidos.length > 1 && (
              <p className="text-[12px] text-muted">
                A mesma nomeação vincula a pessoa a {alvosEscolhidos.length} lugares: {alvosEscolhidos.map(rotuloDe).join(" · ")}
                {abertura.id ? " (os novos lugares viram vínculos próprios)." : "."}
              </p>
            )}
          </>
        )}
      </section>

      <Segmented<TipoVinculo>
        ariaLabel="Tipo de responsável"
        value={d.tipo}
        disabled={ocupado}
        options={[
          { value: "padrao", label: "Padrão", dica: "Responde no período (o fim pode ficar em aberto) com o cargo da pessoa — menos quando um temporário vale" },
          { value: "temporario", label: "Temporário", dica: "Responde só no período, com o cargo do período (substitui os padrões)" },
        ]}
        onChange={(v) => set("tipo", v)}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          {temp ? (
            <OpcoesCargo label="Cargo ou função do período" valor={d.funcao} cargos={cargos} onChange={(c) => set("funcao", c)} />
          ) : (
            <div className="space-y-1">
              <span className="block text-[13px] font-medium text-text">Cargo ou função (o da pessoa)</span>
              {escolhida?.cargo ? (
                <p className="text-sm text-text">{escolhida.cargo}</p>
              ) : (
                <p className="text-[13px] text-[color:var(--warn)]">{escolhida ? "Defina o cargo no cadastro da pessoa." : "Escolha a pessoa."}</p>
              )}
            </div>
          )}
        </div>
        <SelectField label="Nomeação (ato)" value={d.atoTipo ?? ""} onChange={(e) => set("atoTipo", lerTipoAto(e.target.value))} denso>
          <option value="">—</option>
          {TIPOS_ATO.map((t) => (
            <option key={t.valor} value={t.valor}>
              {t.rotulo}
            </option>
          ))}
        </SelectField>
        <TextField label="Número do ato" value={d.atoNumero} onChange={(e) => set("atoNumero", e.target.value)} placeholder="Ex.: 123/2026" maxLength={120} denso />
        <div className="sm:col-span-2">
          <TextField label="Link do documento" value={d.atoLink} onChange={(e) => set("atoLink", e.target.value.trim())} placeholder="https://…" maxLength={500} inputMode="url" denso />
        </div>
        <TextField label="Início" type="date" value={d.inicio ?? ""} onChange={(e) => set("inicio", e.target.value || null)} denso />
        <TextField
          label={temp ? "Fim" : "Fim (opcional)"}
          type="date"
          value={d.fim ?? ""}
          onChange={(e) => set("fim", e.target.value || null)}
          hint={temp ? undefined : "Sem data final = vigente até informar"}
          denso
        />
      </div>

      {motivo && (exoneracao || d.inicio || d.fim || d.atoLink || d.funcao) && <Callout kind="warn">{motivo}</Callout>}

      <div className="flex justify-end gap-2 border-t border-border pt-3">
        <Button size="sm" variant="secondary" disabled={ocupado} onClick={onFechar}>
          Cancelar
        </Button>
        <Button size="sm" loading={ocupado} disabled={!!falta} title={falta ?? undefined} onClick={() => void salvar()}>
          Salvar vínculo
        </Button>
      </div>
    </div>
  );
}

/** A pessoa cadastrada na hora (no editor do vínculo). */
export type NovaPessoa = { nome: string; matricula: string; cargo: string };

/** A escolha do cargo entre os CADASTRADOS (Configurações → Cargos e funções) — o atual fora da lista continua visível.
 * `oculto` = sem o rótulo à vista (dentro de um campo com cadeado, que já o mostra): o `<select>` da célula. */
export function OpcoesCargo({
  label,
  valor,
  cargos,
  onChange,
  oculto = false,
}: {
  label: string;
  valor: string;
  cargos: readonly string[];
  onChange: (c: string) => void;
  oculto?: boolean;
}) {
  const opcoes = (
    <>
      <option value="">{cargos.length ? (oculto ? "Nenhum" : "Escolha…") : "Nenhum cargo cadastrado"}</option>
      {valor && !cargos.includes(valor) && <option value={valor}>{valor} (fora da lista)</option>}
      {cargos.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </>
  );
  if (oculto)
    return (
      <select className={cellCls} value={valor} onChange={(e) => onChange(e.target.value)} aria-label={label}>
        {opcoes}
      </select>
    );
  return (
    <SelectField label={label} value={valor} onChange={(e) => onChange(e.target.value)} denso>
      {opcoes}
    </SelectField>
  );
}
