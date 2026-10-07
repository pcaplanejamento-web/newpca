"use client";

import { useState } from "react";
import { dataBR } from "@/lib/format";
import { TIPOS_ATO } from "@/lib/reparticao-responsaveis";
import {
  type DadosVinculo,
  type EstadoVinculo,
  estadoDoVinculo,
  lerTipoAto,
  motivoVinculoInvalido,
  type PessoaResponsavel,
  ROTULO_ESTADO_VINCULO,
  type TipoVinculo,
  type VinculoComPessoa,
} from "@/lib/responsaveis-planilha-core";
import { Badge, type Tone } from "./Badge";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { SelectField, TextField } from "./Field";
import { IconLink, IconPencil, IconPlus, IconTrash, IconUserCheck } from "./icons";
import { LinkExterno } from "./LinkExterno";
import { Modal } from "./Modal";
import { type OpcaoBusca, SeletorBusca } from "./SeletorBusca";
import { Segmented } from "./Segmented";

/**
 * RESPONSÁVEIS POR DFDs — as peças de tela da PLANILHA ÚNICA (pessoas vinculadas a unidades/órgãos): a célula dos
 * vigentes, a lista de vínculos (do alvo ou da pessoa) e o editor do vínculo (escolher a pessoa da planilha ou cadastrá-la
 * na hora; função, nomeação e período). Só apresentação — as gravações ficam com quem usa (`PlanilhaResponsaveis`).
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

/**
 * A LISTA de vínculos: um cartão por vínculo (a pessoa — ou o alvo, na lista da pessoa —, o tipo, o estado hoje, a
 * função, a nomeação com o link e o período). `irmaos` = os vínculos do MESMO alvo de cada um (o padrão fica inativo
 * com um temporário vigente). Sem `onEditar`/`onRemover`, só leitura.
 */
