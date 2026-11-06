// Catalogue artwork stays vector-native, with the same white stroke across games.
export function GameIcon({ slug }: { slug: string }) {
  return <svg className="game-icon" viewBox="0 0 96 96" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {slug === "game-1" ? <><path d="M49 29a25 25 0 1 0 0 38L29 48Z"/><circle cx="29" cy="34" r="2" fill="currentColor" stroke="none"/><circle cx="61" cy="48" r="2"/><circle cx="74" cy="48" r="2"/><path d="M66 29V17h17v12m-17 38v12h17V67"/></> : slug === "game-2" ? <><path d="M30 12h36l12 19v34L58 84H38L18 65V31Z"/><circle cx="38" cy="33" r="8"/><circle cx="60" cy="45" r="7"/><circle cx="62" cy="23" r="3" fill="currentColor"/><path d="m27 62 14 8m28-8-14 8M78 34h6v41h-8m3-24h5"/><path d="M30 19h24"/></> : <><path d="M35 12h26q10 0 10 13v14l7 5v5l-7-2v25q0 12-10 12H35q-10 0-10-12V47l-7 2v-5l7-5V25q0-13 10-13Z"/><path d="M33 33q15-6 30 0l-4 12H37Zm4 29h22l4 12q-15 5-30 0Z"/><path d="M31 20h8m18 0h8"/></>}
  </svg>;
}
