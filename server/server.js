const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

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
