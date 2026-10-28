"use client";

import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { linkImportacoes, NOME_TIPO } from "@/lib/empenho-cards-core";
import { fracaoDaLeitura as fracaoLeituraGrande, rotuloPeriodo } from "@/lib/empenhos-core";
import { type Amostra, registrarAmostra, tempoRestanteMs } from "@/lib/fluxo-progresso";
import { estadoDoPedido, ordenarPedidos, resumoPedidos, ROTULO_ETAPA, textoBytes, textoPedido } from "@/lib/importacao-progresso";
import type { LoteAoVivo } from "@/lib/importacoes-andamento";
import { aoConsultarImportacao, assinarImportacoes, CHAVE_IMPORTACOES, fracaoDaImportacao, type ImportacaoLocal, importacoesLocais, importacoesLocaisServidor, lotesDestaAba, retirarImportacao } from "@/lib/importacoes-ao-vivo-store";
import { AndamentoDoServidor, AndamentoImportacao } from "./AndamentoImportacao";
import { type EstadoTrabalho, type Trabalho, usePainelSegundoPlano } from "./SegundoPlano";
import { toast } from "./Toast";

/**
 * O ANDAMENTO DAS IMPORTAÇÕES ao vivo, para o ADM, no painel padrão do canto inferior direito (`PainelSegundoPlano`):
 * - as desta ABA (`importacoes-ao-vivo-store` — fase a fase, pedido a pedido; seguem ao trocar de tela);
 * - as do SERVIDOR: a atualização automática (o cron), outras abas e outras pessoas — `GET /api/admin/importacoes/andamento`,
 *   relido a cada 3 s enquanto alguma lê (60 s parado; só com a aba à vista).
 * Todas ao mesmo tempo, cada uma com o que está acontecendo agora. O ADM desliga em Perfil → Notificações ("Andamento das
 * importações"); desligado, nada é pedido ao servidor (a importação desta aba só mantém a tela viva, sem aparecer).
 */


const RAPIDO_MS = 3000;
const PARADO_MS = 60_000;

type Pref = { ligado: boolean; definir: (v: boolean) => void };
const PrefCtx = createContext<Pref | null>(null);

/** A preferência (o Perfil liga e desliga na hora). Sem o provedor (não ADM), desligado. */
export function useImportacoesAoVivo(): Pref | null {
  return useContext(PrefCtx);
}

export function ImportacoesAoVivoProvider({ admin, ligado: inicial, children }: { admin: boolean; ligado: boolean; children: ReactNode }) {
  const [ligado, setLigado] = useState(inicial);
  const valor = useMemo(() => (admin ? { ligado, definir: setLigado } : null), [admin, ligado]);
  return <PrefCtx.Provider value={valor}>{children}</PrefCtx.Provider>;
}

/** As importações desta aba (ao vivo). */
export function useImportacoesLocais(): ImportacaoLocal[] {
  return useSyncExternalStore(assinarImportacoes, importacoesLocais, importacoesLocaisServidor);
}

/** A importação desta aba de UM card (a em curso, ou a última). */
export function useImportacaoDoCard(cardId: number): ImportacaoLocal | null {
  const l = useImportacoesLocais();
  return l.filter((i) => i.cardId === cardId).at(-1) ?? null;
}

/** O detalhe COMPLETO de uma importação desta aba no painel do canto — lido ao vivo do armazém (não depende do painel). */
function AndamentoDaAba({ id }: { id: string }) {
  const imp = useImportacoesLocais().find((i) => i.id === id);
  return imp ? <AndamentoImportacao imp={imp} /> : null;
}

const ESTADO_LOCAL: Record<ImportacaoLocal["estado"], EstadoTrabalho> = {
  rodando: "rodando",
  gravado: "concluido",
  parcial: "falhou",
  falhou: "falhou",
  interrompido: "cancelado",
  cancelado: "cancelado",
};
const ESTADO_LOTE = (l: LoteAoVivo): EstadoTrabalho =>
  l.estado === "lendo" ? "rodando" : l.estado === "promovido" || l.estado === "unidades" ? "concluido" : l.estado === "cancelado" ? "cancelado" : "falhou";

const num = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("pt-BR"));
const haQuanto = (sql: string, agora: number) => {
  const t = Date.parse(sql.includes("T") ? sql : `${sql.replace(" ", "T")}Z`);
  if (!Number.isFinite(t)) return "";
  const s = Math.max(0, Math.round((agora - t) / 1000));
  return s < 60 ? `há ${s} s` : `há ${Math.round(s / 60)} min`;
};

