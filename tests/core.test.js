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

test("generated mazes contain open rooms", () => {
  const game = new QuantumFoamGame({ resourceCount: 0 }, "open-rooms");
  let openSquare = false;

  for (let y = 0; y < game.config.rows - 1 && !openSquare; y += 1) {
    for (let x = 0; x < game.config.cols - 1; x += 1) {
      const topLeft = game.index(x, y);
      const topRight = game.index(x + 1, y);
      openSquare =
        game.isPassageOpen(topLeft, "right") &&
        game.isPassageOpen(topLeft, "down") &&
        game.isPassageOpen(topRight, "down") &&
        game.isPassageOpen(game.index(x, y + 1), "right");
      if (openSquare) break;
    }
  }

  assert.equal(openSquare, true);
});

test("resource placement creates a route-reachable chain", () => {
  for (let run = 0; run < 20; run += 1) {
    const game = new QuantumFoamGame({}, `resource-chain-${run}`);
    const anchors = new Set([game.source]);
    const remaining = new Set(game.resources.keys());

    while (remaining.size > 0) {
      const distances = game.routeDistances(anchors);
      const reachable = [...remaining].filter(
        (index) =>
          distances[index] >= 0 &&
          distances[index] <= game.config.resourceLinkMaxDistance,
      );
      assert.ok(reachable.length > 0);
      for (const index of reachable) {
        anchors.add(index);
        remaining.delete(index);
      }
    }
  }
});

test("a photon sees diagonally across an open room", () => {
  const game = new QuantumFoamGame(
    { cols: 4, rows: 4, resourceCount: 0, roomCount: 0 },
    "diagonal-sight",
  );
  game.walls.fill(15);
  for (let y = 0; y < game.config.rows; y += 1) {
    for (let x = 0; x < game.config.cols; x += 1) {
      const index = game.index(x, y);
      if (x < game.config.cols - 1) {
        game.setPassage(game.walls, index, game.index(x + 1, y), true);
      }
      if (y < game.config.rows - 1) {
        game.setPassage(game.walls, index, game.index(x, y + 1), true);
      }
    }
  }
  const start = game.index(0, 0);
  const diagonal = game.index(3, 3);
  game.activePhoton.position = start;
  game.activePhoton.notebook.clear();
  game.resources.set(diagonal, {
    energy: 18,
    collected: false,
    confirmed: false,
  });
  game.observeFrom(game.activePhoton);

  assert.equal(game.hasLineOfSight(start, diagonal), true);
  assert.equal(game.activePhoton.notebook.has(diagonal), true);
  assert.deepEqual(game.getRevealedResourceIndices(), [diagonal]);
});

test("a closed corner blocks diagonal vision", () => {
  const game = new QuantumFoamGame(
    { cols: 4, rows: 4, resourceCount: 0, roomCount: 0 },
    "blocked-diagonal",
  );
  game.walls.fill(15);
  const start = game.index(1, 1);
  const right = game.index(2, 1);
  const diagonal = game.index(2, 2);
  game.setPassage(game.walls, start, right, true);
  game.setPassage(game.walls, right, diagonal, true);

  assert.equal(game.hasLineOfSight(start, diagonal), false);
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

test("moving onto a hidden node reports the pickup and records its location", () => {
  const game = new QuantumFoamGame({ resourceCount: 0 }, "node-pickup");
  const direction = openDirection(game, game.source);
  const target = game.neighbor(game.source, direction);
  game.resources.set(target, {
    energy: 17,
    collected: false,
    confirmed: false,
  });

  const result = game.move(direction);

  assert.deepEqual(result.pickup, {
    index: target,
    energy: 17,
    confirmed: false,
  });
  assert.equal(game.activePhoton.collectedNodes.has(target), true);
  assert.equal(game.resources.get(target).collected, true);
});

test("an uncollected node is revealed anywhere in line of sight", () => {
  const game = new QuantumFoamGame(
    { cols: 5, rows: 5, resourceCount: 0, roomCount: 0 },
    "visible-node",
  );
  game.walls.fill(15);
  const start = game.index(1, 2);
  const middle = game.index(2, 2);
  const visibleNode = game.index(3, 2);
  game.setPassage(game.walls, start, middle, true);
  game.setPassage(game.walls, middle, visibleNode, true);
  game.activePhoton.position = start;
  game.resources.set(visibleNode, {
    energy: 18,
    collected: false,
    confirmed: false,
  });

  assert.deepEqual(game.getRevealedResourceIndices(), [visibleNode]);

  game.setPassage(game.walls, middle, visibleNode, false);
  assert.deepEqual(game.getRevealedResourceIndices(), []);
});

test("the detector reports walking distance through the maze", () => {
  const game = new QuantumFoamGame({ resourceCount: 0 }, "route-detector");
  const distances = game.routeDistances([game.source]);
  const target = [...distances].findIndex(
    (distance) => distance === Math.min(3, game.config.detectorRange),
  );
  game.resources.set(target, {
    energy: 18,
    collected: false,
    confirmed: false,
  });

  assert.equal(game.getProximity().distance, distances[target]);
});

test("the detector stays quiet beyond its five-step range", () => {
  const game = new QuantumFoamGame(
    { cols: 7, rows: 1, resourceCount: 0, roomCount: 0 },
    "detector-boundary",
  );
  game.walls.fill(15);
  for (let x = 0; x < game.config.cols - 1; x += 1) {
    game.setPassage(game.walls, game.index(x, 0), game.index(x + 1, 0), true);
  }
  const target = game.index(6, 0);
  game.resources.set(target, {
    energy: 18,
    collected: false,
    confirmed: false,
  });

  assert.equal(game.getProximity(), null);

  game.move("right");

  assert.equal(game.getProximity().distance, game.config.detectorRange);
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

test("losing the final photon records an explicit loss reason", () => {
  const game = new QuantumFoamGame(
    { photonCount: 1, photonCapacity: 1, resourceCount: 0 },
    "final-photon",
  );
  const outbound = openDirection(game, game.source);
  game.move(outbound);

  assert.equal(game.status, "lost");
  assert.equal(game.lossReason.type, "all-photons-lost");
  assert.equal(game.lossReason.title, "No photons remain.");
  assert.match(game.lossReason.explanation, /every photon was lost/i);
});

test("energy bankruptcy records the best remaining route and shortfall", () => {
  const game = new QuantumFoamGame(
    { cols: 6, rows: 6, photonCount: 2, globalEnergy: 0, resourceCount: 0 },
    "energy-stranded",
  );
  const candidates = Array.from({ length: game.cellCount }, (_, index) => ({
    index,
    cost: game.shortestEnergyCost(game.source, index),
  })).filter(({ index }) => index !== game.source);
  candidates.sort((a, b) => b.cost - a.cost);
  const target = candidates[0];
  const availableCharge = Math.min(5, target.cost - 1);

  game.resources.set(target.index, {
    energy: 20,
    collected: false,
    confirmed: false,
  });
  for (const photon of game.photons) photon.energy = availableCharge;

  game.checkEnergyLoss();

  assert.equal(game.status, "lost");
  assert.equal(game.lossReason.type, "energy-stranded");
  assert.equal(game.lossReason.title, "Energy stranded.");
  assert.equal(game.lossReason.availableCharge, availableCharge);
  assert.equal(game.lossReason.requiredCharge, target.cost);
  assert.equal(game.lossReason.shortfall, target.cost - availableCharge);
  assert.match(game.lossReason.explanation, new RegExp(`had ${availableCharge} charge`));
  assert.match(game.lossReason.explanation, new RegExp(`required ${target.cost}`));
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
