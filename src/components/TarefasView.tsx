"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { num } from "@/lib/format";
import { chamarPadronizacao as chamar } from "@/lib/padronizacao-cliente";
import type { QuadroCard as QuadroCardDados } from "@/lib/tarefas";
import { type AtorPasta, type ConjuntoQuadros, MAX_CONJUNTOS, type PastasQuadros } from "@/lib/tarefas-core";
import { MESES } from "@/lib/normalize";
import { mesSeguinte } from "@/lib/calendario-core";
import { AvisoFlutuante } from "./AvisoFlutuante";
import { Button } from "./Button";
import { Checkbox, SelectField } from "./Field";
import { useFavoritosQuadros } from "./FavoritosQuadros";
import { IconInbox, IconPasta } from "./icons";
import { Modal } from "./Modal";
import { SeletorFundo } from "./SeletorFundo";
import { Switch } from "./Switch";
import { corpoFundo, type FundoEscolha } from "@/lib/imagem-fundo-core";
import { CamposPeriodo, CamposQuadro, type CamposQuadroValor, type PeriodoQuadro, QuadroNovoCard } from "./QuadroCard";
import { EditorConjunto, pastaEmBranco, SecoesDeQuadros, useConjuntosQuadros } from "./SecoesQuadros";

const NOVO: CamposQuadroValor = { nome: "", cor: "#6366f1", descricao: "" };
const VAZIO: PastasQuadros = { lista: [], ordem: [] };

/** Um MODELO de quadro que o "Novo quadro" pode usar (as listas, para a prévia). */
export type ModeloQuadroOpcao = { id: number; nome: string; listas: string[] };

/**
 * Módulo TAREFAS — os QUADROS do grupo ativo nas SEÇÕES (`SecoesDeQuadros`: Favoritos · Recentes · "Seus quadros" com as
 * PASTAS da pessoa — "Nova pasta", abrir no lugar, arrastar, editar/excluir no "…"; todas minimizáveis) + o card "+"
 * (editor) que cria um quadro (em branco ou de um MODELO; com as LISTAS DOS DIAS de um mês e os TEMPLATES de outro quadro)
 * no grupo ativo e o ABRE. O Calendário é um módulo à parte (`/painel/calendario`). 100% design-system.
 */
