import assert from "node:assert/strict";
import test from "node:test";

import { DIRECTIONS, QuantumFoamGame } from "../core.js";

const directionNames = Object.keys(DIRECTIONS);

function openDirection(game, index, excludedTarget = null) {
  return directionNames.find((name) => {
    const target = game.neighbor(index, name);
    return (
      target !== null &&
      target !== excludedTarget &&
      game.isPassageOpen(index, name)
    );
  });
}

function reverseDirection(directionName) {
  return {
    up: "down",
    right: "left",
    down: "up",
    left: "right",
  }[directionName];
}

test("generated mazes are connected and have symmetric passages", () => {
  const game = new QuantumFoamGame({ resourceCount: 0 }, "connectivity");
  const reached = game.reachableCells();

  assert.equal(reached.size, game.cellCount);

  for (let index = 0; index < game.cellCount; index += 1) {
    for (const name of directionNames) {
      const neighbor = game.neighbor(index, name);
      if (neighbor === null) continue;
      assert.equal(
        game.isPassageOpen(index, name),
        game.isPassageOpen(neighbor, reverseDirection(name)),
      );
    }
  }
});

test("an expedition costs charge and delivery confirms the notebook", () => {
  const game = new QuantumFoamGame({ resourceCount: 0 }, "delivery");
  const outbound = openDirection(game, game.source);
  assert.ok(outbound);

  const moved = game.move(outbound);
  assert.equal(moved.ok, true);
  assert.equal(game.activePhoton.energy, game.config.photonCapacity - 1);
  assert.ok(game.activePhoton.notebook.size > 0);
  assert.equal(game.confirmed.size, 1);

  const returned = game.move(reverseDirection(outbound));
  assert.equal(returned.ok, true);
  assert.equal(game.activePhoton.position, game.source);
  assert.equal(game.activePhoton.notebook.size, 0);
  assert.ok(game.confirmed.size > 1);
  assert.equal(game.activePhoton.energy, game.config.photonCapacity);
  assert.equal(game.globalEnergy, game.config.globalEnergy - 1);
});

test("backtracking across observed ground stays stable and still costs charge", () => {
  const game = new QuantumFoamGame({ resourceCount: 0 }, "backtrack");
  const firstDirection = openDirection(game, game.source);
  const firstCell = game.neighbor(game.source, firstDirection);
  game.move(firstDirection);

  const secondDirection = openDirection(game, firstCell, game.source);
  assert.ok(secondDirection);
  const wallSnapshot = [...game.walls];
  game.move(secondDirection);
  const energyBeforeBacktrack = game.activePhoton.energy;
  game.move(reverseDirection(secondDirection));

  assert.deepEqual([...game.walls], wallSnapshot);
  assert.equal(game.activePhoton.position, firstCell);
  assert.equal(
    game.activePhoton.energy,
    energyBeforeBacktrack - game.config.unconfirmedMoveCost,
  );
  assert.ok(game.activePhoton.notebook.has(firstCell));
});

test("a notebook is delivered at a waystation, not any confirmed cell", () => {
  const game = new QuantumFoamGame({ resourceCount: 0 }, "station-delivery");
  const firstDirection = openDirection(game, game.source);
  const firstCell = game.neighbor(game.source, firstDirection);
  game.confirmed.add(firstCell);
  game.move(firstDirection);

  const secondDirection = openDirection(game, firstCell, game.source);
  game.move(secondDirection);
  assert.ok(game.activePhoton.notebook.size > 0);

  game.move(reverseDirection(secondDirection));
  assert.equal(game.activePhoton.position, firstCell);
  assert.ok(game.activePhoton.notebook.size > 0);

  game.move(reverseDirection(firstDirection));
  assert.equal(game.activePhoton.position, game.source);
  assert.equal(game.activePhoton.notebook.size, 0);
});

test("a resource on confirmed ground is collected and becomes a waystation", () => {
  const game = new QuantumFoamGame({ resourceCount: 0 }, "confirmed-resource");
  const direction = openDirection(game, game.source);
  const target = game.neighbor(game.source, direction);
  game.confirmed.add(target);
  game.resources.set(target, {
    energy: 7,
    collected: false,
    confirmed: false,
  });
  game.activePhoton.energy = 10;

  game.move(direction);

  assert.equal(game.resources.get(target).collected, true);
  assert.equal(game.resources.get(target).confirmed, true);
  assert.equal(game.isWaystation(target), true);
  assert.equal(game.activePhoton.energy, game.config.photonCapacity);
  assert.equal(game.globalEnergy, game.config.globalEnergy - 3);
});

test("a photon at zero charge is lost with its undelivered notebook", () => {
  const game = new QuantumFoamGame(
    { photonCount: 2, photonCapacity: 1, resourceCount: 0 },
    "photon-loss",
  );
  const sourceWalls = game.walls[game.source];
  const outbound = openDirection(game, game.source);
  const moved = game.move(outbound);

  assert.equal(moved.event, "photon-lost");
  assert.equal(game.photons[0].alive, false);
  assert.equal(game.photons[0].notebook.size, 0);
  assert.equal(game.activePhotonIndex, 1);
  assert.equal(game.status, "playing");
  assert.equal(game.walls[game.source], sourceWalls);
  assert.equal(game.reachableCells().size, game.cellCount);
});

test("photons can switch at a waystation but not in the foam", () => {
  const game = new QuantumFoamGame({ resourceCount: 0 }, "switching");
  assert.equal(game.switchPhoton(1).ok, true);
  assert.equal(game.activePhotonIndex, 1);

  const outbound = openDirection(game, game.source);
  game.move(outbound);
  const blocked = game.switchPhoton(2);

  assert.equal(blocked.ok, false);
  assert.match(blocked.reason, /waystation/i);
  assert.equal(game.activePhotonIndex, 1);
});

test("the exit appears on an open confirmed frontier after the threshold", () => {
  const game = new QuantumFoamGame(
    { cols: 8, rows: 8, resourceCount: 0, confirmationThreshold: 0.5 },
    "exit",
  );
  const unconfirmedCell = game.cellCount - 1;
  game.confirmed = new Set(
    Array.from({ length: game.cellCount }, (_, index) => index).filter(
      (index) => index !== unconfirmedCell,
    ),
  );
  game.maybeSpawnExit();

  assert.ok(game.exit);
  assert.equal(game.confirmed.has(game.exit.from), true);
  assert.equal(game.confirmed.has(game.exit.cell), false);
  assert.equal(
    game.isPassageOpen(game.exit.from, game.exit.direction),
    true,
  );

  game.activePhoton.position = game.exit.from;
  game.activePhoton.energy = 1;
  const result = game.move(game.exit.direction);
  assert.equal(result.event, "won");
  assert.equal(game.status, "won");
});
