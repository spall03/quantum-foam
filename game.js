import { CONFIG, DIRECTIONS, QuantumFoamGame, WALL } from "./core.js";
import { QuantumMusic } from "./music.js";

const elements = {
  canvas: document.querySelector("#game-canvas"),
  canvasFrame: document.querySelector("#canvas-frame"),
  photonEnergyValue: document.querySelector("#photon-energy-value"),
  photonEnergyBar: document.querySelector("#photon-energy-bar"),
  globalEnergyValue: document.querySelector("#global-energy-value"),
  globalEnergyBar: document.querySelector("#global-energy-bar"),
  signalCard: document.querySelector(".signal-card"),
  signalLabel: document.querySelector("#signal-label"),
  signalBars: [...document.querySelectorAll("#signal-bars i")],
  canvasSignal: document.querySelector("#canvas-signal"),
  canvasSignalValue: document.querySelector("#canvas-signal-value"),
  nodeAlert: document.querySelector("#node-alert"),
  nodeAlertValue: document.querySelector("#node-alert-value"),
  photonSelector: document.querySelector("#photon-selector"),
  viewMode: document.querySelector("#view-mode"),
  viewTitle: document.querySelector("#view-title"),
  turnValue: document.querySelector("#turn-value"),
  seedValue: document.querySelector("#seed-value"),
  notebookValue: document.querySelector("#notebook-value"),
  confirmationValue: document.querySelector("#confirmation-value"),
  confirmationShort: document.querySelector("#confirmation-short"),
  confirmationOrbit: document.querySelector("#confirmation-orbit"),
  exitStatus: document.querySelector("#exit-status"),
  transmission: document.querySelector("#transmission"),
  runResult: document.querySelector("#run-result"),
  resultEyebrow: document.querySelector("#result-eyebrow"),
  resultTitle: document.querySelector("#result-title"),
  resultCopy: document.querySelector("#result-copy"),
  resultNewRun: document.querySelector("#result-new-run"),
  briefing: document.querySelector("#briefing"),
  beginButton: document.querySelector("#begin-button"),
  helpButton: document.querySelector("#help-button"),
  closeHelp: document.querySelector("#close-help"),
  newRunButton: document.querySelector("#new-run-button"),
  musicButton: document.querySelector("#music-button"),
  musicState: document.querySelector("#music-state"),
};

const context = elements.canvas.getContext("2d");
const params = new URLSearchParams(window.location.search);
const music = new QuantumMusic();

function randomSeed() {
  const values = new Uint32Array(2);
  crypto.getRandomValues(values);
  return `${values[0].toString(36)}${values[1].toString(36)}`.slice(0, 10).toUpperCase();
}

let game = new QuantumFoamGame({}, params.get("seed") || randomSeed());
let temporaryMessage = "";
let temporaryMessageTimer = null;
let nodeAlertTimer = null;
let touchStart = null;

function isExploring() {
  return Boolean(
    game.activePhoton?.alive && !game.confirmed.has(game.activePhoton.position),
  );
}

function isAtWaystation() {
  return Boolean(game.activePhoton?.alive && game.isWaystation(game.activePhoton.position));
}

function showTemporaryMessage(message) {
  temporaryMessage = message;
  clearTimeout(temporaryMessageTimer);
  temporaryMessageTimer = setTimeout(() => {
    temporaryMessage = "";
    syncInterface();
  }, 1300);
}

function showNodeAlert(pickup) {
  clearTimeout(nodeAlertTimer);
  elements.nodeAlertValue.textContent = `+${pickup.energy} charge`;
  elements.nodeAlert.hidden = false;
  elements.nodeAlert.classList.remove("is-visible");
  void elements.nodeAlert.offsetWidth;
  elements.nodeAlert.classList.add("is-visible");
  nodeAlertTimer = setTimeout(() => {
    elements.nodeAlert.classList.remove("is-visible");
    elements.nodeAlert.hidden = true;
  }, 1800);
}

