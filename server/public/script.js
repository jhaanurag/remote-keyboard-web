const socket = io();
let currentRoom = null;

const statusEl = document.getElementById('status');
const connectionSection = document.getElementById('connection-section');
const keyboardSection = document.getElementById('keyboard-section');
const currentRoomEl = document.getElementById('current-room');

socket.on('connect', () => {
    console.log("Connected to server");
    statusEl.textContent = "Connected to Server. Enter Room Code.";
    statusEl.className = "status connected";
});

socket.on('disconnect', () => {
    console.log("Disconnected from server");
    statusEl.textContent = "Disconnected";
    statusEl.className = "status disconnected";
    leaveRoom();
});

function joinRoom() {
    const code = document.getElementById('room-code').value.trim();
    if (code.length > 0) {
        currentRoom = code;
        socket.emit('join-room', currentRoom, 'sender');
        
        // Update UI
        connectionSection.classList.remove('active');
        keyboardSection.classList.add('active');
        currentRoomEl.textContent = currentRoom;
    }
}

function leaveRoom() {
    currentRoom = null;
    connectionSection.classList.add('active');
    keyboardSection.classList.remove('active');
    document.getElementById('room-code').value = '';
}

// Tab switching logic
function switchTab(tab) {
    document.querySelectorAll('.mode-section').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    
    document.getElementById(`${tab}-mode`).classList.add('active');
    event.target.classList.add('active');
}

// Instant Mode Logic
const instantInput = document.getElementById('instant-input');

instantInput.addEventListener('input', (e) => {
    if (!currentRoom) return;
    
    const mode = document.querySelector('input[name="instant-type"]:checked').value;
    const val = instantInput.value;
    
    if (mode === 'letter') {
        if (val.length > 0) {
            const char = val[val.length - 1];
            socket.emit('keystroke', { roomCode: currentRoom, type: 'letter', payload: char });
            instantInput.value = ''; 
        }
    } else if (mode === 'word') {
        if (val.endsWith(' ')) {
            socket.emit('keystroke', { roomCode: currentRoom, type: 'word', payload: val });
            instantInput.value = ''; 
        }
    }
});

instantInput.addEventListener('keydown', (e) => {
    if (!currentRoom) return;
    
    const mode = document.querySelector('input[name="instant-type"]:checked').value;
    
    if (mode === 'letter') {
        if (e.key === 'Backspace' || e.key === 'Enter') {
            socket.emit('keystroke', { roomCode: currentRoom, type: 'letter', payload: e.key });
        }
    } else if (mode === 'word') {
        if (e.key === 'Enter') {
            socket.emit('keystroke', { roomCode: currentRoom, type: 'word', payload: instantInput.value + '\n' });
            instantInput.value = '';
        }
    }
});

// Button Mode Logic
function sendBlock() {
    if (!currentRoom) return;
    
    const textarea = document.getElementById('button-input');
    const text = textarea.value;
    if (text) {
        socket.emit('keystroke', { roomCode: currentRoom, type: 'block', payload: text });
        textarea.value = ''; 
    }
}
