import { hojeIso } from "./empenhos-core.ts";
import type { PedidoAndamento } from "./importacao-progresso.ts";
import { type ImportacaoLocal, mudarImportacao, mudarPedido, publicarImportacao } from "./importacoes-ao-vivo-store.ts";
import { codigoLegivel, diasEntre, dividirPeriodo, MAX_BYTES_EXTRATO, mesesDoAno, type ProdutoContrato, ROTULO_TIPO, type TipoTransacao, tiposDoProduto } from "./volus-core.ts";

/**
 * A IMPORTAÇÃO DA FROTA (Vólus) conduzida pelo navegador, no MESMO armazém ao vivo das importações da Centi
 * (`importacoes-ao-vivo-store`): roda em nível de módulo (sair da tela não a interrompe), cada período lido é um pedido
 * com a fase (pedindo · concluído · dividido · erro) e o painel do canto, a tela da Importação e o "Importar agora" das
 * KPIs leem o mesmo estado. A fila é contrato × tipo do produto × mês; o período grande demais volta em partes e a falha
 * passageira (rede, 5xx) tem 2 novas tentativas. EM PARALELO (`PARALELO_FROTA` pedidos ao mesmo tempo — os períodos nunca
 * se sobrepõem, então cada gravação é independente) e, aprendido o tamanho por dia de um contrato × tipo, o mês seguinte já
 * é pedido em partes (sem o pedido "grande demais" jogado fora a cada mês).
 */

/** Quantos períodos ao mesmo tempo (cada um uma requisição — o D1 executa uma consulta por vez: poucos bastam). */
export const PARALELO_FROTA = 3;

/** Em quantas partes pedir `dias` dias com a densidade aprendida (bytes por dia); 1 = cabe inteiro. As partes ficam com
 * folga de 25% (como `partesPara`) — a parte prevista nunca é dividida de novo pela previsão. */
export function partesPrevistas(densidade: number | undefined, dias: number): number {
  if (!densidade || dias <= 1 || densidade * dias <= MAX_BYTES_EXTRATO) return 1;
  return Math.min(dias, Math.ceil((densidade * dias * 1.25) / MAX_BYTES_EXTRATO));
}

export const TIPO_FROTA = "frotas";
export const ROTA_IMPORTACAO_FROTA = "/painel/configuracoes?aba=importacoes&tipo=frotas";

export type ContratoFrota = { codigo: string; produto: ProdutoContrato };
export type PedidoFrota = { contrato: string; tipo: TipoTransacao; inicio: string; fim: string };
type Resultado = { estado: string; partes?: number; registros?: number; novos?: number; alterados?: number; removidos?: number; bytes?: number; erro?: string };
export type ResumoFrota = { registros: number; novos: number; alterados: number; removidos: number; falhas: string[]; interrompido: boolean };

/** A fila inicial: contrato × tipo do produto × mês do ano (até hoje). */
export function filaDaFrota(contratos: readonly ContratoFrota[], ano: number, hoje: string): PedidoFrota[] {
  return contratos.flatMap((c) => tiposDoProduto(c.produto).flatMap((tipo) => mesesDoAno(ano, hoje).map((m) => ({ contrato: c.codigo, tipo, ...m }))));
}

const chaveDe = (p: PedidoFrota) => `${p.contrato}|${p.tipo}|${p.inicio}|${p.fim}`;
const rotuloDe = (p: PedidoFrota) => `${codigoLegivel(p.contrato)} · ${ROTULO_TIPO[p.tipo]}`;

export type OpcoesFrota = {
  ano: number;
  contratos: readonly ContratoFrota[];
  titulo?: string;
  rota?: string;
  /** O pedido de UM período (injetável nos testes). Lança com `status` na falha. */
  pedir?: (p: PedidoFrota) => Promise<Resultado>;
  /** A espera entre as tentativas (injetável nos testes). */
  esperar?: (ms: number) => Promise<void>;
  /** Quantos pedidos ao mesmo tempo (padrão `PARALELO_FROTA`). */
  paralelo?: number;
  hoje?: string;
};

