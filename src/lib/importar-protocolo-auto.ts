/**
 * IMPORTAÇÃO AUTOMÁTICA de um protocolo (os FLUXOS de automação — sem a tela): a MESMA leitura e a MESMA régua da
 * importação manual (`ProtocoloUploadForm`): índice do PDF → cada DFD lido por inteiro e normalizado → assinatura
 * achatada por OCR → unidade pelo Interessado/assinatura → `avaliarLinhaDfd` + a trava do ADM. Só grava quando NADA
 * está com erro e o protocolo ainda não está no sistema (nunca sobrescreve sozinho). Roda no navegador.
 */
import { classificarAssunto, gateProtocolo, protocolarHabilitado, type RegrasAvaliacao } from "./avaliacao-core";
import { avaliarLinhaDfd } from "./conferencia-dfd";
import { duplicadosDfds, normalizarSecoesDfd } from "./dfd-tratamento";
import { buscarExistentes, buscarProcesso, enviarDfdEmLotes } from "./importar-dfd";
import { mesclarAssinaturasOcr, precisaOcr } from "./ocr-assinatura-core";
import { type DfdParseado, tipoCurtoDfd } from "./parse-dfd-comum";
import type { ProtocoloMeta } from "./parse-protocolo-pdf-core";
import { casarPorInteressado, preverUnidadeDoDfd } from "./reparticao-match";

type Rep = NonNullable<Parameters<typeof avaliarLinhaDfd>[1]> & Parameters<typeof preverUnidadeDoDfd>[2][number];
export type ContextoImportacao = {
  reparticoes: Rep[];
  orgaos: Parameters<typeof preverUnidadeDoDfd>[1] & NonNullable<NonNullable<Parameters<typeof avaliarLinhaDfd>[2]>["orgaos"]>;
  regras: RegrasAvaliacao;
  pcas: { ano: number | null }[];
};

export type ProtocoloLido = {
  capa: ProtocoloMeta;
  dfds: DfdParseado[];
  /** Por DFD: houve correção automática (prioridade, previsão…). */
  auto: boolean[];
};

/** Lê o PDF do protocolo inteiro: capa + todos os DFDs (com o nº de planejamento), normalizados como na Mesa. */
export async function lerProtocoloCompleto(file: File, regras: RegrasAvaliacao): Promise<ProtocoloLido> {
  const { indexarProtocoloPdf, parseDfdDoProtocolo } = await import("./parse-protocolo-pdf");
  const { ocrAssinaturasEmPaginas } = await import("./parse-dfd-pdf");
  const { index, doc } = await indexarProtocoloPdf(file);
  try {
    const dfds: DfdParseado[] = [];
    const auto: boolean[] = [];
    for (const di of index.dfds) {
      let d = (await parseDfdDoProtocolo(doc, di, file.name)) as DfdParseado;
      if (precisaOcr(d.assinaturas)) {
        const ocr = await ocrAssinaturasEmPaginas(doc, di.pages).catch(() => []);
        if (ocr.length) d = { ...d, assinaturas: mesclarAssinaturasOcr(d.assinaturas, ocr) };
      }
      const n = normalizarSecoesDfd(d, regras, index.protocolo.anoPca ?? undefined);
      dfds.push(n.dfd);
      auto.push(n.auto.length > 0);
    }
    return { capa: index.protocolo, dfds, auto };
  } finally {
    await doc.destroy().catch(() => undefined);
    const { encerrarOcr } = await import("./ocr-assinatura");
    await encerrarOcr().catch(() => undefined);
  }
}

export type ResultadoImportacao = { importado: boolean; protocoloId?: number; motivo?: string; erros?: string[] };

const ref = (d: DfdParseado) => `DFD ${d.numero}${d.planejamento ? ` (Planej. ${d.planejamento})` : ""}`;

/**
 * Importa o protocolo LIDO na Mesa com os apontamentos na observação. Recusa (sem gravar nada) quando: já está no
 * sistema, o PCA da capa não está cadastrado, a trava do ADM barra, ou algum DFD está com erro pela régua da Mesa.
 */
