const statusEl = document.getElementById('status');
const deliveryStatusEl = document.getElementById('delivery-status');
const roomCodeEl = document.getElementById('room-code');
const transportModeEl = document.getElementById('transport-mode');
const transportNoteEl = document.getElementById('transport-note');
const sanitizeToggleEl = document.getElementById('sanitize-toggle');
const denyShortcutsToggleEl = document.getElementById('deny-shortcuts-toggle');
const shortcutDenylistEl = document.getElementById('shortcut-denylist');

let socket = null;
let socketReady = false;
let currentTransport = localStorage.getItem('rk_transport_mode') || 'websocket';
let nextClientEventId = Number.parseInt(localStorage.getItem('rk_next_client_event_id') || '1', 10);
const pendingAcks = new Map();
let deniedShortcuts = new Set();

const ACK_TIMEOUT_MS = 6000;
const DEFAULT_DENYLIST = 'Ctrl+W,Ctrl+R,Alt+F4,Meta+Q';

function setStatus(text, isConnected) {
    statusEl.textContent = text;
    statusEl.className = isConnected ? 'status connected' : 'status disconnected';
}

function setDeliveryStatus(text, tone = 'neutral') {
    deliveryStatusEl.textContent = text;
    deliveryStatusEl.className = `delivery-status ${tone}`.trim();
}

