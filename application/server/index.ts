import { WebSocketServer, WebSocket } from 'ws';
import type { ClientMessage, ServerMessage, ChatMessage, SystemMessage } from '../shared/types';

const PORT = 4000;
const HOST = '0.0.0.0'; // Bind to all network interfaces for LAN access

interface Client {
  ws: WebSocket;
  username: string | null;
}

const clients = new Map<WebSocket, Client>();

const wss = new WebSocketServer({
  port: PORT,
  host: HOST
});

// Logging utility
const log = {
  info: (msg: string) => console.log(`[WS Server] ${new Date().toISOString()} - ${msg}`),
  error: (msg: string) => console.error(`[WS Server ERROR] ${new Date().toISOString()} - ${msg}`),
  client: (username: string | null, msg: string) =>
    console.log(`[WS Server] ${new Date().toISOString()} - [${username || 'Anonymous'}] ${msg}`)
};

// Broadcast message to all connected clients
function broadcast(message: ServerMessage, excludeWs?: WebSocket) {
  const payload = JSON.stringify(message);
  clients.forEach((client, ws) => {
    if (ws !== excludeWs && ws.readyState === WebSocket.OPEN && client.username) {
      ws.send(payload);
    }
  });
}

// Send user list to all clients
function sendUserList() {
  const users = Array.from(clients.values())
    .filter(c => c.username)
    .map(c => c.username!);

  broadcast({
    type: 'user_list',
    users
  });
}

wss.on('listening', () => {
  log.info(`WebSocket server started on ${HOST}:${PORT}`);
  log.info(`Accessible on LAN - clients should connect to ws://<your-lan-ip>:${PORT}`);
  log.info(`Waiting for clients to connect...`);
});

wss.on('connection', (ws: WebSocket) => {
  const client: Client = { ws, username: null };
  clients.set(ws, client);

  log.info(`New connection established (Total: ${clients.size})`);

  ws.on('message', (data: Buffer) => {
    try {
      const message: ClientMessage = JSON.parse(data.toString());

      if (message.type === 'join') {
        // Handle user joining
        client.username = message.username;
        log.client(client.username, 'joined the chat');

        // Send system message to all users
        const systemMessage: SystemMessage = {
          type: 'system',
          text: `${client.username} joined the chat`,
          timestamp: Date.now()
        };
        broadcast(systemMessage);

        // Send updated user list
        sendUserList();

      } else if (message.type === 'chat') {
        // Handle chat message
        if (!client.username) {
          log.error('Chat message from client without username');
          return;
        }

        log.client(client.username, message.text);

        const chatMessage: ChatMessage = {
          type: 'chat',
          text: message.text,
          username: client.username,
          timestamp: Date.now()
        };

        // Broadcast to all clients including sender
        broadcast(chatMessage);
      }
    } catch (err) {
      log.error(`Failed to parse message: ${err}`);
    }
  });

  ws.on('close', () => {
    const username = client.username;
    clients.delete(ws);

    if (username) {
      log.client(username, 'left the chat');

      // Notify others
      const systemMessage: SystemMessage = {
        type: 'system',
        text: `${username} left the chat`,
        timestamp: Date.now()
      };
      broadcast(systemMessage);

      // Send updated user list
      sendUserList();
    }

    log.info(`Connection closed (Total: ${clients.size})`);
  });

  ws.on('error', (error) => {
    log.error(`WebSocket error: ${error.message}`);
  });
});

wss.on('error', (error) => {
  log.error(`Server error: ${error.message}`);
});

process.on('SIGTERM', () => {
  log.info('SIGTERM received, closing server...');
  wss.close(() => {
    log.info('Server closed');
    process.exit(0);
  });
});
