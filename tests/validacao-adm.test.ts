import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { herdarTratamentos } from "../src/lib/comparar-protocolo.ts";
import { gruposAssinatura, mensagensDfd } from "../src/lib/dfd-tratamento.ts";
import { editarDfdSchema } from "../src/lib/dfd-validation.ts";
import { mesclarAssinaturasOcr, precisaOcr } from "../src/lib/ocr-assinatura-core.ts";
import { type Assinatura, coerceValidacao } from "../src/lib/parse-dfd-comum.ts";
import {
  administrativaDe,
  bloqueiaAssinatura,
  carimbarValidacao,
  chaveValidacao,
  desfazerValidacaoAdm,
  desfazerValidacaoEquipe,
  manterValidacaoAdm,
  mudouValidacaoAdm,
  type Responsaveis,
  RESPONSAVEIS_VAZIO,
  solicitanteDeResultado,
  validarAssinatura,
  validarAssinaturaAdm,
  validarAssinaturaPelaEquipe,
} from "../src/lib/reparticao-responsaveis.ts";

const ass = (over: Partial<Assinatura> = {}): Assinatura => ({
  nome: "FULANO",
  eCpf: "",
  usuario: "",
  local: "",
  data: "31/08/2026 16:20:00",
  ip: "",
  codigo: "abc",
  url: "",
  fonte: "certificado",
  ...over,
});
const pessoa = (nome: string) => ({ nome, matricula: "", funcao: "", nomeacao: { tipo: null, numero: "", link: "" } });
const padrao = (nome: string): Responsaveis => ({ padroes: [pessoa(nome)], temporarios: [] });
const MOTIVO = "Documento conferido no processo físico";
const exige = { exigeAssinatura: true };

