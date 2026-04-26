const MOVE_OPTIONS = [
  "forward",
  "left",
  "right",
  "back",
  "stay",
  "N",
  "S",
  "E",
  "W",
];

const DIRS = ["N", "E", "S", "W"];
const DIR_TO_VEC = {
  N: { dx: 0, dy: -1 },
  E: { dx: 1, dy: 0 },
  S: { dx: 0, dy: 1 },
  W: { dx: -1, dy: 0 },
};

const TOOL_LIST = [
  { key: "bit1", label: "Case = 1" },
  { key: "bit0", label: "Case = 0" },
  { key: "input", label: "INPUT" },
  { key: "output", label: "OUTPUT" },
  { key: "halt", label: "HALT" },
  { key: "erase", label: "Effacer" },
];

const COLORS = {
  bit0: "#11152a",
  bit1: "#89a7ff",
  gridLine: "#2a3157",
  ant: "#ffffff",
  antOutline: "#0b0f20",
  input: "#3fd6ff",
  output: "#ffd166",
  halt: "#ff5d8f",
};

const ui = {
  canvas: document.getElementById("worldCanvas"),
  ctx: document.getElementById("worldCanvas").getContext("2d"),
  toolButtons: document.getElementById("toolButtons"),
  currentToolLabel: document.getElementById("currentToolLabel"),
  inputValue: document.getElementById("inputValue"),
  runBtn: document.getElementById("runBtn"),
  pauseBtn: document.getElementById("pauseBtn"),
  stepBtn: document.getElementById("stepBtn"),
  resetBtn: document.getElementById("resetBtn"),
  clearBtn: document.getElementById("clearBtn"),
  demoBtn: document.getElementById("demoBtn"),
  speedInput: document.getElementById("speedInput"),
  gridSizeInput: document.getElementById("gridSizeInput"),
  resizeBtn: document.getElementById("resizeBtn"),
  tickLabel: document.getElementById("tickLabel"),
  runStateLabel: document.getElementById("runStateLabel"),
  haltLabel: document.getElementById("haltLabel"),
  outputSummary: document.getElementById("outputSummary"),
  stateCountInput: document.getElementById("stateCountInput"),
  applyStateCountBtn: document.getElementById("applyStateCountBtn"),
  transitionBody: document.getElementById("transitionBody"),
  statusLabel: document.getElementById("statusLabel"),
  antCountLabel: document.getElementById("antCountLabel"),
  outputCountLabel: document.getElementById("outputCountLabel"),
  exportBtn: document.getElementById("exportBtn"),
  importBtn: document.getElementById("importBtn"),
  jsonArea: document.getElementById("jsonArea"),
  runtimeDump: document.getElementById("runtimeDump"),
  currentBehaviorSelect: document.getElementById("currentBehaviorSelect"),
  addBehaviorBtn: document.getElementById("addBehaviorBtn"),
  removeBehaviorBtn: document.getElementById("removeBehaviorBtn"),
  behaviorNameInput: document.getElementById("behaviorNameInput"),
  renameBehaviorBtn: document.getElementById("renameBehaviorBtn"),
  currentBehaviorLabel: document.getElementById("currentBehaviorLabel"),
  addAntBtn: document.getElementById("addAntBtn"),
  removeAntBtn: document.getElementById("removeAntBtn"),
  duplicateAntBtn: document.getElementById("duplicateAntBtn"),
  antEditor: document.getElementById("antEditor"),
  antXInput: document.getElementById("antXInput"),
  antYInput: document.getElementById("antYInput"),
  antDirInput: document.getElementById("antDirInput"),
  antStateInput: document.getElementById("antStateInput"),
  antBehaviorInput: document.getElementById("antBehaviorInput"),
  saveAntBtn: document.getElementById("saveAntBtn"),
  cancelAntBtn: document.getElementById("cancelAntBtn"),
  antList: document.getElementById("antList"),
};

function create2DArray(width, height, value = 0) {
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, () => value),
  );
}

function clampStateCount(n) {
  return Math.max(1, Math.min(16, Number.isFinite(n) ? Math.floor(n) : 1));
}

function defaultTransition(state, bit) {
  if (state === 0 && bit === 0) {
    return { move: "forward", writeBit: 1, nextState: 0 };
  }
  if (state === 0 && bit === 1) {
    return { move: "right", writeBit: 0, nextState: 1 };
  }
  if (state === 1 && bit === 0) {
    return { move: "left", writeBit: 1, nextState: 0 };
  }
  return { move: "forward", writeBit: 1, nextState: 1 };
}

function createTransitionTable(stateCount) {
  const table = {};
  for (let state = 0; state < stateCount; state += 1) {
    table[state] = {
      0: defaultTransition(state, 0),
      1: defaultTransition(state, 1),
    };
  }
  return table;
}

