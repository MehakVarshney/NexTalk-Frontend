import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { API_BASE_URL } from './api.config';
import { MessageResponse, PageResponse, RoomResponse, MessageType } from './models';

@Injectable({ providedIn: 'root' })
export class ChatService {
  constructor(private readonly http: HttpClient) {}

  getRooms(): Observable<RoomResponse[]> {
    return this.http.get<RoomResponse[]>(`${API_BASE_URL}/api/chat/rooms`);
  }

  createRoom(name: string): Observable<RoomResponse> {
    return this.http.post<RoomResponse>(`${API_BASE_URL}/api/chat/rooms`, { name });
  }

  createDirectRoom(otherUserId: string, displayName?: string): Observable<RoomResponse> {
    return this.http.post<RoomResponse>(`${API_BASE_URL}/api/chat/rooms/direct`, {
      otherUserId,
      displayName
    });
  }

  addMember(roomId: string, userId: string): Observable<unknown> {
    return this.http.post(`${API_BASE_URL}/api/chat/rooms/${roomId}/members`, { userId });
  }

  updateRoomAvatar(roomId: string, avatarUrl: string): Observable<RoomResponse> {
    return this.http.patch<RoomResponse>(`${API_BASE_URL}/api/chat/rooms/${roomId}/avatar`, { avatarUrl });
  }

  getMessages(roomId: string): Observable<PageResponse<MessageResponse>> {
    return this.http.get<PageResponse<MessageResponse>>(`${API_BASE_URL}/api/chat/rooms/${roomId}/messages?page=0&size=30`);
  }

  sendMessage(roomId: string, content: string, type: MessageType = 'TEXT'): Observable<MessageResponse> {
    return this.http.post<MessageResponse>(`${API_BASE_URL}/api/chat/rooms/${roomId}/messages`, {
      content,
      type
    });
  }

  deleteMessage(messageId: string): Observable<void> {
    return this.http.delete<void>(`${API_BASE_URL}/api/chat/messages/${messageId}`);
  }

  leaveRoom(roomId: string): Observable<void> {
    return this.http.delete<void>(`${API_BASE_URL}/api/chat/rooms/${roomId}/members/me`);
  }

  /** Admin-only: kick a specific member out of a group room. */
  removeMember(roomId: string, userId: string): Observable<void> {
    return this.http.delete<void>(`${API_BASE_URL}/api/chat/rooms/${roomId}/members/${userId}`);
  }

  addReaction(messageId: string, emoji: string): Observable<unknown> {
    return this.http.post(`${API_BASE_URL}/api/chat/messages/${messageId}/reactions`, { emoji });
  }

  removeReaction(messageId: string, emoji: string): Observable<void> {
    return this.http.delete<void>(`${API_BASE_URL}/api/chat/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`);
  }
}