describe("validação ADMINISTRATIVA da assinatura", () => {
  it("vale onde nada mais vale: PDF sem assinatura, unidade sem responsável, assinante não autorizado", () => {
    const so = validarAssinaturaAdm([], MOTIVO);
    assert.equal(validarAssinatura([], padrao("ANA"), exige).status, "erro");
    assert.equal(validarAssinatura(so, padrao("ANA"), exige).status, "adm");
    assert.equal(validarAssinatura(validarAssinaturaAdm([ass()], MOTIVO), RESPONSAVEIS_VAZIO, exige).status, "adm");
    const r = validarAssinatura(validarAssinaturaAdm([ass({ nome: "INTRUSO" })], MOTIVO), padrao("ANA"), exige);
    assert.equal(r.status, "adm");
    assert.equal(bloqueiaAssinatura(r), false);
    assert.equal(solicitanteDeResultado(r), null);
  });

  it("a conferência automática e a da equipe continuam vencendo (informam o responsável)", () => {
    const l = validarAssinaturaAdm([ass({ nome: "ANA" })], MOTIVO);
    const r = validarAssinatura(l, padrao("ANA"), exige);
    assert.equal(r.status, "ok");
    assert.equal(r.status === "ok" && r.origem, "auto");
    const eq = validarAssinaturaPelaEquipe(validarAssinaturaAdm([ass({ nome: "X", fonte: "dropsigner", ocr: true })], MOTIVO), "ANA");
    const re = validarAssinatura(eq, padrao("ANA"), exige);
    assert.equal(re.status === "ok" && re.origem, "equipe");
  });

  it("o nome do ADM nunca casa como assinatura lida (auto)", () => {
    const l = [{ ...validarAssinaturaAdm([], MOTIVO)[0], nome: "ANA" }];
    assert.equal(validarAssinatura(l, padrao("ANA"), exige).status, "adm");
  });

  it("entrada inválida (sem motivo ou fora da fonte administrativa) não vale", () => {
    const sem = [ass({ fonte: "administrativa", nome: "", validacao: { por: "adm", motivo: "  " } })];
    assert.equal(administrativaDe(sem), null);
    const fora = [ass({ nome: "X", validacao: { por: "adm", motivo: MOTIVO } })];
    assert.equal(administrativaDe(fora), null);
    assert.equal(validarAssinatura(fora, padrao("ANA"), exige).status, "erro");
  });

  it("uma só vale; desfazer a da equipe não apaga a administrativa (e vice-versa)", () => {
    const duas = validarAssinaturaAdm(validarAssinaturaAdm([ass()], "Primeiro motivo aqui"), MOTIVO);
    assert.equal(duas.filter((a) => a.fonte === "administrativa").length, 1);
    const ambas = validarAssinaturaPelaEquipe(duas, "ANA");
    assert.ok(administrativaDe(desfazerValidacaoEquipe(ambas)));
    assert.equal(desfazerValidacaoAdm(ambas).some((a) => a.fonte === "administrativa"), false);
    assert.ok(desfazerValidacaoAdm(ambas).some((a) => a.validacao?.por === "equipe"));
  });

  it("a equipe nunca valida a entrada administrativa; sem lida, adiciona a manual ao lado", () => {
    const r = validarAssinaturaPelaEquipe(validarAssinaturaAdm([], MOTIVO), "ANA", "01/09/2026");
    assert.equal(r.length, 2);
    assert.equal(administrativaDe(r)?.validacao?.por, "adm");
    assert.ok(r.some((a) => a.fonte === "manual" && a.validacao?.por === "equipe"));
  });

  it("o servidor carimba nome, data e quem/quando; a MESMA validação mantém o carimbo", () => {
    const em = "2026-09-10T15:00:00.000Z";
    const c = carimbarValidacao(validarAssinaturaAdm([], MOTIVO), [], "Admin Silva", em);
    const a = administrativaDe(c);
    assert.equal(a?.nome, "Admin Silva");
    assert.equal(a?.data, "10/09/2026");
    assert.deepEqual(a?.validacao, { por: "adm", motivo: MOTIVO, usuario: "Admin Silva", em });
    // o cliente não escolhe o nome
    const forjada = [{ ...validarAssinaturaAdm([], MOTIVO)[0], nome: "OUTRO" }];
    assert.equal(administrativaDe(carimbarValidacao(forjada, [], "Admin Silva", em))?.nome, "Admin Silva");
    const de_novo = carimbarValidacao(validarAssinaturaAdm([], MOTIVO), c, "Outro Adm", "2026-09-11T10:00:00.000Z");
    assert.deepEqual(administrativaDe(de_novo), a);
    const outra = carimbarValidacao(validarAssinaturaAdm([], "Outro motivo qualquer"), c, "Outro Adm", "2026-09-11T10:00:00.000Z");
    assert.equal(administrativaDe(outra)?.nome, "Outro Adm");
  });

  it("mudouValidacaoAdm + manterValidacaoAdm (quem não é ADM nunca tira nem troca)", () => {
    const gravadas = carimbarValidacao(validarAssinaturaAdm([ass()], MOTIVO), [], "Adm", "2026-09-10T15:00:00.000Z");
    assert.equal(mudouValidacaoAdm(gravadas, gravadas), false);
    assert.equal(mudouValidacaoAdm([ass()], gravadas), true);
    assert.equal(mudouValidacaoAdm(validarAssinaturaAdm([ass()], "Novo motivo diferente"), gravadas), true);
    assert.equal(mudouValidacaoAdm(validarAssinaturaAdm([], MOTIVO), []), true);
    const mantida = manterValidacaoAdm([ass({ nome: "NOVO PDF" })], gravadas);
    assert.equal(mudouValidacaoAdm(mantida, gravadas), false);
    assert.deepEqual(administrativaDe(mantida), administrativaDe(gravadas));
    assert.equal(chaveValidacao(administrativaDe(gravadas)?.validacao), `adm:${MOTIVO}`);
    assert.equal(chaveValidacao({ por: "equipe", responsavel: "ANA" }), "equipe:ANA");
    assert.equal(chaveValidacao(undefined), "");
  });

  it("coerceValidacao (JSON do banco) aceita as duas e descarta o resto", () => {
    assert.deepEqual(coerceValidacao({ por: "adm", motivo: ` ${MOTIVO} `, usuario: "A", em: "x" }), { por: "adm", motivo: MOTIVO, usuario: "A", em: "x" });
    assert.equal(coerceValidacao({ por: "adm", motivo: "" }), undefined);
    assert.deepEqual(coerceValidacao({ por: "equipe", responsavel: "ANA" }), { por: "equipe", responsavel: "ANA" });
    assert.equal(coerceValidacao({ por: "outro" }), undefined);
  });

  it("schema: motivo obrigatório (mín. 10) e a validação só na entrada administrativa", () => {
    const base = { fonte: "administrativa" as const, nome: "", data: "" };
    assert.equal(editarDfdSchema.safeParse({ assinaturas: [{ ...base, validacao: { por: "adm", motivo: MOTIVO } }] }).success, true);
    assert.equal(editarDfdSchema.safeParse({ assinaturas: [{ ...base, validacao: { por: "adm", motivo: "curto" } }] }).success, false);
    assert.equal(editarDfdSchema.safeParse({ assinaturas: [base] }).success, false);
    assert.equal(
      editarDfdSchema.safeParse({ assinaturas: [{ nome: "X", fonte: "certificado", validacao: { por: "adm", motivo: MOTIVO } }] }).success,
      false,
    );
  });

  it("grupo ADM nas listas e mensagem de acerto (sem pendência)", () => {
    assert.deepEqual(gruposAssinatura(validarAssinaturaAdm([ass()], MOTIVO)), ["centi", "adm"]);
    const d = {
      planejamento: "640",
      reparticaoId: 3,
      tipo: "DFD-S — Solução / com ETP",
      itens: [{ valorUnitario: 100, quantidade: 2 }],
      secoes: [
        { titulo: "JUSTIFICATIVA DA NECESSIDADE DA AQUISIÇÃO", texto: "x" },
        { titulo: "PREVISÃO DE ENTREGA/EXECUÇÃO", texto: "ANUAL" },
        { titulo: "PRIORIDADE DA COMPRA OU DA CONTRATAÇÃO", texto: "ALTA" },
        { titulo: "FUNDAMENTAÇÃO LEGAL", texto: "Lei 14.133/2021" },
      ],
      assinatura: { status: "adm" as const, motivo: MOTIVO, responsavel: "Admin Silva" },
    };
    const m = mensagensDfd(d).find((x) => x.chave === "dfd.assinatura");
    assert.equal(m?.status, "acerto");
    assert.match(m?.texto ?? "", /validado administrativamente por Admin Silva — Documento conferido/);
  });

  it("reenvio/sobrescrita herda a validação administrativa do gravado", () => {
    const gravado = { tipo: null, secoes: [], numeroContrato: null, numeroAta: null, numeroLicitacao: null, assinaturas: validarAssinaturaAdm([ass()], MOTIVO) };
    const novo = { ...gravado, assinaturas: [ass({ nome: "NOVO" })] };
    const { dfd, herdados } = herdarTratamentos(novo, gravado, 2027);
    assert.ok(administrativaDe(dfd.assinaturas));
    assert.ok(herdados.includes("Validação administrativa (ADM)"));
    const sem = herdarTratamentos(gravado, gravado, 2027);
    assert.equal(sem.dfd.assinaturas.filter((a) => a.fonte === "administrativa").length, 1);
    assert.equal(sem.herdados.includes("Validação administrativa (ADM)"), false);
  });

  it("OCR: a entrada administrativa não dispensa a leitura e nunca se perde na mescla", () => {
    const so = validarAssinaturaAdm([], MOTIVO);
    assert.equal(precisaOcr(so), true);
    const ocr = [ass({ nome: "ANA", fonte: "foxit", ocr: true })];
    assert.ok(administrativaDe(mesclarAssinaturasOcr(so, ocr)));
    assert.ok(administrativaDe(mesclarAssinaturasOcr(so, [])));
    const mesc = mesclarAssinaturasOcr([...so, ass({ nome: "", fonte: "dropsigner", codigo: "K" })], ocr);
    assert.equal(mesc.filter((a) => a.fonte === "administrativa").length, 1);
  });
});
