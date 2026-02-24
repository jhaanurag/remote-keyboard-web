const statusEl = document.getElementById('status');
const roomCodeEl = document.getElementById('room-code');
const transportModeEl = document.getElementById('transport-mode');
const transportNoteEl = document.getElementById('transport-note');

let socket = null;
let socketReady = false;
let currentTransport = localStorage.getItem('rk_transport_mode') || 'websocket';

function setStatus(text, isConnected) {
    statusEl.textContent = text;
    statusEl.className = isConnected ? 'status connected' : 'status disconnected';
}

function updateTransportNote() {
    const roomCode = getRoomCode();
    if (!roomCode) {
        transportNoteEl.textContent = 'Enter room code to start sending.';
        return;
    }
    if (currentTransport === 'websocket') {
        transportNoteEl.textContent = 'WebSocket mode: low-latency live typing.';
    } else {
        transportNoteEl.textContent = 'HTTP polling mode: works without WebSockets (higher latency).';
    }
}

function getRoomCode() {
    return roomCodeEl.value.trim();
}

function persistRoomCode() {
    localStorage.setItem('rk_room_code', getRoomCode());
}

function ensureSocket() {
    if (socket || typeof io !== 'function') {
        return;
    }

    socket = io({ autoConnect: false, reconnection: true });

    socket.on('connect', () => {
        socketReady = true;
        const roomCode = getRoomCode();
        if (roomCode) {
            socket.emit('join-room', roomCode, 'sender');
            setStatus('Connected (WebSocket)', true);
        } else {
            setStatus('Enter room code', false);
        }
    });

    socket.on('disconnect', () => {
        socketReady = false;
        if (currentTransport === 'websocket') {
            setStatus('Disconnected (WebSocket)', false);
        }
    });
}

function switchTransport(nextMode) {
    currentTransport = nextMode;
    localStorage.setItem('rk_transport_mode', currentTransport);

    if (currentTransport === 'websocket') {
        if (typeof io !== 'function') {
            setStatus('WebSocket library unavailable', false);
        } else {
            ensureSocket();
            if (getRoomCode()) {
                socket.connect();
            } else {
                setStatus('Enter room code', false);
            }
        }
    } else if (socket && socket.connected) {
        socket.disconnect();
        setStatus('HTTP polling mode ready', true);
    } else {
        setStatus('HTTP polling mode ready', true);
    }

    updateTransportNote();
}

async function sendViaHttp(roomCode, type, payload) {
    const response = await fetch(`/api/rooms/${encodeURIComponent(roomCode)}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, payload })
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }
}

function sendViaWebSocket(roomCode, type, payload) {
    ensureSocket();
    if (!socket) {
        throw new Error('WebSocket is not available on this deployment');
    }
    if (!socket.connected) {
        socket.connect();
        throw new Error('WebSocket still connecting, retry in a moment');
    }
    if (!socketReady) {
        throw new Error('WebSocket not ready');
    }
    socket.emit('join-room', roomCode, 'sender');
    socket.emit('keystroke', { roomCode, type, payload });
}

async function sendEvent(type, payload) {
    const roomCode = getRoomCode();
    if (!roomCode) {
        setStatus('Room code is required', false);
        roomCodeEl.focus();
        return;
    }

    persistRoomCode();

    try {
        if (currentTransport === 'websocket') {
            sendViaWebSocket(roomCode, type, payload);
            setStatus('Connected (WebSocket)', true);
        } else {
            await sendViaHttp(roomCode, type, payload);
            setStatus('Sent (HTTP polling)', true);
        }
    } catch (error) {
        setStatus(`Send failed: ${error.message}`, false);
    }
}

// Tab switching logic
function switchTab(tab) {
    document.querySelectorAll('.mode-section').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));

    document.getElementById(`${tab}-mode`).classList.add('active');
    if (window.event && window.event.target) {
        window.event.target.classList.add('active');
    }
}

// --- Separate inputs for each mode ---
const letterInput = document.getElementById('letter-input');
const wordInput = document.getElementById('word-input');
const wordWrapper = document.getElementById('word-input-wrapper');

// Show/hide appropriate input when mode changes
document.querySelectorAll('input[name="instant-type"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
        if (e.target.value === 'letter') {
            letterInput.style.display = '';
            wordWrapper.style.display = 'none';
        } else {
            letterInput.style.display = 'none';
            wordWrapper.style.display = '';
        }
    });
});

// === LETTER MODE ===
letterInput.addEventListener('input', () => {
    const val = letterInput.value;
    if (val.length > 0) {
        const char = val[val.length - 1];
        sendEvent('letter', char);
        letterInput.value = '';
    }
});

letterInput.addEventListener('keydown', (e) => {
    if (e.key === 'Backspace' || e.key === 'Enter') {
        sendEvent('letter', e.key);
    }
});

// === WORD MODE ===
function sendWordContent() {
    const val = wordInput.value;
    if (val.trim().length > 0) {
        const textToSend = val.trim() + ' ';
        sendEvent('word', textToSend);
        wordInput.value = '';
    }
}

function manualSendWord() {
    sendWordContent();
    wordInput.focus();
}

wordInput.addEventListener('input', () => {
    const val = wordInput.value;
    if (val.endsWith(' ')) {
        sendWordContent();
    }
});

let lastWordValue = '';
let wordStableCount = 0;

setInterval(() => {
    const mode = document.querySelector('input[name="instant-type"]:checked').value;
    if (mode !== 'word') return;

    const val = wordInput.value;
    if (val.length === 0) {
        lastWordValue = '';
        wordStableCount = 0;
        return;
    }

    if (val === lastWordValue) {
        wordStableCount++;
        if (wordStableCount >= 3) {
            sendWordContent();
            lastWordValue = '';
            wordStableCount = 0;
        }
    } else {
        lastWordValue = val;
        wordStableCount = 0;
    }
}, 500);

wordInput.addEventListener('blur', () => {
    setTimeout(() => sendWordContent(), 200);
});

wordInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        sendWordContent();
    }
});

function sendBlock() {
    const textarea = document.getElementById('button-input');
    const text = textarea.value;
    if (text) {
        sendEvent('block', text);
        textarea.value = '';
    }
}

window.manualSendWord = manualSendWord;
window.sendBlock = sendBlock;
window.switchTab = switchTab;

roomCodeEl.value = localStorage.getItem('rk_room_code') || '';
transportModeEl.value = currentTransport;

roomCodeEl.addEventListener('change', () => {
    persistRoomCode();
    if (currentTransport === 'websocket' && socket && socket.connected) {
        socket.emit('join-room', getRoomCode(), 'sender');
    }
    updateTransportNote();
});

transportModeEl.addEventListener('change', (e) => {
    switchTransport(e.target.value);
});

if (currentTransport === 'websocket') {
    if (typeof io !== 'function') {
        setStatus('WebSocket unavailable on this host', false);
    } else {
        ensureSocket();
        if (getRoomCode()) {
            socket.connect();
        } else {
            setStatus('Enter room code', false);
        }
    }
} else {
    setStatus('HTTP polling mode ready', true);
}

updateTransportNote();
