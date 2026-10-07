"use client";

import { useEffect, useMemo, useState } from "react";
import { brl, num } from "@/lib/format";
import {
  aplicarVisao,
  contarAusentes,
  DIMENSOES_VISAO,
  type DimensaoVisao,
  type FiltrosVisao,
  type LinhaOrcamentoVisao,
  opcoesDaDimensao,
  semAusentes,
  type VisaoOrcamento,
  valoresAusentes,
} from "@/lib/orcamento-visao";
import { type AlvosVinculo, unidadesDoOrcamento, type VinculoOrcamento, type VisaoVinculos, vinculosDaVisao } from "@/lib/orcamento-vinculo";
import { FerramentasNoLugar } from "./AbasEspaco";
import { AjudaVisoes } from "./AjudaVisoes";
import { AvisoFlutuante } from "./AvisoFlutuante";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { useConfirmacao } from "./Confirmacao";
import { TextField } from "./Field";
import { Modal } from "./Modal";
import { OrcamentoVinculos } from "./OrcamentoVinculos";
import { useGravacaoVinculos } from "./OrcamentoVinculosAba";
import { Segmented } from "./Segmented";
import { SeletorMultiplo } from "./SeletorMultiplo";

const SEM_VINCULOS: VinculoOrcamento[] = [];

/** Um lançamento do orçamento como a visão o enxerga (as dimensões + a dotação inicial, a prévia do Σ). */
export type LinhaVisaoOrcamento = LinhaOrcamentoVisao & { valorInicial: number };

/**
 * EDITOR de uma VISÃO do orçamento — o BANNER padrão (`Modal`): nome + uma lista suspensa por dimensão da visão
 * (`DIMENSOES_VISAO`; unidade, ações e órgão são dos Vínculos), opções CONECTADAS e a prévia do Σ no rodapé. O MESMO na
 * aba Visões do orçamento e na engrenagem do orçamento do PCA. As explicações (o que a visão filtra, os PCAs que a usam —
 * ela é global) ficam na Ajuda (?) do cabeçalho; no corpo só o que pede ação: os valores que o orçamento atual NÃO traz,
 * com "Remover ausentes". Grava pela rota
 * das visões e devolve o id ao host (`onSalva`), que recarrega a tela.
 */
