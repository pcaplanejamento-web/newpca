"use client";

import { useMemo, useRef, useState } from "react";
import { chamarPadronizacao as chamar } from "@/lib/padronizacao-cliente";
import { nomeExibicao, type Pessoa } from "@/lib/pessoa";
import type { CartaoImportado } from "@/lib/tarefas-validation";
import { casarMembro, type ImportacaoTrello, LOTE_IMPORTACAO, lerTrello, resumoTrello } from "@/lib/trello-import";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { Dropzone } from "./Dropzone";
import { Checkbox, SelectField } from "./Field";
import { IconUpload } from "./icons";
import { Modal } from "./Modal";
import { Progress } from "./Progress";
import { StatMini } from "./StatMini";
import { toast } from "./Toast";

/** O andamento guardado entre tentativas (retomar de onde parou). */
type Andamento = { listas: Record<string, number>; etiquetas: Record<string, number>; criados: Record<string, number>; vinculado: boolean };

/**
 * IMPORTAR DO TRELLO (na Configuração do quadro, editores): soltar o JSON exportado do Trello → a PRÉVIA (listas,
 * cartões, arquivados, templates, etiquetas, checklists, comentários, vínculos), os MEMBROS do Trello casados com as
 * pessoas do grupo (escolha em cada um) e as opções → a importação em LOTES (estrutura → cartões de 20 em 20 → vínculos)
 * com a barra de progresso. Uma falha para no cartão que falhou e "Tentar de novo" RETOMA dali (nada é duplicado).
 */
