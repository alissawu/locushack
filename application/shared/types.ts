// Shared message types between client and server

export type MessageType = 'join' | 'chat' | 'system' | 'user_list' | 'agent' | 'agent_progress' | 'agent_typing';

export interface JoinMessage {
  type: 'join';
  username: string;
  apiKey?: 'main' | 'sunny';
}

export interface ChatMessage {
  type: 'chat';
  text: string;
  username?: string; // Added by server
  timestamp?: number; // Added by server
}

export interface SystemMessage {
  type: 'system';
  text: string;
  timestamp: number;
}

export interface UserListMessage {
  type: 'user_list';
  users: string[];
}

export interface AgentMessage {
  type: 'agent';
  text: string;
  timestamp: number;
  tool_uses?: string[]; // List of tools used
}

export interface AgentProgressMessage {
  type: 'agent_progress';
  text: string;
  tool_name: string;
  elapsed_time: number;
}

export interface AgentTypingMessage {
  type: 'agent_typing';
  isTyping: boolean;
}

export type ClientMessage = JoinMessage | ChatMessage;
export type ServerMessage = ChatMessage | SystemMessage | UserListMessage | AgentMessage | AgentProgressMessage | AgentTypingMessage;
