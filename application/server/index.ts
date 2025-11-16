import { config } from 'dotenv';
import { WebSocketServer, WebSocket } from 'ws';
import type { ClientMessage, ServerMessage, ChatMessage, SystemMessage, AgentMessage, AgentProgressMessage, AgentTypingMessage, RoomState, Participant, RoomListMessage } from '../shared/types';
import { LocusAgent } from './agent';
import { randomBytes } from 'crypto';

// Load from application/.env.local first, fallback to root
config({ path: '.env.local' });
config({ path: '../.env.local' });
config({ path: '../.env' });

// Verify env vars loaded
console.log('[Server] Environment check:', {
  LOCUS_API_KEY: process.env.LOCUS_API_KEY ? `${process.env.LOCUS_API_KEY.substring(0, 10)}...` : 'MISSING',
  SUNNY_LOCUS_API_KEY: process.env.SUNNY_LOCUS_API_KEY ? `${process.env.SUNNY_LOCUS_API_KEY.substring(0, 10)}...` : 'MISSING',
  HOST_LOCUS_API_KEY: process.env.HOST_LOCUS_API_KEY ? `${process.env.HOST_LOCUS_API_KEY.substring(0, 10)}...` : 'MISSING',
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ? `${process.env.ANTHROPIC_API_KEY.substring(0, 10)}...` : 'MISSING'
});

const PORT = 4000;
const HOST = '0.0.0.0'; // Bind to all network interfaces for LAN access

interface Client {
  ws: WebSocket;
  apiKey: 'main' | 'sunny' | 'host';
  currentRoom: string | null;
  username: string | null;
  wallet: string | null;
}

// Room management
const rooms = new Map<string, RoomState>();
const clients = new Map<WebSocket, Client>();
const roomMessages = new Map<string, ServerMessage[]>(); // roomId -> messages
const roomChatHistory = new Map<string, ChatMessage[]>(); // roomId -> chat history

// Logging utility
const log = {
  info: (msg: string) => console.log(`[WS Server] ${new Date().toISOString()} - ${msg}`),
  error: (msg: string) => console.error(`[WS Server ERROR] ${new Date().toISOString()} - ${msg}`),
  client: (username: string | null, msg: string) =>
    console.log(`[WS Server] ${new Date().toISOString()} - [${username || 'Anonymous'}] ${msg}`)
};

// Initialize Locus agents (one per API key)
const agents = {
  main: new LocusAgent(
    process.env.LOCUS_API_KEY || '',
    process.env.ANTHROPIC_API_KEY || ''
  ),
  sunny: new LocusAgent(
    process.env.SUNNY_LOCUS_API_KEY || '',
    process.env.ANTHROPIC_API_KEY || ''
  ),
  host: new LocusAgent(
    process.env.HOST_LOCUS_API_KEY || '',
    process.env.ANTHROPIC_API_KEY || ''
  )
};
log.info('Agents initialized (main + sunny + host)');

const wss = new WebSocketServer({
  port: PORT,
  host: HOST
});

// Generate room ID
function generateRoomId(): string {
  return randomBytes(8).toString('hex');
}

// Broadcast message to all clients in a room
function broadcastToRoom(roomId: string, message: ServerMessage, excludeWs?: WebSocket) {
  const payload = JSON.stringify(message);
  clients.forEach((client, ws) => {
    if (ws !== excludeWs && ws.readyState === WebSocket.OPEN && client.currentRoom === roomId) {
      ws.send(payload);
    }
  });
}

// Send room list to a specific client
function sendRoomList(ws: WebSocket) {
  const roomList: RoomListMessage = {
    type: 'room_list',
    rooms: Array.from(rooms.values()).map(room => ({
      roomId: room.roomId,
      roomName: room.roomName,
      mode: room.mode,
      participantCount: room.participants.length
    }))
  };
  ws.send(JSON.stringify(roomList));
}

// Broadcast room list to all connected clients
function sendRoomListToAll() {
  const roomList: RoomListMessage = {
    type: 'room_list',
    rooms: Array.from(rooms.values()).map(room => ({
      roomId: room.roomId,
      roomName: room.roomName,
      mode: room.mode,
      participantCount: room.participants.length
    }))
  };
  const payload = JSON.stringify(roomList);
  clients.forEach((_, ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  });
}

// Send user list to all clients in a room
function sendUserListToRoom(roomId: string) {
  const room = rooms.get(roomId);
  if (!room) return;

  const users = room.participants.map(p => p.username);

  broadcastToRoom(roomId, {
    type: 'user_list',
    users
  });
}

