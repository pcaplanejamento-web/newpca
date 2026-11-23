/**
 * O que os nós dos FLUXOS precisam do navegador: ler UM protocolo da Centi (emitido POR CÓDIGO com a emissão aprendida
 * — a mesma da tarefa "Ler a Tela Protocolo" — e lido no navegador: capa + DFDs, conferido contra o protocolo pedido).
 * Sem a emissão aprendida, o erro diz como ensinar (o fluxo nunca mexe na tela da Centi).
 */
import { analisarRespostaCenti, centroCustoLidoNoLoad, dadosDoPlanejamento, mensagemSemRegistro, operacaoRecusada, PREFIXO_RECUSA, planejamentoInexistente } from "./automacao-centi-core";
import { carregarPlanejamento, comSessaoCenti, type ContextoEmissor, emitirUm, MSG_ENSINAR_REGISTRO } from "./automacao-dfds-motor";
import { nomesDosCampos } from "./fluxo-core";
import { parseDfdPdf } from "./parse-dfd-pdf";
import type { DfdParseado } from "./parse-dfd-comum";
import type { DfdDetalhe } from "./dfd";
import { herdarTratamentos } from "./comparar-protocolo";
import { comSecoesDoSistema, semValores, temSecoes810 } from "./conferencia-dfd-centi";
import { normalizarSecoesDfd } from "./dfd-tratamento";
import { enviarDfdEmLotes, metaDoDfd } from "./importar-dfd";
import { coerceEmissaoProtocolo, conferirLeituraProtocolo, corpoEmissaoProtocolo, type EmissaoProtocolo } from "./automacao-tela-protocolo";
import { baixarPelaExtensao, comoBlob, deBase64, type PedirExtensao, pdfDoAchado, pdfDosBytes } from "./arquivo-navegador";
import { dataIsoBrasilia } from "./format";
import type { Item } from "./fluxo-core";
import type { RegrasAvaliacao } from "./avaliacao-core";
import { lerProtocoloCompleto, type ProtocoloLido } from "./importar-protocolo-auto";

/** Os protocolos lidos NESTA execução (o nó "Importar protocolo" usa a mesma leitura — não emite de novo). */
export type CacheLeitura = Map<string, ProtocoloLido>;
/** Quantos PDFs de protocolo ficam na memória para abrir a análise completa sem emitir de novo. */
export const PDFS_NA_MEMORIA = 8;
export const chaveLeitura = (protocolo: unknown, ano: unknown) => `${s(protocolo).split("/")[0]}/${s(ano)}`;

export async function emissaoDoServidor(): Promise<EmissaoProtocolo | null> {
  const r = (await fetch("/api/admin/automacao/config", { cache: "no-store" })
    .then((x) => x.json())
    .catch(() => null)) as { ok?: boolean; config?: { emissaoProtocolo?: unknown } } | null;
  return r?.ok ? coerceEmissaoProtocolo(r.config?.emissaoProtocolo) : null;
}

const s = (v: unknown) => (v == null ? "" : String(v).trim());