function updateTransportNote() {
    const roomCode = getRoomCode();
    if (!roomCode) {
        transportNoteEl.textContent = 'Enter room code to start sending.';
        return;
    }
    if (currentTransport === 'websocket') {
        transportNoteEl.textContent = 'WebSocket mode: low-latency live typing with ACK status.';
    } else {
        transportNoteEl.textContent = 'HTTP polling mode: works without WebSockets (higher latency, no execution ACK).';
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

    socket.on('delivery-ack', (data = {}) => {
        const { roomCode, clientEventId, eventId } = data;
        if (!clientEventId || roomCode !== getRoomCode()) {
            return;
        }

        const record = pendingAcks.get(clientEventId);
        if (!record) {
            return;
        }

        record.eventId = eventId;
        record.phase = 'queued';
        setDeliveryStatus(`Queued #${eventId}`, 'neutral');
    });

    socket.on('execution-ack', (data = {}) => {
        const { roomCode, clientEventId, eventId, ok, error } = data;
        if (!clientEventId || roomCode !== getRoomCode()) {
            return;
        }

        const record = pendingAcks.get(clientEventId);
        if (!record) {
            return;
        }

        clearTimeout(record.timer);
        pendingAcks.delete(clientEventId);

        if (ok === false) {
            setDeliveryStatus(`Execution failed #${eventId || '?'}: ${error || 'unknown error'}`, 'error');
            return;
        }

        setDeliveryStatus(`Executed #${eventId || '?'}`, 'ok');
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

function sendViaWebSocket(roomCode, type, payload, clientEventId) {
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

    const timer = setTimeout(() => {
        if (!pendingAcks.has(clientEventId)) {
            return;
        }

        pendingAcks.delete(clientEventId);
        setDeliveryStatus(`No execution ACK yet for client event ${clientEventId}`, 'warn');
    }, ACK_TIMEOUT_MS);

    pendingAcks.set(clientEventId, { timer, phase: 'sent', eventId: null });

    socket.emit('join-room', roomCode, 'sender');
    socket.emit('keystroke', { roomCode, type, payload, clientEventId });
    setDeliveryStatus(`Sent client event ${clientEventId}`, 'neutral');
}

const COMMAND_KEYS = new Set([
    'Backspace',
    'Delete',
    'Enter',
    'Tab',
    'Escape',
    'ArrowUp',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    'Home',
    'End',
    'PageUp',
    'PageDown'
]);

const MODIFIER_ONLY_KEYS = new Set([
    'Shift',
    'Control',
    'Alt',
    'Meta',
    'AltGraph',
    'CapsLock',
    'NumLock',
    'ScrollLock',
    'Fn',
    'ContextMenu',
    'OS'
]);

function getInstantType() {
    const selected = document.querySelector('input[name="instant-type"]:checked');
    return selected ? selected.value : 'letter';
}

function isSanitizeEnabled() {
    return sanitizeToggleEl.checked;
}

function normalizeKeyName(rawKey) {
    if (rawKey === 'Esc') return 'Escape';
    if (rawKey === 'Del') return 'Delete';
    if (rawKey === 'Return') return 'Enter';
    if (rawKey === 'Spacebar') return ' ';
    return rawKey;
}

function normalizeModifierName(name) {
    const key = String(name || '').trim().toLowerCase();
    if (!key) return '';
    if (key === 'ctrl' || key === 'control') return 'Control';
    if (key === 'alt' || key === 'option') return 'Alt';
    if (key === 'shift') return 'Shift';
    if (key === 'cmd' || key === 'command' || key === 'meta' || key === 'win' || key === 'super') return 'Meta';
    return '';
}

function normalizeShortcutMain(mainKey) {
    const key = normalizeKeyName(mainKey).trim();
    if (!key) return '';
    if (key.length === 1) return key.toUpperCase();
    return key;
}

function normalizeShortcutToken(token) {
    const parts = token.split('+').map(part => part.trim()).filter(Boolean);
    if (parts.length < 2) {
        return '';
    }

    const modifiers = [];
    for (let i = 0; i < parts.length - 1; i++) {
        const modifier = normalizeModifierName(parts[i]);
        if (!modifier) {
            return '';
        }
        if (!modifiers.includes(modifier)) {
            modifiers.push(modifier);
        }
    }

    const main = normalizeShortcutMain(parts[parts.length - 1]);
    if (!main) {
        return '';
    }

    return `${modifiers.sort().join('+')}+${main}`;
}

function parseDenylist(rawValue) {
    return new Set(
        rawValue
            .split(',')
            .map(token => normalizeShortcutToken(token))
            .filter(Boolean)
    );
}

function keyboardEventToShortcut(event, rawKey) {
    const modifiers = [];
    if (event.ctrlKey) modifiers.push('Control');
    if (event.altKey) modifiers.push('Alt');
    if (event.shiftKey) modifiers.push('Shift');
    if (event.metaKey) modifiers.push('Meta');
    if (modifiers.length === 0) {
        return '';
    }

    const main = normalizeShortcutMain(rawKey);
    if (!main) {
        return '';
    }

    return `${modifiers.sort().join('+')}+${main}`;
}

function isShortcutDenied(event, rawKey) {
    if (!denyShortcutsToggleEl.checked) {
        return '';
    }

    const shortcut = keyboardEventToShortcut(event, rawKey);
    if (!shortcut) {
        return '';
    }

    return deniedShortcuts.has(shortcut) ? shortcut : '';
}

function refreshDenylist() {
    deniedShortcuts = parseDenylist(shortcutDenylistEl.value);
}

function sanitizeLetterKey(rawKey, keyboardEvent) {
    const key = normalizeKeyName(rawKey);
    if (MODIFIER_ONLY_KEYS.has(key)) return null;
    if (keyboardEvent && (keyboardEvent.ctrlKey || keyboardEvent.metaKey || keyboardEvent.altKey)) {
        return null;
    }
    if (key.length === 1 || COMMAND_KEYS.has(key)) {
        return key;
    }
    return null;
}

function sanitizeOutgoing(type, payload) {
    if (!isSanitizeEnabled() || type !== 'letter' || typeof payload !== 'string') {
        return payload;
    }

    return sanitizeLetterKey(payload);
}

function nextEventId() {
    if (!Number.isFinite(nextClientEventId) || nextClientEventId < 1) {
        nextClientEventId = 1;
    }

    const current = nextClientEventId;
    nextClientEventId += 1;
    localStorage.setItem('rk_next_client_event_id', String(nextClientEventId));
    return current;
}

async function sendEvent(type, payload) {
    const safePayload = sanitizeOutgoing(type, payload);
    if (safePayload === null || safePayload === undefined || safePayload === '') {
        return;
    }

    const roomCode = getRoomCode();
    if (!roomCode) {
        setStatus('Room code is required', false);
        roomCodeEl.focus();
        return;
    }

    persistRoomCode();

    try {
        if (currentTransport === 'websocket') {
            const clientEventId = nextEventId();
            sendViaWebSocket(roomCode, type, safePayload, clientEventId);
            setStatus('Connected (WebSocket)', true);
        } else {
            await sendViaHttp(roomCode, type, safePayload);
            setStatus('Sent (HTTP polling)', true);
            setDeliveryStatus('Delivered to server (HTTP polling). Execution ACK unavailable.', 'neutral');
        }
    } catch (error) {
        setStatus(`Send failed: ${error.message}`, false);
        setDeliveryStatus(`Send failed: ${error.message}`, 'error');
    }
}

function switchTab(tab) {
    document.querySelectorAll('.mode-section').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));

    document.getElementById(`${tab}-mode`).classList.add('active');
    if (window.event && window.event.target) {
        window.event.target.classList.add('active');
    }
}

const letterInput = document.getElementById('letter-input');
const wordInput = document.getElementById('word-input');
const wordWrapper = document.getElementById('word-input-wrapper');
const typewriterInput = document.getElementById('typewriter-input');
const typewriterWrapper = document.getElementById('typewriter-input-wrapper');
const instantTypeRadios = document.querySelectorAll('input[name="instant-type"]');

function applyInstantTypeUi(mode) {
    if (mode === 'letter') {
        letterInput.style.display = '';
        wordWrapper.style.display = 'none';
        typewriterWrapper.style.display = 'none';
    } else if (mode === 'word') {
        letterInput.style.display = 'none';
        wordWrapper.style.display = '';
        typewriterWrapper.style.display = 'none';
    } else {
        letterInput.style.display = 'none';
        wordWrapper.style.display = 'none';
        typewriterWrapper.style.display = '';
    }
}

instantTypeRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
        applyInstantTypeUi(e.target.value);
    });
});

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