export function ImportarTrello({ aberto, quadroId, pessoas, onFechar, onFeito }: { aberto: boolean; quadroId: number; pessoas: Pessoa[]; onFechar: () => void; onFeito: () => void }) {
  const [dados, setDados] = useState<ImportacaoTrello | null>(null);
  const [erroArquivo, setErroArquivo] = useState<string | null>(null);
  const [membros, setMembros] = useState<Record<string, number | null>>({});
  const [comArquivados, setComArquivados] = useState(true);
  const [limparVazias, setLimparVazias] = useState(true);
  const [progresso, setProgresso] = useState<{ feito: number; total: number; etapa: string } | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const andamento = useRef<Andamento | null>(null);
  const rodando = progresso != null && falha == null;

  const cartoes = useMemo(() => (dados ? dados.cartoes.filter((c) => comArquivados || !c.arquivada) : []), [dados, comArquivados]);
  const resumo = dados ? resumoTrello(dados) : null;

  const reiniciar = () => {
    setDados(null);
    setErroArquivo(null);
    setMembros({});
    setProgresso(null);
    setFalha(null);
    andamento.current = null;
  };
  const fechar = () => {
    if (rodando) return;
    reiniciar();
    onFechar();
  };

  const ler = async (f: File) => {
    reiniciar();
    try {
      const t = lerTrello(JSON.parse(await f.text()));
      if (!t) return setErroArquivo("Este arquivo não é um quadro exportado do Trello (JSON).");
      setDados(t);
      setMembros(Object.fromEntries(t.membros.map((m) => [m.chave, casarMembro(m, pessoas)])));
    } catch {
      setErroArquivo("Não foi possível ler o arquivo — escolha o .json exportado do Trello.");
    }
  };

  const importar = async () => {
    if (!dados || rodando) return;
    setFalha(null);
    if (!andamento.current) andamento.current = { listas: {}, etiquetas: {}, criados: {}, vinculado: false };
    const a = andamento.current;
    const url = `/api/tarefas/quadros/${quadroId}/importar`;
    const pendentes = cartoes.filter((c) => a.criados[c.chave] == null);
    const total = cartoes.length + 2;
    setProgresso({ feito: cartoes.length - pendentes.length, total, etapa: "Criando as listas e as etiquetas…" });
    try {
      if (!Object.keys(a.listas).length && dados.listas.length) {
        const r = await chamar<{ listas: Record<string, number>; etiquetas: Record<string, number> }>(url, "POST", {
          modo: "estrutura",
          listas: dados.listas.filter((l) => comArquivados || !l.arquivada || cartoes.some((c) => c.lista === l.chave)),
          etiquetas: dados.etiquetas,
          limparVazias,
        });
        a.listas = r.listas;
        a.etiquetas = r.etiquetas;
      }
      for (let i = 0; i < pendentes.length; i += LOTE_IMPORTACAO) {
        const lote: CartaoImportado[] = pendentes
          .slice(i, i + LOTE_IMPORTACAO)
          .filter((c) => a.listas[c.lista] != null)
          .map((c) => ({
            chave: c.chave,
            listaId: a.listas[c.lista],
            titulo: c.titulo,
            descricao: c.descricao || null,
            inicio: c.inicio,
            prazo: c.prazo,
            prazoHora: c.prazo ? c.prazoHora : null,
            concluida: c.concluida,
            arquivada: c.arquivada,
            template: c.template,
            etiquetas: c.etiquetas.map((e) => a.etiquetas[e]).filter((x): x is number => x != null),
            pessoas: c.membros.map((m) => membros[m]).filter((x): x is number => x != null),
            checklists: c.checklists.filter((k) => k.itens.length || k.nome),
            links: c.links,
            comentarios: c.comentarios,
          }));
        setProgresso({ feito: cartoes.length - pendentes.length + i, total, etapa: `Importando os cartões (${i + 1}–${Math.min(i + LOTE_IMPORTACAO, pendentes.length)} de ${pendentes.length})…` });
        if (!lote.length) continue;
        const r = await chamar<{ ids: Record<string, number>; falha: { chave: string; erro: string } | null }>(url, "POST", { modo: "cartoes", cartoes: lote });
        Object.assign(a.criados, r.ids);
        if (r.falha) throw new Error(`Cartão "${dados.cartoes.find((c) => c.chave === r.falha?.chave)?.titulo ?? r.falha.chave}": ${r.falha.erro}`);
      }
      if (!a.vinculado) {
        setProgresso({ feito: cartoes.length + 1, total, etapa: "Ligando os cartões vinculados…" });
        const pares = cartoes.flatMap((c) =>
          c.vinculos.map((v) => ({ de: a.criados[c.chave], para: a.criados[v] })).filter((p) => p.de != null && p.para != null),
        );
        for (let i = 0; i < pares.length; i += 500) await chamar(url, "POST", { modo: "vinculos", pares: pares.slice(i, i + 500) });
        a.vinculado = true;
      }
      setProgresso({ feito: total, total, etapa: "Pronto." });
      toast.success(`${Object.keys(a.criados).length} tarefa(s) importada(s) do Trello.`);
      onFeito();
      reiniciar();
      onFechar();
    } catch (e) {
      setFalha((e as Error).message);
      onFeito();
    }
  };

  return (
    <Modal
      open={aberto}
      onClose={fechar}
      titulo="Importar do Trello"
      size="lg"
      bloqueado={rodando}
      rodape={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" disabled={rodando} onClick={fechar}>
            {falha ? "Fechar" : "Cancelar"}
          </Button>
          {dados && (
            <Button loading={rodando} disabled={rodando || !cartoes.length} icon={<IconUpload className="h-4 w-4" />} onClick={importar}>
              {falha ? "Tentar de novo" : `Importar ${cartoes.length} cartão(ões)`}
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        {!dados && (
          <>
            <Dropzone accept=".json,application/json" onFile={ler} titulo="Solte o JSON do Trello ou clique para escolher" dica="No Trello: Menu do quadro → Imprimir, exportar e compartilhar → Exportar como JSON." />
            {erroArquivo && <Callout kind="danger">{erroArquivo}</Callout>}
          </>
        )}
        {dados && resumo && (
          <>
            <p className="text-[14px] font-semibold text-text">{dados.nome}</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <StatMini label="Listas" value={resumo.listas} />
              <StatMini label="Cartões" value={resumo.cartoes} hint={resumo.arquivados ? `${resumo.arquivados} arquivado(s)` : undefined} />
              <StatMini label="Etiquetas" value={resumo.etiquetas} />
              <StatMini label="Checklists" value={resumo.checklists} />
              <StatMini label="Comentários" value={resumo.comentarios} />
              <StatMini label="Templates" value={resumo.templates} />
              <StatMini label="Vínculos entre cartões" value={resumo.vinculos} />
            </div>
            {dados.membros.length > 0 && (
              <fieldset className="space-y-2">
                <legend className="mb-1 text-[13px] font-semibold text-text">Membros do Trello → pessoas do grupo</legend>
                {dados.membros.map((m) => (
                  <SelectField
                    key={m.chave}
                    compacto
                    label={m.nome || m.usuario}
                    value={membros[m.chave] == null ? "" : String(membros[m.chave])}
                    disabled={rodando}
                    onChange={(e) => setMembros((x) => ({ ...x, [m.chave]: e.target.value ? Number(e.target.value) : null }))}
                  >
                    <option value="">Não atribuir</option>
                    {pessoas.map((p) => (
                      <option key={p.id} value={p.id}>
                        {nomeExibicao(p)}
                      </option>
                    ))}
                  </SelectField>
                ))}
              </fieldset>
            )}
            <div className="flex flex-col gap-1">
              <Checkbox checked={comArquivados} disabled={rodando} onChange={(e) => setComArquivados(e.target.checked)} label="Importar também os cartões e as listas arquivados (entram arquivados)" />
              <Checkbox checked={limparVazias} disabled={rodando} onChange={(e) => setLimparVazias(e.target.checked)} label="Tirar as listas vazias deste quadro antes" />
            </div>
            {progresso && (
              <div className="space-y-1">
                <Progress value={(progresso.feito / Math.max(1, progresso.total)) * 100} label="Importação do Trello" />
                <p className="text-[12.5px] text-muted">{progresso.etapa}</p>
              </div>
            )}
            {falha && <Callout kind="danger">A importação parou: {falha} — o que já entrou fica; "Tentar de novo" continua de onde parou.</Callout>}
            {!progresso && (
              <Button variant="ghost" size="sm" onClick={reiniciar}>
                Escolher outro arquivo
              </Button>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
