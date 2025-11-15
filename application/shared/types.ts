// Shared message types between client and server

export type MessageType = 'join' | 'chat' | 'system' | 'user_list';

export interface JoinMessage {
  type: 'join';
  username: string;
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

export type ClientMessage = JoinMessage | ChatMessage;
export type ServerMessage = ChatMessage | SystemMessage | UserListMessage;
