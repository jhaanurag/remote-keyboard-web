import sys
import time
from urllib.parse import quote

import pyautogui
import requests
import socketio
import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse

sio = socketio.Client()
POLL_INTERVAL_SECONDS = 0.6
LOCAL_HOST = "0.0.0.0"
LOCAL_PORT = 8000


class KeyboardController:
    """
    Handles the actual simulation of keystrokes on the host machine.
    """

    @staticmethod
    def type_text(text: str):
        if text:
            pyautogui.write(text)

    @staticmethod
    def press_key(key: str):
        key_map = {
            'Backspace': 'backspace',
            'Enter': 'enter',
            'Space': 'space',
            'Tab': 'tab',
            'Escape': 'esc',
            'ArrowUp': 'up',
            'ArrowDown': 'down',
            'ArrowLeft': 'left',
            'ArrowRight': 'right'
        }

        mapped_key = key_map.get(key, key)

        if len(mapped_key) == 1:
            pyautogui.write(mapped_key)
        elif mapped_key in pyautogui.KEY_NAMES:
            pyautogui.press(mapped_key)
        else:
            print(f"Warning: Unrecognized key '{key}' ignored.")


@sio.event
def connect():
    print("\n[+] Connected to the server successfully!")
    if hasattr(sio, 'room_code'):
        sio.emit('join-room', sio.room_code, 'receiver')
        print(f"[+] Joined room: {sio.room_code}")
        print("[*] Waiting for keystrokes... (Press Ctrl+C to exit)")


@sio.event
def disconnect():
    print("\n[-] Disconnected from server.")


def handle_keystroke(msg_type, payload):
    if msg_type == 'letter':
        KeyboardController.press_key(payload)
    elif msg_type in ['word', 'block']:
        KeyboardController.type_text(payload)


@sio.on('keystroke')
def on_keystroke(data):
    msg_type = data.get('type')
    payload = data.get('payload')
    room_code = data.get('roomCode') or getattr(sio, 'room_code', None)
    event_id = data.get('eventId')
    client_event_id = data.get('clientEventId')

    try:
        handle_keystroke(msg_type, payload)
        if room_code and event_id:
            sio.emit('execution-ack', {
                'roomCode': room_code,
                'eventId': event_id,
                'clientEventId': client_event_id,
                'ok': True
            })
    except Exception as error:
        print(f"[!] Keystroke execution error: {error}")
        if room_code and event_id:
            sio.emit('execution-ack', {
                'roomCode': room_code,
                'eventId': event_id,
                'clientEventId': client_event_id,
                'ok': False,
                'error': str(error)
            })


def fetch_events(server_url, room_code, since_id):
    url = f"{server_url}/api/rooms/{quote(room_code)}/events"
    response = requests.get(url, params={'since': since_id}, timeout=20)
    response.raise_for_status()
    return response.json()


def run_polling_client(server_url, room_code):
    print(f"[*] Polling {server_url} room {room_code}...")
    since_id = 0

    while True:
        try:
            payload = fetch_events(server_url, room_code, since_id)
            for event in payload.get('events', []):
                handle_keystroke(event.get('type'), event.get('payload'))
            since_id = payload.get('nextSince', since_id)
            time.sleep(POLL_INTERVAL_SECONDS)
        except requests.RequestException as error:
            print(f"[!] Polling error: {error}")
            time.sleep(2)


def run_websocket_client(server_url, room_code):
    sio.room_code = room_code
    print(f"[*] Connecting to {server_url} using WebSocket...")
    sio.connect(server_url)
    sio.wait()


def normalize_url(server_url):
    return server_url.rstrip('/')


