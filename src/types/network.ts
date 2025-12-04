/**
 * Network protocol type definitions
 */

import type { Species, FishInstance } from './game';

export type NetworkMessageType =
  | 'welcome'
  | 'update'
  | 'setName'
  | 'chat'
  | 'sound'
  | 'anim'
  | 'punch_hit'
  | 'spawnPortal'
  | 'forceGhost'
  | 'request_prop'
  | 'spawn_prop'
  | 'remove_prop'
  | 'undo_prop'
  | 'fishCaught'
  | 'sellFish'
  | 'admin_login'
  | 'admin_cmd'
  | 'admin_ok'
  | 'admin_fail'
  | 'playerList'
  | 'playerLeft'
  | 'playerCount'
  | 'environment_sync'
  | 'purge_chat'
  | 'stateUpdate'
  | 'system'
  | 'error';

export interface BaseMessage {
  type: NetworkMessageType;
  id?: string;
}

export interface WelcomeMessage extends BaseMessage {
  type: 'welcome';
  id: string;
  serverName: string;
  adminSalt?: string;
  playerCount: number;
  playerData?: any;
}

export interface PlayerUpdatePayload {
  pos: { x: number; y: number; z: number };
  rot: number;
  bobber: { x: number; y: number; z: number } | null;
  color: string;
  belly: string;
  eye: string;
  hat: string;
  species: Species;
  guitar: boolean;
  glove: boolean;
  title: string;
  heldFish: { name: string; color: string; size: string } | null;
  shirt: string;
  collar: string;
  name: string;
  rod: string;
  handsEmpty: boolean;
  version: string;
}

export interface UpdateMessage extends BaseMessage {
  type: 'update';
  id: string;
  payload: PlayerUpdatePayload;
}

export interface SetNameMessage extends BaseMessage {
  type: 'setName';
  name: string;
  peerId?: string;
}

export interface ChatMessage extends BaseMessage {
  type: 'chat';
  text: string;
  name?: string;
  id: string;
}

export interface SoundMessage extends BaseMessage {
  type: 'sound';
  name: string;
  variant?: number;
  note?: string;
  id: string;
}

export interface PropPayload {
  id: string;
  ownerId: string;
  type: string;
  x: number;
  y: number;
  z: number;
  rot: number;
}

export interface RequestPropMessage extends BaseMessage {
  type: 'request_prop';
  propType: string;
  x: number;
  y: number;
  z: number;
  rot: number;
}

export interface SpawnPropMessage extends BaseMessage {
  type: 'spawn_prop';
  payload: PropPayload;
}

export interface FishCaughtMessage extends BaseMessage {
  type: 'fishCaught';
  fish: FishInstance;
}

export interface AdminCommandMessage extends BaseMessage {
  type: 'admin_cmd';
  cmd: string;
  targetId?: string;
  ip?: string;
  x?: number;
  z?: number;
}

export interface PlayerInfo {
  id: string;
  name: string;
  peerId?: string;
  isChatMuted?: boolean;
  isVoiceMuted?: boolean;
  isMidiMuted?: boolean;
}

export interface PlayerListMessage extends BaseMessage {
  type: 'playerList';
  players: PlayerInfo[];
}

export interface EnvironmentSyncMessage extends BaseMessage {
  type: 'environment_sync';
  isRaining: boolean;
  time: number;
}

export interface SpawnPortalMessage extends BaseMessage {
  type: 'spawnPortal';
  x: number;
  z: number;
}

export type NetworkMessage =
  | WelcomeMessage
  | UpdateMessage
  | SetNameMessage
  | ChatMessage
  | SoundMessage
  | RequestPropMessage
  | SpawnPropMessage
  | FishCaughtMessage
  | AdminCommandMessage
  | PlayerListMessage
  | EnvironmentSyncMessage
  | SpawnPortalMessage
  | BaseMessage;
