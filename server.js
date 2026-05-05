const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname)));

const rooms = new Map();

function createRoomState() {
  return {
    players: [],
    currentPlayer: 0,
    scores: [0, 0],
    coins: null,
    striker: null,
    queenNeedsCover: false,
    queenOwner: null,
    status: 'Waiting for players...'
  };
}

io.on('connection', (socket) => {
  socket.on('join-room', (roomId) => {
    const id = (roomId || 'global').trim().toLowerCase();
    if (!rooms.has(id)) rooms.set(id, createRoomState());
    const room = rooms.get(id);

    if (room.players.length >= 2) {
      socket.emit('room-full');
      return;
    }

    room.players.push(socket.id);
    const playerIndex = room.players.length - 1;

    socket.join(id);
    socket.data.roomId = id;
    socket.data.playerIndex = playerIndex;

    socket.emit('joined', { roomId: id, playerIndex });
    io.to(id).emit('players-update', { count: room.players.length });

    if (room.players.length === 2) {
      io.to(id).emit('start-match', { status: 'Match started! Player 1 turn.' });
    }
  });

  socket.on('sync-state', (payload) => {
    const roomId = socket.data.roomId;
    if (!roomId || !rooms.has(roomId)) return;

    const room = rooms.get(roomId);
    if (socket.id !== room.players[room.currentPlayer]) return;

    Object.assign(room, payload);
    socket.to(roomId).emit('state-update', payload);
  });

  socket.on('pass-turn', () => {
    const roomId = socket.data.roomId;
    if (!roomId || !rooms.has(roomId)) return;
    const room = rooms.get(roomId);
    room.currentPlayer = (room.currentPlayer + 1) % 2;
    io.to(roomId).emit('turn-update', room.currentPlayer);
  });

  socket.on('disconnect', () => {
    const roomId = socket.data.roomId;
    if (!roomId || !rooms.has(roomId)) return;

    const room = rooms.get(roomId);
    room.players = room.players.filter((id) => id !== socket.id);

    if (room.players.length === 0) {
      rooms.delete(roomId);
    } else {
      io.to(roomId).emit('opponent-left');
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Carrom server running on http://localhost:${PORT}`);
});