function syncMusicButton() {
  elements.musicButton.disabled = !music.supported;
  elements.musicButton.setAttribute("aria-pressed", String(music.playing));
  elements.musicButton.setAttribute(
    "aria-label",
    music.supported
      ? music.playing
        ? "Turn music off"
        : "Turn music on"
      : "Music unavailable",
  );
  elements.musicState.textContent = music.supported
    ? music.playing
      ? "On"
      : "Off"
    : "N/A";
}

async function toggleMusic() {
  await music.toggle();
  syncMusicButton();
}

function syncPhotonSelector() {
  elements.photonSelector.replaceChildren();
  const canSwitch = isAtWaystation() && game.status === "playing";

  game.photons.forEach((photon, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "photon-button";
    button.classList.toggle("active", index === game.activePhotonIndex);
    button.classList.toggle("dead", !photon.alive);
    button.disabled = !photon.alive || (!canSwitch && index !== game.activePhotonIndex);
    button.setAttribute(
      "aria-label",
      photon.alive
        ? `Select photon ${index + 1}, ${photon.energy} charge`
        : `Photon ${index + 1} lost`,
    );
    button.innerHTML = `<strong>Φ${index + 1}</strong><small>${
      photon.alive ? `${photon.energy} e` : "lost"
    }</small>`;
    button.addEventListener("click", () => {
      const result = game.switchPhoton(index);
      if (!result.ok) showTemporaryMessage(result.reason);
      syncInterface();
      elements.canvas.focus();
    });
    elements.photonSelector.append(button);
  });
}

function syncInterface() {
  const photon = game.activePhoton;
  const ratio = game.confirmationRatio;
  const percent = ratio * 100;
  music.setProgress(ratio / CONFIG.confirmationThreshold);
  const proximity = game.getProximity();
  const visibleResources = game.getRevealedResourceIndices();
  const hasVisualContact = visibleResources.length > 0;
  const exploring = isExploring();

  elements.photonEnergyValue.textContent = photon
    ? `${photon.energy} / ${CONFIG.photonCapacity}`
    : `0 / ${CONFIG.photonCapacity}`;
  elements.photonEnergyBar.style.width = `${Math.min(
    100,
    ((photon?.energy || 0) / CONFIG.photonCapacity) * 100,
  )}%`;
  elements.photonEnergyBar.style.backgroundColor =
    photon?.energy <= 5 ? "var(--danger)" : "var(--aqua)";

  elements.globalEnergyValue.textContent = String(game.globalEnergy);
  elements.globalEnergyBar.style.width = `${Math.min(
    100,
    (game.globalEnergy / CONFIG.globalEnergy) * 100,
  )}%`;

  const signalText = hasVisualContact
    ? "Node sighted"
    : proximity
      ? proximity.distance <= 2
        ? "Very close"
        : proximity.distance === 3
          ? "Nearby"
          : "Faint"
      : "Quiet";
  elements.signalLabel.textContent = signalText;
  elements.signalCard.classList.toggle(
    "is-detecting",
    Boolean(proximity || hasVisualContact),
  );
  elements.signalBars.forEach((bar, index) => {
    bar.classList.toggle(
      "active",
      Boolean(proximity && index < proximity.strength),
    );
  });
  elements.canvasSignal.hidden = !proximity && !hasVisualContact;
  if (hasVisualContact) {
    elements.canvasSignalValue.textContent =
      visibleResources.length === 1
        ? "Visual contact · marked on map"
        : `${visibleResources.length} nodes in sight · marked on map`;
  } else if (proximity) {
    elements.canvasSignalValue.textContent =
      proximity.distance === 1
        ? "Adjacent · marked on map"
        : `${signalText} · ${proximity.distance} cells`;
  }

  elements.viewMode.textContent = exploring ? "Expedition view" : "Network view";
  elements.viewTitle.textContent = exploring
    ? "Your map is real only while you survive."
    : isAtWaystation()
      ? "Choose a frontier. Bring the notebook back."
      : "Confirmed ground is stable and free.";
  elements.turnValue.textContent = String(game.turn);
  elements.seedValue.textContent = game.seed;
  const recordedNodes = photon?.collectedNodes.size || 0;
  elements.notebookValue.textContent = photon?.notebook.size
    ? `Notebook: ${photon.notebook.size} cells${
        recordedNodes ? ` · ${recordedNodes} node${recordedNodes === 1 ? "" : "s"}` : ""
      }`
    : "Notebook: empty";

  elements.confirmationValue.textContent = `${percent.toFixed(1)}%`;
  elements.confirmationShort.textContent = `${Math.floor(percent)}%`;
  elements.confirmationOrbit.style.setProperty("--orbit-progress", `${Math.min(100, percent)}%`);
  elements.exitStatus.textContent = game.exit
    ? game.exitSpotted
      ? "Exit located. Step through from confirmed ground."
      : "Exit generated. Search the confirmed frontier."
    : `Confirm ${Math.round(CONFIG.confirmationThreshold * 100)}% to generate an exit.`;

  elements.transmission.textContent =
    temporaryMessage || game.log[0]?.text || "The foam is quiet.";
  syncPhotonSelector();

  const resultVisible = game.status === "won" || game.status === "lost";
  elements.runResult.hidden = !resultVisible;
  if (resultVisible) {
    const won = game.status === "won";
    elements.resultEyebrow.textContent = won ? "Exit crossed" : "Run collapsed";
    elements.resultTitle.textContent = won
      ? "Reality generated."
      : game.lossReason?.title || "The foam took it back.";
    elements.resultCopy.textContent = won
      ? `${game.confirmed.size} cells were made permanent in ${game.turn} turns.`
      : `${game.lossReason?.explanation || "This reality could not be sustained."} ` +
        `${game.confirmed.size} cells survived through turn ${game.turn}.`;
  }

  elements.canvas.setAttribute(
    "aria-label",
    `${exploring ? "Expedition" : "Network"} view. Photon ${game.activePhotonIndex + 1} has ${
      photon?.energy || 0
    } charge. ${percent.toFixed(1)} percent confirmed.`,
  );
}