export function ListaVinculos({
  vinculos,
  irmaos,
  hoje,
  titulo,
  vazio,
  onEditar,
  onRemover,
  desabilitado = false,
}: {
  vinculos: readonly VinculoComPessoa[];
  irmaos: (v: VinculoComPessoa) => readonly VinculoComPessoa[];
  hoje: string;
  /** O texto principal do cartão (a pessoa ou o alvo) e o detalhe abaixo dele. */
  titulo: (v: VinculoComPessoa) => { texto: string; detalhe?: string; aviso?: string };
  vazio: string;
  onEditar?: (v: VinculoComPessoa) => void;
  onRemover?: (v: VinculoComPessoa) => void;
  desabilitado?: boolean;
}) {
  if (vinculos.length === 0) return <p className="text-[13px] text-muted">{vazio}</p>;
  return (
    <ul className="space-y-2">
      {vinculos.map((v) => {
        const estado = estadoDoVinculo(v, irmaos(v), hoje);
        const t = titulo(v);
        const ato = textoAto(v);
        const apagado = estado === "encerrado" || estado === "inativo";
        return (
          <li key={v.id} className={`flex flex-wrap items-start gap-x-3 gap-y-2 rounded-control border border-border p-3 ${apagado ? "bg-surface-2" : ""}`}>
            <div className="min-w-0 flex-1 space-y-1">
              <p className={`break-words text-[13.5px] font-semibold ${apagado ? "text-muted" : "text-text"}`}>{t.texto}</p>
              {t.detalhe && <p className="break-words text-[12px] text-muted">{t.detalhe}</p>}
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge tone={v.tipo === "temporario" ? "violet" : "slate"}>{v.tipo === "temporario" ? "Temporário" : "Padrão"}</Badge>
                <Badge tone={TOM_ESTADO[estado]}>{ROTULO_ESTADO_VINCULO[estado]}</Badge>
                {v.tipo === "temporario" && (
                  <span className="text-[12px] tabular-nums text-text-2">
                    {v.inicio ? dataBR(v.inicio) : "?"} a {v.fim ? dataBR(v.fim) : "?"}
                  </span>
                )}
              </div>
              <p className="text-[12.5px] text-text-2">
                {v.funcao || <span className="text-[color:var(--warn)]">Sem função</span>}
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
      })}
    </ul>
  );
}

/** O que o editor manda gravar: a pessoa, o alvo (`o<id>` | `u<id>`) e os dados. */
export type EnvioVinculo = { responsavelId: number; alvo: string; dados: DadosVinculo };

/** Como o editor abre: novo (com o tipo e, quando já se sabe, a pessoa ou o alvo) ou editando um vínculo. */
export type AberturaVinculo = { id?: number; responsavelId: number | null; alvo: string; dados: DadosVinculo };

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
 * O EDITOR do vínculo (num banner): a PESSOA escolhida da planilha (busca por nome ou matrícula) — ou cadastrada ali —,
 * o ALVO (unidade ou órgão; só os que valem pela regra do órgão), padrão ou temporário, a função, a nomeação (ato + nº +
 * link) e, no temporário, o período. A pessoa e o alvo podem vir fixos (o banner da pessoa fixa a pessoa; o do órgão/da
 * unidade, o alvo). A mesma régua do servidor trava o Salvar (`motivoVinculoInvalido`).
 */
export function EditorVinculo({
  abertura,
  pessoas,
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
  /** Os alvos que se podem escolher (`valor` = `o<id>` | `u<id>`). */
  alvos: OpcaoBusca[];
  pessoaFixa?: boolean;
  alvoFixo?: { rotulo: string };
  ocupado: boolean;
  /** Cadastra a pessoa na planilha e devolve o id (ou `null`). */
  onCriarPessoa: (nome: string, matricula: string) => Promise<number | null>;
  onSalvar: (e: EnvioVinculo, id?: number) => Promise<boolean>;
  onFechar: () => void;
}) {
  return (
    <Modal open={!!abertura} onClose={onFechar} bloqueado={ocupado} size="md" titulo={abertura?.id ? "Editar vínculo" : "Novo vínculo"}>
      {abertura && (
        <CorpoEditor
          key={`${abertura.id ?? "novo"}:${abertura.alvo}:${abertura.responsavelId ?? ""}`}
          abertura={abertura}
          pessoas={pessoas}
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
  alvos: OpcaoBusca[];
  pessoaFixa?: boolean;
  alvoFixo?: { rotulo: string };
  ocupado: boolean;
  onCriarPessoa: (nome: string, matricula: string) => Promise<number | null>;
  onSalvar: (e: EnvioVinculo, id?: number) => Promise<boolean>;
  onFechar: () => void;
}) {
  const [pessoa, setPessoa] = useState(abertura.responsavelId == null ? "" : String(abertura.responsavelId));
  const [alvo, setAlvo] = useState(abertura.alvo);
  const [d, setD] = useState<DadosVinculo>(abertura.dados);
  const [nova, setNova] = useState<{ nome: string; matricula: string } | null>(null);
  const set = <K extends keyof DadosVinculo>(k: K, v: DadosVinculo[K]) => setD((x) => ({ ...x, [k]: v }));
  const escolhida = pessoas.find((p) => String(p.id) === pessoa) ?? null;
  const motivo = motivoVinculoInvalido(d);
  const falta = !pessoa ? "Escolha a pessoa." : !alvo ? "Escolha a unidade ou o órgão." : motivo;
  const opcoesPessoas: OpcaoBusca[] = pessoas.map((p) => ({ valor: String(p.id), rotulo: p.nome, detalhe: p.matricula ? `Matrícula ${p.matricula}` : "Sem matrícula" }));

  async function cadastrar() {
    if (!nova?.nome.trim()) return;
    const id = await onCriarPessoa(nova.nome, nova.matricula);
    if (id != null) {
      setPessoa(String(id));
      setNova(null);
    }
  }

  async function salvar() {
    if (falta || !pessoa) return;
    if (await onSalvar({ responsavelId: Number(pessoa), alvo, dados: d }, abertura.id)) onFechar();
  }

  return (
    <div className="space-y-[var(--gap-block)]">
      <section className="space-y-2">
        <span className="block text-[13px] font-semibold text-text">Pessoa</span>
        {pessoaFixa || abertura.id ? (
          <p className="text-sm font-semibold text-text">
            {escolhida?.nome ?? "—"} <span className="font-normal text-muted">{escolhida?.matricula ? `· Matrícula ${escolhida.matricula}` : "· Sem matrícula"}</span>
          </p>
        ) : nova ? (
          <div className="space-y-2 rounded-control border border-border p-3">
            <TextField label="Nome completo" value={nova.nome} onChange={(e) => setNova({ ...nova, nome: e.target.value })} maxLength={160} autoFocus denso />
            <TextField label="Matrícula" value={nova.matricula} onChange={(e) => setNova({ ...nova, matricula: e.target.value })} maxLength={60} inputMode="numeric" denso />
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
            <Button size="sm" variant="secondary" disabled={ocupado} icon={<IconPlus className="h-4 w-4" />} onClick={() => setNova({ nome: "", matricula: "" })}>
              Cadastrar pessoa nova
            </Button>
          </>
        )}
      </section>

      <section className="space-y-2">
        <span className="block text-[13px] font-semibold text-text">Onde responde</span>
        {alvoFixo || abertura.id ? (
          <p className="text-sm font-semibold text-text">{alvoFixo?.rotulo ?? alvos.find((a) => a.valor === alvo)?.rotulo ?? "—"}</p>
        ) : alvos.length === 0 ? (
          <Callout kind="info">Nenhuma unidade ou órgão recebe responsáveis aqui pela regra de assinatura.</Callout>
        ) : (
          <SeletorBusca opcoes={alvos} valor={alvo} onChange={setAlvo} ariaLabel="Unidade ou órgão" placeholder="Buscar unidade ou órgão…" disabled={ocupado} />
        )}
      </section>

      <Segmented<TipoVinculo>
        ariaLabel="Tipo de responsável"
        value={d.tipo}
        disabled={ocupado}
        options={[
          { value: "padrao", label: "Padrão", dica: "Responde sempre (menos quando um temporário vale)" },
          { value: "temporario", label: "Temporário", dica: "Responde só no período (substitui os padrões)" },
        ]}
        onChange={(v) => setD((x) => ({ ...x, tipo: v, inicio: v === "padrao" ? null : x.inicio, fim: v === "padrao" ? null : x.fim }))}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <TextField label="Função" value={d.funcao} onChange={(e) => set("funcao", e.target.value)} placeholder="Ex.: Secretário Municipal" maxLength={120} denso />
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
        {d.tipo === "temporario" && (
          <>
            <TextField label="Início" type="date" value={d.inicio ?? ""} onChange={(e) => set("inicio", e.target.value || null)} denso />
            <TextField label="Fim" type="date" value={d.fim ?? ""} onChange={(e) => set("fim", e.target.value || null)} denso />
          </>
        )}
      </div>

      {motivo && (d.inicio || d.fim || d.atoLink) && <Callout kind="warn">{motivo}</Callout>}

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
