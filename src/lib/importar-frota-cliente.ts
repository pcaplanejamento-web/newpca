import { hojeIso } from "./empenhos-core.ts";
import type { PedidoAndamento } from "./importacao-progresso.ts";
import { type ImportacaoLocal, mudarImportacao, mudarPedido, publicarImportacao } from "./importacoes-ao-vivo-store.ts";
import { codigoLegivel, dividirPeriodo, mesesDoAno, type ProdutoContrato, ROTULO_TIPO, type TipoTransacao, tiposDoProduto } from "./volus-core.ts";

/**
 * A IMPORTAÇÃO DA FROTA (Vólus) conduzida pelo navegador, no MESMO armazém ao vivo das importações da Centi
 * (`importacoes-ao-vivo-store`): roda em nível de módulo (sair da tela não a interrompe), cada período lido é um pedido
 * com a fase (pedindo · concluído · dividido · erro) e o painel do canto, a tela da Importação e o "Importar agora" das
 * KPIs leem o mesmo estado. A fila é contrato × tipo do produto × mês; o período grande demais volta em partes e a falha
 * passageira (rede, 5xx) tem 2 novas tentativas.
 */

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

  const fim = (async (): Promise<ResumoFrota> => {
    const r: ResumoFrota = { registros: 0, novos: 0, alterados: 0, removidos: 0, falhas: [], interrompido: false };
    while (fila.length && !parar) {
      const p = fila.shift() as PedidoFrota;
      const chave = chaveDe(p);
      for (let tentativa = 0; ; tentativa++) {
        mudarPedido(id, chave, (x) => ({ ...(x ?? novoPedido(p)), fase: "pedindo", tentativa: tentativa + 1, faseMs: agora(), inicioMs: tentativa ? (x?.inicioMs ?? agora()) : agora() }));
        try {
          const x = await pedir(p);
          if (x.estado === "dividir") {
            const partes = dividirPeriodo(p.inicio, p.fim, x.partes ?? 2).map((q) => ({ ...p, ...q }));
            fila.unshift(...partes);
            mudarImportacao(id, (i) => ({ ...i, pedidos: [...i.pedidos, ...partes.map(novoPedido)], totalPedidos: (i.totalPedidos ?? 0) + partes.length }));
            mudarPedido(id, chave, (y) => ({ ...(y ?? novoPedido(p)), fase: "dividido", faseMs: agora(), fimMs: agora(), bytes: x.bytes ?? 0 }));
          } else if (x.estado === "erro") {
            throw Object.assign(new Error(x.erro ?? "Falhou"), { status: 0, permanente: true });
          } else {
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
          if (!permanente && (status >= 500 || status === 0) && tentativa < 2 && !parar) {
            const espera = 2000 * (tentativa + 1);
            mudarPedido(id, chave, (y) => ({ ...(y ?? novoPedido(p)), fase: "esperando", faseMs: agora(), espera, mensagem: msg }));
            await esperar(espera);
            continue;
          }
          r.falhas.push(`${rotuloDe(p)} ${p.inicio}: ${msg}`);
          mudarPedido(id, chave, (y) => ({ ...(y ?? novoPedido(p)), fase: "erro", faseMs: agora(), fimMs: agora(), mensagem: msg }));
          break;
        }
      }
    }
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
