import sys
import time
from urllib.parse import quote

import pyautogui
import requests
import socketio

sio = socketio.Client()
POLL_INTERVAL_SECONDS = 0.6


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
    handle_keystroke(msg_type, payload)


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


def main():
    print("=== Remote Keyboard Desktop Client ===")
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

    try:
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
