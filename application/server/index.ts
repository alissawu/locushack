import { config } from 'dotenv';
import { WebSocketServer, WebSocket } from 'ws';
import type { ClientMessage, ServerMessage, ChatMessage, SystemMessage, AgentMessage, AgentProgressMessage, AgentTypingMessage } from '../shared/types';
import { LocusAgent } from './agent';

// Load from application/.env.local first, fallback to root
config({ path: '.env.local' });
config({ path: '../.env.local' });
config({ path: '../.env' });

// Verify env vars loaded
console.log('[Server] Environment check:', {
  LOCUS_API_KEY: process.env.LOCUS_API_KEY ? `${process.env.LOCUS_API_KEY.substring(0, 10)}...` : 'MISSING',
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ? `${process.env.ANTHROPIC_API_KEY.substring(0, 10)}...` : 'MISSING'
});

const PORT = 4000;
const HOST = '0.0.0.0'; // Bind to all network interfaces for LAN access

interface Client {
  ws: WebSocket;
  username: string | null;
}

const clients = new Map<WebSocket, Client>();
const chatHistory: ChatMessage[] = [];
const allMessages: ServerMessage[] = []; // Store all messages for new clients

// Logging utility
const log = {
  info: (msg: string) => console.log(`[WS Server] ${new Date().toISOString()} - ${msg}`),
  error: (msg: string) => console.error(`[WS Server ERROR] ${new Date().toISOString()} - ${msg}`),
  client: (username: string | null, msg: string) =>
    console.log(`[WS Server] ${new Date().toISOString()} - [${username || 'Anonymous'}] ${msg}`)
};

// Initialize Locus agent
const agent = new LocusAgent(
  process.env.LOCUS_API_KEY || '',
  process.env.ANTHROPIC_API_KEY || ''
);
log.info('Agent initialized');

const wss = new WebSocketServer({
  port: PORT,
  host: HOST
});

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

        // Send all previous messages to the new user
        log.info(`Sending ${allMessages.length} previous messages to ${client.username}`);
        allMessages.forEach(msg => {
          ws.send(JSON.stringify(msg));
        });

        // Send system message to all users
        const systemMessage: SystemMessage = {
          type: 'system',
          text: `${client.username} joined the chat`,
          timestamp: Date.now()
        };
        allMessages.push(systemMessage);
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

        // Store in history
        chatHistory.push(chatMessage);
        // Keep only last 50 messages
        if (chatHistory.length > 50) {
          chatHistory.shift();
        }

        // Store in all messages for new users
        allMessages.push(chatMessage);

        // Broadcast to all clients including sender
        broadcast(chatMessage);

        // Check for @locus mention
        if (message.text.includes('@locus')) {
          log.info('🤖 Agent triggered by @locus mention');

          // Send typing indicator
          const typingStart: AgentTypingMessage = {
            type: 'agent_typing',
            isTyping: true
          };
          broadcast(typingStart);

          // Trigger agent (async, doesn't block)
          agent.processMessage(
            message.text,
            chatHistory,
            // Progress callback
            (toolName, elapsed) => {
              const progressMessage: AgentProgressMessage = {
                type: 'agent_progress',
                text: `Using ${toolName.replace('mcp__locus__', '')}...`,
                tool_name: toolName,
                elapsed_time: elapsed
              };
              allMessages.push(progressMessage);
              broadcast(progressMessage);
            },
            // Response callback
            (text, toolsUsed) => {
              // Stop typing indicator
              const typingEnd: AgentTypingMessage = {
                type: 'agent_typing',
                isTyping: false
              };
              broadcast(typingEnd);

              const agentResponse: AgentMessage = {
                type: 'agent',
                text,
                timestamp: Date.now(),
                tool_uses: toolsUsed
              };
              allMessages.push(agentResponse);
              broadcast(agentResponse);
              log.info(`🤖 Agent response sent (used ${toolsUsed.length} tools)`);
            }
          ).catch(err => {
            log.error(`Agent error: ${err.message}`);

            // Stop typing indicator on error
            const typingEnd: AgentTypingMessage = {
              type: 'agent_typing',
              isTyping: false
            };
            broadcast(typingEnd);

            const errorMessage: SystemMessage = {
              type: 'system',
              text: '❌ Locus agent encountered an error',
              timestamp: Date.now()
            };
            allMessages.push(errorMessage);
            broadcast(errorMessage);
          });
        }
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
      allMessages.push(systemMessage);
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
