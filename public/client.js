/* global io */

const socket = io();

const els = {
  status: document.getElementById("status"),
  roomCode: document.getElementById("roomCode"),
  btnCreate: document.getElementById("btnCreate"),
  btnSearch: document.getElementById("btnSearch"),
  btnJoin: document.getElementById("btnJoin"),
  btnNewGame: document.getElementById("btnNewGame"),
  btnLeave: document.getElementById("btnLeave"),
  pillRoom: document.getElementById("pillRoom"),
  pillYou: document.getElementById("pillYou"),
  pillTurn: document.getElementById("pillTurn"),
  log: document.getElementById("log"),
  board: document.getElementById("board"),
  hint: document.getElementById("hint"),
};

const BOARD_SIZE = 15;
const EMPTY = 0;
const BLACK = 1;
const WHITE = 2;

let currentRoomCode = null;
let youPiece = EMPTY;
let turnPiece = BLACK;
let winnerPiece = EMPTY;
let boardState = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(EMPTY));

function pieceName(piece) {
  if (piece === BLACK) return "黑棋";
  if (piece === WHITE) return "白棋";
  return "—";
}

function logLine(text) {
  const div = document.createElement("div");
  div.className = "logLine";
  div.textContent = text;
  els.log.prepend(div);
}

function setStatus(text) {
  els.status.textContent = text;
}

function updatePills() {
  els.pillRoom.textContent = `房間：${currentRoomCode || "—"}`;
  els.pillYou.textContent = `你：${pieceName(youPiece)}`;

  if (winnerPiece !== EMPTY) {
    els.pillTurn.textContent = `結果：${pieceName(winnerPiece)} 勝利`;
  } else {
    els.pillTurn.textContent = `回合：${pieceName(turnPiece)}`;
  }
}

function setControls({ inRoom, canNewGame }) {
  els.btnLeave.disabled = !inRoom;
  els.btnNewGame.disabled = !canNewGame;
}

function sanitizeRoomInput() {
  const v = String(els.roomCode.value || "")
    .replace(/[^\d]/g, "")
    .slice(0, 6);
  els.roomCode.value = v;
  return v;
}

els.roomCode.addEventListener("input", sanitizeRoomInput);

els.btnCreate.addEventListener("click", () => {
  socket.emit("createRoom", (res) => {
    if (!res?.ok) {
      logLine("建立房間失敗。");
      return;
    }
    els.roomCode.value = res.roomCode;
    sanitizeRoomInput();
    logLine(`已建立房間：${res.roomCode}`);
  });
});

els.btnSearch.addEventListener("click", () => {
  const code = sanitizeRoomInput();
  if (!code) return;
  socket.emit("checkRoom", code, (res) => {
    if (!res?.ok) {
      logLine("搜尋失敗。");
      return;
    }
    if (!res.exists) {
      logLine(`找不到房間：${code}`);
      return;
    }
    logLine(`房間 ${code}：${res.players}/2 玩家，${res.started ? "對局中" : "等待中"}`);
  });
});

els.btnJoin.addEventListener("click", () => {
  const code = sanitizeRoomInput();
  if (!code) return;
  socket.emit("joinRoom", code, (res) => {
    if (!res?.ok) {
      const msg =
        res?.error === "ROOM_NOT_FOUND"
          ? "找不到房間。"
          : res?.error === "ROOM_FULL"
            ? "房間已滿。"
            : "加入失敗。";
      logLine(msg);
      return;
    }
    logLine(`已加入房間：${code}`);
  });
});

els.btnNewGame.addEventListener("click", () => {
  socket.emit("newGame", (res) => {
    if (!res?.ok) {
      const msg = res?.error === "NEED_TWO_PLAYERS" ? "需要兩位玩家才能開始。" : "無法開始新對局。";
      logLine(msg);
      return;
    }
  });
});

els.btnLeave.addEventListener("click", () => {
  socket.emit("leaveRoom", () => {
    // Server will push updated state; keep UI responsive anyway.
    logLine("已離開房間。");
  });
});

socket.on("connect", () => {
  setStatus("已連線");
});

socket.on("disconnect", () => {
  setStatus("已斷線");
});

socket.on("system", ({ message }) => {
  if (message) logLine(message);
});

socket.on("hello", ({ boardSize }) => {
  if (Number(boardSize) === BOARD_SIZE) return;
  logLine("提示：棋盤大小與伺服器不同，請重新整理。");
});