// Poker session helpers
function recordBuyIn(roomId: string, player: string, amount: number): string {
  const room = rooms.get(roomId);
  if (!room) return 'Room not found';

  if (!room.pokerSession) {
    // Auto-create poker session on first buy-in
    room.pokerSession = {
      host: player, // First person to buy in becomes host
      buyIns: [],
      cashOuts: []
    };
  }

  room.pokerSession.buyIns.push({
    player,
    amount,
    timestamp: Date.now()
  });

  const totalPot = room.pokerSession.buyIns.reduce((sum, bi) => sum + bi.amount, 0);
  return `Recorded: ${player} bought in for $${amount}. Total pot: $${totalPot}`;
}

function recordCashOut(roomId: string, player: string, amount: number): string {
  const room = rooms.get(roomId);
  if (!room || !room.pokerSession) {
    return 'No poker session active. Start by recording a buy-in first.';
  }

  room.pokerSession.cashOuts.push({
    player,
    amount,
    timestamp: Date.now()
  });

  return `Recorded: ${player} cashing out $${amount}`;
}

function getPokerLedger(roomId: string): string {
  const room = rooms.get(roomId);
  if (!room || !room.pokerSession) {
    return 'No poker session active.';
  }

  const session = room.pokerSession;
  const totalBuyIns = session.buyIns.reduce((sum, bi) => sum + bi.amount, 0);
  const totalCashOuts = session.cashOuts.reduce((sum, co) => sum + co.amount, 0);

  let ledger = `**Poker Session Ledger**\n\n`;
  ledger += `**Buy-ins:**\n`;
  session.buyIns.forEach(bi => {
    ledger += `- ${bi.player}: $${bi.amount}\n`;
  });
  ledger += `Total: $${totalBuyIns}\n\n`;

  ledger += `**Cash Outs:**\n`;
  if (session.cashOuts.length === 0) {
    ledger += `- None yet\n`;
  } else {
    session.cashOuts.forEach(co => {
      ledger += `- ${co.player}: $${co.amount}\n`;
    });
  }
  ledger += `Total: $${totalCashOuts}\n\n`;

  const diff = totalBuyIns - totalCashOuts;
  if (diff === 0) {
    ledger += `✅ **Balanced** - Ready to settle!`;
  } else if (diff > 0) {
    ledger += `⚠️ **Unbalanced** - $${diff} remaining in pot`;
  } else {
    ledger += `❌ **Over by $${Math.abs(diff)}** - Cash outs exceed buy-ins!`;
  }

  return ledger;
}

function settlePokerSession(roomId: string, requestingPlayer: string): { success: boolean; message: string; payments?: Array<{to: string, amount: number}> } {
  const room = rooms.get(roomId);
  if (!room || !room.pokerSession) {
    return { success: false, message: 'No poker session active.' };
  }

  const session = room.pokerSession;

  // Check if requester is host
  if (session.host !== requestingPlayer) {
    return { success: false, message: `Only ${session.host} (the host) can settle the session.` };
  }

  const totalBuyIns = session.buyIns.reduce((sum, bi) => sum + bi.amount, 0);
  const totalCashOuts = session.cashOuts.reduce((sum, co) => sum + co.amount, 0);

  // Validate balance
  if (totalBuyIns !== totalCashOuts) {
    const diff = totalBuyIns - totalCashOuts;
    return {
      success: false,
      message: `❌ Cannot settle - amounts don't match!\n\nBuy-ins: $${totalBuyIns}\nCash outs: $${totalCashOuts}\nDifference: $${diff > 0 ? '+' : ''}${diff}\n\nPlease adjust the cash out amounts.`
    };
  }

  // Prepare payments
  const payments = session.cashOuts.map(co => {
    // Find participant with this username to get wallet
    const participant = room.participants.find(p => p.username === co.player);
    return {
      to: participant?.wallet || co.player, // Use wallet if available, else username
      amount: co.amount
    };
  });

  return {
    success: true,
    message: `✅ **Settlement Approved!**\n\nBuy-ins: $${totalBuyIns}\nCash outs: $${totalCashOuts}\n\nReady to pay:`,
    payments
  };
}

wss.on('listening', () => {
  log.info(`WebSocket server started on ${HOST}:${PORT}`);
  log.info(`Accessible on LAN - clients should connect to ws://<your-lan-ip>:${PORT}`);
  log.info(`Waiting for clients to connect...`);
});

