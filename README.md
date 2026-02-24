# Remote Keyboard Web

A web-based version of the Remote Keyboard app that allows you to type on your computer from anywhere over the internet using a room code.

## Architecture
This project is split into two parts:
1. **Server (Node.js + Socket.io + HTTP API)**: Routes keystrokes by room code. Supports both:
- WebSocket (`socket.io`) transport
- HTTP event queue transport (for polling clients)
2. **Client (Python)**: Desktop receiver with transport choice (`websocket` or `http-polling`) that simulates keystrokes using `pyautogui`.

## Deployment (Vercel & Render)
- **Frontend**: The `server/public` folder can be deployed directly to Vercel as a static site.
- **Backend**:
- WebSocket mode needs a host that supports long-lived connections (Render, Railway, Heroku, etc).
- HTTP polling mode works over normal HTTP endpoints (`/api/rooms/:roomCode/events`) and can be used when WebSockets are unavailable.

## Setup Instructions

### 1. Run the Server (Local or Cloud)
```bash
cd server
npm install
npm start
```
The server will run on `http://localhost:3000`.

### 2. Run the Desktop Client
```bash
cd client
pip install -r requirements.txt
python client.py
```
- Enter the server URL (e.g., `http://localhost:3000` or your deployed Render URL).
- Enter a room code (e.g., `1234`).
- Choose transport: `websocket` or `http-polling`.

### 3. Connect from the Web
- Open `http://localhost:3000` (or your deployed Vercel URL) on your phone or another device.
- Enter the same room code in the top field.
- Use the top transport toggle to switch between `WebSocket` and `HTTP Polling`.
- Start typing!

## Running Tests

### Server Tests (Node.js)
```bash
cd server
npm test
```

### Client Tests (Python)
```bash
cd client
pytest tests/
```

## TODO
- [x] Add transport toggle in web UI (`WebSocket` / `HTTP Polling`).
- [x] Add HTTP polling event APIs on server.
- [x] Support polling transport in desktop Python client.
- [ ] Add authentication or per-room secret to prevent unauthorized typing.
- [ ] Add message TTL/cleanup configuration via environment variables.
- [ ] Add end-to-end test for web sender -> polling receiver flow.