socket.on("roomState", (payload) => {
  currentRoomCode = payload?.room?.code || null;
  youPiece = payload?.you?.piece ?? EMPTY;
  boardState = payload?.game?.board || boardState;
  turnPiece = payload?.game?.turn ?? BLACK;
  winnerPiece = payload?.game?.winner ?? EMPTY;

  const players = payload?.room?.players ?? 0;
  const canNewGame = currentRoomCode && players === 2;
  setControls({ inRoom: !!currentRoomCode, canNewGame });

  updatePills();
  draw();
});

socket.on("moveApplied", ({ x, y, piece, turn, winner }) => {
  if (typeof x === "number" && typeof y === "number") {
    boardState[y][x] = piece;
  }
  if (typeof turn === "number") turnPiece = turn;
  if (typeof winner === "number") winnerPiece = winner;
  updatePills();
  draw();
});

function boardTheme() {
  return {
    bg: "#d7b27a",
    grid: "rgba(0,0,0,0.35)",
    border: "rgba(0,0,0,0.45)",
    star: "rgba(0,0,0,0.40)",
    black: "#141414",
    white: "#f4f4f4",
    whiteStroke: "rgba(0,0,0,0.18)",
  };
}

function draw() {
  const ctx = els.board.getContext("2d");
  if (!ctx) return;

  const { bg, grid, border, star, black, white, whiteStroke } = boardTheme();
  const w = els.board.width;
  const h = els.board.height;
  ctx.clearRect(0, 0, w, h);

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  const padding = 36;
  const span = Math.min(w, h) - padding * 2;
  const cell = span / (BOARD_SIZE - 1);

  // Grid
  ctx.strokeStyle = grid;
  ctx.lineWidth = 1;
  for (let i = 0; i < BOARD_SIZE; i++) {
    const p = padding + i * cell;
    ctx.beginPath();
    ctx.moveTo(padding, p);
    ctx.lineTo(padding + span, p);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(p, padding);
    ctx.lineTo(p, padding + span);
    ctx.stroke();
  }

  // Border
  ctx.strokeStyle = border;
  ctx.lineWidth = 2;
  ctx.strokeRect(padding, padding, span, span);

  // Star points (15x15 standard)
  const stars = [
    [3, 3],
    [11, 3],
    [7, 7],
    [3, 11],
    [11, 11],
  ];
  ctx.fillStyle = star;
  for (const [sx, sy] of stars) {
    const cx = padding + sx * cell;
    const cy = padding + sy * cell;
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Pieces
  const r = cell * 0.42;
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      const piece = boardState?.[y]?.[x] ?? EMPTY;
      if (piece === EMPTY) continue;
      const cx = padding + x * cell;
      const cy = padding + y * cell;

      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);

      if (piece === BLACK) {
        const g = ctx.createRadialGradient(cx - r * 0.4, cy - r * 0.4, r * 0.2, cx, cy, r);
        g.addColorStop(0, "#333");
        g.addColorStop(1, black);
        ctx.fillStyle = g;
        ctx.fill();
      } else if (piece === WHITE) {
        const g = ctx.createRadialGradient(cx - r * 0.4, cy - r * 0.4, r * 0.2, cx, cy, r);
        g.addColorStop(0, "#fff");
        g.addColorStop(1, white);
        ctx.fillStyle = g;
        ctx.fill();
        ctx.strokeStyle = whiteStroke;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }

  const yourTurn = youPiece !== EMPTY && youPiece === turnPiece && winnerPiece === EMPTY;
  els.hint.textContent = winnerPiece !== EMPTY ? "對局結束" : yourTurn ? "輪到你了" : "等待對手/回合";
}

function canvasToCell(clientX, clientY) {
  const rect = els.board.getBoundingClientRect();
  const sx = (clientX - rect.left) * (els.board.width / rect.width);
  const sy = (clientY - rect.top) * (els.board.height / rect.height);

  const padding = 36;
  const span = Math.min(els.board.width, els.board.height) - padding * 2;
  const cell = span / (BOARD_SIZE - 1);

  const x = Math.round((sx - padding) / cell);
  const y = Math.round((sy - padding) / cell);

  const inBounds = x >= 0 && x < BOARD_SIZE && y >= 0 && y < BOARD_SIZE;
  if (!inBounds) return null;
  return { x, y };
}

function tryMoveAt(evt) {
  if (!currentRoomCode) return;
  if (winnerPiece !== EMPTY) return;
  if (youPiece === EMPTY) return;
  if (youPiece !== turnPiece) return;

  const point = canvasToCell(evt.clientX, evt.clientY);
  if (!point) return;
  if (boardState[point.y][point.x] !== EMPTY) return;

  socket.emit("move", { roomCode: currentRoomCode, x: point.x, y: point.y }, (res) => {
    if (!res?.ok) {
      logLine("落子失敗。");
    }
  });
}

els.board.addEventListener("click", tryMoveAt);

draw();

