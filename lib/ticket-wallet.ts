export const WALLET_KEY = "hot-welcome-arcade:tickets";
export function isTicketCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
// Invalid amounts and overflow fail without changing the balance.
export function addToBalance(balance: number, amount: number): number | null {
  return isTicketCount(balance) && isTicketCount(amount) && isTicketCount(balance + amount)
    ? balance + amount : null;
}
export function spendFromBalance(balance: number, amount: number): number | null {
  return isTicketCount(balance) && isTicketCount(amount) && amount <= balance
    ? balance - amount : null;
}
