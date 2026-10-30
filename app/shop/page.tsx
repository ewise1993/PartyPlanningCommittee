import Link from "next/link";
export default function Shop() {
  return <main className="placeholder"><p className="eyebrow">Prize shop</p><h1>Good things<br/>are coming.</h1><p>Earn tickets in the arcade. Spend them here when the shop opens.</p><div className="shop-placeholder glass"><h2>Coming soon</h2><p>The prize shelves are being stocked.</p></div><Link className="button glass" href="/">Back to games</Link></main>;
}