function move(directionName) {
  if (elements.briefing.open) return;
  const result = game.move(directionName);
  if (!result.ok) showTemporaryMessage(result.reason);
  if (result.pickup) showNodeAlert(result.pickup);
  syncInterface();
}

function startNewRun(seed = randomSeed()) {
  game = new QuantumFoamGame({}, seed);
  temporaryMessage = "";
  clearTimeout(nodeAlertTimer);
  elements.nodeAlert.hidden = true;
  elements.nodeAlert.classList.remove("is-visible");
  syncInterface();
  elements.canvas.focus();
}

function resizeCanvas() {
  const rect = elements.canvas.getBoundingClientRect();
  const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
  const width = Math.max(1, Math.round(rect.width * pixelRatio));
  const height = Math.max(1, Math.round(rect.height * pixelRatio));
  if (elements.canvas.width !== width || elements.canvas.height !== height) {
    elements.canvas.width = width;
    elements.canvas.height = height;
  }
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  return { width: rect.width, height: rect.height };
}

function viewBounds() {
  if (!isExploring()) {
    return {
      x: 0,
      y: 0,
      cols: game.config.cols,
      rows: game.config.rows,
      mode: "network",
    };
  }
  const photon = game.coords(game.activePhoton.position);
  const diameter = game.config.explorationRadius * 2 + 1;
  return {
    x: photon.x - game.config.explorationRadius,
    y: photon.y - game.config.explorationRadius,
    cols: diameter,
    rows: diameter,
    mode: "expedition",
  };
}

function seededNoise(index, salt) {
  const value = Math.sin((index + 1) * 127.1 + salt * 311.7 + Number(game.seed.length)) * 43758.5453;
  return value - Math.floor(value);
}

function cellState(index) {
  if (game.confirmed.has(index)) return "confirmed";
  if (game.activePhoton?.notebook.has(index)) return "observed";
  return "foam";
}

function drawDiamond(x, y, radius, fill, stroke) {
  context.beginPath();
  context.moveTo(x, y - radius);
  context.lineTo(x + radius, y);
  context.lineTo(x, y + radius);
  context.lineTo(x - radius, y);
  context.closePath();
  context.fillStyle = fill;
  context.fill();
  context.strokeStyle = stroke;
  context.lineWidth = 1;
  context.stroke();
}

