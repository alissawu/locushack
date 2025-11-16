'use client';

import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import type {
  ClientMessage,
  ServerMessage,
  ConnectMessage,
  CreateRoomMessage,
  JoinRoomMessage,
  RoomListMessage,
  RoomMode
} from '@/shared/types';

interface Room {
  roomId: string;
  roomName: string;
  mode: RoomMode;
  participantCount: number;
}

export default function ChatPage() {
  // Connection state
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [apiKey, setApiKey] = useState<'host' | 'alyssa' | 'sunny' | null>(null);

  // Room state
  const [rooms, setRooms] = useState<Room[]>([]);
  const [currentRoom, setCurrentRoom] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [wallet, setWallet] = useState('');

  // UI state
  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [showJoinRoom, setShowJoinRoom] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomMode, setNewRoomMode] = useState<RoomMode>('casual');
  const [joinRoomId, setJoinRoomId] = useState('');

  // Chat state
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<Record<string, ServerMessage[]>>({});
  const [users, setUsers] = useState<string[]>([]);
  const [agentTyping, setAgentTyping] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, currentRoom]);

  // WebSocket connection
  useEffect(() => {
    if (!apiKey) return;

    const wsUrl = `ws://${window.location.hostname}:4000`;
    console.log(`[Client] Connecting to ${wsUrl}`);

    const socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      console.log('[Client] Connected to WebSocket server');
      setConnected(true);

      // Send connect message with API key
      const connectMsg: ConnectMessage = {
        type: 'connect',
        apiKey
      };
      socket.send(JSON.stringify(connectMsg));
    };

    socket.onmessage = (event) => {
      try {
        const data: ServerMessage = JSON.parse(event.data);
        console.log('[Client] Received:', data);

        if (data.type === 'room_list') {
          setRooms(data.rooms);
        } else if (data.type === 'user_list') {
          setUsers(data.users);
        } else if (data.type === 'agent_typing') {
          if (data.roomId === currentRoom) {
            setAgentTyping(data.isTyping);
          }
        } else {
          // Add message to appropriate room
          const roomId = (data as any).roomId || 'global';
          setMessages((prev) => ({
            ...prev,
            [roomId]: [...(prev[roomId] || []), data]
          }));
        }
      } catch (err) {
        console.error('[Client] Failed to parse message:', err);
      }
    };

    socket.onerror = (error) => {
      console.error('[Client] WebSocket error:', error);
    };

    socket.onclose = () => {
      console.log('[Client] Disconnected from server');
      setConnected(false);
    };

    setWs(socket);

    return () => {
      socket.close();
    };
  }, [apiKey]);

  const handleCreateRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ws || !newRoomName.trim()) return;

    const createMsg: CreateRoomMessage = {
      type: 'create_room',
      roomName: newRoomName.trim(),
      mode: newRoomMode
    };

    ws.send(JSON.stringify(createMsg));
    setNewRoomName('');
    setShowCreateRoom(false);
  };

  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ws || !username.trim() || !joinRoomId) return;

    const joinMsg: JoinRoomMessage = {
      type: 'join_room',
      roomId: joinRoomId,
      username: username.trim(),
      wallet: wallet.trim() || undefined
    };

    ws.send(JSON.stringify(joinMsg));
    setCurrentRoom(joinRoomId);
    setShowJoinRoom(false);
  };

  const handleSelectRoom = (roomId: string) => {
    setJoinRoomId(roomId);
    setShowJoinRoom(true);
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ws || !message.trim() || !currentRoom) return;

    const chatMessage: ClientMessage = {
      type: 'chat',
      roomId: currentRoom,
      text: message.trim()
    };

    ws.send(JSON.stringify(chatMessage));
    setMessage('');
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Render message with mentions
  const renderMessageWithMentions = (text: string, isOwnMessage: boolean) => {
    const parts = text.split(/(@\w+)/g);
    return (
      <>
        {parts.map((part, idx) => {
          if (part.match(/^@\w+$/)) {
            const mentionedUser = part.slice(1);
            const isMentioningMe = mentionedUser === username;
            return (
              <span
                key={idx}
                className={`font-semibold ${
                  isMentioningMe
                    ? 'bg-purple-500/30 px-1.5 py-0.5 rounded border border-purple-400/50'
                    : isOwnMessage
                    ? 'text-purple-200'
                    : 'text-purple-400'
                }`}
              >
                {part}
              </span>
            );
          }
          return <span key={idx}>{part}</span>;
        })}
      </>
    );
  };

  // API Key Selection Screen
  if (!apiKey) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-zinc-900/50 to-black relative overflow-hidden">
        {/* Background particles effect */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-zinc-900/50 to-black"></div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="relative w-full max-w-md"
        >
          <Card className="bg-zinc-900/50 border-white/10 backdrop-blur-lg">
            <CardContent className="p-8">
              <motion.h1
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="text-4xl font-bold text-center mb-2 bg-clip-text text-transparent bg-gradient-to-r from-white to-zinc-500"
              >
                SessionPay
              </motion.h1>
              <p className="text-center text-zinc-400 mb-8">
                Select your API key
              </p>

              <div className="space-y-3">
                <motion.div
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Button
                    onClick={() => setApiKey('host')}
                    variant="purple"
                    className="w-full py-6 text-lg rounded-xl bg-purple-600 hover:bg-purple-700"
                  >
                    Host API
                  </Button>
                </motion.div>
                <motion.div
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Button
                    onClick={() => setApiKey('alyssa')}
                    variant="purple"
                    className="w-full py-6 text-lg rounded-xl bg-indigo-600 hover:bg-indigo-700"
                  >
                    Alissa's API
                  </Button>
                </motion.div>
                <motion.div
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Button
                    onClick={() => setApiKey('sunny')}
                    variant="purple"
                    className="w-full py-6 text-lg rounded-xl bg-cyan-600 hover:bg-cyan-700"
                  >
                    Sunny's API
                  </Button>
                </motion.div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  // Room Selection Screen
  if (!currentRoom) {
    return (
      <div className="flex min-h-screen bg-gradient-to-b from-zinc-900/50 to-black relative overflow-hidden">
        {/* Background effect */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-zinc-900/50 to-black"></div>
        </div>

        <div className="flex-1 flex items-center justify-center p-8 relative">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="w-full max-w-2xl"
          >
            <Card className="bg-zinc-900/50 border-white/10 backdrop-blur-lg">
              <CardContent className="p-8">
                <div className="flex items-center justify-between mb-6">
                  <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-zinc-500">
                    Rooms
                  </h1>
                  <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                    <Button
                      onClick={() => setShowCreateRoom(true)}
                      variant="purple"
                      className="rounded-xl"
                    >
                      + Create Room
                    </Button>
                  </motion.div>
                </div>

                <p className="text-sm text-zinc-400 mb-6">
                  Connected with: {apiKey === 'host' ? 'Host API' : apiKey === 'alyssa' ? "Alyssa's API" : "Sunny's API"}
                </p>

                {connected ? (
                  <div className="space-y-3">
                    {/* Mock room - girls night */}
                    <motion.button
                      onClick={() => handleSelectRoom('mock-girls-night')}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className="w-full p-4 bg-purple-900/30 border border-purple-500/50 hover:border-purple-400 rounded-xl transition-colors text-left"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-semibold text-white">
                            girls night ✈️
                          </h3>
                          <p className="text-sm text-zinc-400">
                            🎲 2 online
                          </p>
                        </div>
                        <span className="text-purple-400">→</span>
                      </div>
                    </motion.button>

                    {/* Real rooms from server */}
                    {rooms.map((room, index) => (
                      <motion.button
                        key={room.roomId}
                        onClick={() => handleSelectRoom(room.roomId)}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 + index * 0.1 }}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className="w-full p-4 bg-zinc-900/50 border border-white/10 hover:border-white/20 rounded-xl transition-colors text-left"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="font-semibold text-white">
                              {room.roomName}
                            </h3>
                            <p className="text-sm text-zinc-400">
                              {room.mode === 'poker' && '🎲 Poker'}
                              {room.mode === 'trip' && '✈️ Trip'}
                              {room.mode === 'casual' && '💬 Casual'} • {room.participantCount} participants
                            </p>
                          </div>
                          <span className="text-purple-400">→</span>
                        </div>
                      </motion.button>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.5 }}
                      className="text-zinc-400"
                    >
                      Connecting...
                    </motion.p>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Create Room Modal */}
        {showCreateRoom && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <Card className="bg-zinc-900/90 border-white/10 backdrop-blur-lg w-full max-w-md">
                <CardContent className="p-6">
                  <h2 className="text-2xl font-bold text-white mb-4">
                    Create Room
                  </h2>

                  <form onSubmit={handleCreateRoom} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-zinc-300 mb-2">
                        Room Name
                      </label>
                      <input
                        type="text"
                        value={newRoomName}
                        onChange={(e) => setNewRoomName(e.target.value)}
                        placeholder="e.g., Poker Night"
                        className="w-full px-4 py-3 bg-zinc-800 border border-white/10 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-white placeholder-zinc-500"
                        autoFocus
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-zinc-300 mb-2">
                        Mode
                      </label>
                      <select
                        value={newRoomMode}
                        onChange={(e) => setNewRoomMode(e.target.value as RoomMode)}
                        className="w-full px-4 py-3 bg-zinc-800 border border-white/10 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-white"
                      >
                        <option value="casual">💬 Casual</option>
                        <option value="poker">🎲 Poker</option>
                        <option value="trip">✈️ Trip</option>
                      </select>
                    </div>

                    <div className="flex gap-3 pt-2">
                      <Button
                        type="button"
                        onClick={() => setShowCreateRoom(false)}
                        variant="outline"
                        className="flex-1 rounded-xl border-white/20 hover:bg-zinc-800"
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        disabled={!newRoomName.trim()}
                        variant="purple"
                        className="flex-1 rounded-xl"
                      >
                        Create
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            </motion.div>
          </motion.div>
        )}

        {/* Join Room Modal */}
        {showJoinRoom && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <Card className="bg-zinc-900/90 border-white/10 backdrop-blur-lg w-full max-w-md">
                <CardContent className="p-6">
                  <h2 className="text-2xl font-bold text-white mb-4">
                    Join Room
                  </h2>

                  <form onSubmit={handleJoinRoom} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-zinc-300 mb-2">
                        Your Name
                      </label>
                      <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="e.g., Alissa"
                        className="w-full px-4 py-3 bg-zinc-800 border border-white/10 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-white placeholder-zinc-500"
                        autoFocus
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-zinc-300 mb-2">
                        Wallet Address (optional)
                      </label>
                      <input
                        type="text"
                        value={wallet}
                        onChange={(e) => setWallet(e.target.value)}
                        placeholder="0x..."
                        className="w-full px-4 py-3 bg-zinc-800 border border-white/10 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-white placeholder-zinc-500"
                      />
                    </div>

                    <div className="flex gap-3 pt-2">
                      <Button
                        type="button"
                        onClick={() => setShowJoinRoom(false)}
                        variant="outline"
                        className="flex-1 rounded-xl border-white/20 hover:bg-zinc-800"
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        disabled={!username.trim()}
                        variant="purple"
                        className="flex-1 rounded-xl"
                      >
                        Join
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            </motion.div>
          </motion.div>
        )}
      </div>
    );
  }

  // Chat Screen
  const currentRoomData = rooms.find((r) => r.roomId === currentRoom);
  const roomMessages = messages[currentRoom] || [];

  return (
    <div className="flex h-screen bg-black overflow-hidden">
      {/* Sidebar - Room List */}
      <div className="w-64 bg-zinc-900/50 border-r border-white/10 p-4 flex flex-col backdrop-blur-lg overflow-hidden">
        <h2 className="text-lg font-semibold mb-4 text-white flex-shrink-0">
          Rooms
        </h2>
        <div className="flex-1 overflow-y-auto mb-4 space-y-2">
          {/* Mock room - girls night */}
          <motion.button
            onClick={() => {
              setCurrentRoom('mock-girls-night');
              if (!username) {
                setJoinRoomId('mock-girls-night');
                setShowJoinRoom(true);
              }
            }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className={`w-full text-left p-3 rounded-xl transition-colors ${
              'mock-girls-night' === currentRoom
                ? 'bg-purple-900/50 border border-purple-500/50 text-white'
                : 'bg-zinc-800/50 border border-white/10 hover:border-white/20 text-zinc-300'
            }`}
          >
            <div className="font-medium">girls night ✈️</div>
            <div className="text-xs text-zinc-400">
              🎲 2 online
            </div>
          </motion.button>

          {/* Real rooms from server */}
          {rooms.map((room) => (
            <motion.button
              key={room.roomId}
              onClick={() => {
                setCurrentRoom(room.roomId);
                // Auto-rejoin if not in room
                if (!username) {
                  setJoinRoomId(room.roomId);
                  setShowJoinRoom(true);
                }
              }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className={`w-full text-left p-3 rounded-xl transition-colors ${
                room.roomId === currentRoom
                  ? 'bg-purple-900/50 border border-purple-500/50 text-white'
                  : 'bg-zinc-800/50 border border-white/10 hover:border-white/20 text-zinc-300'
              }`}
            >
              <div className="font-medium">{room.roomName}</div>
              <div className="text-xs text-zinc-400">
                {room.mode === 'poker' && '🎲'}
                {room.mode === 'trip' && '✈️'}
                {room.mode === 'casual' && '💬'} {room.participantCount} online
              </div>
            </motion.button>
          ))}
        </div>

        <div className="flex-shrink-0">
          <Button
            onClick={() => setShowCreateRoom(true)}
            variant="purple"
            className="w-full rounded-xl text-sm"
          >
            + Create Room
          </Button>

          <div className="mt-4 pt-4 border-t border-white/10">
            <h3 className="text-sm font-semibold mb-2 text-white">
              Online ({users.length})
            </h3>
            <ul className="space-y-2">
              {users.map((user) => (
                <motion.li
                  key={user}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-center gap-2 text-sm text-zinc-300"
                >
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                  {user}
                  {user === username && <span className="text-xs text-zinc-500">(you)</span>}
                </motion.li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <div className="bg-zinc-900/50 border-b border-white/10 p-4 flex-shrink-0 backdrop-blur-lg">
          <h1 className="text-xl font-semibold text-white">
            {currentRoomData?.roomName || 'girls night ✈️'}
          </h1>
          <p className="text-sm text-zinc-400">
            {currentRoomData?.mode === 'poker' && '🎲 Poker Mode'}
            {currentRoomData?.mode === 'trip' && '✈️ Trip Mode'}
            {currentRoomData?.mode === 'casual' && '💬 Casual Mode'} • {username}
          </p>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gradient-to-b from-black to-zinc-950">
          {roomMessages.map((msg, idx) => {
            if (msg.type === 'system') {
              return (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-center"
                >
                  <span className="inline-block px-3 py-1 bg-zinc-800/50 border border-white/10 text-zinc-400 rounded-full text-sm backdrop-blur-sm">
                    {msg.text}
                  </span>
                </motion.div>
              );
            }

            if (msg.type === 'agent_progress') {
              return (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex justify-start"
                >
                  <div className="max-w-xs lg:max-w-md px-4 py-2 rounded-2xl bg-purple-900/30 border border-purple-500/50 backdrop-blur-sm">
                    <p className="text-xs font-semibold mb-1 text-purple-400">
                      🔧 Tool Usage
                    </p>
                    <p className="text-sm text-zinc-300">{msg.text}</p>
                  </div>
                </motion.div>
              );
            }

            if (msg.type === 'agent') {
              return (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex justify-start"
                >
                  <div className="max-w-xs lg:max-w-md px-4 py-3 rounded-2xl bg-purple-900/50 border-2 border-purple-500/50 backdrop-blur-sm">
                    <p className="text-xs font-semibold mb-2 text-purple-300">
                      🤖 Locus Agent
                    </p>
                    <div className="break-words text-white prose prose-sm max-w-none prose-invert">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.text}</ReactMarkdown>
                    </div>
                    {msg.timestamp && (
                      <p className="text-xs mt-2 text-purple-400">
                        {formatTime(msg.timestamp)}
                      </p>
                    )}
                  </div>
                </motion.div>
              );
            }

            if (msg.type === 'chat') {
              const isOwn = msg.username === username;
              return (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, x: isOwn ? 20 : -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-xs lg:max-w-md px-4 py-2 rounded-2xl backdrop-blur-sm ${
                      isOwn
                        ? 'bg-purple-600 text-white border border-purple-500'
                        : 'bg-zinc-800/70 border border-white/10 text-white'
                    }`}
                  >
                    {!isOwn && (
                      <p className="text-xs font-semibold mb-1 text-purple-400">
                        {msg.username}
                      </p>
                    )}
                    <p className="break-words">{renderMessageWithMentions(msg.text, isOwn)}</p>
                    {msg.timestamp && (
                      <p
                        className={`text-xs mt-1 ${
                          isOwn ? 'text-purple-200' : 'text-zinc-500'
                        }`}
                      >
                        {formatTime(msg.timestamp)}
                      </p>
                    )}
                  </div>
                </motion.div>
              );
            }

            return null;
          })}

          {/* Agent Typing Indicator */}
          {agentTyping && (
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex justify-start"
            >
              <div className="max-w-xs lg:max-w-md px-4 py-3 rounded-2xl bg-purple-900/50 border-2 border-purple-500/50 backdrop-blur-sm">
                <p className="text-xs font-semibold mb-1 text-purple-300">
                  🤖 Locus Agent
                </p>
                <div className="flex items-center gap-1">
                  <div className="flex gap-1">
                    <span
                      className="w-2 h-2 bg-purple-400 rounded-full animate-bounce"
                      style={{ animationDelay: '0ms' }}
                    ></span>
                    <span
                      className="w-2 h-2 bg-purple-400 rounded-full animate-bounce"
                      style={{ animationDelay: '150ms' }}
                    ></span>
                    <span
                      className="w-2 h-2 bg-purple-400 rounded-full animate-bounce"
                      style={{ animationDelay: '300ms' }}
                    ></span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="bg-zinc-900/50 border-t border-white/10 p-4 flex-shrink-0 backdrop-blur-lg">
          <form onSubmit={handleSendMessage} className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type a message... (use @locus for agent)"
              className="flex-1 px-4 py-3 bg-zinc-800 border border-white/10 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-white placeholder-zinc-500"
              autoFocus
            />
            <Button
              type="submit"
              disabled={!message.trim()}
              variant="purple"
              className="px-6 py-3 rounded-xl"
            >
              Send
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
