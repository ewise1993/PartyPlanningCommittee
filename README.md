# Hot Welcome Arcade

Next.js App Router + TypeScript. Shared foundation only; games and prizes are placeholders.

## Run

```sh
npm install
npm run dev
```

Open the localhost URL printed by Next.js. `npm run type-check` checks TypeScript; `npm test` checks wallet rules.

## Shared pieces

- `lib/games.ts`: game registry. Update titles and slugs here; home cards and placeholder routes read it.
- `app/page.tsx`: home page / game catalogue.
- `app/games/[slug]/page.tsx`: placeholder for every registered game; unknown slugs return 404. Teammates can add a dedicated route such as `app/games/game-1/page.tsx` when building their game.
- `components/TicketProvider.tsx`: shared wallet provider and `useTickets()` hook. Mounted once in the root layout.
- `lib/ticket-wallet.ts`: pure balance validation and calculation functions.
- `components/Header.tsx`: arcade name, navigation, and live ticket balance on every page.
- `app/shop/page.tsx`: prize shop placeholder.
- `app/layout.tsx`: shared page shell, font, background, provider, and header.
- `app/globals.css`: shared Hot Welcome typography, glass, geometry, and responsive styles.
- `public/backgrounds/arcade.webp`, `public/fonts/safiro.woff2`: copied from the existing local Hot Welcome prototype assets.

## Award or spend tickets in a game

Use the hook inside a client component:

```tsx
"use client";
import { useTickets } from "@/components/TicketProvider";

// Inside your component:
const { tickets, ready, addTickets, spendTickets } = useTickets();
// Call from game events, never while rendering:
// addTickets(10); // true on success
// spendTickets(5); // false if insufficient tickets or invalid amount
```

Both functions return a boolean. Amounts must be nonnegative safe integers. Invalid amounts, insufficient funds, and overflow leave the balance unchanged. Disable wallet-dependent actions until `ready` is true. Ref-backed updates prevent rapid calls within one page from spending the same balance twice.

The wallet starts at zero and persists in localStorage for this browser and origin. It is a simple prototype wallet, editable by the player, with no account, server validation, or concurrent-tab transaction guarantees. If browser storage is blocked it works in memory for the current session.
