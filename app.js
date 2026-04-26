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
  { key: "ant", label: "Fourmi" },
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
  antDir: document.getElementById("antDir"),
  antState: document.getElementById("antState"),
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
    transitions: createTransitionTable(stateCount),
  };
}

const editor = {
  tool: "bit1",
  program: createEmptyProgram(),
  sim: null,
  animationFrame: 0,
  lastFrameTime: 0,
  cellSize: 24,
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
  } else if (editor.tool === "ant") {
    removeAntsAt(program, x, y);
    program.ants.push({
      x,
      y,
      dir: ui.antDir.value,
      state: Math.max(0, Math.floor(Number(ui.antState.value) || 0)),
    });
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

function transitionFor(program, state, bit) {
  const safeState = Object.prototype.hasOwnProperty.call(program.transitions, state)
    ? state
    : 0;
  return program.transitions[safeState][bit] || program.transitions[safeState][0];
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
    const rule = transitionFor(program, ant.state, bit);
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

  program.ants.forEach((ant, index) => {
    const cx = ant.x * cell + cell / 2;
    const cy = ant.y * cell + cell / 2;
    const r = Math.max(6, cell * 0.22);

    ctx.fillStyle = COLORS.ant;
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
  const stateCount = clampStateCount(Number(ui.stateCountInput.value) || 1);
  ui.transitionBody.innerHTML = "";

  for (let state = 0; state < stateCount; state += 1) {
    if (!editor.program.transitions[state]) {
      editor.program.transitions[state] = {
        0: defaultTransition(state, 0),
        1: defaultTransition(state, 1),
      };
    }

    for (const bit of [0, 1]) {
      const tr = editor.program.transitions[state][bit] || defaultTransition(state, bit);
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
        editor.program.transitions[state][bit].move = moveSelect.value;
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
        editor.program.transitions[state][bit].writeBit = Number(writeSelect.value);
        resetSimulation();
        renderAll();
      });

      const nextStateInput = document.createElement("input");
      nextStateInput.type = "number";
      nextStateInput.min = "0";
      nextStateInput.step = "1";
      nextStateInput.value = String(tr.nextState);
      nextStateInput.addEventListener("change", () => {
        editor.program.transitions[state][bit].nextState = Math.max(
          0,
          Math.floor(Number(nextStateInput.value) || 0),
        );
        nextStateInput.value = String(editor.program.transitions[state][bit].nextState);
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

function trimTransitionsToStateCount(stateCount) {
  const newTransitions = {};
  for (let state = 0; state < stateCount; state += 1) {
    const existing = editor.program.transitions[state];
    newTransitions[state] = {
      0: existing?.[0] || defaultTransition(state, 0),
      1: existing?.[1] || defaultTransition(state, 1),
    };
  }
  editor.program.transitions = newTransitions;
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
    editor.program = imported;
    ui.gridSizeInput.value = String(imported.width);
    ui.stateCountInput.value = String(Object.keys(imported.transitions).length);
    resetSimulation();
    updateTransitionTable();
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
  if (!program.transitions || typeof program.transitions !== "object") {
    throw new Error("transitions invalides");
  }
}

function resizeProgram(newSize) {
  const size = Math.max(8, Math.min(64, Math.floor(Number(newSize) || 24)));
  const next = createEmptyProgram(size, Object.keys(editor.program.transitions).length);

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
  next.transitions = cloneProgram({ transitions: editor.program.transitions }).transitions;

  editor.program = next;
  resetSimulation();
  updateTransitionTable();
  renderAll();
}

function clearProgram() {
  const stateCount = Object.keys(editor.program.transitions).length;
  editor.program = createEmptyProgram(editor.program.width, stateCount);
  ui.gridSizeInput.value = String(editor.program.width);
  resetSimulation();
  updateTransitionTable();
  renderAll();
}

function loadDemo() {
  const program = createEmptyProgram(24, 2);

  program.markers.inputs = [{ x: 2, y: 12, value: 1 }];
  applyInputsToGrid(program);

  program.markers.outputs = [{ x: 18, y: 12 }];
  program.markers.halt = { x: 20, y: 12 };

  program.ants = [{ x: 2, y: 12, dir: "E", state: 0 }];

  program.transitions = {
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
  updateTransitionTable();
  renderAll();
  ui.jsonArea.value = "";
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
    trimTransitionsToStateCount(stateCount);

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
  ui.importBtn.addEventListener("click", importProgram);
}

function init() {
  buildToolButtons();
  bindEvents();
  setTool(editor.tool);
  resetSimulation();
  updateTransitionTable();
  renderAll();
  loadDemo();
  editor.animationFrame = requestAnimationFrame(loop);
}

init();