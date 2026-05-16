export type AuthProvider = 'LOCAL' | 'GOOGLE';
export type UserStatus = 'ONLINE' | 'AWAY' | 'OFFLINE';
export type RoomType = 'GROUP' | 'DIRECT';
export type MessageType = 'TEXT' | 'MEDIA';
export type PresenceStatus = 'ONLINE' | 'AWAY' | 'OFFLINE';
export type NotificationType = 'MESSAGE' | 'MENTION' | 'REACTION' | 'ROOM_INVITE' | 'SYSTEM';

export interface UserResponse {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  provider: AuthProvider;
  status: UserStatus;
  createdAt: string;
}

export interface AuthResponse {
  tokenType: string;
  accessToken: string;
  user: UserResponse;
}

export interface MemberResponse {
  id: string;
  userId: string;
  role: 'OWNER' | 'MEMBER';
  joinedAt: string;
}

export interface RoomResponse {
  id: string;
  name: string;
  avatarUrl?: string | null;
  type: RoomType;
  createdBy: string;
  createdAt: string;
  members: MemberResponse[];
}

export interface ReactionResponse {
  id: string;
  messageId: string;
  userId: string;
  emoji: string;
  createdAt: string;
}

export interface MessageResponse {
  id: string;
  roomId: string;
  senderId: string;
  content: string;
  type: MessageType;
  edited: boolean;
  deleted: boolean;
  createdAt: string;
  updatedAt: string;
  reactions: ReactionResponse[];
}

export interface MediaResponse {
  id: string;
  ownerId: string;
  originalFileName: string;
  contentType: string;
  sizeBytes: number;
  image: boolean;
  fileUrl: string;
  thumbnailUrl: string | null;
  createdAt: string;
}

export interface NotificationResponse {
  id: string;
  recipientId: string;
  actorId: string | null;
  type: NotificationType;
  title: string;
  body: string;
  resourceType: string | null;
  resourceId: string | null;
  read: boolean;
  readAt: string | null;
  createdAt: string;
}

export interface PageResponse<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}

export interface RealtimeInfo {
  endpoint: string;
  applicationPrefix: string;
  topics: string[];
  sendDestinations: string[];
}

export interface RealtimeSocketEvent {
  type: 'TYPING' | 'READ_RECEIPT' | 'PRESENCE' | 'REACTION' | 'MESSAGE_CREATED' | 'MESSAGE_UPDATED' | 'MESSAGE_DELETED';
  roomId: string | null;
  messageId: string | null;
  userId: string | null;
  userName: string | null;
  content: string | null;
  emoji: string | null;
  status: string | null;
  typing: boolean;
  removed: boolean;
  occurredAt: string;
}
