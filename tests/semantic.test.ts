import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { avatarVar } from "../src/lib/semantic.ts";

describe("semantic tokens (rótulo → var)", () => {
  it("avatarVar: conhecidos, vazio e determinístico", () => {
    assert.equal(avatarVar("Jhone Prado"), "var(--av-jhone)");
    assert.equal(avatarVar("maria"), "var(--av-maria)");
    assert.equal(avatarVar(""), "var(--faint)");
    assert.equal(avatarVar("   "), "var(--faint)");
    assert.equal(avatarVar("Fulano X"), avatarVar("Fulano X"));
    assert.ok(avatarVar("Fulano X").startsWith("var(--av-"));
  });
});
