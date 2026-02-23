const { createServer } = require('http');
const { Server } = require('socket.io');
const Client = require('socket.io-client');
const express = require('express');

describe('Socket.io Server', () => {
    let io, serverSocket, clientSocket1, clientSocket2;
    let port;

    beforeAll((done) => {
        const app = express();
        const httpServer = createServer(app);
        io = new Server(httpServer);
        
        httpServer.listen(() => {
            port = httpServer.address().port;
            
            io.on('connection', (socket) => {
                serverSocket = socket;
                
                socket.on('join-room', (roomCode, role) => {
                    socket.join(roomCode);
                    socket.to(roomCode).emit('user-joined', { id: socket.id, role });
                });

                socket.on('keystroke', (data) => {
                    const { roomCode, type, payload } = data;
                    socket.to(roomCode).emit('keystroke', { type, payload });
                });
            });
            
            done();
        });
    });

    afterAll(() => {
        io.close();
    });

    beforeEach((done) => {
        clientSocket1 = new Client(`http://localhost:${port}`);
        clientSocket2 = new Client(`http://localhost:${port}`);
        
        let connected = 0;
        const checkDone = () => {
            connected++;
            if (connected === 2) done();
        };
        
        clientSocket1.on('connect', checkDone);
        clientSocket2.on('connect', checkDone);
    });

    afterEach(() => {
        if (clientSocket1.connected) clientSocket1.disconnect();
        if (clientSocket2.connected) clientSocket2.disconnect();
    });

    test('should allow clients to join a room and notify others', (done) => {
        const roomCode = '1234';
        
        clientSocket2.on('user-joined', (data) => {
            expect(data.role).toBe('sender');
            done();
        });

        clientSocket2.emit('join-room', roomCode, 'receiver');
        
        setTimeout(() => {
            clientSocket1.emit('join-room', roomCode, 'sender');
        }, 50);
    });

    test('should route keystrokes only to the correct room', (done) => {
        const roomCode = '5678';
        
        clientSocket2.on('keystroke', (data) => {
            expect(data.type).toBe('letter');
            expect(data.payload).toBe('a');
            done();
        });

        clientSocket2.emit('join-room', roomCode, 'receiver');
        
        setTimeout(() => {
            clientSocket1.emit('join-room', roomCode, 'sender');
            clientSocket1.emit('keystroke', { roomCode, type: 'letter', payload: 'a' });
        }, 50);
    });
});