function drawMaze(time) {
  const { width, height } = resizeCanvas();
  context.clearRect(0, 0, width, height);

  const bounds = viewBounds();
  const margin = bounds.mode === "network" ? Math.max(18, width * 0.035) : Math.max(24, width * 0.055);
  const cellSize = Math.min(
    (width - margin * 2) / bounds.cols,
    (height - margin * 2) / bounds.rows,
  );
  const mapWidth = cellSize * bounds.cols;
  const mapHeight = cellSize * bounds.rows;
  const originX = (width - mapWidth) / 2;
  const originY = (height - mapHeight) / 2;

  context.fillStyle = "#05070b";
  context.fillRect(0, 0, width, height);

  const visibleCells = [];

  for (let viewY = 0; viewY < bounds.rows; viewY += 1) {
    for (let viewX = 0; viewX < bounds.cols; viewX += 1) {
      const gridX = bounds.x + viewX;
      const gridY = bounds.y + viewY;
      const screenX = originX + viewX * cellSize;
      const screenY = originY + viewY * cellSize;

      if (!game.isInside(gridX, gridY)) {
        context.fillStyle = "#030408";
        context.fillRect(screenX, screenY, cellSize + 0.5, cellSize + 0.5);
        continue;
      }

      const index = game.index(gridX, gridY);
      const state = cellState(index);
      const noise = seededNoise(index, game.turn % 7);

      if (state === "confirmed") {
        context.fillStyle =
          bounds.mode === "network" ? "rgba(35, 132, 123, 0.19)" : "rgba(35, 132, 123, 0.25)";
      } else if (state === "observed") {
        context.fillStyle = `rgba(108, 77, 176, ${0.2 + noise * 0.08})`;
      } else {
        context.fillStyle = `rgba(11, 13, 22, ${0.92 + noise * 0.06})`;
      }
      context.fillRect(screenX, screenY, cellSize + 0.5, cellSize + 0.5);

      if (state === "foam" && cellSize > 9 && noise > 0.72) {
        context.fillStyle = `rgba(169, 141, 255, ${0.05 + noise * 0.06})`;
        context.fillRect(
          screenX + seededNoise(index, 2) * cellSize,
          screenY + seededNoise(index, 3) * cellSize,
          Math.max(0.7, cellSize * 0.035),
          Math.max(0.7, cellSize * 0.035),
        );
      } else if (state !== "foam") {
        visibleCells.push({ index, state, screenX, screenY });
      }
    }
  }

  for (const cell of visibleCells) {
    const lineColor =
      cell.state === "confirmed" ? "rgba(114, 245, 221, 0.72)" : "rgba(169, 141, 255, 0.72)";
    context.strokeStyle = lineColor;
    context.lineWidth = Math.max(0.65, cellSize * 0.055);
    context.lineCap = "square";
    context.beginPath();
    if (game.walls[cell.index] & WALL.north) {
      context.moveTo(cell.screenX, cell.screenY);
      context.lineTo(cell.screenX + cellSize, cell.screenY);
    }
    if (game.walls[cell.index] & WALL.east) {
      context.moveTo(cell.screenX + cellSize, cell.screenY);
      context.lineTo(cell.screenX + cellSize, cell.screenY + cellSize);
    }
    if (game.walls[cell.index] & WALL.south) {
      context.moveTo(cell.screenX + cellSize, cell.screenY + cellSize);
      context.lineTo(cell.screenX, cell.screenY + cellSize);
    }
    if (game.walls[cell.index] & WALL.west) {
      context.moveTo(cell.screenX, cell.screenY + cellSize);
      context.lineTo(cell.screenX, cell.screenY);
    }
    context.stroke();
  }

  function positionFor(index) {
    const coords = game.coords(index);
    const viewX = coords.x - bounds.x;
    const viewY = coords.y - bounds.y;
    if (viewX < 0 || viewX >= bounds.cols || viewY < 0 || viewY >= bounds.rows) return null;
    return {
      x: originX + (viewX + 0.5) * cellSize,
      y: originY + (viewY + 0.5) * cellSize,
    };
  }

  const sourcePosition = positionFor(game.source);
  if (sourcePosition) {
    drawDiamond(
      sourcePosition.x,
      sourcePosition.y,
      Math.max(2.6, cellSize * 0.22),
      "#72f5dd",
      "rgba(255,255,255,.85)",
    );
  }

  const revealedResources = new Set(game.getRevealedResourceIndices());
  for (const [index, resource] of game.resources) {
    const recorded = Boolean(game.activePhoton?.collectedNodes.has(index));
    const revealed = revealedResources.has(index);
    if (!resource.confirmed && !recorded && !revealed) continue;
    const position = positionFor(index);
    if (!position) continue;
    const radius = Math.max(2.3, cellSize * 0.19);
    if (resource.confirmed) {
      context.beginPath();
      context.arc(position.x, position.y, radius, 0, Math.PI * 2);
      context.fillStyle = "#ffd166";
      context.fill();
      context.beginPath();
      context.arc(position.x, position.y, radius * 1.65, 0, Math.PI * 2);
      context.strokeStyle = "rgba(255, 209, 102, 0.45)";
      context.lineWidth = 1;
      context.stroke();
    } else if (recorded) {
      const pulse = 1 + Math.sin(time / 180) * 0.12;
      const markerRadius = radius * 1.8 * pulse;
      context.save();
      context.shadowColor = "#ffd166";
      context.shadowBlur = Math.max(8, cellSize * 0.55);
      context.beginPath();
      context.arc(position.x, position.y, markerRadius, 0, Math.PI * 2);
      context.strokeStyle = "#ffd166";
      context.lineWidth = Math.max(1.5, cellSize * 0.075);
      context.stroke();
      context.restore();
    } else {
      const pulse = 1 + Math.sin(time / 150) * 0.14;
      const markerRadius = Math.max(6, cellSize * 0.34) * pulse;
      context.save();
      context.shadowColor = "#ffd166";
      context.shadowBlur = Math.max(12, cellSize * 0.9);

      context.beginPath();
      context.arc(position.x, position.y, markerRadius, 0, Math.PI * 2);
      context.strokeStyle = "#ffd166";
      context.lineWidth = Math.max(2, cellSize * 0.095);
      context.stroke();

      context.beginPath();
      context.arc(position.x, position.y, Math.max(2.5, cellSize * 0.12), 0, Math.PI * 2);
      context.fillStyle = "#fff0ad";
      context.fill();

      const tickStart = markerRadius * 1.25;
      const tickEnd = markerRadius * 1.75;
      context.beginPath();
      context.moveTo(position.x - tickEnd, position.y);
      context.lineTo(position.x - tickStart, position.y);
      context.moveTo(position.x + tickStart, position.y);
      context.lineTo(position.x + tickEnd, position.y);
      context.moveTo(position.x, position.y - tickEnd);
      context.lineTo(position.x, position.y - tickStart);
      context.moveTo(position.x, position.y + tickStart);
      context.lineTo(position.x, position.y + tickEnd);
      context.strokeStyle = "rgba(255, 209, 102, 0.88)";
      context.lineWidth = Math.max(1, cellSize * 0.06);
      context.stroke();
      context.restore();
    }
  }

  if (game.exit?.spotted) {
    const position = positionFor(game.exit.cell);
    if (position) {
      const pulse = 0.8 + Math.sin(time / 250) * 0.16;
      drawDiamond(
        position.x,
        position.y,
        Math.max(4, cellSize * 0.3) * pulse,
        "#a98dff",
        "rgba(255,255,255,.92)",
      );
      context.beginPath();
      context.arc(position.x, position.y, cellSize * 0.42, 0, Math.PI * 2);
      context.strokeStyle = "rgba(169, 141, 255, 0.35)";
      context.lineWidth = 1;
      context.stroke();
    }
  }

  for (const photon of game.photons) {
    if (!photon.alive) continue;
    const position = positionFor(photon.position);
    if (!position) continue;
    if (cellState(photon.position) === "foam") continue;
    const active = photon.id === game.activePhotonIndex;
    const unstable = active && !game.confirmed.has(photon.position);
    const flicker = unstable ? 0.55 + seededNoise(game.turn, Math.floor(time / 120)) * 0.45 : 1;
    const radius = Math.max(3.1, cellSize * (active ? 0.24 : 0.17));

    context.save();
    context.globalAlpha = flicker;
    context.shadowColor = unstable ? "#a98dff" : "#72f5dd";
    context.shadowBlur = active ? cellSize * 0.8 : cellSize * 0.25;
    context.beginPath();
    context.arc(position.x, position.y, radius, 0, Math.PI * 2);
    context.fillStyle = unstable ? "#b6a2ff" : "#ecfffb";
    context.fill();
    context.restore();

    if (active) {
      context.beginPath();
      context.arc(position.x, position.y, radius * 1.8, 0, Math.PI * 2);
      context.strokeStyle = unstable
        ? "rgba(169, 141, 255, 0.66)"
        : "rgba(114, 245, 221, 0.66)";
      context.lineWidth = 1;
      context.stroke();
    }
  }

  context.fillStyle = "rgba(255,255,255,0.018)";
  for (let y = 0; y < height; y += 4) {
    context.fillRect(0, y, width, 1);
  }
}

