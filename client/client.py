import socketio
import pyautogui
import sys
import time

# Create a Socket.IO client
sio = socketio.Client()

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
    # The room code is passed via a global variable or closure in a real app,
    # but here we'll just emit it if we have it stored.
    if hasattr(sio, 'room_code'):
        sio.emit('join-room', (sio.room_code, 'receiver'))
        print(f"[+] Joined room: {sio.room_code}")
        print("[*] Waiting for keystrokes... (Press Ctrl+C to exit)")

@sio.event
def disconnect():
    print("\n[-] Disconnected from server.")

@sio.on('keystroke')
def on_keystroke(data):
    msg_type = data.get('type')
    payload = data.get('payload')
    
    if msg_type == 'letter':
        KeyboardController.press_key(payload)
    elif msg_type in ['word', 'block']:
        KeyboardController.type_text(payload)

def main():
    print("=== Remote Keyboard Desktop Client ===")
    server_url = input("Enter the server URL (e.g., http://localhost:3000): ").strip()
    if not server_url:
        server_url = "http://localhost:3000"
        
    room_code = input("Enter a 4-digit room code to create/join: ").strip()
    if not room_code:
        print("Room code is required.")
        sys.exit(1)
        
    # Store room code on the sio object so the connect event can use it
    sio.room_code = room_code
    
    try:
        print(f"[*] Connecting to {server_url}...")
        sio.connect(server_url)
        sio.wait()
    except socketio.exceptions.ConnectionError as e:
        print(f"[!] Connection failed: {e}")
    except KeyboardInterrupt:
        print("\n[*] Exiting...")
        sio.disconnect()

if __name__ == '__main__':
    main()