function createBehavior(id, name = null, stateCount = 2) {
  return {
    id,
    name: name || `Behavior ${id}`,
    transitions: createTransitionTable(stateCount),
  };
}

function cloneProgram(program) {
  return JSON.parse(JSON.stringify(program));
}

function createEmptyProgram(size = 24, stateCount = 2) {
  return {
    width: size,
    height: size,
    grid: create2DArray(size, size, 0),
    markers: {
      inputs: [],
      outputs: [],
      halt: { x: Math.min(size - 1, size - 3), y: Math.min(size - 1, size - 3) },
    },
    ants: [],
    behaviors: [createBehavior(0, "Default", stateCount)],
    nextBehaviorId: 1,
  };
}

const editor = {
  tool: "bit1",
  program: createEmptyProgram(),
  sim: null,
  animationFrame: 0,
  lastFrameTime: 0,
  cellSize: 24,
  currentBehaviorId: 0,
  selectedAntIndex: -1,
};

function buildToolButtons() {
  ui.toolButtons.innerHTML = "";
  for (const tool of TOOL_LIST) {
    const btn = document.createElement("button");
    btn.textContent = tool.label;
    btn.dataset.tool = tool.key;
    if (tool.key === editor.tool) {
      btn.classList.add("active");
    }
    btn.addEventListener("click", () => setTool(tool.key));
    ui.toolButtons.appendChild(btn);
  }
}

function setTool(tool) {
  editor.tool = tool;
  ui.currentToolLabel.textContent = tool;
  for (const btn of ui.toolButtons.querySelectorAll("button")) {
    btn.classList.toggle("active", btn.dataset.tool === tool);
  }
}

function normalizePosition(program, x, y) {
  if (x < 0 || y < 0 || x >= program.width || y >= program.height) {
    return null;
  }
  return { x, y };
}

function wrapPosition(program, x, y) {
  const wrappedX = ((x % program.width) + program.width) % program.width;
  const wrappedY = ((y % program.height) + program.height) % program.height;
  return { x: wrappedX, y: wrappedY };
}

function removeMarkersAt(program, x, y) {
  program.markers.inputs = program.markers.inputs.filter(
    (m) => !(m.x === x && m.y === y),
  );
  program.markers.outputs = program.markers.outputs.filter(
    (m) => !(m.x === x && m.y === y),
  );
  if (program.markers.halt && program.markers.halt.x === x && program.markers.halt.y === y) {
    program.markers.halt = null;
  }
}

function removeAntsAt(program, x, y) {
  program.ants = program.ants.filter((ant) => !(ant.x === x && ant.y === y));
}

function applyToolAt(x, y) {
  const program = editor.program;
  const pos = normalizePosition(program, x, y);
  if (!pos) {
    return;
  }

  if (editor.tool === "erase") {
    program.grid[y][x] = 0;
    removeMarkersAt(program, x, y);
    removeAntsAt(program, x, y);
    resetSimulation();
    renderAll();
    return;
  }

  if (editor.tool === "bit1") {
    program.grid[y][x] = 1;
  } else if (editor.tool === "bit0") {
    program.grid[y][x] = 0;
  } else if (editor.tool === "input") {
    removeMarkersAt(program, x, y);
    program.markers.inputs.push({ x, y, value: Number(ui.inputValue.value) });
    program.grid[y][x] = Number(ui.inputValue.value);
  } else if (editor.tool === "output") {
    removeMarkersAt(program, x, y);
    program.markers.outputs.push({ x, y });
  } else if (editor.tool === "halt") {
    program.markers.halt = { x, y };
  }

  resetSimulation();
  renderAll();
}

function canvasToCell(event) {
  const rect = ui.canvas.getBoundingClientRect();
  const scaleX = ui.canvas.width / rect.width;
  const scaleY = ui.canvas.height / rect.height;
  const px = (event.clientX - rect.left) * scaleX;
  const py = (event.clientY - rect.top) * scaleY;
  const x = Math.floor(px / editor.cellSize);
  const y = Math.floor(py / editor.cellSize);
  return { x, y };
}

function rotateDir(dir, move) {
  const idx = DIRS.indexOf(dir);
  if (idx < 0) {
    return dir;
  }
  if (move === "forward") {
    return dir;
  }
  if (move === "left") {
    return DIRS[(idx + 3) % 4];
  }
  if (move === "right") {
    return DIRS[(idx + 1) % 4];
  }
  if (move === "back") {
    return DIRS[(idx + 2) % 4];
  }
  return dir;
}