function animationFrame(time) {
  drawMaze(time);
  requestAnimationFrame(animationFrame);
}

const keyDirections = {
  ArrowUp: "up",
  w: "up",
  W: "up",
  ArrowRight: "right",
  d: "right",
  D: "right",
  ArrowDown: "down",
  s: "down",
  S: "down",
  ArrowLeft: "left",
  a: "left",
  A: "left",
};

window.addEventListener("keydown", (event) => {
  if (elements.briefing.open) return;
  if (keyDirections[event.key]) {
    event.preventDefault();
    move(keyDirections[event.key]);
    return;
  }
  if (/^[123]$/.test(event.key)) {
    event.preventDefault();
    const result = game.switchPhoton(Number(event.key) - 1);
    if (!result.ok) showTemporaryMessage(result.reason);
    syncInterface();
    return;
  }
  if (event.key === "m" || event.key === "M") {
    event.preventDefault();
    void toggleMusic();
  }
});

document.querySelectorAll("[data-direction]").forEach((button) => {
  button.addEventListener("click", () => {
    move(button.dataset.direction);
    elements.canvas.focus();
  });
});

elements.canvas.addEventListener(
  "pointerdown",
  (event) => {
    touchStart = { x: event.clientX, y: event.clientY };
    elements.canvas.setPointerCapture(event.pointerId);
  },
  { passive: true },
);