typewriterInput.addEventListener('keydown', (e) => {
    const rawKey = normalizeKeyName(e.key);
    const denied = isShortcutDenied(e, rawKey);

    e.preventDefault();

    if (denied) {
        setDeliveryStatus(`Blocked shortcut: ${denied}`, 'warn');
        return;
    }

    const keyToSend = isSanitizeEnabled() ? sanitizeLetterKey(rawKey, e) : rawKey;
    if (!keyToSend) {
        return;
    }

    sendEvent('letter', keyToSend);
    typewriterInput.value = '';
});

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
    const mode = getInstantType();
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
sanitizeToggleEl.checked = localStorage.getItem('rk_sanitize_before_send') !== '0';
denyShortcutsToggleEl.checked = localStorage.getItem('rk_deny_shortcuts_enabled') !== '0';
shortcutDenylistEl.value = localStorage.getItem('rk_shortcut_denylist') || DEFAULT_DENYLIST;

sanitizeToggleEl.addEventListener('change', () => {
    localStorage.setItem('rk_sanitize_before_send', sanitizeToggleEl.checked ? '1' : '0');
});

denyShortcutsToggleEl.addEventListener('change', () => {
    localStorage.setItem('rk_deny_shortcuts_enabled', denyShortcutsToggleEl.checked ? '1' : '0');
});

shortcutDenylistEl.addEventListener('change', () => {
    localStorage.setItem('rk_shortcut_denylist', shortcutDenylistEl.value.trim());
    refreshDenylist();
});

applyInstantTypeUi(getInstantType());
refreshDenylist();

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
setDeliveryStatus('No events sent yet.');