export function TarefasView({
  quadros,
  podeCriar,
  modelos = [],
  favoritos: favIniciais = [],
  conjuntos: conjIniciais = VAZIO,
  ator,
  hoje,
}: {
  quadros: QuadroCardDados[];
  podeCriar: boolean;
  modelos?: ModeloQuadroOpcao[];
  favoritos?: number[];
  hoje: string;
  /** As PASTAS que a pessoa vê (públicas do grupo + as privadas dela) + a ordem pessoal da grade. */
  conjuntos?: PastasQuadros;
  /** Quem vê (as regras das pastas). */
  ator: AtorPasta;
}) {
  const router = useRouter();
  const { favoritos, alternar } = useFavoritosQuadros(favIniciais);
  const conj = useConjuntosQuadros(conjIniciais, { quadros, ator, aoMudar: () => router.refresh() });
  // O quadro novo criado DENTRO de uma pasta (na privada, nasce privado).
  const [naPasta, setNaPasta] = useState<ConjuntoQuadros | null>(null);
  const [editando, setEditando] = useState<ConjuntoQuadros | null>(null);
  // O quadro do PERÍODO: um mês (o seguinte, por padrão — o quadro do mês é montado antes de ele começar).
  const [periodo, setPeriodo] = useState<PeriodoQuadro | null>(null);
  const [templatesDe, setTemplatesDe] = useState("");
  const [novo, setNovo] = useState<CamposQuadroValor | null>(null);
  const [fundo, setFundo] = useState<FundoEscolha>({ tipo: "nenhum" });
  const [privado, setPrivado] = useState(false);
  const [modeloId, setModeloId] = useState("");
  const modelo = modelos.find((m) => String(m.id) === modeloId);
  const [salvando, setSalvando] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);
  const abertas = quadros.reduce((s, q) => s + (q.arquivado ? 0 : q.abertas), 0);
  const atrasadas = quadros.reduce((s, q) => s + (q.arquivado ? 0 : q.atrasadas), 0);

  const abrirNovo = (pasta: ConjuntoQuadros | null = null) => {
    setNovo(NOVO);
    setNaPasta(pasta);
    setFundo({ tipo: "nenhum" });
    setPrivado(!!pasta?.privado);
    setPeriodo(null);
    setTemplatesDe("");
  };

  async function criar() {
    if (!novo?.nome.trim()) return;
    setSalvando(true);
    setFalha(null);
    try {
      const j = await chamar<{ id: number }>("/api/tarefas/quadros", "POST", {
        nome: novo.nome.trim(),
        cor: novo.cor,
        descricao: novo.descricao.trim() || null,
        modeloId: modelo?.id ?? null,
        periodo,
        templatesDe: templatesDe ? Number(templatesDe) : null,
        ...corpoFundo(fundo),
        privado: naPasta ? naPasta.privado : privado,
        pastaId: naPasta && !naPasta.id.startsWith("novo-") ? Number(naPasta.id) : null,
      });
      setNovo(null);
      router.push(`/painel/tarefas/${j.id}`);
    } catch (e) {
      setFalha((e as Error).message);
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-[var(--gap-block)]">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
        <h1 className="text-xl font-bold text-text">Tarefas</h1>
        <p className="text-sm text-muted">
          {quadros.length} {quadros.length === 1 ? "quadro" : "quadros"} · {num(abertas)} {abertas === 1 ? "tarefa aberta" : "tarefas abertas"}
          {atrasadas > 0 && <span style={{ color: "var(--danger)" }}> · {num(atrasadas)} atrasada{atrasadas === 1 ? "" : "s"}</span>} · do grupo ativo do cabeçalho
        </p>
        </div>
        {quadros.length > 0 && conj.estado.lista.length < MAX_CONJUNTOS && (
          <Button
            size="sm"
            variant="secondary"
            icon={<IconPasta className="h-4 w-4" />}
            onClick={() => setEditando(pastaEmBranco(ator))}
          >
            Nova pasta
          </Button>
        )}
      </div>

      {quadros.length === 0 && !podeCriar ? (
        <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-border-2 bg-surface px-6 py-16 text-center">
          <IconInbox className="h-10 w-10 text-faint" />
          <p className="text-sm text-muted">Nenhum quadro de tarefas neste grupo.</p>
        </div>
      ) : (
        <SecoesDeQuadros
          quadros={quadros}
          favoritos={favoritos}
          onFavorito={alternar}
          pastas={conj.estado}
          onMover={conj.mover}
          onEditarPasta={setEditando}
          onExcluirPasta={conj.excluir}
          ator={ator}
          novoNaPasta={podeCriar ? (c) => <QuadroNovoCard rotulo="Novo quadro nesta pasta" onClick={() => abrirNovo(c)} /> : undefined}
          extraFinal={podeCriar && <QuadroNovoCard onClick={() => abrirNovo()} />}
        />
      )}

      <EditorConjunto aberto={editando} quadros={quadros} pastas={conj.estado.lista} ator={ator} onFechar={() => setEditando(null)} onSalvar={conj.salvar} />
      {conj.confirmacao}
      <Modal
        open={novo != null}
        onClose={() => !salvando && setNovo(null)}
        titulo={naPasta ? `Novo quadro na pasta "${naPasta.nome}"` : "Novo quadro"}
        bloqueado={salvando}
        rodape={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" disabled={salvando} onClick={() => setNovo(null)}>
              Cancelar
            </Button>
            <Button loading={salvando} disabled={!novo?.nome.trim()} onClick={criar}>
              Criar quadro
            </Button>
          </div>
        }
      >
        {modelos.length > 0 && (
          <div className="mb-4">
            <SelectField label="Começar de" value={modeloId} disabled={salvando} onChange={(e) => setModeloId(e.target.value)}>
              <option value="">Quadro em branco</option>
              {modelos.map((m) => (
                <option key={m.id} value={m.id}>
                  Modelo: {m.nome}
                </option>
              ))}
            </SelectField>
          </div>
        )}
        <div className="mb-4">
          <SeletorFundo valor={fundo} onChange={setFundo} disabled={salvando} />
        </div>
        {novo && <CamposQuadro valor={novo} onChange={setNovo} />}
        <div className="mt-4">
          <Switch
            checked={naPasta ? naPasta.privado : privado}
            onChange={setPrivado}
            disabled={salvando || !!naPasta}
            label={
              <span>
                <span className="block font-semibold text-text">Quadro privado</span>
                <span className="block text-[12px] text-muted">
                  {naPasta ? (naPasta.privado ? "Na pasta privada, o quadro nasce privado — só você o vê." : "Na pasta do grupo, o quadro é de todo o grupo.") : "Só você vê o quadro — nem o grupo nem os administradores."}
                </span>
              </span>
            }
          />
        </div>
        <div className="mt-4 space-y-3 border-t border-border pt-3">
          <div className="flex min-h-11 items-center lg:min-h-9">
            <Checkbox label="Listas dos dias de um mês (quadro do período)" checked={periodo != null} disabled={salvando} onChange={(e) => setPeriodo(e.target.checked ? { ...mesSeguinte(hoje), diasUteis: true } : null)} />
          </div>
          {periodo && <CamposPeriodo valor={periodo} onChange={setPeriodo} disabled={salvando} />}
          {quadros.length > 0 && (
            <SelectField label="Copiar os templates de" value={templatesDe} disabled={salvando} onChange={(e) => setTemplatesDe(e.target.value)}>
              <option value="">Nenhum quadro</option>
              {quadros.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.nome}
                </option>
              ))}
            </SelectField>
          )}
        </div>
        <p className="mt-3 text-[12px] text-muted">
          Nasce com as listas {(modelo?.listas ?? ["A fazer", "Em andamento", "Concluído"]).join(" · ")}
          {modelo ? " e as etiquetas do modelo" : ""}
          {periodo ? `, mais uma lista por ${periodo.diasUteis ? "dia útil" : "dia"} de ${MESES[periodo.mes - 1].toLowerCase()}/${periodo.ano}` : ""}
          {templatesDe ? " e os templates do quadro escolhido" : ""} — ajuste depois no próprio quadro.
        </p>
      </Modal>
      {falha && (
        <AvisoFlutuante kind="danger" titulo="Atenção" onClose={() => setFalha(null)}>
          {falha}
        </AvisoFlutuante>
      )}
    </div>
  );
}