elements.canvas.addEventListener(
  "pointerup",
  (event) => {
    if (!touchStart) return;
    const dx = event.clientX - touchStart.x;
    const dy = event.clientY - touchStart.y;
    touchStart = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) {
      elements.canvas.focus();
      return;
    }
    move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up");
  },
  { passive: true },
);

elements.beginButton.addEventListener("click", () => {
  elements.briefing.close();
  void music.start().then(syncMusicButton);
  elements.canvas.focus();
});

elements.closeHelp.addEventListener("click", () => {
  elements.briefing.close();
  elements.canvas.focus();
});

elements.helpButton.addEventListener("click", () => {
  if (!elements.briefing.open) elements.briefing.showModal();
});

elements.newRunButton.addEventListener("click", () => startNewRun());
elements.resultNewRun.addEventListener("click", () => startNewRun());
elements.musicButton.addEventListener("click", () => {
  void toggleMusic();
  elements.canvas.focus();
});

window.addEventListener("resize", () => drawMaze(performance.now()));
document.addEventListener("visibilitychange", () => {
  music.setPageVisible(!document.hidden);
});

window.__quantumFoam = {
  get game() {
    return game;
  },
  move,
  newRun: startNewRun,
  directions: DIRECTIONS,
  music,
};

syncInterface();
syncMusicButton();
requestAnimationFrame(animationFrame);
if (typeof elements.briefing.showModal === "function") {
  elements.briefing.showModal();
} else {
  elements.briefing.setAttribute("open", "");
}