/** Lê um protocolo (item com protocolo, ano e id) → a capa + os DFDs. Lança com a mensagem quando não dá. */
export async function lerProtocoloPorCodigo(
  pedir: PedirExtensao,
  emissao: EmissaoProtocolo | null,
  it: Item,
  regras: RegrasAvaliacao,
  cache?: CacheLeitura,
  /** Os ÚLTIMOS PDFs lidos (a análise completa abre sem emitir de novo) — até `PDFS_NA_MEMORIA`. */
  arquivos?: Map<string, File>,
): Promise<Item> {
  const alvo = { id: s(it.id ?? it.idExterno), protocolo: s(it.protocolo ?? it.numero).split("/")[0], ano: s(it.ano) };
  if (!alvo.protocolo) throw new Error("O item não tem o nº do protocolo (campo “protocolo”).");
  if (!emissao) throw new Error("A emissão do protocolo ainda não foi aprendida — emita UM protocolo pela tarefa “Ler a Tela Protocolo”.");
  if (!alvo.id) throw new Error(`Protocolo ${alvo.protocolo}: sem o Id da Centi (campo “id”).`);
  const corpo = corpoEmissaoProtocolo(emissao, { ...alvo, hoje: dataIsoBrasilia(new Date().toISOString()) });
  if (!corpo) throw new Error("Não consegui montar a emissão do protocolo.");
  // Emissão + download na trava da sessão da Centi (nenhuma outra aba abre outro registro no meio).
  const x = await comSessaoCenti(async () => {
    const r = (await pedir("pedir", { metodo: "POST", caminho: "restauth/operation", corpo }, 300_000)) as { ok?: boolean; erro?: string; b64?: string; status?: number; interrompido?: boolean };
    if (r.interrompido) throw new Error("Interrompido na extensão.");
    if (!r.ok || r.b64 == null) throw new Error(r.erro || "A extensão não respondeu.");
    const bytes = deBase64(r.b64);
    if (bytes.length < 64 * 1024 && operacaoRecusada(new TextDecoder().decode(bytes)))
      throw new Error("A Centi recusou a emissão guardada — emita UM protocolo pela tarefa “Ler a Tela Protocolo” para reaprender.");
    const direto = await pdfDosBytes(bytes).catch(() => null);
    return direto ? { pdf: direto } : await pdfDoAchado(analisarRespostaCenti(bytes, r.status ?? 0), baixarPelaExtensao(pedir));
  });
  if (!("pdf" in x)) throw new Error(x.erro);
  const file = new File([comoBlob(x.pdf)], `Protocolo ${alvo.protocolo}-${alvo.ano}.pdf`, { type: "application/pdf" });
  const lido = await lerProtocoloCompleto(file, regras);
  const numeros = lido.dfds.map((d) => d.numero);
  const leitura = conferirLeituraProtocolo(alvo, lido.capa, numeros);
  if (leitura.estado !== "falha") {
    cache?.set(chaveLeitura(alvo.protocolo, alvo.ano), lido);
    if (arquivos) {
      const k = chaveLeitura(alvo.protocolo, alvo.ano);
      arquivos.delete(k);
      arquivos.set(k, file);
      while (arquivos.size > PDFS_NA_MEMORIA) arquivos.delete(arquivos.keys().next().value as string);
    }
  }
  return {
    leitura: leitura.estado,
    leituraTexto: leitura.texto,
    capa: { ...lido.capa },
    assunto: lido.capa.assunto ?? "",
    totalDfds: numeros.length,
    dfds: lido.dfds.map((d) => ({
      numero: d.numero,
      planejamento: d.planejamento ?? "",
      tipo: d.tipo ?? "",
      sigla: d.siglaSetor ?? "",
      orgao: d.orgaoEntidade ?? "",
      objeto: d.objeto ?? "",
      valor: d.valorTotal ?? 0,
      itens: d.itens.length,
      assinaturas: d.assinaturas.length,
    })),
  };
}

/** Busca UM DFD na Centi pelo nº de PLANEJAMENTO com o MESMO emissor do "Baixar DFDs" (por API): o load do planejamento
 * (a SITUAÇÃO) e, com `comPdf`, o Emitir DFD lido SEM OCR (nº, tipo, objeto, valor e itens). Lança com a mensagem. */
export async function lerDfdCentiPorCodigo(
  c: ContextoEmissor,
  planejamento: string,
  entidade?: string,
  comPdf = true,
  /** Devolve também o DFD lido INTEIRO (`dfd`) — a base da substituição. */
  completo = false,
  /** Lê a assinatura achatada por OCR (a sobrescrita); a conferência lê só o texto. */
  ocr = completo,
): Promise<Item> {
  const plan = s(planejamento).replace(/\D/g, "");
  if (!plan) throw new Error("O DFD não tem nº de planejamento.");
  // Load e emissão na MESMA trava da sessão da Centi (nenhuma outra aba carrega outro registro no meio).
  return comSessaoCenti(() => lerNaSessao(c, plan, entidade, comPdf, completo, ocr));
}

/** Os últimos PDFs que a Centi GEROU na conferência (por planejamento, na memória da aba) — vão ao servidor com o retrato
 * para o ADM ver o arquivo como veio. */
const pdfsLidos = new Map<string, Uint8Array>();
const MAX_PDFS_LIDOS = 30;
/** A chave do PDF guardado: o planejamento NO ÓRGÃO (o mesmo nº existe em órgãos diferentes da Centi). */
const chavePdf = (planejamento: string, entidade?: string) => `${s(planejamento).replace(/\D/g, "")}@${s(entidade).replace(/^0+(?=\d)/, "")}`;
/** O PDF (base64) da última emissão do planejamento (no órgão) nesta aba; null = nenhum. */
export function pdfLidoNaCenti(planejamento: string, entidade?: string): string | null {
  const b = pdfsLidos.get(chavePdf(planejamento, entidade));
  if (!b) return null;
  let t = "";
  for (let i = 0; i < b.length; i += 0x8000) t += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(t);
}

