import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ASSINATURA_ROTULO,
  grupoAssinatura,
  gruposAssinatura,
  mensagensItem,
  ROTULO_CURTO,
  ROTULO_CURTO_INVALIDA,
  resumoEstado,
  type StatusMensagem,
} from "../src/lib/dfd-tratamento.ts";

// Mensagem mínima aceita por resumoEstado (só status/chave/texto contam).
const m = (status: StatusMensagem, chave: string, texto = "T") => ({ status, chave, texto });

describe("resumoEstado (célula compacta 'Estado')", () => {
  it("sem erros nem atenções ⇒ regular (rótulo vazio, cor --ok)", () => {
    const r = resumoEstado([]);
    assert.equal(r.rotulo, "");
    assert.equal(r.cor, "var(--ok)");
    assert.equal(r.extraErros, 0);
    assert.equal(r.extraAtencoes, 0);
    assert.equal(r.titulo, "");
    // acertos não contam como problema
    assert.equal(resumoEstado([m("acerto", "x")]).rotulo, "");
  });

  it("um único erro ⇒ rótulo curto do ponto, cor --danger, sem contadores", () => {
    const r = resumoEstado([m("erro", "item.valorUnitario", "Item sem valor unitário.")]);
    assert.equal(r.rotulo, "Item sem valor"); // ROTULO_CURTO
    assert.equal(r.cor, "var(--danger)");
    assert.equal(r.extraErros, 0);
    assert.equal(r.extraAtencoes, 0);
  });

  it("exemplo 'ITEM sem valor +1' (2 erros)", () => {
    const r = resumoEstado([m("erro", "item.valorUnitario"), m("erro", "item.quantidade")]);
    assert.equal(r.rotulo, "Item sem valor");
    assert.equal(r.cor, "var(--danger)");
    assert.equal(r.extraErros, 1); // +1 vermelho
    assert.equal(r.extraAtencoes, 0);
  });

  it("exemplo 'Assinatura não conferida +2 +1' (3 erros + 1 atenção)", () => {
    const r = resumoEstado([
      m("erro", "dfd.assinatura"),
      m("erro", "item.valorUnitario"),
      m("erro", "dfd.reparticao"),
      m("atencao", "dfd.referenciaRenovacao"),
    ]);
    assert.equal(r.rotulo, "Assinatura não conferida"); // 1º erro = principal
    assert.equal(r.cor, "var(--danger)");
    assert.equal(r.extraErros, 2); // +2 vermelho (erros além do principal)
    assert.equal(r.extraAtencoes, 1); // +1 âmbar (a atenção)
  });

  it("erro tem precedência sobre atenção para o PRINCIPAL", () => {
    const r = resumoEstado([m("atencao", "item.naoCatalogado"), m("erro", "dfd.assinatura")]);
    assert.equal(r.rotulo, "Assinatura não conferida"); // o erro vira principal, mesmo vindo depois
    assert.equal(r.cor, "var(--danger)");
    assert.equal(r.extraErros, 0);
    assert.equal(r.extraAtencoes, 1); // a atenção conta como extra
  });

  it("exemplo 'DFD-R sem referência +1' (só atenções)", () => {
    const r = resumoEstado([m("atencao", "dfd.referenciaRenovacao"), m("atencao", "item.naoCatalogado")]);
    assert.equal(r.rotulo, "DFD-R sem referência");
    assert.equal(r.cor, "var(--warn)");
    assert.equal(r.extraErros, 0);
    assert.equal(r.extraAtencoes, 1); // +1 âmbar (atenções além do principal)
  });

  it("exemplo 'Fora de catálogo +3' (4 atenções)", () => {
    const r = resumoEstado([
      m("atencao", "item.naoCatalogado"),
      m("atencao", "item.divergenteCatalogo"),
      m("atencao", "item.tipoIncompativel"),
      m("atencao", "dfd.referenciaRenovacao"),
    ]);
    assert.equal(r.rotulo, "Fora de catálogo");
    assert.equal(r.cor, "var(--warn)");
    assert.equal(r.extraAtencoes, 3);
  });

  it("chave sem rótulo curto ⇒ cai no texto completo da mensagem", () => {
    const r = resumoEstado([m("erro", "chave.desconhecida", "Texto integral do erro.")]);
    assert.equal(r.rotulo, "Texto integral do erro.");
  });

  it("titulo = lista completa (erros primeiro, depois atenções) p/ o tooltip nativo", () => {
    const r = resumoEstado([
      m("erro", "dfd.assinatura", "PDF sem assinatura."),
      m("atencao", "dfd.referenciaRenovacao", "DFD-R sem referência."),
    ]);
    assert.equal(r.titulo, "Erro: PDF sem assinatura.\nAtenção: DFD-R sem referência.");
  });

  it("todo rótulo curto tem no máximo 3 palavras", () => {
    for (const rot of [...Object.values(ROTULO_CURTO), ...Object.values(ROTULO_CURTO_INVALIDA)]) {
      assert.ok(rot && rot.split(/\s+/).length <= 3, `"${rot}" excede 3 palavras`);
    }
  });

  it("rotulos = TODOS os problemas (erros primeiro, sem repetir) — inclusive os ocultos no +N", () => {
    const r = resumoEstado([
      m("atencao", "dfd.referenciaRenovacao"),
      m("erro", "dfd.tipo"),
      m("erro", "dfd.prioridade"),
      m("erro", "item.valorUnitario"),
      m("erro", "item.valorUnitario"),
    ]);
    assert.equal(r.rotulo, "Sem tipo");
    assert.deepEqual(r.rotulos, ["Sem tipo", "Sem prioridade", "Item sem valor", "DFD-R sem referência"]);
    assert.deepEqual(resumoEstado([]).rotulos, []);
  });

  it("rótulo específico da mensagem (seção fora do padrão) vence o da chave", () => {
    const r = resumoEstado([{ status: "erro", chave: "dfd.prioridade", texto: "T", rotulo: "Prioridade inválida" }]);
    assert.equal(r.rotulo, "Prioridade inválida");
    assert.deepEqual(r.rotulos, ["Prioridade inválida"]);
  });
});

