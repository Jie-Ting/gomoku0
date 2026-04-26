const http = require("http");
const path = require("path");

const express = require("express");
const { Server } = require("socket.io");

const app = express();
app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

const server = http.createServer(app);
const io = new Server(server);

const BOARD_SIZE = 15;
const EMPTY = 0;
const BLACK = 1;
const WHITE = 2;

function createEmptyBoard() {
  return Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(EMPTY));
}

function roomSummary(room) {
  return {
    code: room.code,
    players: room.players.size,
    started: room.started,
  };
}

function generateRoomCode(existingCodes) {
  // 6-digit numeric codes are easy to type on mobile.
  for (let attempts = 0; attempts < 10000; attempts++) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    if (!existingCodes.has(code)) return code;
  }
  // Fallback: extremely unlikely.
  return String(Date.now()).slice(-6);
}

function checkWin(board, x, y, piece) {
  const directions = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1],
  ];

  const inBounds = (cx, cy) =>
    cx >= 0 && cx < BOARD_SIZE && cy >= 0 && cy < BOARD_SIZE;

  for (const [dx, dy] of directions) {
    let count = 1;

    for (let step = 1; step < 5; step++) {
      const cx = x + dx * step;
      const cy = y + dy * step;
      if (!inBounds(cx, cy) || board[cy][cx] !== piece) break;
      count++;
    }

    for (let step = 1; step < 5; step++) {
      const cx = x - dx * step;
      const cy = y - dy * step;
      if (!inBounds(cx, cy) || board[cy][cx] !== piece) break;
      count++;
    }

    if (count >= 5) return true;
  }
  return false;
}

function resetRoomGame(room) {
  room.board = createEmptyBoard();
  room.started = room.players.size === 2;
  room.winner = EMPTY;
  room.turn = BLACK;
}

function normalizePieces(room) {
  const ids = Array.from(room.players.keys());
  if (ids.length === 0) return;
  if (ids.length === 1) {
    const only = room.players.get(ids[0]);
    room.players.set(ids[0], { ...only, piece: BLACK });
    return;
  }
  if (ids.length === 2) {
    const p1 = room.players.get(ids[0]);
    const p2 = room.players.get(ids[1]);
    room.players.set(ids[0], { ...p1, piece: BLACK });
    room.players.set(ids[1], { ...p2, piece: WHITE });
  }
}

// code -> room
const rooms = new Map();
// socketId -> code
const socketToRoom = new Map();

function removeSocketFromCurrentRoom(socket, message) {
  const code = socketToRoom.get(socket.id);
  const room = code ? rooms.get(code) : null;
  if (!room) return;

  room.players.delete(socket.id);
  socketToRoom.delete(socket.id);
  socket.leave(code);

  if (message) io.to(code).emit("system", { message });

  if (room.players.size === 0) {
    rooms.delete(code);
  } else {
    normalizePieces(room);
    resetRoomGame(room);
    emitRoomState(room);
  }
}

function getSocketPiece(room, socketId) {
  for (const player of room.players.values()) {
    if (player.socketId === socketId) return player.piece;
  }
  return EMPTY;
}

function emitRoomState(room) {
  for (const player of room.players.values()) {
    io.to(player.socketId).emit("roomState", {
      room: roomSummary(room),
      you: { piece: player.piece },
      game: {
        board: room.board,
        turn: room.turn,
        winner: room.winner,
      },
    });
  }
}