async function lerNaSessao(c: ContextoEmissor, plan: string, entidade: string | undefined, comPdf: boolean, completo: boolean, ocr: boolean): Promise<Item> {
  const l = await carregarPlanejamento(c, plan, entidade || undefined);
  if ("erro" in l) throw new Error(l.erro);
  const ondeOrgao = entidade ? ` (órgão ${entidade})` : "";
  const diag = l.diagnostico ? ` [${l.diagnostico}]` : "";
  // A resposta VAZIA não diz nada (a Centi 217 responde assim também ao planejamento que existe): NÃO ABRIU — nunca "não
  // encontrado" (que gravaria "Não encontrado na Centi" e limparia o centro de custo). Os outros órgãos são tentados.
  if (!l.j || (typeof l.j === "object" && !Object.keys(l.j as object).length)) throw new Error(`Não consegui abrir o planejamento ${plan} na Centi${ondeOrgao} — a Centi respondeu vazio.${diag}`);
  // A Centi responde `{Entity: null, Message}` quando NÃO abre o registro: o motivo é a mensagem dela, nunca "sem o campo".
  const semRegistro = mensagemSemRegistro(l.j);
  const naoEncontrado = () => new Error(`NAO_ENCONTRADO: a Centi não abriu o planejamento ${plan}${ondeOrgao}${semRegistro ? ` — ${semRegistro}` : ""}.`);
  // Só a leitura SEM o PDF depende do registro; com o PDF, a emissão segue como no "Baixar DFDs" (que não lê o load).
  // "Não encontrado" SÓ quando a mensagem da Centi diz; sem ela (ou outra mensagem), não abriu — tenta os outros órgãos.
  if (!comPdf && semRegistro !== null) {
    if (planejamentoInexistente(semRegistro)) throw naoEncontrado();
    throw new Error(`Não consegui abrir o planejamento ${plan} na Centi${ondeOrgao}${semRegistro ? ` — ${semRegistro}` : ""}.${diag}`);
  }
  // Os campos do PRÓPRIO planejamento — SÓ o topo da `Entity` (a referência dá o `Display`); nunca uma busca nos registros
  // ligados (o protocolo traz a situação dele). Só TEXTO: o código numérico da situação e o `IdCentroCusto` numérico nunca
  // valem. O que não veio fica "" — quem grava usa a CM002 ou mantém o gravado (nunca um dado de outro registro).
  const topo = dadosDoPlanejamento(l.j);
  const situacao = topo.situacao ?? "";
  const centroCusto = topo.centroCusto ?? "";
  const finalidade = topo.finalidade ?? "";
  // `registro: false` = a Centi não abriu o registro do planejamento (só a emissão saiu): a situação e o centro de custo
  // NÃO foram lidos — quem grava não apaga o que já estava (nunca vira "sem centro de custo" por falta de leitura).
  // `centroAusente` = o load abriu o registro e NÃO trouxe o centro de custo (o campo não veio, ou só a referência sem o
  // texto): não foi lido — quem grava o pula; "" só quando a Centi diz que não tem.
  const centroAusente = semRegistro === null && !centroCusto && !centroCustoLidoNoLoad(l.j);
  const extra = {
    centroCusto,
    finalidade,
    ...(semRegistro !== null ? { registro: false } : {}),
    ...(centroAusente ? { centroAusente: true } : {}),
    ...(centroCusto ? {} : { camposCenti: nomesDosCampos(l.j) }),
  };
  if (!comPdf) return { planejamento: plan, situacao, ...extra };
  // O load ABRIU o registro e só o CONTEÚDO (a emissão, o PDF) falhou: o erro leva o que o load leu (`carga` — situação,
  // centro de custo) para quem verifica também eles gravar o que foi lido (as verificações são independentes por DFD).
  const falha = (msg: string) => {
    const x = new Error(msg);
    if (semRegistro === null) Object.assign(x, { carga: { planejamento: plan, situacao, ...extra } });
    return x;
  };
  // A MESMA emissão do "Baixar DFDs", SEMPRE com o valor de referência ("Emitir valor referência" = Sim): sem ele a Centi
  // emite a seção 4 sem as colunas de valor e a conferência compararia "R$ 0,00". A chave do aparelho vale só no Baixar/anexar.
  const comValores: ContextoEmissor = { ...c, cfg: () => ({ ...c.cfg(), valorReferencia: true }) };
  const e = await emitirUm(comValores, plan, entidade || undefined, false, l);
  // `RECUSA:` = a Centi recusou o Emitir DFD DESTE planejamento (o load abriu) — quem chama decide se é a operação.
  if (!e.pdf) {
    // O load já DIZIA (a mensagem da Centi) que o planejamento NÃO EXISTE e a emissão também falhou: é "não encontrado" (marca Divergente),
    // não falha de comunicação (que deixaria o DFD sem conferir e refeito em toda execução).
    if (semRegistro && planejamentoInexistente(semRegistro)) throw naoEncontrado();
    throw falha(e.recusada ? `${PREFIXO_RECUSA}${e.erro}` : (e.erro ?? "Falha ao emitir."));
  }
  const kPdf = chavePdf(plan, entidade);
  pdfsLidos.delete(kPdf);
  pdfsLidos.set(kPdf, e.pdf);
  while (pdfsLidos.size > MAX_PDFS_LIDOS) pdfsLidos.delete(pdfsLidos.keys().next().value as string);
  let d: DfdParseado;
  try {
    d = await parseDfdPdf(new File([comoBlob(e.pdf)], `Planejamento ${plan}.pdf`, { type: "application/pdf" }), { ocr }); // a sobrescrita lê como a importação (assinatura achatada por OCR); a conferência só o texto
  } catch (x) {
    throw falha(x instanceof Error ? x.message : String(x));
  }
  if (s(d.planejamento).replace(/\D/g, "").replace(/^0+/, "") !== plan.replace(/^0+/, ""))
    throw falha(`A Centi devolveu o DFD de outro planejamento (${s(d.planejamento) || "sem nº"}).`);
  // Sem nenhum valor nos itens = o PDF saiu sem o valor de referência: NÃO confere (nunca compara nem guarda "R$ 0,00").
  if (semValores(d)) throw falha("A Centi emitiu o DFD sem os valores dos itens (Emitir valor referência) — não conferido.");
  // O PDF com as seções 8 a 10 em branco porque a automação NÃO tinha o registro do planejamento (a Centi abriu só a
  // prévia e a tela não ensinou o registro): é outro PDF, não o que a tela gera — NÃO conferido (nunca "Convergente*").
  if (e.secoes810NaoLidas && !temSecoes810(d))
    throw falha(`a Centi gerou o DFD com as seções 8 a 10 em branco porque a automação não tem o registro delas deste planejamento (a tela o manda) — não conferido. ${MSG_ENSINAR_REGISTRO}`);
  const resumo = {
    // As seções 8 a 10 em branco NO PDF (`temSecoes810`): elas não são comparadas (a conferência diz "convergente*").
    // Quem decide é o PDF de cada DFD — nunca o load (a prévia da Centi 217 não traz o registro e o PDF vem completo).
    ...(temSecoes810(d) ? {} : { semSecoes810: true }),
    numero: d.numero,
    planejamento: d.planejamento,
    tipo: d.tipo,
    objeto: d.objeto,
    valor: d.valorTotal ?? 0,
    totalItens: d.itens.length,
    situacao,
    ...extra,
  };
  return completo ? { ...resumo, dfd: d as unknown as Item } : resumo;
}