describe("mensagensItem (faltas próprias do item da Seção 4)", () => {
  const base = { item: 1, codigo: "C", descricao: "D", unidade: "UN", quantidade: 2, valorUnitario: 5, valorTotal: 10 };

  it("item completo ⇒ nenhuma mensagem", () => {
    assert.deepEqual(mensagensItem(base), []);
  });

  it("sem valor unitário (null, 0 ou negativo) ⇒ erro item.valorUnitario", () => {
    for (const v of [null, 0, -1]) {
      const out = mensagensItem({ ...base, valorUnitario: v });
      assert.equal(out.length, 1);
      assert.equal(out[0].chave, "item.valorUnitario");
      assert.equal(out[0].status, "erro");
    }
  });

  it("sem quantidade ⇒ erro item.quantidade", () => {
    const out = mensagensItem({ ...base, quantidade: null });
    assert.equal(out.length, 1);
    assert.equal(out[0].chave, "item.quantidade");
  });

  it("faltando os dois ⇒ dois erros", () => {
    const out = mensagensItem({ ...base, valorUnitario: null, quantidade: null });
    assert.equal(out.length, 2);
    assert.deepEqual(
      out.map((o) => o.chave),
      ["item.valorUnitario", "item.quantidade"],
    );
  });
});

describe("grupoAssinatura / gruposAssinatura (coluna 'Assinatura')", () => {
  it("mapeia a fonte para o grupo (certificado/sistema ⇒ Centi)", () => {
    assert.equal(grupoAssinatura("certificado"), "centi");
    assert.equal(grupoAssinatura("sistema"), "centi");
    assert.equal(grupoAssinatura("dropsigner"), "dropsigner");
    assert.equal(grupoAssinatura("adobe"), "adobe");
    assert.equal(grupoAssinatura("qualquer-outra"), "centi");
  });

  it("rótulos exibidos", () => {
    assert.equal(ASSINATURA_ROTULO.centi, "Centi");
    assert.equal(ASSINATURA_ROTULO.dropsigner, "Dropsigner");
    assert.equal(ASSINATURA_ROTULO.adobe, "Adobe");
  });

  it("grupos DISTINTOS, ordem fixa centi→dropsigner→adobe", () => {
    const gs = gruposAssinatura([{ fonte: "adobe" }, { fonte: "dropsigner" }, { fonte: "certificado" }]);
    assert.deepEqual(gs, ["centi", "dropsigner", "adobe"]);
  });

  it("dedup (várias da mesma fonte ⇒ um grupo)", () => {
    assert.deepEqual(gruposAssinatura([{ fonte: "certificado" }, { fonte: "sistema" }]), ["centi"]);
    assert.deepEqual(gruposAssinatura([{ fonte: "dropsigner" }, { fonte: "dropsigner" }]), ["dropsigner"]);
  });

  it("sem assinaturas ⇒ vazio", () => {
    assert.deepEqual(gruposAssinatura([]), []);
  });
});