io.on("connection", (socket) => {
  socket.emit("hello", { boardSize: BOARD_SIZE });

  socket.on("createRoom", (ack) => {
    removeSocketFromCurrentRoom(socket, "有玩家離開房間。");

    const code = generateRoomCode(rooms);
    const room = {
      code,
      players: new Map(), // socketId -> { socketId, piece }
      board: createEmptyBoard(),
      started: false,
      winner: EMPTY,
      turn: BLACK,
    };
    rooms.set(code, room);

    room.players.set(socket.id, { socketId: socket.id, piece: BLACK });
    socket.join(code);
    socketToRoom.set(socket.id, code);

    if (typeof ack === "function") ack({ ok: true, roomCode: code });
    emitRoomState(room);
  });

  socket.on("checkRoom", (roomCode, ack) => {
    const code = String(roomCode || "").trim();
    const room = rooms.get(code);
    const result = room
      ? { ok: true, exists: true, ...roomSummary(room) }
      : { ok: true, exists: false };
    if (typeof ack === "function") ack(result);
  });

  socket.on("joinRoom", (roomCode, ack) => {
    removeSocketFromCurrentRoom(socket, "有玩家離開房間。");

    const code = String(roomCode || "").trim();
    const room = rooms.get(code);
    if (!room) {
      if (typeof ack === "function") ack({ ok: false, error: "ROOM_NOT_FOUND" });
      return;
    }
    if (room.players.size >= 2) {
      if (typeof ack === "function") ack({ ok: false, error: "ROOM_FULL" });
      return;
    }

    room.players.set(socket.id, { socketId: socket.id, piece: EMPTY });
    socket.join(code);
    socketToRoom.set(socket.id, code);

    normalizePieces(room);
    // When the second player joins, always start a fresh game for clarity.
    resetRoomGame(room);

    if (typeof ack === "function") ack({ ok: true, roomCode: code });
    io.to(code).emit("system", { message: "玩家已加入房間。" });
    emitRoomState(room);
  });

  socket.on("newGame", (ack) => {
    const code = socketToRoom.get(socket.id);
    const room = code ? rooms.get(code) : null;
    if (!room) {
      if (typeof ack === "function") ack({ ok: false, error: "NOT_IN_ROOM" });
      return;
    }
    if (room.players.size !== 2) {
      if (typeof ack === "function") ack({ ok: false, error: "NEED_TWO_PLAYERS" });
      return;
    }

    normalizePieces(room);
    resetRoomGame(room);
    io.to(code).emit("system", { message: "新對局開始。" });
    emitRoomState(room);
    if (typeof ack === "function") ack({ ok: true });
  });

  socket.on("move", ({ roomCode, x, y }, ack) => {
    const code = String(roomCode || socketToRoom.get(socket.id) || "").trim();
    const room = rooms.get(code);
    if (!room) {
      if (typeof ack === "function") ack({ ok: false, error: "ROOM_NOT_FOUND" });
      return;
    }
    if (room.winner !== EMPTY) {
      if (typeof ack === "function") ack({ ok: false, error: "GAME_OVER" });
      return;
    }
    if (room.players.size !== 2) {
      if (typeof ack === "function") ack({ ok: false, error: "NEED_TWO_PLAYERS" });
      return;
    }

    const piece = getSocketPiece(room, socket.id);
    if (piece === EMPTY) {
      if (typeof ack === "function") ack({ ok: false, error: "NOT_IN_ROOM" });
      return;
    }
    if (piece !== room.turn) {
      if (typeof ack === "function") ack({ ok: false, error: "NOT_YOUR_TURN" });
      return;
    }

    const ix = Number(x);
    const iy = Number(y);
    const inBounds = ix >= 0 && ix < BOARD_SIZE && iy >= 0 && iy < BOARD_SIZE;
    if (!inBounds) {
      if (typeof ack === "function") ack({ ok: false, error: "OUT_OF_BOUNDS" });
      return;
    }
    if (room.board[iy][ix] !== EMPTY) {
      if (typeof ack === "function") ack({ ok: false, error: "OCCUPIED" });
      return;
    }

    room.board[iy][ix] = piece;
    const won = checkWin(room.board, ix, iy, piece);
    if (won) {
      room.winner = piece;
    } else {
      room.turn = piece === BLACK ? WHITE : BLACK;
    }

    io.to(code).emit("moveApplied", {
      x: ix,
      y: iy,
      piece,
      turn: room.turn,
      winner: room.winner,
    });
    emitRoomState(room);

    if (typeof ack === "function") ack({ ok: true });
  });

  socket.on("leaveRoom", (ack) => {
    removeSocketFromCurrentRoom(socket, "有玩家離開房間。");
    if (typeof ack === "function") ack({ ok: true });
  });

  socket.on("disconnect", () => {
    removeSocketFromCurrentRoom(socket, "有玩家斷線。");
  });
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Gomoku server listening on http://localhost:${PORT}`);
});
