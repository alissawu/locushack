// Shared message types between client and server

export type MessageType = 'connect' | 'create_room' | 'join_room' | 'chat' | 'system' | 'user_list' | 'agent' | 'agent_progress' | 'agent_typing' | 'room_list';

export interface ConnectMessage {
  type: 'connect';
  apiKey: 'main' | 'sunny' | 'host';
}

export interface CreateRoomMessage {
  type: 'create_room';
  roomName: string;
  mode: RoomMode;
}

export interface JoinRoomMessage {
  type: 'join_room';
  roomId: string;
  username: string;
  wallet?: string;
}

// Room state types
export type RoomMode = 'casual' | 'poker' | 'trip';

export interface Participant {
  username: string;
  wallet?: string;
  apiKey: 'main' | 'sunny' | 'host';
}

export interface Contact {
  name: string;
  wallet: string;
}

export interface PokerSession {
  host: string; // username who can settle
  buyIns: Array<{
    player: string; // username
    amount: number;
    timestamp: number;
  }>;
  cashOuts: Array<{
    player: string; // username
    amount: number;
    timestamp: number;
  }>;
}

export interface RoomState {
  roomId: string;
  roomName: string;
  mode: RoomMode;
  participants: Participant[];
  contacts: Record<string, string>; // name -> wallet address
  pokerSession?: PokerSession;
}

export interface RoomListMessage {
  type: 'room_list';
  rooms: Array<{
    roomId: string;
    roomName: string;
    mode: RoomMode;
    participantCount: number;
  }>;
}

export interface ChatMessage {
  type: 'chat';
  roomId?: string; // Set by client or server
  text: string;
  username?: string; // Added by server
  timestamp?: number; // Added by server
}

export interface SystemMessage {
  type: 'system';
  roomId?: string;
  text: string;
  timestamp: number;
}

export interface UserListMessage {
  type: 'user_list';
  users: string[];
}

export interface AgentMessage {
  type: 'agent';
  roomId?: string;
  text: string;
  timestamp: number;
  tool_uses?: string[]; // List of tools used
}

export interface AgentProgressMessage {
  type: 'agent_progress';
  roomId?: string;
  text: string;
  tool_name: string;
  elapsed_time: number;
}

export interface AgentTypingMessage {
  type: 'agent_typing';
  roomId?: string;
  isTyping: boolean;
}

export type ClientMessage = ConnectMessage | CreateRoomMessage | JoinRoomMessage | ChatMessage;
export type ServerMessage = ChatMessage | SystemMessage | UserListMessage | AgentMessage | AgentProgressMessage | AgentTypingMessage | RoomListMessage;
