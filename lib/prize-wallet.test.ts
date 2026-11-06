import { test } from "node:test";
import assert from "node:assert/strict";
import { purchasePie } from "./prize-wallet.ts";
const wallet = { tickets: 100, awards: ["traffic-jam:puzzle-1"], prizes: {} };
test("redeeming records a pie and spends its catalogue price together", () => {
  assert.deepEqual(purchasePie(wallet, "pumpkin"), { tickets: 40, awards: wallet.awards, prizes: { pumpkin: 1 } });
  assert.equal(wallet.tickets, 100);
});
test("insufficient funds or an unknown prize leave the wallet unchanged", () => {
  assert.equal(purchasePie(wallet, "steak"), null);
  assert.equal(purchasePie(wallet, "missing"), null);
  const once = purchasePie(wallet, "pumpkin")!;
  assert.equal(purchasePie(once, "pumpkin"), null);
});
test("collection counts survive serialization and repeat purchases", () => {
  const twice = purchasePie(JSON.parse(JSON.stringify({ ...wallet, tickets: 120, prizes: { pumpkin: 1 } })), "pumpkin")!;
  assert.equal(twice.prizes.pumpkin, 2);
  assert.equal(twice.tickets, 60);
});