export async function importarProtocolo(lido: ProtocoloLido, apontamentos: string[], ctx: ContextoImportacao): Promise<ResultadoImportacao> {
  const { capa, dfds } = lido;
  if (!capa.numero) return { importado: false, motivo: "A capa não tem o número do protocolo." };
  if (!dfds.length) return { importado: false, motivo: "O protocolo não tem DFDs." };
  if (await buscarProcesso(capa.numero, capa.idExterno)) return { importado: false, motivo: "Já está no sistema." };
  const existentes = await buscarExistentes(dfds.map((d) => d.numero));
  const jaGravados = dfds.filter((d) => existentes.has(d.numero.trim()));
  if (jaGravados.length) return { importado: false, motivo: `DFD já cadastrado em outro protocolo: ${jaGravados.map(ref).join(", ")}.` };
  const anoPca = capa.anoPca != null && ctx.pcas.some((p) => p.ano === capa.anoPca) ? capa.anoPca : null;
  if (anoPca == null) return { importado: false, motivo: `PCA da capa (${capa.anoPca ?? "não identificado"}) não está cadastrado.` };
  if (!protocolarHabilitado(ctx.regras)) return { importado: false, motivo: "A protocolação está desligada nas Configurações." };
  const gate = gateProtocolo(capa.assunto, dfds.map((d) => tipoCurtoDfd(d.tipo)), ctx.regras);
  if (!gate.ok) return { importado: false, motivo: gate.motivos.join(" ") };

  const alvo = casarPorInteressado(capa.interessado, ctx.orgaos, ctx.reparticoes);
  const repIds = dfds.map((d) => preverUnidadeDoDfd(d, ctx.orgaos, ctx.reparticoes));
  const protoRep = alvo?.tipo === "unidade" ? alvo.id : (repIds.find((x) => x != null) ?? null);
  const categoria = classificarAssunto(capa.assunto);
  const dupl = new Set(duplicadosDfds(dfds.map((d) => ({ numero: d.numero, planejamento: d.planejamento }))).flat());
  const erros: string[] = [];
  dfds.forEach((d, i) => {
    if (dupl.has(i)) {
      erros.push(`${ref(d)}: duplicado no protocolo.`);
      return;
    }
    const rep = ctx.reparticoes.find((r) => r.id === repIds[i]) ?? null;
    const a = avaliarLinhaDfd(d, rep, { anoPca, regras: ctx.regras, categoria, orgaos: ctx.orgaos, auto: lido.auto[i] });
    if (a.estado === "erro") erros.push(`${ref(d)}: ${a.mensagens.filter((m) => m.status === "erro").map((m) => m.rotulo ?? m.texto).join("; ")}`);
  });
  if (erros.length) return { importado: false, motivo: `${erros.length} DFD(s) com erro — corrija antes de protocolar.`, erros };

  const obsAuto = apontamentos.length ? `Apontamentos da automação: ${apontamentos.join(" | ")}` : "Automação: conferido na CM002 sem divergências.";
  const observacao = [capa.observacao, obsAuto].filter(Boolean).join("\n").slice(0, 2000);
  const r = await fetch("/api/protocolo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: "start-protocolo",
      origem: "automacao",
      protocolo: {
        numero: capa.numero,
        idExterno: capa.idExterno,
        anoPca,
        data: capa.data,
        interessado: capa.interessado,
        documento: capa.documento,
        assunto: capa.assunto,
        observacao,
        valorCapa: capa.valorCapa,
        reparticaoId: protoRep,
        orgaoId: alvo?.tipo === "orgao" ? alvo.id : null,
        localReparticao: capa.localReparticao,
        nomeArquivo: capa.nomeArquivo,
      },
    }),
  });
  const pj = (await r.json().catch(() => null)) as { ok?: boolean; error?: string; protocoloId?: number } | null;
  if (!r.ok || !pj?.ok || !pj.protocoloId) return { importado: false, motivo: pj?.error ?? "O sistema recusou o protocolo." };
  const falhas: string[] = [];
  for (const [i, d] of dfds.entries()) {
    try {
      await enviarDfdEmLotes(
        {
          numero: d.numero,
          planejamento: d.planejamento,
          tipo: d.tipo,
          objeto: d.objeto,
          orgaoEntidade: d.orgaoEntidade,
          setorRequisitante: d.setorRequisitante,
          siglaSetor: d.siglaSetor,
          responsavel: d.responsavel,
          matricula: d.matricula,
          email: d.email,
          telefone: d.telefone,
          anoPca,
          numeroContrato: d.numeroContrato,
          numeroAta: d.numeroAta,
          numeroLicitacao: d.numeroLicitacao,
          reparticaoId: repIds[i],
          protocoloId: pj.protocoloId,
          valorTotal: d.valorTotal,
          nomeArquivo: d.nomeArquivo,
          secoes: d.secoes,
          assinaturas: d.assinaturas,
          origem: "automacao",
        },
        d.itens,
      );
    } catch (e) {
      falhas.push(`${ref(d)}: ${e instanceof Error ? e.message : "falha ao gravar"}`);
    }
  }
  if (falhas.length)
    return { importado: false, protocoloId: pj.protocoloId, motivo: `Protocolação INCOMPLETA (${falhas.length} DFD(s) não gravado(s)) — complete pelo "Reenviar protocolo".`, erros: falhas };
  return { importado: true, protocoloId: pj.protocoloId };
}