async function pedirPadrao(p: PedidoFrota): Promise<Resultado> {
  const r = await fetch("/api/admin/frota/importar", { method: "POST", cache: "no-store", headers: { "content-type": "application/json" }, body: JSON.stringify(p) });
  const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; resultado?: Resultado };
  if (!r.ok || !j.ok || !j.resultado) throw Object.assign(new Error(j.error || `Falha (erro ${r.status}).`), { status: r.status });
  return j.resultado;
}

let seq = 0;

/** Importa o ano; devolve o id da importação no armazém e o resumo (ao terminar). */
export function importarFrota(o: OpcoesFrota): { id: string; fim: Promise<ResumoFrota> } {
  const pedir = o.pedir ?? pedirPadrao;
  const esperar = o.esperar ?? ((ms: number) => new Promise<void>((ok) => setTimeout(ok, ms)));
  const fila = filaDaFrota(o.contratos, o.ano, o.hoje ?? hojeIso());
  const id = `frota-${Date.now()}-${++seq}`;
  let parar = false;
  const agora = () => Date.now();
  const novoPedido = (p: PedidoFrota): PedidoAndamento => ({
    chave: chaveDe(p),
    periodo: { inicio: p.inicio, fim: p.fim },
    pagina: 1,
    rotuloPagina: rotuloDe(p),
    fase: "fila",
    tentativa: 1,
    inicioMs: agora(),
    faseMs: agora(),
    bytes: 0,
    bytesEsperados: null,
    registros: null,
    iguais: null,
    mudaram: null,
    partes: 0,
    partesFeitas: 0,
  });
  const imp: ImportacaoLocal = {
    id,
    cardId: null,
    titulo: o.titulo ?? `Frotas (Vólus) · ${o.ano}`,
    ano: o.ano,
    rota: o.rota ?? ROTA_IMPORTACAO_FROTA,
    lote: null,
    etapa: "leitura",
    etapaMs: agora(),
    inicioMs: agora(),
    fimMs: null,
    pedidos: fila.map(novoPedido),
    passos: [],
    assinaturas: null,
    estado: "rodando",
    texto: null,
    aguardandoConfirmacao: false,
    tipo: TIPO_FROTA,
    totalPedidos: fila.length,
    parar: () => {
      parar = true;
    },
  };
  publicarImportacao(imp);

  // O tamanho por dia de cada contrato × tipo (o maior visto): o mês seguinte já vai dividido no tamanho certo.
  const densidade = new Map<string, number>();
  const aprender = (p: PedidoFrota, bytes: number | undefined) => {
    if (!bytes || bytes <= 0) return;
    const k = `${p.contrato}|${p.tipo}`;
    densidade.set(k, Math.max(densidade.get(k) ?? 0, bytes / diasEntre(p.inicio, p.fim)));
  };
  const dividirEmPartes = (p: PedidoFrota, n: number, bytes = 0) => {
    const partes = dividirPeriodo(p.inicio, p.fim, n).map((q) => ({ ...p, ...q }));
    fila.unshift(...partes);
    mudarImportacao(id, (i) => ({ ...i, pedidos: [...i.pedidos, ...partes.map(novoPedido)], totalPedidos: (i.totalPedidos ?? 0) + partes.length }));
    mudarPedido(id, chaveDe(p), (y) => ({ ...(y ?? novoPedido(p)), fase: "dividido", faseMs: agora(), fimMs: agora(), bytes }));
  };

  const fim = (async (): Promise<ResumoFrota> => {
    const r: ResumoFrota = { registros: 0, novos: 0, alterados: 0, removidos: 0, falhas: [], interrompido: false };
    const um = async (p: PedidoFrota) => {
      const chave = chaveDe(p);
      const previstas = partesPrevistas(densidade.get(`${p.contrato}|${p.tipo}`), diasEntre(p.inicio, p.fim));
      if (previstas > 1) {
        dividirEmPartes(p, previstas);
        return;
      }
      for (let tentativa = 0; ; tentativa++) {
        mudarPedido(id, chave, (x) => ({ ...(x ?? novoPedido(p)), fase: "pedindo", tentativa: tentativa + 1, faseMs: agora(), inicioMs: tentativa ? (x?.inicioMs ?? agora()) : agora() }));
        try {
          const x = await pedir(p);
          if (x.estado === "dividir") {
            aprender(p, x.bytes);
            dividirEmPartes(p, Math.max(2, x.partes ?? 2), x.bytes ?? 0);
          } else if (x.estado === "erro") {
            throw Object.assign(new Error(x.erro ?? "Falhou"), { status: 0, permanente: true });
          } else {
            aprender(p, x.bytes);
            r.registros += x.registros ?? 0;
            r.novos += x.novos ?? 0;
            r.alterados += x.alterados ?? 0;
            r.removidos += x.removidos ?? 0;
            mudarPedido(id, chave, (y) => ({ ...(y ?? novoPedido(p)), fase: "concluido", faseMs: agora(), fimMs: agora(), registros: x.registros ?? 0, novos: x.novos ?? 0, alterados: x.alterados ?? 0, bytes: x.bytes ?? 0 }));
          }
          break;
        } catch (e) {
          const status = (e as { status?: number }).status ?? 0;
          const permanente = (e as { permanente?: boolean }).permanente;
          const msg = (e as Error).message;
          // A Vólus não respondeu a tempo (504 da rota — o tempo esgotado, o 522/524): o MESMO período falharia de novo; ao meio.
          if (status === 504 && diasEntre(p.inicio, p.fim) > 1 && !parar) {
            dividirEmPartes(p, 2);
            break;
          }
          // 409 = a atualização automática está lendo este contrato agora: espera ela terminar e tenta de novo.
          if (!permanente && (status >= 500 || status === 0 || status === 409) && tentativa < 2 && !parar) {
            const espera = status === 409 ? 30_000 : 2000 * (tentativa + 1);
            mudarPedido(id, chave, (y) => ({ ...(y ?? novoPedido(p)), fase: "esperando", faseMs: agora(), espera, mensagem: msg }));
            await esperar(espera);
            continue;
          }
          r.falhas.push(`${rotuloDe(p)} ${p.inicio}: ${msg}`);
          mudarPedido(id, chave, (y) => ({ ...(y ?? novoPedido(p)), fase: "erro", faseMs: agora(), fimMs: agora(), mensagem: msg }));
          break;
        }
      }
    };
    // O POOL: até `paralelo` pedidos em curso; quem fica sem fila espera os outros (uma divisão pode trazer mais partes).
    const n = Math.max(1, Math.floor(o.paralelo ?? PARALELO_FROTA));
    let ativos = 0;
    let acordar: (() => void) | null = null;
    const avisar = () => {
      const a = acordar;
      acordar = null;
      a?.();
    };
    const trabalhador = async () => {
      for (;;) {
        if (parar) return;
        const p = fila.shift();
        if (!p) {
          if (!ativos) return;
          await new Promise<void>((ok) => {
            const antes = acordar;
            acordar = () => {
              antes?.();
              ok();
            };
          });
          continue;
        }
        ativos++;
        try {
          await um(p);
        } catch (e) {
          // Nunca para o pool em silêncio: o inesperado vira a falha DESTE período.
          r.falhas.push(`${rotuloDe(p)} ${p.inicio}: ${(e as Error)?.message ?? "falha"}`);
        } finally {
          ativos--;
          avisar();
        }
      }
    };
    await Promise.all(Array.from({ length: n }, trabalhador));
    r.interrompido = parar && fila.length > 0;
    const num = (n: number) => n.toLocaleString("pt-BR");
    const texto = r.interrompido
      ? `Interrompida: ${num(r.novos)} novos, ${num(r.alterados)} alterados.`
      : `${r.falhas.length ? `Concluída com ${num(r.falhas.length)} falha(s)` : "Concluída"}: ${num(r.registros)} registros lidos, ${num(r.novos)} novos, ${num(r.alterados)} alterados.`;
    mudarImportacao(id, (i) => ({
      ...i,
      // O que não chegou a ser pedido sai da lista (a interrupção não deixa a fila "parada").
      pedidos: i.pedidos.filter((x) => x.fase !== "fila"),
      totalPedidos: r.interrompido ? i.pedidos.filter((x) => x.fase !== "fila").length : i.totalPedidos,
      etapa: "fim",
      estado: r.interrompido ? "interrompido" : r.falhas.length ? "parcial" : "gravado",
      fimMs: agora(),
      texto,
    }));
    return r;
  })();
  return { id, fim };
}
