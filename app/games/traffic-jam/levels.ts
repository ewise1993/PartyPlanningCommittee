import { initialCars, moveCar, isSolved, type Car } from "./puzzle.ts";
export type Level = { number: number; size: number; cars: Car[]; solution: { id: string; direction: number }[] };
export function gridSize(level: number) { return 6 + Math.floor((level - 1) / 5); }
function key(cars: Car[]) { return cars.map(c => c.axis === "h" ? c.x : c.y).join(","); }
// Build a connected graph by legal moves from a solved arrangement. A multi-source
// BFS from every solved node gives each candidate a measured distance to an exit.
export function generateLevel(number: number): Level {
  const size = gridSize(number);
  if(number===1) return {number,size,cars:initialCars,solution:[...Array(3).fill({id:"E",direction:-1}),{id:"B",direction:-1},...Array(2).fill({id:"A",direction:1}),...Array(3).fill({id:"C",direction:1}),...Array(4).fill({id:"You",direction:1})]};
  let seed = (number * 2654435761) >>> 0;
  const random = () => { seed = (Math.imul(seed,1664525)+1013904223)>>>0; return seed/4294967296; };
  const target = 12 + number;
  let best: Level | undefined;
  for (let attempt = 0; attempt < 40; attempt++) {
    const row = Math.floor(size/2)-1;
    const cars: Car[] = [{ id:"You",x:size-2,y:row,length:2,axis:"h" }];
    const count = Math.min(Math.floor(size*size*.42), 7 + Math.ceil(number/2) + (size-6)*2);
    for (let tries=0; cars.length<count && tries<500; tries++) {
      const axis = random()<.5 ? "h" : "v";
      const length = random()<.28 ? 3 : 2;
      const c: Car = { id:`car-${cars.length}`,axis,length,x:Math.floor(random()*(size-(axis==="h"?length:1)+1)),y:Math.floor(random()*(size-(axis==="v"?length:1)+1)) };
      if (c.y <= row && c.y + (axis === "v" ? length : 1) > row) continue;
      const overlaps = cars.some(o => c.x<o.x+(o.axis==="h"?o.length:1)&&c.x+(axis==="h"?length:1)>o.x&&c.y<o.y+(o.axis==="v"?o.length:1)&&c.y+(axis==="v"?length:1)>o.y);
      if (!overlaps) cars.push(c);
    }
    const states: Car[][] = [cars], edges: {to:number;id:string;direction:number}[][] = [[]];
    const seen = new Map([[key(cars),0]]);
    // Bound work; every recorded edge still has a real legal reverse move.
    const stack=[0];
    while(stack.length) {
      const i=stack.pop()!;
      for(const c of [...states[i].slice(1), states[i][0]]) for(const direction of [-1,1]) {
        const next=moveCar(states[i],c.id,direction,size); if(!next) continue;
        const k=key(next); let index=seen.get(k);
        if(index===undefined) { if(states.length>=8000) continue; index=states.length; seen.set(k,index);states.push(next);edges.push([]);stack.push(index); }
        edges[i].push({to:index,id:c.id,direction});
      }
    }
    const distance=Array(states.length).fill(-1) as number[];
    const toward: ({to:number;id:string;direction:number}|undefined)[] = Array(states.length);
    const queue:number[]=[];
    states.forEach((state,i)=>{if(isSolved(state,size)){distance[i]=0;queue.push(i);}});
    for(let i=0;i<queue.length;i++) {
      const at=queue[i];
      for(const edge of edges[at]) if(distance[edge.to]===-1) {
        distance[edge.to]=distance[at]+1;
        toward[edge.to]={to:at,id:edge.id,direction:-edge.direction};queue.push(edge.to);
      }
    }
    let chosen=0;
    for(let i=0;i<states.length;i++) if(distance[i] > distance[chosen] && distance[chosen] < target) chosen=i;
    const exact = distance.findIndex(d => d === target); if(exact !== -1) chosen=exact;
    const solution: Level["solution"]=[];
    for(let at=chosen;toward[at];) {const step=toward[at]!;solution.push({id:step.id,direction:step.direction});at=step.to;}
    const candidate={number,size,cars:states[chosen],solution};
    if(!best || solution.length>best.solution.length) best=candidate;
    if(solution.length>=target) break;
  }
  return best!;
}