function computeMove(ant, move) {
  let newDir = ant.dir;
  let delta = { dx: 0, dy: 0 };

  if (["forward", "left", "right", "back"].includes(move)) {
    newDir = rotateDir(ant.dir, move);
    delta = DIR_TO_VEC[newDir];
  } else if (move === "stay") {
    delta = { dx: 0, dy: 0 };
  } else {
    newDir = move;
    delta = DIR_TO_VEC[move];
  }

  return { newDir, dx: delta.dx, dy: delta.dy };
}

function transitionFor(program, ant, bit) {
  const behavior = program.behaviors.find(b => b.id === ant.behaviorId);
  if (!behavior) {
    // Fallback to first behavior if ant's behavior doesn't exist
    const fallbackBehavior = program.behaviors[0];
    if (!fallbackBehavior) return defaultTransition(ant.state, bit);
    behavior = fallbackBehavior;
  }

  const safeState = Object.prototype.hasOwnProperty.call(behavior.transitions, ant.state)
    ? ant.state
    : 0;
  return behavior.transitions[safeState][bit] || behavior.transitions[safeState][0];
}

function applyInputsToGrid(program) {
  for (const input of program.markers.inputs) {
    if (input.x >= 0 && input.y >= 0 && input.x < program.width && input.y < program.height) {
      program.grid[input.y][input.x] = input.value ? 1 : 0;
    }
  }
}

function createSimulationFromProgram(program) {
  const snapshot = cloneProgram(program);
  applyInputsToGrid(snapshot);

  return {
    program: snapshot,
    tick: 0,
    running: false,
    halted: Boolean(
      snapshot.markers.halt &&
      snapshot.grid[snapshot.markers.halt.y]?.[snapshot.markers.halt.x] === 1,
    ),
    reason: snapshot.markers.halt ? "" : "Pas de HALT défini",
  };
}

function resetSimulation() {
  editor.sim = createSimulationFromProgram(editor.program);
  if (editor.sim.reason) {
    editor.sim.running = false;
  }
  updateUI();
}

function stopSimulation(reason = "stopped") {
  if (!editor.sim) {
    return;
  }
  editor.sim.running = false;
  editor.sim.reason = reason;
  updateUI();
}

function tickSimulation() {
  const sim = editor.sim;
  if (!sim || sim.halted) {
    return;
  }

  const { program } = sim;
  if (!program.markers.halt) {
    stopSimulation("Pas de HALT");
    return;
  }

  for (let i = 0; i < program.ants.length; i += 1) {
    const ant = program.ants[i];
    const currentX = ant.x;
    const currentY = ant.y;
    const bit = program.grid[currentY][currentX];
    const rule = transitionFor(program, ant, bit);
    const step = computeMove(ant, rule.move);
    const next = wrapPosition(program, currentX + step.dx, currentY + step.dy);

    ant.x = next.x;
    ant.y = next.y;
    ant.dir = step.newDir;
    program.grid[currentY][currentX] = rule.writeBit ? 1 : 0;
    ant.state = Math.max(0, Math.floor(Number(rule.nextState) || 0));

    if (program.grid[program.markers.halt.y][program.markers.halt.x] === 1) {
      sim.halted = true;
      sim.running = false;
      sim.reason = `HALT activé au tick ${sim.tick + 1} après la fourmi ${i}`;
      break;
    }
  }

  sim.tick += 1;
  updateUI();
  renderAll();
}

function loop(ts) {
  if (!editor.sim) {
    resetSimulation();
  }

  const speed = Math.max(1, Math.min(120, Number(ui.speedInput.value) || 10));
  const interval = 1000 / speed;

  if (editor.sim.running && !editor.sim.halted) {
    if (ts - editor.lastFrameTime >= interval) {
      editor.lastFrameTime = ts;
      tickSimulation();
    }
  }

  editor.animationFrame = requestAnimationFrame(loop);
}

