# Remote Keyboard Web

A web-based version of the Remote Keyboard app that allows you to type on your computer from anywhere over the internet using a room code.

## Architecture
This project is split into two parts:
1. **Server (Node.js + Socket.io)**: A central WebSocket server that routes keystrokes from the web sender to the desktop receiver using a 4-digit room code.
2. **Client (Python)**: A desktop script that connects to the server, joins a room, and simulates keystrokes using `pyautogui`.

## Deployment (Vercel & Render)
- **Frontend**: The `server/public` folder can be deployed directly to Vercel as a static site.
- **Backend**: Vercel Serverless Functions do not support long-lived WebSockets (like Socket.io). You should deploy the `server` folder to a platform that supports WebSockets, such as **Render**, **Railway**, or **Heroku**.

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
- Enter a 4-digit room code (e.g., `1234`).

### 3. Connect from the Web
- Open `http://localhost:3000` (or your deployed Vercel URL) on your phone or another device.
- Enter the same 4-digit room code.
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
