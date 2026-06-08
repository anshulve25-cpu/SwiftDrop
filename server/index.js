const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

app.get('/health', (_, res) => res.json({ status: 'ok', rooms: rooms.size }));

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  maxHttpBufferSize: 1e8, // 100 MB max payload
});

// Track rooms: roomId -> Set of socket IDs
const rooms = new Map();

io.on('connection', (socket) => {
  console.log(`[+] Connected: ${socket.id}`);

  socket.on('create-room', (roomId) => {
    if (!roomId || typeof roomId !== 'string') return;
    socket.join(roomId);
    rooms.set(roomId, new Set([socket.id]));
    console.log(`[Room] Created: ${roomId} by ${socket.id}`);
    socket.emit('room-created', { roomId });
  });

  socket.on('join-room', (roomId) => {
    if (!roomId || typeof roomId !== 'string') return;

    const room = io.sockets.adapter.rooms.get(roomId);
    if (!room) {
      socket.emit('join-error', { message: 'Room not found. Check the Room ID.' });
      return;
    }
    if (room.size >= 2) {
      socket.emit('join-error', { message: 'Room is full (max 2 peers).' });
      return;
    }

    socket.join(roomId);
    if (!rooms.has(roomId)) rooms.set(roomId, new Set());
    rooms.get(roomId).add(socket.id);

    socket.to(roomId).emit('peer-joined', { peerId: socket.id });
    console.log(`[Room] ${socket.id} joined: ${roomId}`);
  });

  socket.on('offer', ({ roomId, offer }) => {
    if (!roomId || !offer) return;
    socket.to(roomId).emit('offer', { offer, from: socket.id });
  });

  socket.on('answer', ({ roomId, answer }) => {
    if (!roomId || !answer) return;
    socket.to(roomId).emit('answer', { answer, from: socket.id });
  });

  socket.on('ice-candidate', ({ roomId, candidate }) => {
    if (!roomId || !candidate) return;
    socket.to(roomId).emit('ice-candidate', { candidate, from: socket.id });
  });

  // Clean up on disconnect
  socket.on('disconnecting', () => {
    for (const roomId of socket.rooms) {
      if (roomId === socket.id) continue;
      socket.to(roomId).emit('peer-disconnected', { peerId: socket.id });
      console.log(`[Room] ${socket.id} left: ${roomId}`);

      // Cleanup empty rooms
      const room = io.sockets.adapter.rooms.get(roomId);
      if (!room || room.size <= 1) {
        rooms.delete(roomId);
        console.log(`[Room] Cleaned up: ${roomId}`);
      } else if (rooms.has(roomId)) {
        rooms.get(roomId).delete(socket.id);
      }
    }
  });

  socket.on('disconnect', () => {
    console.log(`[-] Disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 P2P Signaling Server running on port ${PORT}`);
});