function drawGrid(program) {
  const ctx = ui.ctx;
  const cell = editor.cellSize;

  ctx.clearRect(0, 0, ui.canvas.width, ui.canvas.height);

  for (let y = 0; y < program.height; y += 1) {
    for (let x = 0; x < program.width; x += 1) {
      ctx.fillStyle = program.grid[y][x] ? COLORS.bit1 : COLORS.bit0;
      ctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }

  ctx.strokeStyle = COLORS.gridLine;
  ctx.lineWidth = 1;

  for (let x = 0; x <= program.width; x += 1) {
    ctx.beginPath();
    ctx.moveTo(x * cell + 0.5, 0);
    ctx.lineTo(x * cell + 0.5, program.height * cell);
    ctx.stroke();
  }

  for (let y = 0; y <= program.height; y += 1) {
    ctx.beginPath();
    ctx.moveTo(0, y * cell + 0.5);
    ctx.lineTo(program.width * cell, y * cell + 0.5);
    ctx.stroke();
  }
}

function drawMarkers(program) {
  const ctx = ui.ctx;
  const cell = editor.cellSize;

  for (const marker of program.markers.inputs) {
    drawCornerMarker(marker.x, marker.y, COLORS.input, `I${marker.value}`);
  }

  for (const marker of program.markers.outputs) {
    drawCornerMarker(marker.x, marker.y, COLORS.output, "O");
  }

  if (program.markers.halt) {
    drawCornerMarker(program.markers.halt.x, program.markers.halt.y, COLORS.halt, "H");
  }

  function drawCornerMarker(x, y, color, label) {
    const px = x * cell;
    const py = y * cell;
    ctx.fillStyle = color;
    ctx.fillRect(px + 3, py + 3, Math.max(10, cell * 0.42), Math.max(10, cell * 0.42));
    ctx.fillStyle = "#0b0f20";
    ctx.font = `${Math.max(9, cell * 0.24)}px Inter, sans-serif`;
    ctx.textBaseline = "top";
    ctx.fillText(label, px + 5, py + 4);
  }
}

function drawAnts(program) {
  const ctx = ui.ctx;
  const cell = editor.cellSize;

  // Define colors for different behaviors
  const behaviorColors = [
    "#ffffff", // Default white
    "#ff6b6b", // Red
    "#4ecdc4", // Teal
    "#45b7d1", // Blue
    "#f9ca24", // Yellow
    "#f0932b", // Orange
    "#eb4d4b", // Dark red
    "#6c5ce7", // Purple
  ];

  program.ants.forEach((ant, index) => {
    const cx = ant.x * cell + cell / 2;
    const cy = ant.y * cell + cell / 2;
    const r = Math.max(6, cell * 0.22);

    const colorIndex = ant.behaviorId % behaviorColors.length;
    const antColor = behaviorColors[colorIndex];

    ctx.fillStyle = antColor;
    ctx.strokeStyle = COLORS.antOutline;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    const tipVec = DIR_TO_VEC[ant.dir];
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + tipVec.dx * r * 1.6, cy + tipVec.dy * r * 1.6);
    ctx.strokeStyle = COLORS.antOutline;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = COLORS.antOutline;
    ctx.font = `${Math.max(10, cell * 0.26)}px Inter, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(index), cx, cy);
  });

  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

function renderAll() {
  const sim = editor.sim ?? createSimulationFromProgram(editor.program);
  const program = sim.program;
  editor.cellSize = Math.floor(
    Math.min(ui.canvas.width / program.width, ui.canvas.height / program.height),
  );
  drawGrid(program);
  drawMarkers(program);
  drawAnts(program);
  updateUI();
}

function computeOutputSummary(sim) {
  return sim.program.markers.outputs.map((output, index) => ({
    index,
    x: output.x,
    y: output.y,
    value: sim.program.grid[output.y]?.[output.x] ?? 0,
  }));
}

function updateTransitionTable() {
  const currentBehavior = editor.program.behaviors.find(b => b.id === editor.currentBehaviorId);
  if (!currentBehavior) return;

  const stateCount = clampStateCount(Object.keys(currentBehavior.transitions).length);
  ui.transitionBody.innerHTML = "";

  for (let state = 0; state < stateCount; state += 1) {
    if (!currentBehavior.transitions[state]) {
      currentBehavior.transitions[state] = {
        0: defaultTransition(state, 0),
        1: defaultTransition(state, 1),
      };
    }

    for (const bit of [0, 1]) {
      const tr = currentBehavior.transitions[state][bit] || defaultTransition(state, bit);
      const row = document.createElement("tr");

      row.innerHTML = `
        <td class="mono">${state}</td>
        <td class="mono">${bit}</td>
        <td></td>
        <td></td>
        <td></td>
      `;

      const moveSelect = document.createElement("select");
      for (const move of MOVE_OPTIONS) {
        const opt = document.createElement("option");
        opt.value = move;
        opt.textContent = move;
        if (move === tr.move) {
          opt.selected = true;
        }
        moveSelect.appendChild(opt);
      }
      moveSelect.addEventListener("change", () => {
        currentBehavior.transitions[state][bit].move = moveSelect.value;
        resetSimulation();
        renderAll();
      });

      const writeSelect = document.createElement("select");
      [0, 1].forEach((writeBit) => {
        const opt = document.createElement("option");
        opt.value = String(writeBit);
        opt.textContent = String(writeBit);
        if (writeBit === tr.writeBit) {
          opt.selected = true;
        }
        writeSelect.appendChild(opt);
      });
      writeSelect.addEventListener("change", () => {
        currentBehavior.transitions[state][bit].writeBit = Number(writeSelect.value);
        resetSimulation();
        renderAll();
      });

      const nextStateInput = document.createElement("input");
      nextStateInput.type = "number";
      nextStateInput.min = "0";
      nextStateInput.step = "1";
      nextStateInput.value = String(tr.nextState);
      nextStateInput.addEventListener("change", () => {
        currentBehavior.transitions[state][bit].nextState = Math.max(
          0,
          Math.floor(Number(nextStateInput.value) || 0),
        );
        nextStateInput.value = String(currentBehavior.transitions[state][bit].nextState);
        resetSimulation();
        renderAll();
      });

      row.children[2].appendChild(moveSelect);
      row.children[3].appendChild(writeSelect);
      row.children[4].appendChild(nextStateInput);
      ui.transitionBody.appendChild(row);
    }
  }
}

function trimTransitionsToStateCount(behaviorId, stateCount) {
  const behavior = editor.program.behaviors.find(b => b.id === behaviorId);
  if (!behavior) return;

  const newTransitions = {};
  for (let state = 0; state < stateCount; state += 1) {
    const existing = behavior.transitions[state];
    newTransitions[state] = {
      0: existing?.[0] || defaultTransition(state, 0),
      1: existing?.[1] || defaultTransition(state, 1),
    };
  }
  behavior.transitions = newTransitions;
}

function updateUI() {
  const sim = editor.sim;

  ui.antCountLabel.textContent = String(
    sim?.program.ants.length ?? editor.program.ants.length,
  );
  ui.outputCountLabel.textContent = String(
    sim?.program.markers.outputs.length ?? editor.program.markers.outputs.length,
  );
  ui.tickLabel.textContent = String(sim?.tick ?? 0);
  ui.runStateLabel.textContent = sim?.halted
    ? "halted"
    : sim?.running
      ? "running"
      : "stopped";

  ui.haltLabel.textContent = sim?.program.markers.halt
    ? String(sim.program.grid[sim.program.markers.halt.y][sim.program.markers.halt.x])
    : "—";

  const outputs = sim ? computeOutputSummary(sim) : [];
  ui.outputSummary.textContent = outputs.length
    ? outputs.map((o) => `OUT${o.index}@(${o.x},${o.y})=${o.value}`).join("  ·  ")
    : "Aucun OUTPUT";

  if (!sim?.program.markers.halt) {
    ui.statusLabel.textContent = "Pas de HALT défini";
    ui.statusLabel.className = "status danger";
  } else if (sim?.halted) {
    ui.statusLabel.textContent = sim.reason || "HALT activé";
    ui.statusLabel.className = "status ok";
  } else {
    ui.statusLabel.textContent = sim?.reason || "Prêt";
    ui.statusLabel.className = "status muted";
  }

  ui.runtimeDump.textContent = JSON.stringify(
    {
      tick: sim?.tick ?? 0,
      halted: sim?.halted ?? false,
      reason: sim?.reason ?? "",
      halt: sim?.program.markers.halt ?? null,
      outputs,
      ants: sim?.program.ants ?? [],
    },
    null,
    2,
  );
}

function exportProgram() {
  ui.jsonArea.value = JSON.stringify(editor.program, null, 2);
}

function importProgram() {
  try {
    const imported = JSON.parse(ui.jsonArea.value);
    validateProgramShape(imported);

    // Handle backward compatibility: convert old transitions to behaviors
    if (imported.transitions && !imported.behaviors) {
      imported.behaviors = [createBehavior(0, "Default")];
      imported.behaviors[0].transitions = imported.transitions;
      imported.nextBehaviorId = 1;
      delete imported.transitions;
    }

    editor.program = imported;
    ui.gridSizeInput.value = String(imported.width);
    ui.stateCountInput.value = String(Object.keys(imported.behaviors[0]?.transitions || {}).length || 2);
    resetSimulation();
    updateBehaviorUI();
    updateTransitionTable();
    selectAnt(-1);
    updateAntList();
    renderAll();
  } catch (error) {
    alert(`Import impossible: ${error.message}`);
  }
}

function validateProgramShape(program) {
  if (!Number.isInteger(program.width) || !Number.isInteger(program.height)) {
    throw new Error("width/height invalides");
  }
  if (!Array.isArray(program.grid) || program.grid.length !== program.height) {
    throw new Error("grid invalide");
  }
  if (
    !program.grid.every(
      (row) =>
        Array.isArray(row) &&
        row.length === program.width &&
        row.every((bit) => bit === 0 || bit === 1),
    )
  ) {
    throw new Error("la grille doit être binaire");
  }
  if (
    !program.markers ||
    !Array.isArray(program.markers.inputs) ||
    !Array.isArray(program.markers.outputs)
  ) {
    throw new Error("markers invalides");
  }
  if (!Array.isArray(program.ants)) {
    throw new Error("ants invalide");
  }
  // Allow both old transitions and new behaviors
  if (!program.transitions && !program.behaviors) {
    throw new Error("transitions ou behaviors manquant");
  }
  if (program.behaviors && !Array.isArray(program.behaviors)) {
    throw new Error("behaviors invalide");
  }
}

function resizeProgram(newSize) {
  const size = Math.max(8, Math.min(64, Math.floor(Number(newSize) || 24)));
  const next = createEmptyProgram(size, Object.keys(editor.program.behaviors[0]?.transitions || {}).length || 2);

  for (let y = 0; y < Math.min(size, editor.program.height); y += 1) {
    for (let x = 0; x < Math.min(size, editor.program.width); x += 1) {
      next.grid[y][x] = editor.program.grid[y][x];
    }
  }

  next.markers.inputs = editor.program.markers.inputs.filter(
    (m) => m.x < size && m.y < size,
  );
  next.markers.outputs = editor.program.markers.outputs.filter(
    (m) => m.x < size && m.y < size,
  );
  next.markers.halt =
    editor.program.markers.halt &&
    editor.program.markers.halt.x < size &&
    editor.program.markers.halt.y < size
      ? editor.program.markers.halt
      : { x: size - 2, y: size - 2 };

  next.ants = editor.program.ants.filter((ant) => ant.x < size && ant.y < size);
  next.behaviors = editor.program.behaviors.map(behavior => ({
    ...behavior,
    transitions: cloneProgram({ transitions: behavior.transitions }).transitions
  }));
  next.nextBehaviorId = editor.program.nextBehaviorId;

  editor.program = next;
  resetSimulation();
  updateBehaviorUI();
  updateTransitionTable();
  updateAntList();
  renderAll();
}

function clearProgram() {
  const stateCount = Object.keys(editor.program.behaviors[0]?.transitions || {}).length || 2;
  editor.program = createEmptyProgram(editor.program.width, stateCount);
  ui.gridSizeInput.value = String(editor.program.width);
  resetSimulation();
  updateBehaviorUI();
  updateTransitionTable();
  updateAntList();
  renderAll();
}

function loadDemo() {
  const program = createEmptyProgram(24, 2);

  program.markers.inputs = [{ x: 2, y: 12, value: 1 }];
  applyInputsToGrid(program);

  program.markers.outputs = [{ x: 18, y: 12 }];
  program.markers.halt = { x: 20, y: 12 };

  program.ants = [{ x: 2, y: 12, dir: "E", state: 0, behaviorId: 0 }];

  program.behaviors[0].transitions = {
    0: {
      0: { move: "forward", writeBit: 1, nextState: 0 },
      1: { move: "forward", writeBit: 1, nextState: 0 },
    },
    1: {
      0: { move: "forward", writeBit: 1, nextState: 1 },
      1: { move: "forward", writeBit: 1, nextState: 1 },
    },
  };

  editor.program = program;
  ui.gridSizeInput.value = "24";
  ui.stateCountInput.value = "2";
  resetSimulation();
  updateBehaviorUI();
  updateTransitionTable();
  renderAll();
  ui.jsonArea.value = "";
}

function updateBehaviorUI() {
  // Update behavior selector
  ui.currentBehaviorSelect.innerHTML = "";
  editor.program.behaviors.forEach(behavior => {
    const option = document.createElement("option");
    option.value = behavior.id;
    option.textContent = behavior.name;
    if (behavior.id === editor.currentBehaviorId) {
      option.selected = true;
    }
    ui.currentBehaviorSelect.appendChild(option);
  });

  // Update ant behavior selector
  ui.antBehaviorInput.innerHTML = "";
  editor.program.behaviors.forEach(behavior => {
    const option = document.createElement("option");
    option.value = behavior.id;
    option.textContent = behavior.name;
    ui.antBehaviorInput.appendChild(option);
  });

  // Update current behavior label
  const currentBehavior = editor.program.behaviors.find(b => b.id === editor.currentBehaviorId);
  ui.currentBehaviorLabel.textContent = currentBehavior ? `(${currentBehavior.name})` : "(Unknown)";

  // Update behavior name input
  ui.behaviorNameInput.value = currentBehavior ? currentBehavior.name : "";
}

function updateAntList() {
  ui.antList.innerHTML = "";
  editor.program.ants.forEach((ant, index) => {
    const antDiv = document.createElement("div");
    antDiv.className = `ant-item ${index === editor.selectedAntIndex ? 'selected' : ''}`;
    antDiv.style.cursor = "pointer";

    const behavior = editor.program.behaviors.find(b => b.id === ant.behaviorId);
    const behaviorName = behavior ? behavior.name : "Unknown";

    antDiv.innerHTML = `
      <div class="ant-info">
        <strong>Fourmi ${index}</strong><br>
        Position: (${ant.x}, ${ant.y}) | Dir: ${ant.dir} | État: ${ant.state} | Comportement: ${behaviorName}
      </div>
    `;

    antDiv.addEventListener("click", () => {
      selectAnt(index);
    });

    ui.antList.appendChild(antDiv);
  });

  // Update remove and duplicate button states
  ui.removeAntBtn.disabled = editor.selectedAntIndex === -1;
  ui.duplicateAntBtn.disabled = editor.selectedAntIndex === -1;
}

function selectAnt(index) {
  editor.selectedAntIndex = index;
  updateAntList();

  if (index >= 0) {
    const ant = editor.program.ants[index];
    ui.antXInput.value = ant.x;
    ui.antYInput.value = ant.y;
    ui.antXInput.max = editor.program.width - 1;
    ui.antYInput.max = editor.program.height - 1;
    ui.antDirInput.value = ant.dir;
    ui.antStateInput.value = ant.state;
    ui.antBehaviorInput.value = ant.behaviorId;
    ui.antEditor.style.display = "block";
  } else {
    ui.antEditor.style.display = "none";
  }
}

function saveAnt() {
  if (editor.selectedAntIndex === -1) return;

  const ant = editor.program.ants[editor.selectedAntIndex];
  const newX = Math.max(0, Math.min(editor.program.width - 1, Math.floor(Number(ui.antXInput.value) || 0)));
  const newY = Math.max(0, Math.min(editor.program.height - 1, Math.floor(Number(ui.antYInput.value) || 0)));

  // Check if position conflicts with another ant
  const conflictIndex = editor.program.ants.findIndex((a, i) => i !== editor.selectedAntIndex && a.x === newX && a.y === newY);
  if (conflictIndex !== -1) {
    alert(`Position occupée par la fourmi ${conflictIndex}`);
    return;
  }

  ant.x = newX;
  ant.y = newY;
  ant.dir = ui.antDirInput.value;
  ant.state = Math.max(0, Math.floor(Number(ui.antStateInput.value) || 0));
  ant.behaviorId = Number(ui.antBehaviorInput.value);

  resetSimulation();
  updateAntList();
  renderAll();
}

function addAnt() {
  // Find a free position
  let x = 0, y = 0;
  let attempts = 0;
  while (attempts < editor.program.width * editor.program.height) {
    const conflict = editor.program.ants.some(ant => ant.x === x && ant.y === y);
    if (!conflict) break;

    x++;
    if (x >= editor.program.width) {
      x = 0;
      y++;
      if (y >= editor.program.height) {
        y = 0;
      }
    }
    attempts++;
  }

  if (attempts >= editor.program.width * editor.program.height) {
    alert("Aucune position libre pour une nouvelle fourmi");
    return;
  }

  editor.program.ants.push({
    x,
    y,
    dir: "E",
    state: 0,
    behaviorId: editor.currentBehaviorId,
  });

  selectAnt(editor.program.ants.length - 1);
  resetSimulation();
  updateAntList();
  renderAll();
}

function removeAnt() {
  if (editor.selectedAntIndex === -1) return;

  editor.program.ants.splice(editor.selectedAntIndex, 1);
  editor.selectedAntIndex = -1;
  ui.antEditor.style.display = "none";
  resetSimulation();
  updateAntList();
  renderAll();
}

function duplicateAnt() {
  if (editor.selectedAntIndex === -1) return;

  const originalAnt = editor.program.ants[editor.selectedAntIndex];
  const newAnt = {
    x: Math.min(editor.program.width - 1, originalAnt.x + 1),
    y: originalAnt.y,
    dir: originalAnt.dir,
    state: originalAnt.state,
    behaviorId: originalAnt.behaviorId,
  };

  // Check if position is free
  const conflict = editor.program.ants.some(ant => ant.x === newAnt.x && ant.y === newAnt.y);
  if (conflict) {
    alert("Position adjacente occupée");
    return;
  }

  editor.program.ants.push(newAnt);
  selectAnt(editor.program.ants.length - 1);
  resetSimulation();
  updateAntList();
  renderAll();
}

function bindEvents() {
  ui.canvas.addEventListener("click", (event) => {
    const { x, y } = canvasToCell(event);
    applyToolAt(x, y);
  });

  ui.runBtn.addEventListener("click", () => {
    if (!editor.sim) {
      resetSimulation();
    }
    if (!editor.sim.program.markers.halt) {
      stopSimulation("Pas de HALT");
      renderAll();
      return;
    }
    if (editor.sim.halted) {
      resetSimulation();
    }
    editor.sim.running = true;
    editor.sim.reason = "";
    updateUI();
  });

  ui.pauseBtn.addEventListener("click", () => stopSimulation("Pause"));

  ui.stepBtn.addEventListener("click", () => {
    if (!editor.sim) {
      resetSimulation();
    }
    if (!editor.sim.halted) {
      tickSimulation();
    }
  });

  ui.resetBtn.addEventListener("click", () => {
    resetSimulation();
    renderAll();
  });

  ui.clearBtn.addEventListener("click", clearProgram);
  ui.demoBtn.addEventListener("click", loadDemo);

  ui.resizeBtn.addEventListener("click", () => resizeProgram(ui.gridSizeInput.value));

  ui.applyStateCountBtn.addEventListener("click", () => {
    const stateCount = clampStateCount(Number(ui.stateCountInput.value) || 1);
    ui.stateCountInput.value = String(stateCount);
    trimTransitionsToStateCount(editor.currentBehaviorId, stateCount);

    // Update all ants' states if they exceed the new state count
    editor.program.ants.forEach((ant) => {
      if (ant.state >= stateCount) {
        ant.state = stateCount - 1;
      }
    });

    resetSimulation();
    updateTransitionTable();
    renderAll();
  });

  ui.exportBtn.addEventListener("click", exportProgram);
  ui.currentBehaviorSelect.addEventListener("change", () => {
    editor.currentBehaviorId = Number(ui.currentBehaviorSelect.value);
    updateBehaviorUI();
    updateTransitionTable();
  });

  ui.addBehaviorBtn.addEventListener("click", () => {
    const newId = editor.program.nextBehaviorId++;
    const newBehavior = createBehavior(newId, `Behavior ${newId}`);
    editor.program.behaviors.push(newBehavior);
    editor.currentBehaviorId = newId;
    updateBehaviorUI();
    updateTransitionTable();
    renderAll();
  });

  ui.removeBehaviorBtn.addEventListener("click", () => {
    if (editor.program.behaviors.length <= 1) {
      alert("Cannot remove the last behavior");
      return;
    }

    const behaviorToRemove = editor.currentBehaviorId;
    editor.program.behaviors = editor.program.behaviors.filter(b => b.id !== behaviorToRemove);

    // Reassign ants using the removed behavior to the first remaining behavior
    editor.program.ants.forEach(ant => {
      if (ant.behaviorId === behaviorToRemove) {
        ant.behaviorId = editor.program.behaviors[0].id;
      }
    });

    editor.currentBehaviorId = editor.program.behaviors[0].id;
    updateBehaviorUI();
    updateTransitionTable();
    updateAntList();
    renderAll();
  });

  ui.renameBehaviorBtn.addEventListener("click", () => {
    const currentBehavior = editor.program.behaviors.find(b => b.id === editor.currentBehaviorId);
    if (currentBehavior) {
      currentBehavior.name = ui.behaviorNameInput.value || `Behavior ${currentBehavior.id}`;
      updateBehaviorUI();
    }
  });

  ui.behaviorNameInput.addEventListener("change", () => {
    const currentBehavior = editor.program.behaviors.find(b => b.id === editor.currentBehaviorId);
    if (currentBehavior) {
      currentBehavior.name = ui.behaviorNameInput.value || `Behavior ${currentBehavior.id}`;
      updateBehaviorUI();
    }
  });

  // Add listeners for ant property changes
  ui.addAntBtn.addEventListener("click", addAnt);
  ui.removeAntBtn.addEventListener("click", removeAnt);
  ui.duplicateAntBtn.addEventListener("click", duplicateAnt);
  ui.saveAntBtn.addEventListener("click", saveAnt);
  ui.cancelAntBtn.addEventListener("click", () => selectAnt(-1));

  // Add keyboard shortcut for run button (Space key)
  document.addEventListener('keydown', (event) => {
    if (event.code === 'Space' && event.target.tagName !== 'INPUT' && event.target.tagName !== 'TEXTAREA' && event.target.tagName !== 'SELECT') {
      event.preventDefault();
      ui.runBtn.click();
    }
  });
}


function init() {
  buildToolButtons();
  bindEvents();
  setTool(editor.tool);
  resetSimulation();
  updateBehaviorUI();
  updateTransitionTable();
  selectAnt(-1); // Hide ant editor initially
  updateAntList();
  renderAll();
  editor.animationFrame = requestAnimationFrame(loop);
}

init();