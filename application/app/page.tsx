'use client';

import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ClientMessage, ServerMessage } from '@/shared/types';

export default function ChatPage() {
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [joined, setJoined] = useState(false);
  const [username, setUsername] = useState('');
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<ServerMessage[]>([]);
  const [users, setUsers] = useState<string[]>([]);
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const [mentionStartPos, setMentionStartPos] = useState(0);
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);
  const [agentTyping, setAgentTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // WebSocket connection
  useEffect(() => {
    const wsUrl = `ws://${window.location.hostname}:4000`;
    console.log(`[Client] Connecting to ${wsUrl}`);

    const socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      console.log('[Client] Connected to WebSocket server');
      setConnected(true);
    };

    socket.onmessage = (event) => {
      try {
        const data: ServerMessage = JSON.parse(event.data);
        console.log('[Client] Received:', data);

        if (data.type === 'user_list') {
          setUsers(data.users);
        } else if (data.type === 'agent_typing') {
          setAgentTyping(data.isTyping);
        } else {
          setMessages((prev) => [...prev, data]);
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
      setJoined(false);
    };

    setWs(socket);

    return () => {
      socket.close();
    };
  }, []);

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ws || !username.trim()) return;

    const joinMessage: ClientMessage = {
      type: 'join',
      username: username.trim(),
    };

    console.log('[Client] Joining as:', username);
    ws.send(JSON.stringify(joinMessage));
    setJoined(true);
  };

  const handleMessageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newMessage = e.target.value;
    setMessage(newMessage);

    // Check for @ mentions
    const cursorPos = e.target.selectionStart || 0;
    const textBeforeCursor = newMessage.slice(0, cursorPos);
    const atMatch = textBeforeCursor.match(/@(\w*)$/);

    if (atMatch) {
      setShowMentionDropdown(true);
      setMentionFilter(atMatch[1]);
      setMentionStartPos(cursorPos - atMatch[0].length);
      setSelectedMentionIndex(0);
    } else {
      setShowMentionDropdown(false);
      setMentionFilter('');
    }
  };

  const handleMentionSelect = (selectedUser: string) => {
    const beforeMention = message.slice(0, mentionStartPos);
    const afterMention = message.slice(inputRef.current?.selectionStart || message.length);
    const newMessage = `${beforeMention}@${selectedUser} ${afterMention}`;

    setMessage(newMessage);
    setShowMentionDropdown(false);
    setMentionFilter('');

    // Focus back on input
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showMentionDropdown) return;

    const filteredUsers = users.filter(u =>
      u.toLowerCase().startsWith(mentionFilter.toLowerCase()) && u !== username
    );

    // Add "locus" to the list if it matches the filter
    const allOptions = 'locus'.startsWith(mentionFilter.toLowerCase())
      ? ['locus', ...filteredUsers]
      : filteredUsers;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedMentionIndex((prev) =>
        prev < allOptions.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedMentionIndex((prev) => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === 'Enter' && allOptions.length > 0) {
      e.preventDefault();
      handleMentionSelect(allOptions[selectedMentionIndex]);
    } else if (e.key === 'Escape') {
      setShowMentionDropdown(false);
    }
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ws || !message.trim()) return;

    const chatMessage: ClientMessage = {
      type: 'chat',
      text: message.trim(),
    };

    console.log('[Client] Sending message:', message);
    ws.send(JSON.stringify(chatMessage));
    setMessage('');
    setShowMentionDropdown(false);
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Parse message text and highlight mentions
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

  // Join screen
  if (!joined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
        <div className="w-full max-w-md p-8 bg-white dark:bg-gray-800 rounded-2xl shadow-xl">
          <h1 className="text-3xl font-bold text-center mb-2 text-gray-900 dark:text-white">
            LAN Chat
          </h1>
          <p className="text-center text-gray-600 dark:text-gray-400 mb-6">
            {connected ? 'Connected to server' : 'Connecting...'}
          </p>

          <form onSubmit={handleJoin} className="space-y-4">
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your name"
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
              disabled={!connected}
              autoFocus
            />
            <button
              type="submit"
              disabled={!connected || !username.trim()}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
            >
              {connected ? 'Join Chat' : 'Connecting...'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Chat screen
  return (
    <div className="flex min-h-screen bg-gray-100 dark:bg-gray-900">
      {/* Sidebar - User List */}
      <div className="w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 p-4">
        <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
          Online ({users.length})
        </h2>
        <ul className="space-y-2">
          {users.map((user) => (
            <li
              key={user}
              className="flex items-center gap-2 text-gray-700 dark:text-gray-300"
            >
              <span className="w-2 h-2 bg-green-500 rounded-full"></span>
              {user}
              {user === username && (
                <span className="text-xs text-gray-500">(you)</span>
              )}
            </li>
          ))}
        </ul>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
            LAN Group Chat
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Connected as {username}
          </p>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg, idx) => {
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
                    <p className="text-sm text-gray-700 dark:text-gray-200">
                      {msg.text}
                    </p>
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
                    <div className="break-words text-gray-900 dark:text-white prose prose-sm max-w-none dark:prose-invert prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {msg.text}
                      </ReactMarkdown>
                    </div>
                    {msg.timestamp && (
                      <p className="text-xs mt-1 text-purple-600 dark:text-purple-400">
                        {formatTime(msg.timestamp)}
                        {msg.tool_uses && msg.tool_uses.length > 0 && (
                          <span className="ml-2">• {msg.tool_uses.length} tool{msg.tool_uses.length > 1 ? 's' : ''} used</span>
                        )}
                      </p>
                    )}
                  </div>
                </div>
              );
            }

            if (msg.type === 'chat') {
              const isOwn = msg.username === username;
              return (
                <div
                  key={idx}
                  className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
                >
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
                    <p className="break-words">
                      {renderMessageWithMentions(msg.text, isOwn)}
                    </p>
                    {msg.timestamp && (
                      <p
                        className={`text-xs mt-1 ${
                          isOwn
                            ? 'text-indigo-200'
                            : 'text-gray-500 dark:text-gray-400'
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
                    <span className="w-2 h-2 bg-purple-600 dark:bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                    <span className="w-2 h-2 bg-purple-600 dark:bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                    <span className="w-2 h-2 bg-purple-600 dark:bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 p-4 relative">
          {/* Mention Dropdown */}
          {showMentionDropdown && (() => {
            const filteredUsers = users.filter(u =>
              u.toLowerCase().startsWith(mentionFilter.toLowerCase()) && u !== username
            );

            // Add "locus" to the list if it matches the filter
            const allOptions = 'locus'.startsWith(mentionFilter.toLowerCase())
              ? ['locus', ...filteredUsers]
              : filteredUsers;

            return allOptions.length > 0 ? (
              <div className="absolute bottom-full left-4 right-4 mb-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {allOptions.map((user, idx) => (
                  <button
                    key={user}
                    type="button"
                    onClick={() => handleMentionSelect(user)}
                    className={`w-full text-left px-4 py-2 hover:bg-indigo-100 dark:hover:bg-indigo-900 ${
                      idx === selectedMentionIndex
                        ? 'bg-indigo-50 dark:bg-indigo-800'
                        : ''
                    } ${user === 'locus' ? 'border-b border-purple-200 dark:border-purple-700' : ''}`}
                  >
                    {user === 'locus' ? (
                      <span className="text-purple-600 dark:text-purple-300 font-semibold">
                        🤖 @{user}
                      </span>
                    ) : (
                      <span className="text-gray-900 dark:text-white">@{user}</span>
                    )}
                  </button>
                ))}
              </div>
            ) : null;
          })()}

          <form onSubmit={handleSendMessage} className="flex gap-2">
            <div className="flex-1 relative">
              <input
                ref={inputRef}
                type="text"
                value={message}
                onChange={handleMessageChange}
                onKeyDown={handleKeyDown}
                placeholder="Type a message... (use @ to mention)"
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                autoFocus
              />
            </div>
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
