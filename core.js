export const CONFIG = Object.freeze({
  cols: 30,
  rows: 30,
  photonCount: 3,
  photonCapacity: 20,
  globalEnergy: 100,
  resourceCount: 12,
  resourceEnergyMin: 16,
  resourceEnergyMax: 24,
  detectorRange: 3,
  confirmationThreshold: 0.5,
  confirmedMoveCost: 0,
  unconfirmedMoveCost: 1,
  explorationRadius: 4,
});

export const WALL = Object.freeze({
  north: 1,
  east: 2,
  south: 4,
  west: 8,
});

export const DIRECTIONS = Object.freeze({
  up: { dx: 0, dy: -1, wall: WALL.north, opposite: WALL.south },
  right: { dx: 1, dy: 0, wall: WALL.east, opposite: WALL.west },
  down: { dx: 0, dy: 1, wall: WALL.south, opposite: WALL.north },
  left: { dx: -1, dy: 0, wall: WALL.west, opposite: WALL.east },
});

const DIRECTION_NAMES = Object.keys(DIRECTIONS);

function hashSeed(seed) {
  const source = String(seed);
  let hash = 2166136261;
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(values, random) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export class QuantumFoamGame {
  constructor(config = {}, seed = Date.now()) {
    this.config = Object.freeze({ ...CONFIG, ...config });
    this.newRun(seed);
  }

  newRun(seed = Date.now()) {
    this.seed = String(seed);
    this.random = mulberry32(hashSeed(this.seed));
    this.turn = 0;
    this.status = "playing";
    this.lossReason = null;
    this.exit = null;
    this.exitSpotted = false;
    this.log = [];

    this.walls = this.generateMaze();
    const sourceY = Math.floor(this.random() * this.config.rows);
    this.source = this.index(0, sourceY);
    this.confirmed = new Set([this.source]);
    this.resources = this.placeResources();
    this.photons = Array.from({ length: this.config.photonCount }, (_, index) => ({
      id: index,
      position: this.source,
      energy: this.config.photonCapacity,
      alive: true,
      notebook: new Set(),
      collectedNodes: new Set(),
    }));
    this.activePhotonIndex = 0;
    this.globalEnergy = this.config.globalEnergy;
    this.addLog("Photon 1 is ready at the source. Find a node and bring the map home.", "info");
    return this.snapshot();
  }

  get cellCount() {
    return this.config.cols * this.config.rows;
  }

  get activePhoton() {
    return this.photons[this.activePhotonIndex];
  }

  index(x, y) {
    return y * this.config.cols + x;
  }

  coords(index) {
    return {
      x: index % this.config.cols,
      y: Math.floor(index / this.config.cols),
    };
  }

  isInside(x, y) {
    return x >= 0 && x < this.config.cols && y >= 0 && y < this.config.rows;
  }

  neighbor(index, directionName) {
    const direction = DIRECTIONS[directionName];
    if (!direction) return null;
    const { x, y } = this.coords(index);
    const nextX = x + direction.dx;
    const nextY = y + direction.dy;
    return this.isInside(nextX, nextY) ? this.index(nextX, nextY) : null;
  }

  directionBetween(from, to) {
    for (const name of DIRECTION_NAMES) {
      if (this.neighbor(from, name) === to) return name;
    }
    return null;
  }

  isPassageOpen(index, directionName, walls = this.walls) {
    const direction = DIRECTIONS[directionName];
    const neighbor = this.neighbor(index, directionName);
    return neighbor !== null && (walls[index] & direction.wall) === 0;
  }

  openPassage(walls, from, to) {
    const directionName = this.directionBetween(from, to);
    if (!directionName) return;
    const direction = DIRECTIONS[directionName];
    walls[from] &= ~direction.wall;
    walls[to] &= ~direction.opposite;
  }

  setPassage(walls, from, to, open) {
    const directionName = this.directionBetween(from, to);
    if (!directionName) return;
    const direction = DIRECTIONS[directionName];
    if (open) {
      walls[from] &= ~direction.wall;
      walls[to] &= ~direction.opposite;
    } else {
      walls[from] |= direction.wall;
      walls[to] |= direction.opposite;
    }
  }

  generateMaze() {
    const walls = new Uint8Array(this.cellCount);
    walls.fill(WALL.north | WALL.east | WALL.south | WALL.west);
    const visited = new Uint8Array(this.cellCount);
    const start = Math.floor(this.random() * this.cellCount);
    const stack = [start];
    visited[start] = 1;

    while (stack.length > 0) {
      const current = stack[stack.length - 1];
      const choices = DIRECTION_NAMES
        .map((name) => ({ name, target: this.neighbor(current, name) }))
        .filter(({ target }) => target !== null && !visited[target]);

      if (choices.length === 0) {
        stack.pop();
        continue;
      }

      const choice = choices[Math.floor(this.random() * choices.length)];
      this.openPassage(walls, current, choice.target);
      visited[choice.target] = 1;
      stack.push(choice.target);
    }

    return walls;
  }

  placeResources() {
    const resources = new Map();
    const candidates = shuffled(
      Array.from({ length: this.cellCount }, (_, index) => index).filter((index) => {
        if (index === this.source) return false;
        const { x } = this.coords(index);
        return x > 2;
      }),
      this.random,
    );

    for (const index of candidates) {
      if (resources.size >= this.config.resourceCount) break;
      const { x, y } = this.coords(index);
      const tooClose = [...resources.keys()].some((otherIndex) => {
        const other = this.coords(otherIndex);
        return Math.abs(x - other.x) + Math.abs(y - other.y) < 4;
      });
      if (tooClose) continue;
      const span = this.config.resourceEnergyMax - this.config.resourceEnergyMin + 1;
      resources.set(index, {
        energy: this.config.resourceEnergyMin + Math.floor(this.random() * span),
        collected: false,
        confirmed: false,
      });
    }

    return resources;
  }

  observeFrom(photon) {
    const cells = [photon.position];
    for (const name of DIRECTION_NAMES) {
      if (this.isPassageOpen(photon.position, name)) {
        cells.push(this.neighbor(photon.position, name));
      }
    }
    for (const index of cells) {
      if (!this.confirmed.has(index)) photon.notebook.add(index);
    }
  }

  move(directionName) {
    if (this.status !== "playing") {
      return { ok: false, reason: "This run is over." };
    }

    const photon = this.activePhoton;
    if (!photon?.alive) {
      return { ok: false, reason: "That photon is gone." };
    }
    if (!DIRECTIONS[directionName]) {
      return { ok: false, reason: "Unknown direction." };
    }
    if (!this.isPassageOpen(photon.position, directionName)) {
      return { ok: false, reason: "A wall blocks that route." };
    }

    const target = this.neighbor(photon.position, directionName);
    const enteringConfirmed = this.confirmed.has(target);
    const moveCost = enteringConfirmed
      ? this.config.confirmedMoveCost
      : this.config.unconfirmedMoveCost;

    if (photon.energy < moveCost) {
      this.checkEnergyLoss();
      return { ok: false, reason: "No charge left for unconfirmed space." };
    }

    const from = photon.position;
    photon.position = target;
    photon.energy -= moveCost;
    this.turn += 1;

    if (!enteringConfirmed) this.observeFrom(photon);
    const pickup = this.collectResource(photon);

    if (
      this.exit &&
      from === this.exit.from &&
      target === this.exit.cell &&
      this.confirmed.has(from)
    ) {
      this.status = "won";
      this.addLog("The boundary gives way. You generated enough reality to leave.", "success");
      return { ok: true, event: "won", pickup };
    }

    if (enteringConfirmed && this.isWaystation(target)) {
      this.deliverNotebook(photon);
      this.servicePhoton(photon);
    }

    this.updateExitVisibility();

    if (photon.energy <= 0 && !this.confirmed.has(photon.position)) {
      this.killPhoton(photon);
      return {
        ok: true,
        event: this.status === "lost" ? "lost" : "photon-lost",
        pickup,
      };
    }

    this.checkEnergyLoss();
    return {
      ok: true,
      event: enteringConfirmed ? "confirmed" : "moved",
      pickup,
    };
  }

  collectResource(photon) {
    const resource = this.resources.get(photon.position);
    if (!resource || resource.collected) return null;
    resource.collected = true;
    const alreadyMapped = this.confirmed.has(photon.position);
    if (alreadyMapped) {
      resource.confirmed = true;
    } else {
      photon.collectedNodes.add(photon.position);
    }
    photon.energy += resource.energy;
    this.addLog(
      alreadyMapped
        ? `A mapped node yielded ${resource.energy} energy and is now a waystation.`
        : `Photon ${photon.id + 1} found ${resource.energy} energy. Get it to a confirmed node.`,
      "resource",
    );
    return {
      index: photon.position,
      energy: resource.energy,
      confirmed: resource.confirmed,
    };
  }

  deliverNotebook(photon) {
    if (photon.notebook.size === 0) return;
    const deliveredCount = photon.notebook.size;
    for (const index of photon.notebook) this.confirmed.add(index);
    photon.notebook.clear();

    for (const index of photon.collectedNodes) {
      const resource = this.resources.get(index);
      if (resource) resource.confirmed = true;
    }
    photon.collectedNodes.clear();

    this.addLog(
      `${deliveredCount} cells confirmed. The route is permanent and free to cross.`,
      "success",
    );
    this.maybeSpawnExit();
  }

  servicePhoton(photon) {
    if (photon.energy > this.config.photonCapacity) {
      const surplus = photon.energy - this.config.photonCapacity;
      photon.energy = this.config.photonCapacity;
      this.globalEnergy += surplus;
      this.addLog(`${surplus} surplus energy banked in the shared pool.`, "resource");
    }

    if (photon.energy < this.config.photonCapacity && this.globalEnergy > 0) {
      const needed = this.config.photonCapacity - photon.energy;
      const transfer = Math.min(needed, this.globalEnergy);
      photon.energy += transfer;
      this.globalEnergy -= transfer;
    }
  }

  isWaystation(index) {
    if (index === this.source) return true;
    const resource = this.resources.get(index);
    return Boolean(resource?.confirmed);
  }

  switchPhoton(index) {
    if (this.status !== "playing") {
      return { ok: false, reason: "This run is over." };
    }
    if (!Number.isInteger(index) || index < 0 || index >= this.photons.length) {
      return { ok: false, reason: "Unknown photon." };
    }
    if (!this.isWaystation(this.activePhoton.position)) {
      return { ok: false, reason: "Switch photons from a waystation." };
    }
    const target = this.photons[index];
    if (!target.alive) {
      return { ok: false, reason: "That photon is gone." };
    }
    this.activePhotonIndex = index;
    this.servicePhoton(target);
    this.updateExitVisibility();
    this.addLog(`Photon ${index + 1} is active.`, "info");
    return { ok: true };
  }

  killPhoton(photon) {
    const lostCells = photon.notebook.size;
    photon.alive = false;
    photon.energy = 0;
    photon.notebook.clear();
    photon.collectedNodes.clear();

    if (lostCells > 0) this.rerollUnconfirmed();

    this.addLog(
      `Photon ${photon.id + 1} was lost. ${lostCells} observations dissolved back into foam.`,
      "danger",
    );

    const nextIndex = this.photons.findIndex((candidate) => candidate.alive);
    if (nextIndex === -1) {
      this.status = "lost";
      this.lossReason = {
        type: "all-photons-lost",
        title: "No photons remain.",
        explanation: "Every photon was lost before enough of the maze could be confirmed.",
      };
      this.addLog(this.lossReason.explanation, "danger");
      return;
    }

    this.activePhotonIndex = nextIndex;
    this.updateExitVisibility();
    this.checkEnergyLoss();
  }

  rerollUnconfirmed() {
    const oldWalls = this.walls;
    const generated = this.generateMaze();
    const nextWalls = new Uint8Array(oldWalls);

    for (let index = 0; index < this.cellCount; index += 1) {
      for (const name of ["right", "down"]) {
        const neighbor = this.neighbor(index, name);
        if (neighbor === null) continue;
        if (this.confirmed.has(index) || this.confirmed.has(neighbor)) continue;
        const open = (generated[index] & DIRECTIONS[name].wall) === 0;
        this.setPassage(nextWalls, index, neighbor, open);
      }
    }

    this.walls = nextWalls;
    this.connectUnconfirmedRegions();

    if (this.exit) {
      const exitStillOpen =
        this.confirmed.has(this.exit.from) &&
        !this.confirmed.has(this.exit.cell) &&
        this.directionBetween(this.exit.from, this.exit.cell) &&
        this.isPassageOpen(
          this.exit.from,
          this.directionBetween(this.exit.from, this.exit.cell),
        );
      if (!exitStillOpen) {
        this.exit = null;
        this.exitSpotted = false;
        this.maybeSpawnExit();
      }
    }
  }

  reachableCells() {
    const start = this.confirmed.size > 0 ? this.confirmed.values().next().value : 0;
    const reached = new Set([start]);
    const queue = [start];
    while (queue.length > 0) {
      const current = queue.shift();
      for (const name of DIRECTION_NAMES) {
        if (!this.isPassageOpen(current, name)) continue;
        const neighbor = this.neighbor(current, name);
        if (!reached.has(neighbor)) {
          reached.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
    return reached;
  }

  connectUnconfirmedRegions() {
    let reached = this.reachableCells();
    let guard = this.cellCount * 2;

    while (reached.size < this.cellCount && guard > 0) {
      guard -= 1;
      let bridge = null;
      for (const index of reached) {
        if (this.confirmed.has(index)) continue;
        for (const name of DIRECTION_NAMES) {
          const neighbor = this.neighbor(index, name);
          if (
            neighbor !== null &&
            !reached.has(neighbor) &&
            !this.confirmed.has(neighbor)
          ) {
            bridge = [index, neighbor];
            break;
          }
        }
        if (bridge) break;
      }
      if (!bridge) break;
      this.openPassage(this.walls, bridge[0], bridge[1]);
      reached = this.reachableCells();
    }
  }

  maybeSpawnExit() {
    if (this.exit || this.confirmationRatio < this.config.confirmationThreshold) return;

    const candidates = [];
    for (const index of this.confirmed) {
      for (const name of DIRECTION_NAMES) {
        const neighbor = this.neighbor(index, name);
        if (
          neighbor !== null &&
          !this.confirmed.has(neighbor) &&
          this.isPassageOpen(index, name)
        ) {
          candidates.push({ from: index, cell: neighbor, direction: name });
        }
      }
    }

    if (candidates.length === 0) return;
    this.exit = candidates[Math.floor(this.random() * candidates.length)];
    this.exitSpotted = false;
    this.addLog(
      "Enough of the maze is real. An exit now exists somewhere on the frontier.",
      "exit",
    );
  }

  updateExitVisibility() {
    if (!this.exit || this.exitSpotted || !this.activePhoton?.alive) return;
    if (this.activePhoton.position === this.exit.from) {
      this.exitSpotted = true;
      this.addLog("The exit shimmers just beyond this boundary.", "exit");
    }
  }

  get confirmationRatio() {
    return this.confirmed.size / this.cellCount;
  }

  getProximity() {
    if (!this.activePhoton?.alive) return null;
    const current = this.coords(this.activePhoton.position);
    let closest = Infinity;

    for (const [index, resource] of this.resources) {
      if (resource.collected) continue;
      const target = this.coords(index);
      const distance = Math.abs(current.x - target.x) + Math.abs(current.y - target.y);
      closest = Math.min(closest, distance);
    }

    if (closest > this.config.detectorRange) return null;
    return {
      distance: closest,
      strength: this.config.detectorRange - closest + 1,
    };
  }

  shortestEnergyCost(start, target) {
    const distances = new Float64Array(this.cellCount);
    distances.fill(Infinity);
    distances[start] = 0;
    const frontier = [{ index: start, cost: 0 }];

    while (frontier.length > 0) {
      frontier.sort((a, b) => a.cost - b.cost);
      const current = frontier.shift();
      if (current.cost !== distances[current.index]) continue;
      if (current.index === target) return current.cost;

      for (const name of DIRECTION_NAMES) {
        if (!this.isPassageOpen(current.index, name)) continue;
        const neighbor = this.neighbor(current.index, name);
        const step = this.confirmed.has(neighbor)
          ? this.config.confirmedMoveCost
          : this.config.unconfirmedMoveCost;
        const cost = current.cost + step;
        if (cost < distances[neighbor]) {
          distances[neighbor] = cost;
          frontier.push({ index: neighbor, cost });
        }
      }
    }

    return Infinity;
  }

  getEnergyRecoveryDetails() {
    const availableResources = [...this.resources.entries()].filter(
      ([, resource]) => !resource.collected,
    );
    let bestRoute = null;

    for (const photon of this.photons) {
      if (!photon.alive) continue;
      for (const [index] of availableResources) {
        const requiredCharge = this.shortestEnergyCost(photon.position, index);
        if (!Number.isFinite(requiredCharge)) continue;
        const shortfall = Math.max(0, requiredCharge - photon.energy);
        const candidate = {
          photonId: photon.id,
          availableCharge: photon.energy,
          requiredCharge,
          shortfall,
        };
        if (
          !bestRoute ||
          candidate.shortfall < bestRoute.shortfall ||
          (candidate.shortfall === bestRoute.shortfall &&
            candidate.requiredCharge < bestRoute.requiredCharge)
        ) {
          bestRoute = candidate;
        }
      }
    }

    return {
      remainingNodes: availableResources.length,
      bestRoute,
    };
  }

  canAnyPhotonReachResource() {
    const recovery = this.getEnergyRecoveryDetails();
    return Boolean(recovery.bestRoute && recovery.bestRoute.shortfall === 0);
  }

  canAnyPhotonReachExit() {
    if (!this.exit) return false;
    return this.photons.some(
      (photon) =>
        photon.alive &&
        this.shortestEnergyCost(photon.position, this.exit.cell) <= photon.energy,
    );
  }

  checkEnergyLoss() {
    if (this.status !== "playing" || this.globalEnergy > 0) return;
    if (this.canAnyPhotonReachExit()) return;
    const recovery = this.getEnergyRecoveryDetails();
    if (recovery.bestRoute?.shortfall === 0) return;

    let explanation;
    if (recovery.remainingNodes === 0) {
      explanation =
        "The shared pool was empty, and every energy node had already been depleted.";
    } else if (!recovery.bestRoute) {
      explanation =
        "The shared pool was empty, and the remaining energy nodes were cut off by the maze.";
    } else {
      explanation =
        `The shared pool was empty. Photon ${recovery.bestRoute.photonId + 1} had ` +
        `${recovery.bestRoute.availableCharge} charge, but the best remaining route to an ` +
        `energy node required ${recovery.bestRoute.requiredCharge}.`;
    }

    this.status = "lost";
    this.lossReason = {
      type: "energy-stranded",
      title: "Energy stranded.",
      explanation,
      remainingNodes: recovery.remainingNodes,
      ...(recovery.bestRoute || {}),
    };
    this.addLog(explanation, "danger");
  }

  addLog(text, tone = "info") {
    this.log.unshift({ turn: this.turn, text, tone });
    this.log = this.log.slice(0, 8);
  }

  snapshot() {
    return {
      seed: this.seed,
      turn: this.turn,
      status: this.status,
      lossReason: this.lossReason ? { ...this.lossReason } : null,
      source: this.source,
      activePhotonIndex: this.activePhotonIndex,
      globalEnergy: this.globalEnergy,
      confirmationRatio: this.confirmationRatio,
      exit: this.exit ? { ...this.exit, spotted: this.exitSpotted } : null,
      proximity: this.getProximity(),
      photons: this.photons.map((photon) => ({
        id: photon.id,
        position: photon.position,
        energy: photon.energy,
        alive: photon.alive,
        notebookSize: photon.notebook.size,
      })),
    };
  }
}
