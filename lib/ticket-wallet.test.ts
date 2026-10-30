import { test } from "node:test";
import assert from "node:assert/strict";
import { addToBalance, spendFromBalance, isTicketCount } from "./ticket-wallet.ts";
test("earn, spend, and reject insufficient tickets", () => {
  assert.equal(addToBalance(0, 25), 25);
  assert.equal(spendFromBalance(25, 10), 15);
  assert.equal(spendFromBalance(25, 25), 0);
  assert.equal(spendFromBalance(0, 1), null);
});
test("invalid values never create a negative or unsafe balance", () => {
  for (const amount of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(addToBalance(10, amount), null);
    assert.equal(spendFromBalance(10, amount), null);
  }
  assert.equal(addToBalance(Number.MAX_SAFE_INTEGER, 1), null);
  assert.equal(isTicketCount("10"), false);
});
