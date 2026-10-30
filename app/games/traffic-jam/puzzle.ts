export type Car = { id: string; x: number; y: number; length: number; axis: "h" | "v" };
export const initialCars: Car[] = [
  { id: "You", x: 0, y: 2, length: 2, axis: "h" },
  { id: "A", x: 2, y: 1, length: 3, axis: "v" },
  { id: "B", x: 1, y: 4, length: 2, axis: "h" },
  { id: "C", x: 4, y: 0, length: 3, axis: "v" },
  { id: "D", x: 0, y: 0, length: 2, axis: "h" },
  { id: "E", x: 3, y: 5, length: 2, axis: "h" },
];
export function moveCar(cars: Car[], id: string, direction: number): Car[] | null {
  if (direction !== -1 && direction !== 1) return null;
  const car = cars.find(c => c.id === id);
  if (!car) return null;
  const next = { ...car, x: car.x + (car.axis === "h" ? direction : 0), y: car.y + (car.axis === "v" ? direction : 0) };
  if (next.x < 0 || next.y < 0 || next.x + (next.axis === "h" ? next.length : 1) > 6 || next.y + (next.axis === "v" ? next.length : 1) > 6) return null;
  for (const other of cars) {
    if (other.id === id) continue;
    if (next.x < other.x + (other.axis === "h" ? other.length : 1) && next.x + (next.axis === "h" ? next.length : 1) > other.x && next.y < other.y + (other.axis === "v" ? other.length : 1) && next.y + (next.axis === "v" ? next.length : 1) > other.y) return null;
  }
  return cars.map(c => c.id === id ? next : c);
}
export function isSolved(cars: Car[]) { return cars.some(c => c.id === "You" && c.x === 4); }

export function validCars(value: unknown): value is Car[] {
  if (!Array.isArray(value) || value.length !== initialCars.length) return false;
  const occupied = new Set<string>();
  return initialCars.every(original => {
    const matches = value.filter(c => c && c.id === original.id);
    if (matches.length !== 1) return false;
    const c = matches[0];
    if (c.axis !== original.axis || c.length !== original.length || !Number.isInteger(c.x) || !Number.isInteger(c.y) || c.x < 0 || c.y < 0 || c.x + (c.axis === "h" ? c.length : 1) > 6 || c.y + (c.axis === "v" ? c.length : 1) > 6 || (c.axis === "h" ? c.y !== original.y : c.x !== original.x)) return false;
    for (let i = 0; i < c.length; i++) {
      const key = `${c.x + (c.axis === "h" ? i : 0)},${c.y + (c.axis === "v" ? i : 0)}`;
      if (occupied.has(key)) return false;
      occupied.add(key);
    }
    return true;
  });
}