/** O texto de AGORA de uma importação do servidor (a leitura grande em fragmentos ou o último pedido). */
function textoDoLote(l: LoteAoVivo, agora: number): string {
  if (l.estado !== "lendo") return l.mensagem ?? (l.estado === "promovido" ? "Concluída e gravada." : "Terminou.");
  const partes: string[] = [];
  if (l.leitura) {
    const pct = Math.floor(fracaoLeituraGrande(l.leitura) * 100);
    partes.push(
      l.leitura.capturado
        ? `Processando a resposta de ${rotuloPeriodo(l.leitura)} (${textoBytes(l.leitura.bytes)}): ${pct}%`
        : `Baixando a resposta de ${rotuloPeriodo(l.leitura)}: ${textoBytes(l.leitura.bytes)}${l.leitura.comprimento ? ` de ${textoBytes(l.leitura.comprimento)}` : ""}`,
    );
  } else if (l.passos[0]) {
    const p = l.passos[0];
    const guardando = (p.mensagem ?? "").startsWith("Guardando a página");
    partes.push(
      guardando
        ? `Gravando ${rotuloPeriodo(p)} · pág./órgão ${p.pagina} ${haQuanto(p.em, agora)}`
        : p.estado === "erro"
          ? `Último pedido com erro (${rotuloPeriodo(p)}): ${p.mensagem ?? "falha"}`
          : `Último pedido: ${rotuloPeriodo(p)} · ${num(p.recebidos)} registros (${num(p.resNovos ?? 0)} novos, ${num(p.resAlterados ?? 0)} alterados) ${haQuanto(p.em, agora)}`,
    );
  } else partes.push("Começando…");
  partes.push(`${num(l.pedidos)} pedidos · ${num(l.unicos)} registros distintos · ${textoBytes(l.bytes)}${l.erros ? ` · ${num(l.erros)} com erro` : ""}`);
  return partes.join(" — ");
}

/**
 * O MONITOR (no layout do painel, dentro do `SegundoPlano`): junta as importações desta aba e as do servidor e as informa ao
 * painel do canto. Não desenha nada.
 */
