const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const EVENT_RETENTION_MS = 30 * 60 * 1000;
const MAX_EVENTS_PER_ROOM = 1000;
const roomEvents = new Map();

function getRoomStore(roomCode) {
    if (!roomEvents.has(roomCode)) {
        roomEvents.set(roomCode, {
            events: [],
            nextId: 1,
            lastTouched: Date.now()
        });
    }
    const store = roomEvents.get(roomCode);
    store.lastTouched = Date.now();
    return store;
}

function pruneExpiredRooms() {
    const now = Date.now();
    for (const [roomCode, store] of roomEvents.entries()) {
        if (now - store.lastTouched > EVENT_RETENTION_MS) {
            roomEvents.delete(roomCode);
        }
    }
}

function queueEvent(roomCode, type, payload) {
    const store = getRoomStore(roomCode);
    const event = {
        id: store.nextId++,
        type,
        payload,
        ts: Date.now()
    };
    store.events.push(event);
    if (store.events.length > MAX_EVENTS_PER_ROOM) {
        store.events = store.events.slice(-MAX_EVENTS_PER_ROOM);
    }
    return event;
}

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Serve static files from the public directory
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (_, res) => {
    pruneExpiredRooms();
    res.json({ ok: true });
});

app.post('/api/rooms/:roomCode/events', (req, res) => {
    const { roomCode } = req.params;
    const { type, payload } = req.body || {};
    if (!roomCode || !type || payload === undefined || payload === null) {
        return res.status(400).json({ error: 'roomCode, type and payload are required' });
    }
    pruneExpiredRooms();
    const event = queueEvent(roomCode, type, payload);
    return res.status(202).json({ accepted: true, eventId: event.id });
});

app.get('/api/rooms/:roomCode/events', (req, res) => {
    const { roomCode } = req.params;
    const since = Number.parseInt(req.query.since || '0', 10);
    const store = getRoomStore(roomCode);
    pruneExpiredRooms();
    const events = store.events.filter((event) => event.id > (Number.isNaN(since) ? 0 : since));
    const nextSince = events.length > 0 ? events[events.length - 1].id : (Number.isNaN(since) ? 0 : since);
    return res.json({ events, nextSince });
});

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Handle joining a room
    socket.on('join-room', (roomCode, role) => {
        socket.join(roomCode);
        console.log(`User ${socket.id} joined room ${roomCode} as ${role}`);
        
        // Notify others in the room
        socket.to(roomCode).emit('user-joined', { id: socket.id, role });
    });

    // Handle keystroke events
    socket.on('keystroke', (data) => {
        const { roomCode, type, payload } = data;
        if (!roomCode || !type || payload === undefined || payload === null) {
            return;
        }
        queueEvent(roomCode, type, payload);
        // Broadcast to everyone else in the room (specifically the desktop receiver)
        socket.to(roomCode).emit('keystroke', { type, payload });
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
    });
});

// Export for testing, or start server if run directly
if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}

module.exports = { app, server, io };