/** SUBSTITUI os dados do DFD gravado (`dfdId`) pelos do DFD lido na Centi — a MESMA sobrescrita do "Sobrescrever DFD":
 * o mesmo nº de planejamento é exigido; a unidade, o protocolo e o PCA ficam os do gravado; o que a Centi não traz e o
 * gravado já tratou é HERDADO (`herdarTratamentos`) e, sem assinatura lida (PDF sem OCR), ficam as do gravado. */
export async function dfdDoSistema(dfdId: number): Promise<DfdDetalhe> {
  const r = await fetch(`/api/dfd/${dfdId}`);
  const j = (await r.json().catch(() => null)) as { ok?: boolean; error?: string; dfd?: DfdDetalhe } | null;
  if (!r.ok || !j?.ok || !j.dfd) throw new Error(j?.error ?? "Não foi possível carregar o DFD gravado.");
  return j.dfd;
}

/** O PDF da Centi com as seções 8 a 10 em branco (`temSecoes810`): ficam as do SISTEMA — nunca as em branco da Centi
 * (a mesma regra da comparação e da correção). */
export async function substituirDfdPelaCenti(dfdId: number, lido: DfdParseado): Promise<{ numero: string; itens: number }> {
  const g = await dfdDoSistema(dfdId);
  const novo = temSecoes810(lido) ? lido : comSecoesDoSistema(lido, g);
  const so = (v: unknown) => s(v).replace(/\D/g, "").replace(/^0+/, "");
  if (!so(g.planejamento) || so(g.planejamento) !== so(novo.planejamento))
    throw new Error(`O DFD da Centi é de outro planejamento (${s(novo.planejamento) || "sem nº"} × ${s(g.planejamento) || "sem nº"}).`);
  const anoPca = g.anoPca ?? g.protocoloAnoPca ?? novo.anoPca ?? null;
  const base: DfdParseado = { ...novo, numero: g.numero, assinaturas: novo.assinaturas.length ? novo.assinaturas : g.assinaturas };
  const { dfd } = herdarTratamentos(normalizarSecoesDfd(base, undefined, anoPca).dfd, g, anoPca);
  await enviarDfdEmLotes(metaDoDfd(dfd, { anoPca, reparticaoId: g.reparticaoId, origem: "sobrescrita" }), dfd.itens, undefined, { existia: true });
  return { numero: g.numero, itens: dfd.itens.length };
}