export function EditorVisaoOrcamento({
  aberta,
  itens,
  podeEditar,
  onFechar,
  onSalva,
  vinculos,
  alvos,
  visoes,
  podeEditarVinculos = podeEditar,
}: {
  /** A visão aberta, "nova" ou `null` (fechado). */
  aberta: VisaoOrcamento | "nova" | null;
  itens: LinhaVisaoOrcamento[];
  podeEditar: boolean;
  onFechar: () => void;
  onSalva: (r: { id: number; nova: boolean; nome: string }) => void;
  /** TODOS os vínculos (o padrão e os das visões) + os alvos + as visões — a aba Vínculos (sem eles, não aparece). */
  vinculos?: VinculoOrcamento[];
  alvos?: AlvosVinculo;
  visoes?: VisaoVinculos[];
  /** Configura os vínculos (Configurar no Orçamento). */
  podeEditarVinculos?: boolean;
}) {
  const [nome, setNome] = useState("");
  const [filtros, setFiltros] = useState<FiltrosVisao>({});
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const { confirmar, confirmacao } = useConfirmacao();
  const [parte, setParte] = useState<"filtros" | "vinculos">("filtros");

  // Cada abertura começa do que está gravado.
  useEffect(() => {
    if (!aberta) return;
    setNome(aberta === "nova" ? "" : aberta.nome);
    setFiltros(aberta === "nova" ? {} : aberta.filtros);
    setErro(null);
    setParte("filtros");
  }, [aberta]);

  // VÍNCULOS desta visão (só da gravada): os que valem nela + a gravação com escopo.
  const g = useGravacaoVinculos(vinculos ?? SEM_VINCULOS, visoes);
  const visaoVinc = aberta && aberta !== "nova" ? (g.visoesAtuais.find((v) => v.id === aberta.id) ?? { id: aberta.id, nome: aberta.nome, proprias: aberta.proprias }) : null;
  const efetivos = useMemo(() => (visaoVinc ? vinculosDaVisao(g.atuais, visaoVinc) : []), [g.atuais, visaoVinc]);
  const unidades = useMemo(
    () => (vinculos ? unidadesDoOrcamento(itens.map((i) => ({ orgao: i.orgao ?? null, unidade: i.unidade ?? null, acao: i.acao ?? null, valorInicial: i.valorInicial }))) : []),
    [vinculos, itens],
  );
  const comVinculos = !!vinculos && !!alvos;
  const proprias = visaoVinc?.proprias.length ?? 0;

  const total = useMemo(() => itens.reduce((s, i) => s + i.valorInicial, 0), [itens]);
  const naVisao = useMemo(() => aplicarVisao(itens, filtros), [itens, filtros]);
  const somaVisao = naVisao.reduce((s, i) => s + i.valorInicial, 0);
  const ausentes = useMemo(() => valoresAusentes(itens, filtros), [itens, filtros]);
  const opcoes = useMemo(() => {
    const m = new Map<DimensaoVisao, { valor: string; contagem: number }[]>();
    if (!aberta) return m;
    for (const d of DIMENSOES_VISAO) m.set(d.key, opcoesDaDimensao(itens, d.key, filtros).map((o) => ({ valor: o.valor, contagem: o.linhas })));
    return m;
  }, [itens, filtros, aberta]);
  const usos = aberta && aberta !== "nova" ? (aberta.pcas ?? []) : [];

  async function removerAusentes() {
    const r = semAusentes(filtros, ausentes);
    if (r.esvaziadas.length) {
      const ok = await confirmar({
        titulo: "Remover os valores ausentes?",
        texto: `Nada do que foi escolhido em ${r.esvaziadas.join(", ")} existe neste orçamento — sem eles, a visão passa a considerar TODOS os valores dessa(s) dimensão(ões).`,
        confirmar: "Remover",
      });
      if (!ok) return;
    }
    setFiltros(r.filtros);
  }

  async function salvar() {
    if (!aberta || !nome.trim() || salvando) return;
    setSalvando(true);
    setErro(null);
    try {
      const nova = aberta === "nova";
      const r = await fetch(nova ? "/api/orcamento/visoes" : `/api/orcamento/visoes/${aberta.id}`, {
        method: nova ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: nome.trim(), filtros }),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; id?: number };
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Não foi possível salvar a visão.");
      onSalva({ id: nova ? Number(j.id) : aberta.id, nova, nome: nome.trim() });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar a visão.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <>
      <Modal
        open={aberta != null}
        onClose={onFechar}
        bloqueado={salvando || g.salvando}
        size={parte === "vinculos" ? "xl" : "lg"}
        titulo={aberta === "nova" ? "Nova visão" : podeEditar ? "Editar visão" : "Visão"}
        acoesCabecalho={<AjudaVisoes usos={aberta && aberta !== "nova" ? usos : undefined} />}
        rodape={
          // Altura FIXA: a prévia numa linha própria (truncada) e os botões abaixo — marcar um item não muda o banner.
          <div className="flex flex-wrap items-center justify-end gap-2">
            <p className="w-full truncate text-sm text-text-2">
              Na visão: <b className="tabular-nums">{brl(somaVisao)}</b> de <span className="tabular-nums">{brl(total)}</span> ·{" "}
              {num(naVisao.length)} {naVisao.length === 1 ? "lançamento" : "lançamentos"}
            </p>
            <Button size="sm" variant="ghost" onClick={onFechar} disabled={salvando}>
              {podeEditar ? "Cancelar" : "Fechar"}
            </Button>
            {podeEditar && (
              <Button size="sm" onClick={salvar} loading={salvando} disabled={!nome.trim()}>
                {aberta === "nova" ? "Criar visão" : "Atualizar visão"}
              </Button>
            )}
          </div>
        }
      >
        <div className="space-y-[var(--gap-block)]">
          {comVinculos && (
            <Segmented
              value={parte}
              onChange={setParte}
              ariaLabel="Parte da visão"
              options={[
                { value: "filtros", label: "Filtros", dica: "O que a visão considera do orçamento" },
                {
                  value: "vinculos",
                  label: proprias ? `Vínculos (${proprias} ${proprias === 1 ? "própria" : "próprias"})` : "Vínculos",
                  dica: "Os vínculos das unidades nesta visão — os próprios dela e, nas demais, o padrão",
                },
              ]}
            />
          )}
          {parte === "vinculos" && comVinculos ? (
            visaoVinc && alvos ? (
              <FerramentasNoLugar>
                <OrcamentoVinculos
                  unidades={unidades}
                  vinculos={efetivos}
                  alvos={alvos}
                  podeEditar={podeEditarVinculos}
                  salvando={g.salvando}
                  erro={g.erro}
                  contexto={{ visoes: g.visoesAtuais, visaoId: visaoVinc.id }}
                  onCriar={g.criar}
                  onEditar={g.editar}
                  onExcluir={g.excluir}
                  onUsarPadrao={(chave) => g.usarPadrao(visaoVinc.id, chave)}
                />
              </FerramentasNoLugar>
            ) : (
              <Callout kind="info">Crie a visão para ajustar os vínculos dela.</Callout>
            )
          ) : (
            <>
              {erro && <Callout kind="danger">{erro}</Callout>}
              <TextField label="Nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: PCA" maxLength={80} disabled={!podeEditar} />
              {contarAusentes(ausentes) > 0 && (
                <Callout kind="warn">
                  <div className="space-y-1.5">
                    <p>
                      <b>{num(contarAusentes(ausentes))} valor(es) da visão não existem neste orçamento</b> (o QDD foi reenviado ou o texto
                      mudou) e não contam nada:
                    </p>
                    <ul className="list-disc pl-5 text-[13px]">
                      {ausentes.map((a) => (
                        <li key={a.dimensao}>
                          {a.rotulo}: {a.valores.join("; ")}
                        </li>
                      ))}
                    </ul>
                    {podeEditar && (
                      <Button size="sm" variant="secondary" onClick={removerAusentes} disabled={salvando}>
                        Remover ausentes
                      </Button>
                    )}
                  </div>
                </Callout>
              )}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {DIMENSOES_VISAO.map((d) => (
                  <SeletorMultiplo
                    key={d.key}
                    suspenso
                    rotulo={d.rotulo}
                    opcoes={opcoes.get(d.key) ?? []}
                    selecionados={filtros[d.key] ?? []}
                    disabled={!podeEditar || salvando}
                    onChange={(vals) => setFiltros((f) => ({ ...f, [d.key]: vals.length ? vals : undefined }))}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </Modal>
      {g.erro && (
        <AvisoFlutuante kind="danger" titulo="Não foi possível gravar o vínculo" onClose={g.limparErro}>
          {g.erro}
        </AvisoFlutuante>
      )}
      {confirmacao}
    </>
  );
}
