// Confetti Chase rules: a tile maze, the player's teammate, and the teammates chasing them.
// Pure state + step function so the component only handles input and drawing.

// # wall · . confetti · o party hat · P player start · G chaser start
const MAZE = [
  "###################",
  "#o.......#.......o#",
  "#.##.###.#.###.##.#",
  "#.................#",
  "#.##.#.#####.#.##.#",
  "#....#...#...#....#",
  "####.###.#.###.####",
  "#......#G#G#......#",
  "#.#..#.#####.#..#.#",
  "#.#......P......#.#",
  "#.#.###.#.#.###.#.#",
  "#o..#...#.#...#..o#",
  "#.##.##.#.#.##.##.#",
  "#.................#",
  "###################",
];

export const DIRS = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } } as const;
export type DirName = keyof typeof DIRS;
const DIR_NAMES = Object.keys(DIRS) as DirName[];
const OPPOSITE: Record<DirName, DirName> = { up: "down", down: "up", left: "right", right: "left" };

export type Cell = "wall" | "confetti" | "hat" | "empty";
export type Mover = { x: number; y: number; fromX: number; fromY: number; dir: DirName | null; timer: number };
export type Chaser = Mover & { id: number; homeX: number; homeY: number; wait: number; scared: boolean };
export type Status = "ready" | "playing" | "paused" | "caught" | "cleared" | "over";
export type Game = {
  cells: Cell[][]; width: number; height: number;
  player: Mover & { next: DirName | null }; startX: number; startY: number;
  chasers: Chaser[]; score: number; lives: number; level: number; remaining: number;
  frightened: number; combo: number; status: Status; pause: number;
};

export const POINTS = { confetti: 10, hat: 50, chaser: 200 };
const PLAYER_SPEED = 7.5; // tiles per second
const RELEASE_DELAYS = [0, 2, 4]; // seconds each chaser waits before leaving its spawn

export function createGame(): Game {
  const cells: Cell[][] = [];
  const chasers: Chaser[] = [];
  let startX = 0, startY = 0;
  MAZE.forEach((row, y) => {
    cells.push([...row].map((char, x) => {
      if (char === "P") { startX = x; startY = y; }
      if (char === "G") chasers.push({ ...mover(x, y), id: chasers.length, homeX: x, homeY: y, wait: 0, scared: false });
      return char === "#" ? "wall" : char === "." ? "confetti" : char === "o" ? "hat" : "empty";
    }));
  });
  const game: Game = {
    cells, width: MAZE[0].length, height: MAZE.length,
    player: { ...mover(startX, startY), next: null }, startX, startY,
    chasers, score: 0, lives: 3, level: 1, remaining: countPickups(cells),
    frightened: 0, combo: 0, status: "ready", pause: 0,
  };
  resetPositions(game);
  return game;
}

export function steer(game: Game, dir: DirName) {
  game.player.next = dir;
  if (game.status === "ready") game.status = "playing";
}

export function togglePause(game: Game) {
  if (game.status === "playing") game.status = "paused";
  else if (game.status === "paused" || game.status === "ready") game.status = "playing";
}

export function pause(game: Game) {
  if (game.status === "playing") game.status = "paused";
}

// Advances the game by dt seconds. `random` is injectable so behaviour can be tested.
export function step(game: Game, dt: number, random: () => number = Math.random) {
  if (game.status === "caught" || game.status === "cleared") {
    game.pause -= dt;
    if (game.pause > 0) return;
    if (game.status === "cleared") nextLevel(game);
    else if (game.lives <= 0) { game.status = "over"; return; }
    resetPositions(game);
    game.status = "ready"; // the next steer resumes play
    return;
  }
  if (game.status !== "playing") return;

  if (game.frightened > 0) {
    game.frightened = Math.max(0, game.frightened - dt);
    if (game.frightened === 0) { game.combo = 0; game.chasers.forEach((p) => { p.scared = false; }); }
  }

  const { player } = game;
  player.timer += dt;
  while (player.timer >= 1 / PLAYER_SPEED && game.status === "playing") {
    player.timer -= 1 / PLAYER_SPEED;
    movePlayer(game);
    checkCollisions(game);
  }

  for (const chaser of game.chasers) {
    if (chaser.wait > 0) { chaser.wait -= dt; continue; }
    const interval = 1 / chaserSpeed(game, chaser);
    chaser.timer += dt;
    while (chaser.timer >= interval && game.status === "playing") {
      chaser.timer -= interval;
      moveChaser(game, chaser, random);
      checkCollisions(game);
    }
  }
}