wss.on('connection', (ws: WebSocket) => {
  const client: Client = {
    ws,
    apiKey: 'main',
    currentRoom: null,
    username: null,
    wallet: null
  };
  clients.set(ws, client);

  log.info(`New connection established (Total: ${clients.size})`);

  ws.on('message', (data: Buffer) => {
    try {
      const message: ClientMessage = JSON.parse(data.toString());

      if (message.type === 'connect') {
        // Handle initial connection with API key
        client.apiKey = message.apiKey;
        log.info(`Client connected with ${client.apiKey} API key`);

        // Send room list
        sendRoomList(ws);

      } else if (message.type === 'create_room') {
        // Handle room creation
        const roomId = generateRoomId();
        const newRoom: RoomState = {
          roomId,
          roomName: message.roomName,
          mode: message.mode,
          participants: [],
          contacts: {}
        };

        rooms.set(roomId, newRoom);
        roomMessages.set(roomId, []);
        roomChatHistory.set(roomId, []);

        log.info(`Room created: ${message.roomName} (${roomId}) - mode: ${message.mode}`);

        // Send room list to all clients
        clients.forEach((_, clientWs) => {
          sendRoomList(clientWs);
        });

        // Send room ID back to creator
        ws.send(JSON.stringify({
          type: 'system',
          roomId,
          text: `Room "${message.roomName}" created. Room ID: ${roomId}`,
          timestamp: Date.now()
        } as SystemMessage));

      } else if (message.type === 'join_room') {
        // Handle joining a room
        const room = rooms.get(message.roomId);
        if (!room) {
          ws.send(JSON.stringify({
            type: 'system',
            text: `Room not found: ${message.roomId}`,
            timestamp: Date.now()
          } as SystemMessage));
          return;
        }

        // If user is switching rooms, remove them from old room first
        const oldRoomId = client.currentRoom;
        if (oldRoomId && oldRoomId !== message.roomId) {
          const oldRoom = rooms.get(oldRoomId);
          if (oldRoom) {
            // Remove from old room's participants
            oldRoom.participants = oldRoom.participants.filter(p => p.username !== message.username);

            // Send leave message to old room
            const leaveMessage: SystemMessage = {
              type: 'system',
              roomId: oldRoomId,
              text: `${message.username} left the room`,
              timestamp: Date.now()
            };
            roomMessages.get(oldRoomId)?.push(leaveMessage);
            broadcastToRoom(oldRoomId, leaveMessage);

            // Update user list in old room
            sendUserListToRoom(oldRoomId);

            log.client(message.username, `left room ${oldRoom.roomName} (${oldRoomId})`);
          }
        }

        client.username = message.username;
        client.wallet = message.wallet || null;
        client.currentRoom = message.roomId;

        // Add participant to room
        const participant: Participant = {
          username: message.username,
          wallet: message.wallet,
          apiKey: client.apiKey
        };

        // Remove existing participant with same username (rejoin case)
        room.participants = room.participants.filter(p => p.username !== message.username);
        room.participants.push(participant);

        log.client(client.username, `joined room ${room.roomName} (${message.roomId}) with ${client.apiKey} API key`);

        // Send room history to new user
        const messages = roomMessages.get(message.roomId) || [];
        log.info(`Sending ${messages.length} previous messages to ${client.username}`);
        messages.forEach(msg => {
          ws.send(JSON.stringify(msg));
        });

        // Send system message to room
        const systemMessage: SystemMessage = {
          type: 'system',
          roomId: message.roomId,
          text: `${client.username} joined the room`,
          timestamp: Date.now()
        };
        roomMessages.get(message.roomId)?.push(systemMessage);
        broadcastToRoom(message.roomId, systemMessage);

        // Send updated user list
        sendUserListToRoom(message.roomId);

        // Broadcast updated room list to all clients
        sendRoomListToAll();

      } else if (message.type === 'chat') {
        // Handle chat message
        if (!client.username || !client.currentRoom) {
          log.error('Chat message from client without username or room');
          return;
        }

        const roomId = client.currentRoom;
        const room = rooms.get(roomId);
        if (!room) {
          log.error(`Room not found: ${roomId}`);
          return;
        }

        log.client(client.username, `[${room.roomName}] ${message.text}`);

        const chatMessage: ChatMessage = {
          type: 'chat',
          roomId,
          text: message.text,
          username: client.username,
          timestamp: Date.now()
        };

        // Store in room history
        const chatHistory = roomChatHistory.get(roomId) || [];
        chatHistory.push(chatMessage);
        // Keep only last 50 messages per room
        if (chatHistory.length > 50) {
          chatHistory.shift();
        }
        roomChatHistory.set(roomId, chatHistory);

        // Store in room messages
        roomMessages.get(roomId)?.push(chatMessage);

        // Broadcast to room
        broadcastToRoom(roomId, chatMessage);

        // Check for @locus mention
        if (message.text.includes('@locus')) {
          log.info(`🤖 Agent triggered by @locus mention in room ${room.roomName} (using ${client.apiKey} API key)`);

          // Send typing indicator
          const typingStart: AgentTypingMessage = {
            type: 'agent_typing',
            roomId,
            isTyping: true
          };
          broadcastToRoom(roomId, typingStart);

          // Get the appropriate agent for this client's API key
          const selectedAgent = agents[client.apiKey];

          // Build room context for agent with poker helpers
          const roomContext = {
            roomName: room.roomName,
            mode: room.mode,
            participants: room.participants,
            contacts: room.contacts,
            pokerSession: room.pokerSession,
            // Poker helper functions
            pokerHelpers: {
              recordBuyIn: (player: string, amount: number) => recordBuyIn(roomId, player, amount),
              recordCashOut: (player: string, amount: number) => recordCashOut(roomId, player, amount),
              getLedger: () => getPokerLedger(roomId),
              settle: (requestingPlayer: string) => settlePokerSession(roomId, requestingPlayer)
            }
          };

          // Trigger agent (async, doesn't block)
          selectedAgent.processMessage(
            message.text,
            chatHistory,
            // Progress callback
            (toolName, elapsed) => {
              const progressMessage: AgentProgressMessage = {
                type: 'agent_progress',
                roomId,
                text: `Using ${toolName.replace('mcp__locus__', '').replace('mcp__sessionpay__', '')}...`,
                tool_name: toolName,
                elapsed_time: elapsed
              };
              roomMessages.get(roomId)?.push(progressMessage);
              broadcastToRoom(roomId, progressMessage);
            },
            // Response callback
            (text, toolsUsed) => {
              // Parse and execute poker actions from agent response
              let finalText = text;
              const actionPattern = /\[ACTION:\s*(\w+)\(([^)]+)\)\]/g;
              const actions = [...text.matchAll(actionPattern)];

              for (const action of actions) {
                const [fullMatch, functionName, argsStr] = action;
                const args = argsStr.split(',').map(a => a.trim().replace(/['"]/g, ''));

                let result = '';
                if (functionName === 'recordBuyIn' && args.length === 2) {
                  result = recordBuyIn(roomId, args[0], parseFloat(args[1]));
                } else if (functionName === 'recordCashOut' && args.length === 2) {
                  result = recordCashOut(roomId, args[0], parseFloat(args[1]));
                } else if (functionName === 'getLedger') {
                  result = getPokerLedger(roomId);
                } else if (functionName === 'settle' && args.length === 1) {
                  const settleResult = settlePokerSession(roomId, args[0]);
                  result = settleResult.message;

                  // If settlement successful, prepare payment info
                  if (settleResult.success && settleResult.payments) {
                    result += '\n\n' + settleResult.payments.map(p => `- ${p.to}: $${p.amount}`).join('\n');
                    result += '\n\nUse Locus to send these payments.';
                  }
                }

                // Replace action marker with result
                finalText = finalText.replace(fullMatch, result);
              }

              // Stop typing indicator
              const typingEnd: AgentTypingMessage = {
                type: 'agent_typing',
                roomId,
                isTyping: false
              };
              broadcastToRoom(roomId, typingEnd);

              const agentResponse: AgentMessage = {
                type: 'agent',
                roomId,
                text: finalText,
                timestamp: Date.now(),
                tool_uses: toolsUsed
              };
              roomMessages.get(roomId)?.push(agentResponse);
              broadcastToRoom(roomId, agentResponse);
              log.info(`🤖 Agent response sent to room ${room.roomName} (used ${toolsUsed.length} tools)`);
            },
            roomContext // Pass room context
          ).catch(err => {
            log.error(`Agent error: ${err.message}`);

            // Stop typing indicator on error
            const typingEnd: AgentTypingMessage = {
              type: 'agent_typing',
              roomId,
              isTyping: false
            };
            broadcastToRoom(roomId, typingEnd);

            const errorMessage: SystemMessage = {
              type: 'system',
              roomId,
              text: '❌ Locus agent encountered an error',
              timestamp: Date.now()
            };
            roomMessages.get(roomId)?.push(errorMessage);
            broadcastToRoom(roomId, errorMessage);
          });
        }
      }
    } catch (err) {
      log.error(`Failed to parse message: ${err}`);
    }
  });

  ws.on('close', () => {
    const username = client.username;
    const roomId = client.currentRoom;
    clients.delete(ws);

    if (username && roomId) {
      const room = rooms.get(roomId);
      if (room) {
        log.client(username, `left room ${room.roomName}`);

        // Remove participant from room
        room.participants = room.participants.filter(p => p.username !== username);

        // Notify others in room
        const systemMessage: SystemMessage = {
          type: 'system',
          roomId,
          text: `${username} left the room`,
          timestamp: Date.now()
        };
        roomMessages.get(roomId)?.push(systemMessage);
        broadcastToRoom(roomId, systemMessage);

        // Send updated user list
        sendUserListToRoom(roomId);

        // Broadcast updated room list to all clients
        sendRoomListToAll();
      }
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
