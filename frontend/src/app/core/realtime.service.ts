import { Injectable, signal } from '@angular/core';
import { Client, IMessage } from '@stomp/stompjs';
import SockJS from 'sockjs-client';

import { WS_BASE_URL } from './api.config';
import { RealtimeSocketEvent } from './models';
import { TokenStorageService } from './token-storage.service';

@Injectable({ providedIn: 'root' })
export class RealtimeService {
  readonly connected = signal(false);
  readonly events = signal<string[]>([]);
  readonly lastEvent = signal<RealtimeSocketEvent | null>(null);
  private client: Client | null = null;

  constructor(private readonly storage: TokenStorageService) {}

  private activeSubscriptions = new Set<string>();

  connect(roomIds: string[]): void {
    const token = this.storage.token();
    if (!token) {
      return;
    }

    if (this.client?.active) {
      roomIds.forEach((id) => this.subscribeToRoom(id));
      return;
    }

    this.client = new Client({
      webSocketFactory: () => new SockJS(WS_BASE_URL),
      connectHeaders: {
        Authorization: `Bearer ${token}`
      },
      reconnectDelay: 4000,
      onConnect: () => {
        this.connected.set(true);
        this.subscribe('/topic/presence');
        roomIds.forEach((id) => this.subscribeToRoom(id));
      },
      onDisconnect: () => this.connected.set(false),
      onStompError: () => this.connected.set(false)
    });
    this.client.activate();
  }

  subscribeToRoom(roomId: string): void {
    if (this.activeSubscriptions.has(roomId) || !this.client?.connected) {
      return;
    }
    this.subscribe(`/topic/rooms/${roomId}/typing`);
    this.subscribe(`/topic/rooms/${roomId}/reads`);
    this.subscribe(`/topic/rooms/${roomId}/reactions`);
    this.subscribe(`/topic/rooms/${roomId}/events`);
    this.activeSubscriptions.add(roomId);
  }

  disconnect(): void {
    this.client?.deactivate();
    this.client = null;
    this.connected.set(false);
    this.activeSubscriptions.clear();
  }

  sendTyping(roomId: string, typing: boolean): void {
    this.publish('/app/typing', { roomId, typing });
  }

  sendPresence(status: string): void {
    this.publish('/app/presence', { status });
  }

  sendRoomEvent(
    roomId: string,
    type: 'MESSAGE_CREATED' | 'MESSAGE_UPDATED' | 'MESSAGE_DELETED',
    messageId?: string,
    content?: string
  ): void {
    this.publish('/app/room-event', {
      roomId,
      type,
      messageId: messageId ?? null,
      content: content ?? null
    });
  }

  sendReaction(roomId: string, messageId: string, emoji: string, removed = false): void {
    this.publish('/app/reaction', {
      roomId,
      messageId,
      emoji,
      removed
    });
  }

  private subscribe(destination: string): void {
    this.client?.subscribe(destination, (message: IMessage) => {
      try {
        const parsed = JSON.parse(message.body) as RealtimeSocketEvent;
        this.lastEvent.set(parsed);
        const summary = `${parsed.type}${parsed.userName ? ` - ${parsed.userName}` : ''}`;
        this.events.update((items) => [summary, ...items].slice(0, 20));
      } catch {
        this.events.update((items) => [message.body, ...items].slice(0, 20));
      }
    });
  }

  private publish(destination: string, body: unknown): void {
    if (!this.client?.connected) {
      return;
    }
    this.client.publish({ destination, body: JSON.stringify(body) });
  }
}