// Fraction of the way from each mover's previous tile to its current one, for smooth drawing.
export function progress(game: Game, m: Mover, isPlayer: boolean) {
  const speed = isPlayer ? PLAYER_SPEED : chaserSpeed(game, m as Chaser);
  return Math.min(1, m.timer * speed);
}

export function isOpen(game: Game, x: number, y: number) {
  return game.cells[y]?.[x] !== undefined && game.cells[y][x] !== "wall";
}

function mover(x: number, y: number): Mover { return { x, y, fromX: x, fromY: y, dir: null, timer: 0 }; }

function countPickups(cells: Cell[][]) {
  return cells.flat().filter((cell) => cell === "confetti" || cell === "hat").length;
}

function chaserSpeed(game: Game, chaser: Chaser) {
  return chaser.scared ? 4 : Math.min(8, 5.5 + (game.level - 1) * 0.5);
}

function moveTo(m: Mover, dir: DirName) {
  m.fromX = m.x; m.fromY = m.y;
  m.x += DIRS[dir].x; m.y += DIRS[dir].y;
  m.dir = dir;
}

function movePlayer(game: Game) {
  const { player } = game;
  const canGo = (dir: DirName | null): dir is DirName => dir !== null && isOpen(game, player.x + DIRS[dir].x, player.y + DIRS[dir].y);
  if (canGo(player.next)) moveTo(player, player.next);
  else if (canGo(player.dir)) moveTo(player, player.dir);
  else { Object.assign(player, { fromX: player.x, fromY: player.y, dir: null, timer: 0 }); return; } // blocked: wait in place

  const cell = game.cells[player.y][player.x];
  if (cell === "confetti" || cell === "hat") {
    game.cells[player.y][player.x] = "empty";
    game.remaining--;
    game.score += POINTS[cell];
    if (cell === "hat") {
      game.frightened = Math.max(3, 7 - (game.level - 1) * 0.5);
      game.combo = 0;
      game.chasers.forEach((p) => {
        p.scared = true;
        if (p.dir && p.wait <= 0) p.dir = OPPOSITE[p.dir]; // a startled turn signals the switch
      });
    }
    if (game.remaining === 0) { game.status = "cleared"; game.pause = 1.6; }
  }
}

function moveChaser(game: Game, chaser: Chaser, random: () => number) {
  const options = DIR_NAMES.filter((d) => isOpen(game, chaser.x + DIRS[d].x, chaser.y + DIRS[d].y));
  const forward = options.filter((d) => !chaser.dir || d !== OPPOSITE[chaser.dir]);
  const pool = forward.length ? forward : options;
  if (!pool.length) return;
  // Each chaser has its own temperament so they don't move as one clump.
  const wander = chaser.scared ? 1 : [0.1, 0.2, 0.35][chaser.id] ?? 0.2;
  if (random() < wander) { moveTo(chaser, pool[Math.floor(random() * pool.length)]); return; }
  const { player } = game;
  let tx = player.x, ty = player.y;
  if (chaser.id === 1 && player.dir) { tx += DIRS[player.dir].x * 4; ty += DIRS[player.dir].y * 4; }
  if (chaser.id === 2 && Math.abs(chaser.x - player.x) + Math.abs(chaser.y - player.y) < 5) { tx = chaser.homeX; ty = game.height; }
  const dist = (d: DirName) => (chaser.x + DIRS[d].x - tx) ** 2 + (chaser.y + DIRS[d].y - ty) ** 2;
  moveTo(chaser, pool.reduce((best, d) => (dist(d) < dist(best) ? d : best)));
}

function checkCollisions(game: Game) {
  const { player } = game;
  for (const chaser of game.chasers) {
    if (chaser.wait > 0) continue;
    const sameTile = chaser.x === player.x && chaser.y === player.y;
    const crossed = chaser.x === player.fromX && chaser.y === player.fromY && chaser.fromX === player.x && chaser.fromY === player.y;
    if (!sameTile && !crossed) continue;
    if (chaser.scared) {
      game.score += POINTS.chaser * 2 ** game.combo;
      game.combo++;
      Object.assign(chaser, mover(chaser.homeX, chaser.homeY), { wait: 3, scared: false });
    } else {
      game.lives--;
      game.status = "caught";
      game.pause = 1.4;
      return;
    }
  }
}

function resetPositions(game: Game) {
  Object.assign(game.player, mover(game.startX, game.startY), { next: null });
  game.chasers.forEach((p, i) => Object.assign(p, mover(p.homeX, p.homeY), { wait: RELEASE_DELAYS[i] ?? 0, scared: false }));
  game.frightened = 0;
  game.combo = 0;
}

function nextLevel(game: Game) {
  const fresh = createGame();
  game.cells = fresh.cells;
  game.remaining = fresh.remaining;
  game.level++;
}
