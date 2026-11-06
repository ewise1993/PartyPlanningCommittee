import { test } from "node:test";
import assert from "node:assert/strict";
import { generateLevel, gridSize } from "./levels.ts";
import { moveCar, validCars, isSolved } from "./puzzle.ts";
test("grids grow after each five-level block",()=>{
  assert.deepEqual([1,5,6,10,11,15,16].map(gridSize),[6,6,7,7,8,8,9]);
});
test("new arrangements have valid cars and executable solutions across grid expansions",()=>{
  let previous="";
  for(const number of [1,2,3,4,5,6,10,11]){
    const level=generateLevel(number);
    assert.ok(validCars(level.cars,level.size,level.cars));
    assert.equal(isSolved(level.cars,level.size),false);
    assert.notEqual(JSON.stringify(level.cars),previous);
    previous=JSON.stringify(level.cars);
    let cars=level.cars;
    for(const step of level.solution){
      const next=moveCar(cars,step.id,step.direction,level.size);
      assert.ok(next,`level ${number}: illegal solution step`);cars=next;
    }
    assert.ok(isSolved(cars,level.size));
    assert.ok(level.solution.length>=12+number);
  }
});
test("level generation is deterministic for saved progress and reset",()=>{
  assert.deepEqual(generateLevel(2),generateLevel(2));
  const level=generateLevel(6);
  assert.ok(validCars(JSON.parse(JSON.stringify(level.cars)),level.size,level.cars));
  const invalid=level.cars.map(c=>({...c}));invalid[0].x=level.size;
  assert.equal(validCars(invalid,level.size,level.cars),false);
});
