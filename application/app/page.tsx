'use client';

import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
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
                    ? 'bg-yellow-200 dark:bg-yellow-600 px-1 rounded'
                    : isOwnMessage
                    ? 'text-indigo-200'
                    : 'text-indigo-600 dark:text-indigo-400'
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
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
        <div className="w-full max-w-md p-8 bg-white dark:bg-gray-800 rounded-2xl shadow-xl">
          <h1 className="text-3xl font-bold text-center mb-2 text-gray-900 dark:text-white">
            SessionPay
          </h1>
          <p className="text-center text-gray-600 dark:text-gray-400 mb-6">
            Select your API key
          </p>

          <div className="space-y-3">
            <button
              onClick={() => setApiKey('host')}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg transition-colors"
            >
              Host API
            </button>
            <button
              onClick={() => setApiKey('alyssa')}
              className="w-full py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-colors"
            >
              Alyssa's API
            </button>
            <button
              onClick={() => setApiKey('sunny')}
              className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors"
            >
              Sunny's API
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Room Selection Screen
  if (!currentRoom) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-full max-w-2xl">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
              <div className="flex items-center justify-between mb-6">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                  Rooms
                </h1>
                <button
                  onClick={() => setShowCreateRoom(true)}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg transition-colors"
                >
                  + Create Room
                </button>
              </div>

              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Connected with: {apiKey === 'host' ? 'Host API' : apiKey === 'alyssa' ? "Alyssa's API" : "Sunny's API"}
              </p>

              {connected ? (
                rooms.length > 0 ? (
                  <div className="space-y-3">
                    {rooms.map((room) => (
                      <button
                        key={room.roomId}
                        onClick={() => handleSelectRoom(room.roomId)}
                        className="w-full p-4 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg transition-colors text-left"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="font-semibold text-gray-900 dark:text-white">
                              {room.roomName}
                            </h3>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              {room.mode === 'poker' && '🎲 Poker'}
                              {room.mode === 'trip' && '✈️ Trip'}
                              {room.mode === 'casual' && '💬 Casual'} • {room.participantCount} participants
                            </p>
                          </div>
                          <span className="text-indigo-600 dark:text-indigo-400">→</span>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <p className="text-gray-600 dark:text-gray-400 mb-4">
                      No rooms yet. Create one to get started!
                    </p>
                  </div>
                )
              ) : (
                <div className="text-center py-12">
                  <p className="text-gray-600 dark:text-gray-400">Connecting...</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Create Room Modal */}
        {showCreateRoom && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 w-full max-w-md">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                Create Room
              </h2>

              <form onSubmit={handleCreateRoom} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Room Name
                  </label>
                  <input
                    type="text"
                    value={newRoomName}
                    onChange={(e) => setNewRoomName(e.target.value)}
                    placeholder="e.g., Poker Night"
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Mode
                  </label>
                  <select
                    value={newRoomMode}
                    onChange={(e) => setNewRoomMode(e.target.value as RoomMode)}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                  >
                    <option value="casual">💬 Casual</option>
                    <option value="poker">🎲 Poker</option>
                    <option value="trip">✈️ Trip</option>
                  </select>
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setShowCreateRoom(false)}
                    className="flex-1 py-3 bg-gray-300 hover:bg-gray-400 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-900 dark:text-white font-semibold rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!newRoomName.trim()}
                    className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
                  >
                    Create
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Join Room Modal */}
        {showJoinRoom && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 w-full max-w-md">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                Join Room
              </h2>

              <form onSubmit={handleJoinRoom} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Your Name
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="e.g., Alissa"
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Wallet Address (optional)
                  </label>
                  <input
                    type="text"
                    value={wallet}
                    onChange={(e) => setWallet(e.target.value)}
                    placeholder="0x..."
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setShowJoinRoom(false)}
                    className="flex-1 py-3 bg-gray-300 hover:bg-gray-400 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-900 dark:text-white font-semibold rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!username.trim()}
                    className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
                  >
                    Join
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Chat Screen
  const currentRoomData = rooms.find((r) => r.roomId === currentRoom);
  const roomMessages = messages[currentRoom] || [];

  return (
    <div className="flex h-screen bg-gray-100 dark:bg-gray-900">
      {/* Sidebar - Room List */}
      <div className="w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 p-4 overflow-y-auto">
        <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
          Rooms
        </h2>
        <div className="space-y-2 mb-4">
          {rooms.map((room) => (
            <button
              key={room.roomId}
              onClick={() => {
                setCurrentRoom(room.roomId);
                // Auto-rejoin if not in room
                if (!username) {
                  setJoinRoomId(room.roomId);
                  setShowJoinRoom(true);
                }
              }}
              className={`w-full text-left p-3 rounded-lg transition-colors ${
                room.roomId === currentRoom
                  ? 'bg-indigo-100 dark:bg-indigo-900 text-indigo-900 dark:text-indigo-100'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
              }`}
            >
              <div className="font-medium">{room.roomName}</div>
              <div className="text-xs opacity-75">
                {room.mode === 'poker' && '🎲'}
                {room.mode === 'trip' && '✈️'}
                {room.mode === 'casual' && '💬'} {room.participantCount} online
              </div>
            </button>
          ))}
        </div>

        <button
          onClick={() => setShowCreateRoom(true)}
          className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg transition-colors text-sm"
        >
          + Create Room
        </button>

        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-semibold mb-2 text-gray-900 dark:text-white">
            Online ({users.length})
          </h3>
          <ul className="space-y-2">
            {users.map((user) => (
              <li key={user} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                {user}
                {user === username && <span className="text-xs text-gray-500">(you)</span>}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4 flex-shrink-0">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
            {currentRoomData?.roomName || 'Chat'}
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {currentRoomData?.mode === 'poker' && '🎲 Poker Mode'}
            {currentRoomData?.mode === 'trip' && '✈️ Trip Mode'}
            {currentRoomData?.mode === 'casual' && '💬 Casual Mode'} • {username}
          </p>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
          {roomMessages.map((msg, idx) => {
            if (msg.type === 'system') {
              return (
                <div key={idx} className="text-center">
                  <span className="inline-block px-3 py-1 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-full text-sm">
                    {msg.text}
                  </span>
                </div>
              );
            }

            if (msg.type === 'agent_progress') {
              return (
                <div key={idx} className="flex justify-start">
                  <div className="max-w-xs lg:max-w-md px-4 py-2 rounded-2xl bg-purple-50 dark:bg-purple-800 border border-purple-200 dark:border-purple-600">
                    <p className="text-xs font-semibold mb-1 text-purple-600 dark:text-purple-300">
                      🔧 Tool Usage
                    </p>
                    <p className="text-sm text-gray-700 dark:text-gray-200">{msg.text}</p>
                  </div>
                </div>
              );
            }

            if (msg.type === 'agent') {
              return (
                <div key={idx} className="flex justify-start">
                  <div className="max-w-xs lg:max-w-md px-4 py-2 rounded-2xl bg-purple-100 dark:bg-purple-900 border-2 border-purple-300 dark:border-purple-700">
                    <p className="text-xs font-semibold mb-1 text-purple-700 dark:text-purple-300">
                      🤖 Locus Agent
                    </p>
                    <div className="break-words text-gray-900 dark:text-white prose prose-sm max-w-none dark:prose-invert">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.text}</ReactMarkdown>
                    </div>
                    {msg.timestamp && (
                      <p className="text-xs mt-1 text-purple-600 dark:text-purple-400">
                        {formatTime(msg.timestamp)}
                      </p>
                    )}
                  </div>
                </div>
              );
            }

            if (msg.type === 'chat') {
              const isOwn = msg.username === username;
              return (
                <div key={idx} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-xs lg:max-w-md px-4 py-2 rounded-2xl ${
                      isOwn
                        ? 'bg-indigo-600 text-white'
                        : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white'
                    }`}
                  >
                    {!isOwn && (
                      <p className="text-xs font-semibold mb-1 text-indigo-600 dark:text-indigo-400">
                        {msg.username}
                      </p>
                    )}
                    <p className="break-words">{renderMessageWithMentions(msg.text, isOwn)}</p>
                    {msg.timestamp && (
                      <p
                        className={`text-xs mt-1 ${
                          isOwn ? 'text-indigo-200' : 'text-gray-500 dark:text-gray-400'
                        }`}
                      >
                        {formatTime(msg.timestamp)}
                      </p>
                    )}
                  </div>
                </div>
              );
            }

            return null;
          })}

          {/* Agent Typing Indicator */}
          {agentTyping && (
            <div className="flex justify-start">
              <div className="max-w-xs lg:max-w-md px-4 py-3 rounded-2xl bg-purple-100 dark:bg-purple-900 border-2 border-purple-300 dark:border-purple-700">
                <p className="text-xs font-semibold mb-1 text-purple-700 dark:text-purple-300">
                  🤖 Locus Agent
                </p>
                <div className="flex items-center gap-1">
                  <div className="flex gap-1">
                    <span
                      className="w-2 h-2 bg-purple-600 dark:bg-purple-400 rounded-full animate-bounce"
                      style={{ animationDelay: '0ms' }}
                    ></span>
                    <span
                      className="w-2 h-2 bg-purple-600 dark:bg-purple-400 rounded-full animate-bounce"
                      style={{ animationDelay: '150ms' }}
                    ></span>
                    <span
                      className="w-2 h-2 bg-purple-600 dark:bg-purple-400 rounded-full animate-bounce"
                      style={{ animationDelay: '300ms' }}
                    ></span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 p-4 flex-shrink-0">
          <form onSubmit={handleSendMessage} className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type a message... (use @locus for agent)"
              className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
              autoFocus
            />
            <button
              type="submit"
              disabled={!message.trim()}
              className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