def run_local_mode():
    app = FastAPI(title="Remote Keyboard Local Mode")
    local_page = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Remote Keyboard (Local)</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; background: #f4f4f9; }
    .container { max-width: 520px; margin: 0 auto; background: white; padding: 16px; border-radius: 10px; box-shadow: 0 6px 14px rgba(0,0,0,0.08); }
    h1 { margin-top: 0; font-size: 1.4rem; }
    .tabs { display: flex; margin-bottom: 12px; border: 1px solid #ddd; border-radius: 8px; overflow: hidden; }
    .tab-btn { flex: 1; padding: 10px; border: none; cursor: pointer; font-weight: 700; background: #f8f9fa; }
    .tab-btn.active { background: #007bff; color: #fff; }
    .mode-section { display: none; }
    .mode-section.active { display: block; }
    input[type="text"], textarea, button { width: 100%; box-sizing: border-box; padding: 10px; margin-bottom: 8px; border-radius: 8px; border: 1px solid #ccc; font-size: 16px; }
    button { border: none; background: #28a745; color: white; font-weight: 700; cursor: pointer; }
    .controls { display: flex; justify-content: space-around; flex-wrap: wrap; gap: 8px 12px; margin-bottom: 10px; background: #f8f9fa; border-radius: 8px; padding: 8px; }
    .toggle-row { display: flex; align-items: center; gap: 8px; font-size: 13px; margin-bottom: 8px; }
    .toggle-row input[type="checkbox"] { width: auto; margin: 0; }
    .status { text-align: center; font-weight: 700; margin-top: 8px; }
    .delivery-status { text-align: center; font-size: 12px; margin-top: 6px; }
    .ok { color: #28a745; }
    .warn { color: #b8860b; }
    .error { color: #dc3545; }
    .connected { color: #28a745; }
    .disconnected { color: #dc3545; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Remote Keyboard (Local)</h1>
    <div class="tabs">
      <button class="tab-btn active" onclick="switchTab('instant')">Instant Mode</button>
      <button class="tab-btn" onclick="switchTab('button')">Button Mode</button>
    </div>
    <div id="instant-mode" class="mode-section active">
      <div class="controls">
        <label><input type="radio" name="instant-type" value="letter" checked> Letter</label>
        <label><input type="radio" name="instant-type" value="word"> Word</label>
        <label><input type="radio" name="instant-type" value="typewriter"> Typewriter</label>
      </div>
      <label class="toggle-row"><input id="sanitize-toggle" type="checkbox" checked>Sanitize before sending</label>
      <label class="toggle-row"><input id="deny-shortcuts-toggle" type="checkbox" checked>Block denied shortcuts</label>
      <input id="shortcut-denylist" type="text" placeholder="Ctrl+W, Ctrl+R, Alt+F4, Meta+Q" autocomplete="off">
      <input id="letter-input" type="text" placeholder="Type here..." autocomplete="off">
      <div id="word-wrap" style="display:none;">
        <textarea id="word-input" rows="3" placeholder="Type or paste"></textarea>
        <button onclick="manualSendWord()">Send</button>
      </div>
      <div id="typewriter-wrap" style="display:none;">
        <input id="typewriter-input" type="text" placeholder="Type naturally; keys send instantly" autocomplete="off">
      </div>
    </div>
    <div id="button-mode" class="mode-section">
      <textarea id="button-input" rows="5" placeholder="Type your full message"></textarea>
      <button onclick="sendBlock()">Send Message</button>
    </div>
    <div id="status" class="status disconnected">Disconnected</div>
    <div id="delivery-status" class="delivery-status">No events sent yet.</div>
  </div>
  <script>
    const scheme = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${scheme}://${window.location.host}/ws`);
    const statusEl = document.getElementById("status");
    const deliveryStatusEl = document.getElementById("delivery-status");
    const letterInput = document.getElementById("letter-input");
    const wordInput = document.getElementById("word-input");
    const wordWrap = document.getElementById("word-wrap");
    const typewriterInput = document.getElementById("typewriter-input");
    const typewriterWrap = document.getElementById("typewriter-wrap");
    const sanitizeToggleEl = document.getElementById("sanitize-toggle");
    const denyShortcutsToggleEl = document.getElementById("deny-shortcuts-toggle");
    const shortcutDenylistEl = document.getElementById("shortcut-denylist");

    const COMMAND_KEYS = new Set(['Backspace', 'Delete', 'Enter', 'Tab', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown']);
    const MODIFIER_ONLY_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'AltGraph', 'CapsLock', 'NumLock', 'ScrollLock', 'Fn', 'ContextMenu', 'OS']);
    const DEFAULT_DENYLIST = 'Ctrl+W,Ctrl+R,Alt+F4,Meta+Q';
    const ACK_TIMEOUT_MS = 6000;

    let nextClientEventId = Number.parseInt(localStorage.getItem('rk_local_next_client_event_id') || '1', 10);
    let deniedShortcuts = new Set();
    const pendingAcks = new Map();

    function setDeliveryStatus(text, tone = '') {
      deliveryStatusEl.textContent = text;
      deliveryStatusEl.className = `delivery-status ${tone}`.trim();
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
      if (['cmd', 'command', 'meta', 'win', 'super'].includes(key)) return 'Meta';
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
      if (parts.length < 2) return '';

      const modifiers = [];
      for (let i = 0; i < parts.length - 1; i++) {
        const modifier = normalizeModifierName(parts[i]);
        if (!modifier) return '';
        if (!modifiers.includes(modifier)) modifiers.push(modifier);
      }

      const main = normalizeShortcutMain(parts[parts.length - 1]);
      if (!main) return '';
      return `${modifiers.sort().join('+')}+${main}`;
    }

    function refreshDenylist() {
      deniedShortcuts = new Set(
        shortcutDenylistEl.value
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
      if (modifiers.length === 0) return '';

      const main = normalizeShortcutMain(rawKey);
      if (!main) return '';
      return `${modifiers.sort().join('+')}+${main}`;
    }

    function isShortcutDenied(event, rawKey) {
      if (!denyShortcutsToggleEl.checked) return '';
      const shortcut = keyboardEventToShortcut(event, rawKey);
      if (!shortcut) return '';
      return deniedShortcuts.has(shortcut) ? shortcut : '';
    }

    function sanitizeLetterKey(rawKey, keyboardEvent) {
      const key = normalizeKeyName(rawKey);
      if (MODIFIER_ONLY_KEYS.has(key)) return null;
      if (keyboardEvent && (keyboardEvent.ctrlKey || keyboardEvent.metaKey || keyboardEvent.altKey)) return null;
      if (key.length === 1 || COMMAND_KEYS.has(key)) return key;
      return null;
    }

    function nextEventId() {
      if (!Number.isFinite(nextClientEventId) || nextClientEventId < 1) nextClientEventId = 1;
      const current = nextClientEventId;
      nextClientEventId += 1;
      localStorage.setItem('rk_local_next_client_event_id', String(nextClientEventId));
      return current;
    }

    function send(type, payload) {
      if (ws.readyState !== WebSocket.OPEN) return;
      const clientEventId = nextEventId();
      ws.send(JSON.stringify({ type, payload, clientEventId }));

      const timer = setTimeout(() => {
        if (!pendingAcks.has(clientEventId)) return;
        pendingAcks.delete(clientEventId);
        setDeliveryStatus(`No execution ACK yet for client event ${clientEventId}`, 'warn');
      }, ACK_TIMEOUT_MS);

      pendingAcks.set(clientEventId, { timer });
      setDeliveryStatus(`Sent client event ${clientEventId}`);
    }

    function getInstantType() {
      const selected = document.querySelector('input[name="instant-type"]:checked');
      return selected ? selected.value : 'letter';
    }

    function applyInstantType(mode) {
      if (mode === 'letter') {
        letterInput.style.display = '';
        wordWrap.style.display = 'none';
        typewriterWrap.style.display = 'none';
      } else if (mode === 'word') {
        letterInput.style.display = 'none';
        wordWrap.style.display = '';
        typewriterWrap.style.display = 'none';
      } else {
        letterInput.style.display = 'none';
        wordWrap.style.display = 'none';
        typewriterWrap.style.display = '';
      }
    }

    ws.onopen = () => {
      statusEl.textContent = "Connected";
      statusEl.className = "status connected";
    };

    ws.onclose = () => {
      statusEl.textContent = "Disconnected";
      statusEl.className = "status disconnected";
    };

    ws.onmessage = (event) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch (_) {
        return;
      }

      const clientEventId = data.clientEventId;
      if (!clientEventId || !pendingAcks.has(clientEventId)) return;

      if (data.kind === 'delivery-ack') {
        setDeliveryStatus(`Queued #${data.eventId}`);
        return;
      }

      if (data.kind === 'execution-ack') {
        const record = pendingAcks.get(clientEventId);
        clearTimeout(record.timer);
        pendingAcks.delete(clientEventId);

        if (data.ok === false) {
          setDeliveryStatus(`Execution failed #${data.eventId}: ${data.error || 'unknown error'}`, 'error');
        } else {
          setDeliveryStatus(`Executed #${data.eventId}`, 'ok');
        }
      }
    };

    function switchTab(tab) {
      document.querySelectorAll('.mode-section').forEach(el => el.classList.remove('active'));
      document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
      document.getElementById(`${tab}-mode`).classList.add('active');
      if (window.event && window.event.target) window.event.target.classList.add('active');
    }

    document.querySelectorAll('input[name="instant-type"]').forEach(radio => {
      radio.addEventListener('change', (e) => applyInstantType(e.target.value));
    });

    letterInput.addEventListener('input', () => {
      const val = letterInput.value;
      if (!val) return;
      send('letter', val[val.length - 1]);
      letterInput.value = '';
    });

    letterInput.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' || e.key === 'Enter') send('letter', e.key);
    });

    typewriterInput.addEventListener('keydown', (e) => {
      const rawKey = normalizeKeyName(e.key);
      const denied = isShortcutDenied(e, rawKey);

      e.preventDefault();
      if (denied) {
        setDeliveryStatus(`Blocked shortcut: ${denied}`, 'warn');
        return;
      }

      const keyToSend = sanitizeToggleEl.checked ? sanitizeLetterKey(rawKey, e) : rawKey;
      if (!keyToSend) return;

      send('letter', keyToSend);
      typewriterInput.value = '';
    });

    function sendWordContent() {
      const val = wordInput.value.trim();
      if (!val) return;
      send('word', `${val} `);
      wordInput.value = '';
    }

    function manualSendWord() {
      sendWordContent();
      wordInput.focus();
    }

    wordInput.addEventListener('input', () => {
      if (wordInput.value.endsWith(' ')) sendWordContent();
    });

    wordInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        sendWordContent();
      }
    });

    function sendBlock() {
      const box = document.getElementById('button-input');
      if (!box.value) return;
      send('block', box.value);
      box.value = '';
    }

    sanitizeToggleEl.checked = localStorage.getItem('rk_local_sanitize_before_send') !== '0';
    denyShortcutsToggleEl.checked = localStorage.getItem('rk_local_deny_shortcuts_enabled') !== '0';
    shortcutDenylistEl.value = localStorage.getItem('rk_local_shortcut_denylist') || DEFAULT_DENYLIST;

    sanitizeToggleEl.addEventListener('change', () => {
      localStorage.setItem('rk_local_sanitize_before_send', sanitizeToggleEl.checked ? '1' : '0');
    });

    denyShortcutsToggleEl.addEventListener('change', () => {
      localStorage.setItem('rk_local_deny_shortcuts_enabled', denyShortcutsToggleEl.checked ? '1' : '0');
    });

    shortcutDenylistEl.addEventListener('change', () => {
      localStorage.setItem('rk_local_shortcut_denylist', shortcutDenylistEl.value.trim());
      refreshDenylist();
    });

    refreshDenylist();
    applyInstantType(getInstantType());

    window.switchTab = switchTab;
    window.manualSendWord = manualSendWord;
    window.sendBlock = sendBlock;
  </script>
</body>
</html>"""

    local_event_state = {'next_event_id': 1}

    @app.get("/health")
    async def health():
        return {"ok": True, "mode": "local"}

    @app.get("/", response_class=HTMLResponse)
    async def local_index():
        return local_page

    @app.websocket("/ws")
    async def websocket_endpoint(websocket: WebSocket):
        await websocket.accept()
        print("[+] Local WebSocket sender connected.")
        try:
            while True:
                message = await websocket.receive_json()
                msg_type = message.get('type')
                payload = message.get('payload')
                client_event_id = message.get('clientEventId')

                if msg_type is None or payload is None:
                    continue

                event_id = local_event_state['next_event_id']
                local_event_state['next_event_id'] += 1

                await websocket.send_json({
                    'kind': 'delivery-ack',
                    'eventId': event_id,
                    'clientEventId': client_event_id
                })

                try:
                    handle_keystroke(msg_type, payload)
                    await websocket.send_json({
                        'kind': 'execution-ack',
                        'eventId': event_id,
                        'clientEventId': client_event_id,
                        'ok': True
                    })
                except Exception as error:
                    await websocket.send_json({
                        'kind': 'execution-ack',
                        'eventId': event_id,
                        'clientEventId': client_event_id,
                        'ok': False,
                        'error': str(error)
                    })
        except WebSocketDisconnect:
            print("[-] Local WebSocket sender disconnected.")
        except Exception as error:
            print(f"[!] Local mode message error: {error}")

    print("[*] Starting local mode server...")
    print(f"[*] Open on your phone: http://<your-local-ip>:{LOCAL_PORT}")
    print("[*] Local mode endpoint: /ws")
    uvicorn.run(app, host=LOCAL_HOST, port=LOCAL_PORT)


def main():
    print("=== Remote Keyboard Desktop Client ===")
    mode = input("Mode [internet/local] (default internet): ").strip().lower()
    if mode in ('', 'internet', 'online'):
        mode = 'internet'
    elif mode in ('local', 'lan'):
        mode = 'local'
    else:
        print("Unknown mode. Use internet or local.")
        sys.exit(1)

    try:
        if mode == 'local':
            run_local_mode()
        else:
            server_url = input("Enter server URL (e.g., http://localhost:3000): ").strip()
            if not server_url:
                server_url = "http://localhost:3000"

            room_code = input("Enter room code to create/join: ").strip()
            if not room_code:
                print("Room code is required.")
                sys.exit(1)

            transport = input("Transport [websocket/http-polling] (default websocket): ").strip().lower()
            if transport in ('', 'websocket', 'ws'):
                transport = 'websocket'
            elif transport in ('http-polling', 'polling', 'http'):
                transport = 'http-polling'
            else:
                print("Unknown transport. Use websocket or http-polling.")
                sys.exit(1)

            server_url = normalize_url(server_url)

            if transport == 'websocket':
                run_websocket_client(server_url, room_code)
            else:
                run_polling_client(server_url, room_code)
    except socketio.exceptions.ConnectionError as error:
        print(f"[!] Connection failed: {error}")
    except KeyboardInterrupt:
        print("\n[*] Exiting...")
        if sio.connected:
            sio.disconnect()


if __name__ == '__main__':
    main()
