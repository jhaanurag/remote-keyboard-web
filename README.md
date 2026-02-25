# Remote Keyboard Web

Remote Keyboard Web lets you type on a desktop machine from a phone/browser using a shared room code.

It supports two transport modes:
- `WebSocket` for low-latency live typing
- `HTTP Polling` for environments where WebSockets are unavailable or unreliable

## Features
- Web sender UI with instant mode and button mode
- Desktop Python receiver that simulates key input using `pyautogui`
- Client startup mode selection: `internet` or `local` (LAN)
- Runtime transport switching in web UI (`WebSocket` <-> `HTTP Polling`)
- Room-based routing via room code
- Test coverage for socket routing and polling endpoints

## Project Structure

```text
remote-keyboard-web/
  client/
    client.py
    requirements.txt
    tests/
  server/
    server.js
    package.json
    public/
      index.html
      script.js
      style.css
    tests/
  README.md
```

## Architecture

### 1) Server (`Node.js + Express + Socket.io`)
- Serves the web app from `server/public`
- Accepts sender events and routes them by room code
- Supports both:
  - Socket events (`join-room`, `keystroke`)
  - HTTP event queue API (`/api/rooms/:roomCode/events`)

### 2) Desktop Receiver (`Python`)
- Supports two top-level modes:
  - `internet`: connects to hosted/local Node backend with `websocket` or `http-polling`
  - `local`: starts a local FastAPI WebSocket server on LAN (`0.0.0.0:8000`)
- Converts incoming events into key actions using `pyautogui`

## Transport Modes

### WebSocket mode
Best when backend supports long-lived connections.
- Lowest latency
- Real-time event delivery
- Requires a host that supports WebSockets

### HTTP polling mode
Fallback for free/serverless setups or cold-start-prone environments.
- Works over standard HTTP endpoints
- Slightly higher latency (receiver polls every ~0.6s)
- Useful when WebSocket connections fail

## Local Setup

### Prerequisites
- Node.js 18+
- Python 3.9+

### 1) Run server

```bash
cd server
npm install
npm start
```

Server runs at `http://localhost:3000` (or `PORT` env var).

### 2) Run desktop receiver

```bash
cd client
pip install -r requirements.txt
python client.py
```

Prompts:
- Mode (`internet` or `local`)
- If `internet`:
  - Server URL (example: `http://localhost:3000`)
  - Room code (example: `1234`)
  - Transport (`websocket` or `http-polling`)
- If `local`:
  - Starts local LAN server on `http://0.0.0.0:8000`
  - Serves built-in local web sender UI at `/`
  - WebSocket endpoint is `/ws`
  - Open from your phone using your computer IP, for example `http://192.168.1.20:8000`

### 3) Use web sender
- Open `http://localhost:3000`
- Enter same room code in top field
- Select transport from top dropdown
- Type using:
  - `Instant Mode` (letter/word send)
  - `Button Mode` (send full block)

## Deployment

### Recommended split deploy
- Frontend/static UI: Vercel (or any static host)
- Backend/server: Render / Railway / Fly.io / any Node host

Reason: Vercel serverless functions are not ideal for long-lived Socket.io sessions.

### If using Render free tier
- Cold starts can delay initial response
- Use `HTTP Polling` mode during warm-up
- Switch back to `WebSocket` when server is fully active

## API Reference

### `GET /api/health`
Health check.

Response:
```json
{ "ok": true }
```

### `POST /api/rooms/:roomCode/events`
Queue an event for polling receivers.

Request body:
```json
{
  "type": "letter",
  "payload": "a"
}
```

Response:
- `202 Accepted` on success
- `400` if required fields are missing

### `GET /api/rooms/:roomCode/events?since=<id>`
Fetch queued events after a given event id.

Response:
```json
{
  "events": [
    { "id": 1, "type": "letter", "payload": "a", "ts": 1739980000000 }
  ],
  "nextSince": 1
}
```

## Test Commands

### Server tests

```bash
cd server
npm test
```

### Client tests

```bash
cd client
pytest tests/
```

## Security Notes
- Current room code model is simple and unauthenticated.
- Anyone with server URL + room code can send input.
- Do not expose this publicly without adding auth/room secrets/rate limits.

## Known Limits
- Polling mode adds latency versus WebSocket mode
- Event queue is in-memory (not persistent storage)
- Queue retention is time-based and process-local
- Local mode currently runs on fixed port `8000`

## TODO
- [x] Add transport toggle in web UI (`WebSocket` / `HTTP Polling`)
- [x] Add HTTP polling event APIs on server
- [x] Support polling transport in desktop Python client
- [x] Add local mode option in desktop client (LAN FastAPI WebSocket server)
- [ ] Add `both` startup mode (run local + internet receivers together with conflict policy)
- [ ] Add room authentication (secret/token)
- [ ] Move event queue to persistent store (optional)
- [ ] Add end-to-end test for sender -> receiver across both transports