export function MonitorImportacoes() {
  const pref = useImportacoesAoVivo();
  const painel = usePainelSegundoPlano();
  const locais = useImportacoesLocais();
  const ligado = !!pref?.ligado;
  const [lotes, setLotes] = useState<LoteAoVivo[]>([]);
  const [agora, setAgora] = useState(() => Date.now());
  const vistosLendo = useRef(new Set<number>());
  // A ÚLTIMA importação CONSULTADA pelo relógio da Execução (fica no painel até dispensar, mesmo antiga) e o pedido de abrir.
  const [consultada, setConsultada] = useState<{ lote: LoteAoVivo; em: number } | null>(null);
  const dispensados = useRef(new Set<string>());
  const amostras = useRef(new Map<string, Amostra[]>());
  const informados = useRef(new Set<string>());
  /** O último conteúdo informado de cada trabalho: igual = não informa de novo (o painel não re-renderiza à toa). */
  const assinaturas = useRef(new Map<string, string>());

  // O relógio (os "há 12 s", a fração da conclusão): um tique por segundo só com algo em curso.
  const algoRodando = locais.some((i) => i.estado === "rodando") || lotes.some((l) => l.estado === "lendo");
  useEffect(() => {
    if (!algoRodando) return;
    const id = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(id);
  }, [algoRodando]);

  // O SERVIDOR: relido a cada 3 s com alguma importação lendo, 60 s parado; só com a aba à vista (voltar relê na hora).
  const lendoServidor = lotes.some((l) => l.estado === "lendo");
  const lendoRef = useRef(lendoServidor);
  lendoRef.current = lendoServidor || locais.some((i) => i.estado === "rodando");
  const ler = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/importacoes/andamento", { cache: "no-store" });
      const j = (await r.json()) as { ok?: boolean; lotes?: LoteAoVivo[] };
      if (r.ok && j.ok && j.lotes) {
        const l = j.lotes;
        setLotes(l);
        // A consultada acompanha: lendo, ela vem na lista; a nova leitura a atualiza.
        setConsultada((c) => {
          const nova = c && l.find((x) => x.id === c.lote.id);
          return c && nova ? { ...c, lote: nova } : c;
        });
      }
    } catch {
      // Sem rede: fica o que estava (a próxima leitura atualiza).
    }
  }, []);
  useEffect(() => {
    if (!ligado || !painel) {
      setLotes([]);
      return;
    }
    let vivo = true;
    let t: ReturnType<typeof setTimeout> | undefined;
    const ciclo = async () => {
      if (!vivo) return;
      if (document.visibilityState === "visible") await ler();
      if (vivo) t = setTimeout(ciclo, lendoRef.current ? RAPIDO_MS : PARADO_MS);
    };
    // A 1ª leitura depois que a tela carregou (não disputa com ela).
    t = setTimeout(ciclo, 2000);
    const voltar = () => {
      if (document.visibilityState !== "visible") return;
      if (t) clearTimeout(t);
      void ciclo();
    };
    document.addEventListener("visibilitychange", voltar);
    return () => {
      vivo = false;
      if (t) clearTimeout(t);
      document.removeEventListener("visibilitychange", voltar);
    };
  }, [ligado, painel, ler]);
  // O RELÓGIO dos indicadores da Execução pede a última importação de um tipo: busca e abre o painel nela (vale também com o
  // andamento ao vivo desligado — é um pedido explícito).
  useEffect(() => {
    if (!painel) return;
    return aoConsultarImportacao((tipo) => {
      void (async () => {
        try {
          const r = await fetch(`/api/admin/importacoes/andamento?ultima=${encodeURIComponent(tipo)}`, { cache: "no-store" });
          const j = (await r.json()) as { ok?: boolean; error?: string; ultima?: LoteAoVivo | null };
          if (!r.ok || !j.ok) throw new Error(j.error ?? "Não foi possível ler a última importação.");
          if (!j.ultima) {
            toast.info(`Nenhuma importação de ${NOME_TIPO[tipo as LoteAoVivo["tipo"]]?.varios ?? "dados"} ainda.`);
            return;
          }
          const id = j.ultima.id;
          dispensados.current.delete(`imp-lote-${id}`);
          for (const i of importacoesLocais()) if (i.lote?.id === id) dispensados.current.delete(`imp-local-${i.id}`);
          setConsultada({ lote: j.ultima, em: Date.now() });
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Não foi possível ler a última importação.");
        }
      })();
    });
  }, [painel]);
  const restante = useCallback((id: string, f: number, ativo: boolean) => {
    if (!ativo) {
      amostras.current.delete(id);
      return null;
    }
    const nova = registrarAmostra(amostras.current.get(id) ?? [], { t: Date.now(), f });
    amostras.current.set(id, nova);
    return tempoRestanteMs(nova, Date.now());
  }, []);

  // INFORMA o painel a cada mudança (o painel só re-renderiza quando o conteúdo informado muda).
  useEffect(() => {
    if (!painel) return;
    const agoraInf = new Set<string>();
    const informar = (t: Trabalho) => {
      const { onParar: _p, onDispensar: _d, onAbrir: _a, pergunta, ...dados } = t;
      const ass = JSON.stringify({ ...dados, pergunta: pergunta?.texto });
      if (assinaturas.current.get(t.id) !== ass) {
        assinaturas.current.set(t.id, ass);
        painel.informar(t);
      }
      agoraInf.add(t.id);
    };
    const deAba = lotesDestaAba();
    for (const i of locais) {
      const id = `imp-local-${i.id}`;
      if (dispensados.current.has(id)) continue;
      const rodando = i.estado === "rodando";
      const f = fracaoDaImportacao(i, agora);
      const r = resumoPedidos(i.pedidos);
      const emCurso = ordenarPedidos(i.pedidos).find((p) => p.fase !== "fila" && p.fase !== "concluido" && p.fase !== "dividido");
      const texto = rodando
        ? [
            i.aguardandoConfirmacao ? (i.responder ? "Aguardando a sua confirmação aqui (os números caíram)" : "Aguardando a sua confirmação na tela da importação (os números caíram)") : ROTULO_ETAPA[i.etapa],
            emCurso ? `${rotuloPeriodo(emCurso.periodo)} · ${emCurso.rotuloPagina}: ${textoPedido(emCurso, agora)}` : null,
            i.pedidos.length ? `${num(r.concluidos)}/${num(i.pedidos.length)} pedidos · ${num(r.registros)} registros · ${textoBytes(r.bytes)}` : null,
          ]
            .filter(Boolean)
            .join(" — ")
        : (i.texto ?? undefined);
      const t: Trabalho = {
        id,
        chave: CHAVE_IMPORTACOES,
        titulo: i.titulo,
        estado: ESTADO_LOCAL[i.estado],
        feito: r.concluidos,
        total: i.pedidos.length,
        fracao: rodando ? f : undefined,
        restanteMs: restante(id, f, rodando),
        texto,
        rota: i.rota,
        abrirEm: consultada && i.lote?.id === consultada.lote.id ? consultada.em : undefined,
        // Com a pergunta da queda no painel, ele aparece mesmo com o andamento desligado.
        oculto: !ligado && !i.responder && !(consultada && i.lote?.id === consultada.lote.id),
        pergunta: i.responder
          ? { texto: `${i.titulo}: os números caíram — gravar mesmo assim? ${(i.texto ?? "").replace(/^Aguardando a confirmação: /, "")} Confira a Centi antes: se for um erro de leitura, cancele (nada é gravado).`, sim: "Gravar", nao: "Cancelar este card", responder: i.responder }
          : undefined,
        corpo: () => <AndamentoDaAba id={i.id} />,
        itens: ordenarPedidos(i.pedidos)
          .slice(0, 40)
          .map((p) => ({ rotulo: `${rotuloPeriodo(p.periodo)} · ${p.rotuloPagina}`, estado: estadoDoPedido(p.fase), detalhe: textoPedido(p, agora) })),
        onParar: rodando ? i.parar : undefined,
        onDispensar: () => {
          dispensados.current.add(id);
          retirarImportacao(i.id);
        },
      };
      informar(t);
    }
    const servidor = ligado ? [...lotes] : [];
    if (consultada && !servidor.some((l) => l.id === consultada.lote.id)) servidor.push(consultada.lote);
    for (const l of servidor) {
      const ehConsultada = l.id === consultada?.lote.id;
      if (l.estado === "lendo") vistosLendo.current.add(l.id);
      // O desfecho só de quem foi visto lendo nesta sessão (abrir a tela não lista as que terminaram antes) — ou consultado.
      if (l.estado !== "lendo" && !vistosLendo.current.has(l.id) && !ehConsultada) continue;
      if (deAba.has(l.id)) continue;
      const id = `imp-lote-${l.id}`;
      if (dispensados.current.has(id)) continue;
      const rodando = l.estado === "lendo";
      const t: Trabalho = {
        id,
        chave: "",
        titulo: `${l.cardNome} · ${l.ano}${l.doCron ? " · automática" : ""}`,
        estado: ESTADO_LOTE(l),
        feito: l.pedidos,
        total: 0,
        fracao: rodando ? l.fracao : undefined,
        restanteMs: restante(id, l.fracao, rodando),
        texto: `${l.doCron ? "Atualização automática" : `Importação manual (${l.iniciadoPor})`} de ${NOME_TIPO[l.tipo].titulo.toLowerCase()} — ${textoDoLote(l, agora)}`,
        rota: linkImportacoes(l.tipo, l.cardId, "importacao"),
        itens: l.passos.map((p) => {
          const guardando = (p.mensagem ?? "").startsWith("Guardando a página");
          return {
            rotulo: `${rotuloPeriodo(p)} · ${l.orgaosCenti ? `órgão ${l.orgaosCenti[p.pagina - 1] ?? p.pagina}` : `página ${p.pagina}`}`,
            estado: guardando ? ("rodando" as const) : p.estado === "erro" ? ("falhou" as const) : ("ok" as const),
            detalhe: guardando ? "gravando…" : p.estado === "erro" ? (p.mensagem ?? "erro") : `${num(p.recebidos)} registros · ${num(p.resNovos ?? 0)} novos · ${haQuanto(p.em, agora)}`,
          };
        }),
        onDispensar: () => {
          dispensados.current.add(id);
          if (ehConsultada) setConsultada(null);
        },
        abrirEm: ehConsultada ? consultada?.em : undefined,
        corpo: () => <AndamentoDoServidor lote={l} />,
      };
      informar(t);
    }
    // O que deixou de existir sai do painel.
    for (const id of informados.current)
      if (!agoraInf.has(id)) {
        painel.retirar(id);
        assinaturas.current.delete(id);
      }
    informados.current = agoraInf;
  }, [painel, locais, lotes, agora, ligado, restante, consultada]);

  // Ao desmontar (sair do painel), nada fica.
  useEffect(
    () => () => {
      for (const id of informados.current) painel?.retirar(id);
    },
    [painel],
  );
  return null;
}
