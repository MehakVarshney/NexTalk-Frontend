import {
  AfterViewChecked,
  Component,
  ElementRef,
  HostListener,
  OnInit,
  ViewChild,
  computed,
  effect,
  signal
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { API_BASE_URL } from '../../core/api.config';
import { AuthService } from '../../core/auth.service';
import { ChatService } from '../../core/chat.service';
import { MediaService } from '../../core/media.service';
import {
  MessageResponse,
  NotificationResponse,
  RealtimeSocketEvent,
  RoomResponse,
  UserResponse
} from '../../core/models';
import { NotificationService } from '../../core/notification.service';
import { RealtimeService } from '../../core/realtime.service';
import { TokenStorageService } from '../../core/token-storage.service';

const BLOCKED_CONTACTS_PREFIX = 'nextalk_blocked_contacts_';

export interface ToastNotification {
  id: string;
  title: string;
  body: string;
}

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [DatePipe, FormsModule],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.css'
})
export class ShellComponent implements OnInit, AfterViewChecked {
  @ViewChild('scrollContainer') scrollContainer!: ElementRef<HTMLElement>;

  rooms = signal<RoomResponse[]>([]);
  selectedRoom = signal<RoomResponse | null>(null);
  messages = signal<MessageResponse[]>([]);
  notifications = signal<NotificationResponse[]>([]);
  mediaItems = signal<string[]>([]);
  contactDirectory = signal<Record<string, UserResponse>>({});
  directSearchResults = signal<UserResponse[]>([]);
  selectedDirectContact = signal<UserResponse | null>(null);
  blockedUserIds = signal<string[]>([]);
  error = signal('');
  theme = signal<'light' | 'dark'>('light');
  searchText = signal('');
  infoPanelOpen = signal(false);
  notifPanelOpen = signal(false);
  attachmentMenuOpen = signal(false);
  composerMode = signal<'group' | 'dm' | null>(null);
  toasts = signal<ToastNotification[]>([]);
  /** Message awaiting delete confirmation (null = no dialog) */
  pendingDeleteMessage = signal<MessageResponse | null>(null);
  /** Whether the in-app camera capture modal is open */
  cameraModalOpen = signal(false);
  /** URLs of MEDIA messages that failed to load as images → rendered as doc cards */
  readonly imageFailedUrls = signal<ReadonlySet<string>>(new Set());

  private cameraStream: MediaStream | null = null;
  private cameraVideoEl: HTMLVideoElement | null = null;
  /** Per-room unread message counts (WhatsApp-style badge) */
  unreadCounts = signal<Record<string, number>>({});

  roomName = '';
  directSearchQuery = '';
  groupSearchQuery = '';
  groupSearchResults = signal<UserResponse[]>([]);
  selectedGroupContact = signal<UserResponse | null>(null);
  messageText = '';
  uploadLabel = signal('No file selected');
  /** True while the avatar upload+save is in progress */
  avatarUploading = signal(false);

  readonly user = computed(() => this.storage.user());
  readonly apiBaseUrl = API_BASE_URL;
  /** Full URL of the current user's avatar (null = use initials) */
  readonly myAvatarUrl = computed(() => {
    const u = this.user();
    if (!u?.avatarUrl) return null;
    // avatarUrl may be absolute (Google OAuth / full URL) or relative (/api/media/...)
    if (u.avatarUrl.startsWith('http')) return u.avatarUrl;
    return `${API_BASE_URL}${u.avatarUrl}`;
  });
  readonly unreadNotificationCount = computed(() =>
    this.notifications().filter((n) => !n.read).length
  );
  /** Total unread messages across all rooms (for notification bell badge) */
  readonly totalUnreadMessages = computed(() =>
    Object.values(this.unreadCounts()).reduce((sum, c) => sum + c, 0)
  );
  /** Rooms with unread messages — shown in the notification panel */
  readonly unreadRooms = computed(() => {
    const counts = this.unreadCounts();
    const allRooms = this.rooms();
    return Object.entries(counts)
      .filter(([, count]) => count > 0)
      .map(([roomId, count]) => ({
        room: allRooms.find((r) => r.id === roomId) ?? null,
        count
      }))
      .filter((item) => item.room !== null) as { room: RoomResponse; count: number }[];
  });
  /** True when there is anything to show in the notification panel */
  readonly hasAnyNotifications = computed(
    () => this.unreadRooms().length > 0 || this.notifications().length > 0
  );
  readonly filteredRooms = computed(() => {
    const query = this.searchText().trim().toLowerCase();
    if (!query) return this.rooms();
    return this.rooms().filter((room) => {
      const roomText =
        `${this.roomDisplayName(room)} ${this.roomSecondaryText(room)} ${room.type} ${room.members.length}`.toLowerCase();
      return roomText.includes(query);
    });
  });
  readonly selectedDirectMemberId = computed(() => {
    const room = this.selectedRoom();
    if (!room || room.type !== 'DIRECT') return null;
    return this.getOtherMemberId(room);
  });
  readonly isSelectedRoomBlocked = computed(() => {
    const userId = this.selectedDirectMemberId();
    return userId ? this.blockedUserIds().includes(userId) : false;
  });
  readonly selectedRoomAvatar = computed(() => {
    const room = this.selectedRoom();
    return room ? this.roomAvatar(room) : 'NT';
  });
  readonly selectedRoomTitle = computed(() => {
    const room = this.selectedRoom();
    return room ? this.roomDisplayName(room) : 'NexTalk';
  });
  readonly selectedRoomSubtitle = computed(() => {
    const room = this.selectedRoom();
    if (!room) return 'Pick a conversation and start chatting';
    if (room.type === 'DIRECT') {
      const otherMemberId = this.getOtherMemberId(room);
      const otherUser = otherMemberId ? this.contactDirectory()[otherMemberId] : null;
      if (otherUser) return otherUser.email;
      return 'Direct chat';
    }
    const memberCount = `${room.members.length} member${room.members.length === 1 ? '' : 's'}`;
    const status = this.realtimeService.connected() ? 'online now' : 'connecting...';
    return `Group chat · ${memberCount} · ${status}`;
  });
  readonly selectedRoomMeta = computed(() => {
    const room = this.selectedRoom();
    if (!room) return 'Select a chat to view members, media and notifications.';
    if (room.type === 'DIRECT') {
      const otherMemberId = this.getOtherMemberId(room);
      const otherUser = otherMemberId ? this.contactDirectory()[otherMemberId] : null;
      return otherUser ? `${otherUser.name} · ${otherUser.email}` : 'Direct conversation';
    }
    return `${room.members.length} members in this group`;
  });

  /** True when the logged-in user is the OWNER of the currently selected group room. */
  readonly isCurrentUserGroupAdmin = computed(() => {
    const room = this.selectedRoom();
    const userId = this.user()?.id;
    if (!room || !userId || room.type !== 'GROUP') return false;
    const member = room.members.find((m) => m.userId === userId);
    return member?.role === 'OWNER';
  });

  private shouldScrollToBottom = false;

  constructor(
    private readonly authService: AuthService,
    private readonly chatService: ChatService,
    private readonly mediaService: MediaService,
    private readonly notificationService: NotificationService,
    readonly realtimeService: RealtimeService,
    private readonly storage: TokenStorageService,
    private readonly route: ActivatedRoute,
    private readonly router: Router
  ) {
    const savedTheme = localStorage.getItem('nextalk_theme');
    if (savedTheme === 'dark' || savedTheme === 'light') {
      this.theme.set(savedTheme);
    }

    this.loadBlockedContacts();

    // Request browser notification permission early
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    effect(() => {
      const value = this.theme();
      document.body.dataset['theme'] = value;
      localStorage.setItem('nextalk_theme', value);
    });

    effect(
      () => {
        const event = this.realtimeService.lastEvent();
        const room = this.selectedRoom();
        const currentUserId = this.user()?.id;

        if (!event || !event.roomId) return;

        if (
          event.type === 'MESSAGE_CREATED' ||
          event.type === 'MESSAGE_UPDATED' ||
          event.type === 'MESSAGE_DELETED' ||
          event.type === 'REACTION'
        ) {
          if (
            event.userId &&
            event.userId === currentUserId &&
            event.type === 'MESSAGE_CREATED'
          ) {
            this.bumpRoomToTop(event.roomId);
            return;
          }

          if (room && event.roomId === room.id) {
            this.reloadMessages(room.id, false);
          }

          if (event.type === 'MESSAGE_CREATED') {
            this.bumpRoomToTop(event.roomId);

            // Show notification when message is from another user.
            // event.userId may be null for server-generated events — treat null
            // as "not from current user" so we never miss incoming messages.
            const isFromMe = event.userId != null && event.userId === currentUserId;
            if (!isFromMe) {
              const isCurrentRoom = room?.id === event.roomId;
              const isWindowFocused = document.hasFocus();

              // Increment per-room unread count when not in that room
              if (!isCurrentRoom) {
                this.unreadCounts.update((counts) => ({
                  ...counts,
                  [event.roomId!]: (counts[event.roomId!] ?? 0) + 1
                }));
              }

              // Always show in-app toast
              const senderName = event.userName ?? 'New message';
              const msgPreview = event.content ?? '';
              this.showToast(senderName, msgPreview);

              // Show browser notification when window is not focused or different room
              if (!isWindowFocused || !isCurrentRoom) {
                this.showBrowserNotification(senderName, msgPreview);
              }

              // Keep notification badge count in sync
              this.loadNotifications();
            }
          }
        }
      },
      { allowSignalWrites: true }
    );
  }

  ngOnInit(): void {
    this.loadRooms();
    this.loadNotifications();
    this.loadMedia();

    this.route.paramMap.subscribe((params) => {
      const roomId = params.get('roomId');
      if (roomId) {
        const room = this.rooms().find((r) => r.id === roomId);
        if (room) this.selectRoomInternal(room);
      } else {
        this.clearSelectedRoomInternal();
      }
    });
  }

  ngAfterViewChecked(): void {
    if (this.shouldScrollToBottom) {
      this.scrollToBottom();
      this.shouldScrollToBottom = false;
    }
  }

  // ─── Scroll ──────────────────────────────────────────────────────────────────

  private scrollToBottom(): void {
    try {
      const el = this.scrollContainer?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    } catch {
      // ignore
    }
  }

  private triggerScrollToBottom(): void {
    this.shouldScrollToBottom = true;
  }

  // ─── Toast / Browser Notifications ───────────────────────────────────────────

  private showToast(title: string, body: string): void {
    const id = Date.now().toString();
    this.toasts.update((t) => [...t, { id, title, body }]);
    setTimeout(() => this.dismissToast(id), 5000);
  }

  dismissToast(id: string): void {
    this.toasts.update((t) => t.filter((n) => n.id !== id));
  }

  private showBrowserNotification(title: string, body: string): void {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/favicon.ico' });
    } else if (Notification.permission === 'default') {
      Notification.requestPermission().then((perm) => {
        if (perm === 'granted') {
          new Notification(title, { body, icon: '/favicon.ico' });
        }
      });
    }
  }

  // ─── Theme ───────────────────────────────────────────────────────────────────

  async logout(): Promise<void> {
    this.realtimeService.disconnect();
    await this.authService.logout();
    void this.router.navigateByUrl('/auth');
  }

  toggleTheme(): void {
    this.theme.update((v) => (v === 'light' ? 'dark' : 'light'));
  }

  toggleInfoPanel(): void {
    this.infoPanelOpen.update((v) => !v);
  }

  toggleNotifPanel(): void {
    this.notifPanelOpen.update((v) => !v);
  }

  closeNotifPanel(): void {
    this.notifPanelOpen.set(false);
  }

  /** Navigate to a room from the notification panel and close the panel */
  goToRoom(room: RoomResponse): void {
    this.notifPanelOpen.set(false);
    void this.router.navigate(['/app', room.id]);
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    // Close notification panel on any outside click.
    // The bell button uses $event.stopPropagation() so clicking it
    // toggles rather than immediately closing.
    if (this.notifPanelOpen()) {
      this.notifPanelOpen.set(false);
    }
  }

  toggleAttachmentMenu(): void {
    this.attachmentMenuOpen.update((v) => !v);
  }

  closeAttachmentMenu(): void {
    this.attachmentMenuOpen.set(false);
  }

  clearSelectedRoom(): void {
    void this.router.navigate(['/app']);
  }

  private clearSelectedRoomInternal(): void {
    this.selectedRoom.set(null);
    this.infoPanelOpen.set(false);
    this.attachmentMenuOpen.set(false);
  }

  // ─── Composer ────────────────────────────────────────────────────────────────

  openComposer(mode: 'group' | 'dm'): void {
    this.composerMode.set(mode);
    this.error.set('');
    if (mode === 'dm') {
      this.directSearchResults.set([]);
      this.selectedDirectContact.set(null);
      this.directSearchQuery = '';
    }
  }

  closeComposer(): void {
    this.composerMode.set(null);
    this.directSearchResults.set([]);
    this.selectedDirectContact.set(null);
    this.directSearchQuery = '';
  }

  onDirectSearchQueryChange(value: string): void {
    this.directSearchQuery = value;
    this.selectedDirectContact.set(null);
    const normalized = value.trim();
    if (normalized.length < 2) {
      this.directSearchResults.set([]);
      return;
    }
    this.authService.searchUsers(normalized).subscribe({
      next: (users) => this.directSearchResults.set(users),
      error: () => this.directSearchResults.set([])
    });
  }

  chooseDirectContact(user: UserResponse): void {
    this.selectedDirectContact.set(user);
    this.directSearchQuery = `${user.name} (${user.email})`;
    this.directSearchResults.set([]);
  }

  createRoom(): void {
    if (!this.roomName.trim()) return;
    this.chatService.createRoom(this.roomName.trim()).subscribe({
      next: (room) => {
        this.roomName = '';
        this.composerMode.set(null);
        this.rooms.update((rooms) => [room, ...rooms]);
        this.selectRoom(room);
      },
      error: (err) => this.showError(err)
    });
  }

  createDirectRoom(): void {
    const contact = this.selectedDirectContact();
    if (!contact) {
      this.error.set('Select a user from the search results to start a direct chat.');
      return;
    }
    this.chatService.createDirectRoom(contact.id, contact.name).subscribe({
      next: (room) => {
        this.contactDirectory.update((dir) => ({ ...dir, [contact.id]: contact }));
        this.composerMode.set(null);
        this.directSearchResults.set([]);
        this.selectedDirectContact.set(null);
        this.directSearchQuery = '';
        this.rooms.update((rooms) => [room, ...rooms.filter((r) => r.id !== room.id)]);
        this.selectRoom(room);
      },
      error: (err) => this.showError(err)
    });
  }

  onGroupSearchQueryChange(value: string): void {
    this.groupSearchQuery = value;
    this.selectedGroupContact.set(null);
    const normalized = value.trim();
    if (normalized.length < 2) {
      this.groupSearchResults.set([]);
      return;
    }
    this.authService.searchUsers(normalized).subscribe({
      next: (users) => this.groupSearchResults.set(users),
      error: () => this.groupSearchResults.set([])
    });
  }

  chooseGroupContact(user: UserResponse): void {
    this.selectedGroupContact.set(user);
    this.groupSearchQuery = `${user.name} (${user.email})`;
    this.groupSearchResults.set([]);
  }

  addMember(): void {
    const room = this.selectedRoom();
    const contact = this.selectedGroupContact();
    if (!room || !contact) return;
    this.chatService.addMember(room.id, contact.id).subscribe({
      next: () => {
        this.groupSearchQuery = '';
        this.selectedGroupContact.set(null);
        this.loadRooms();
      },
      error: (err) => this.showError(err)
    });
  }

  /** Admin-only: remove a member from the current group room. */
  removeMemberFromGroup(userId: string): void {
    const room = this.selectedRoom();
    if (!room || !this.isCurrentUserGroupAdmin()) return;
    this.chatService.removeMember(room.id, userId).subscribe({
      next: () => this.loadRooms(),
      error: (err) => this.showError(err)
    });
  }

  selectRoom(room: RoomResponse): void {
    void this.router.navigate(['/app', room.id]);
  }

  private selectRoomInternal(room: RoomResponse): void {
    this.selectedRoom.set(room);
    this.attachmentMenuOpen.set(false);
    this.error.set('');
    // Clear unread count for this room when opened
    this.unreadCounts.update((counts) => {
      const next = { ...counts };
      delete next[room.id];
      return next;
    });
    this.reloadMessages(room.id, false);
    // Refresh contact directory so we always display the latest avatar of
    // all members in this room (including updated DPs from other users)
    this.refreshDirectoryForRoom(room);
  }

  // ─── Messages ─────────────────────────────────────────────────────────────────

  sendMessage(): void {
    const room = this.selectedRoom();
    if (!room || !this.messageText.trim()) return;
    if (this.isSelectedRoomBlocked()) {
      this.error.set('This contact is blocked. Unblock to send messages.');
      return;
    }
    this.chatService.sendMessage(room.id, this.messageText.trim()).subscribe({
      next: (message) => {
        this.messageText = '';
        this.messages.update((msgs) => [...msgs, message]);
        this.triggerScrollToBottom();
        this.realtimeService.sendRoomEvent(room.id, 'MESSAGE_CREATED', message.id, message.content);
      },
      error: (err) => this.showError(err)
    });
  }

  /** Show the confirmation dialog instead of deleting immediately */
  deleteMessage(message: MessageResponse): void {
    this.pendingDeleteMessage.set(message);
  }

  /** Called when the user confirms deletion in the dialog */
  confirmDelete(): void {
    const message = this.pendingDeleteMessage();
    const room = this.selectedRoom();
    if (!message || !room) { this.pendingDeleteMessage.set(null); return; }
    this.pendingDeleteMessage.set(null);
    this.chatService.deleteMessage(message.id).subscribe({
      next: () => {
        this.messages.update((msgs) =>
          msgs.map((m) =>
            m.id === message.id
              ? { ...m, deleted: true, content: 'This message was deleted' }
              : m
          )
        );
        this.realtimeService.sendRoomEvent(
          room.id,
          'MESSAGE_DELETED',
          message.id,
          'This message was deleted'
        );
      },
      error: (err) => this.showError(err)
    });
  }

  /** Called when the user cancels deletion */
  cancelDelete(): void {
    this.pendingDeleteMessage.set(null);
  }

  deleteCurrentChat(): void {
    const room = this.selectedRoom();
    if (!room) return;
    this.chatService.leaveRoom(room.id).subscribe({
      next: () => {
        const remaining = this.rooms().filter((r) => r.id !== room.id);
        this.rooms.set(remaining);
        if (remaining.length > 0) {
          void this.router.navigate(['/app', remaining[0].id]);
        } else {
          void this.router.navigate(['/app']);
        }
      },
      error: (err) => this.showError(err)
    });
  }

  // ─── Block / Unblock ─────────────────────────────────────────────────────────

  blockSelectedContact(): void {
    const otherUserId = this.selectedDirectMemberId();
    if (!otherUserId || this.blockedUserIds().includes(otherUserId)) return;
    const next = [...this.blockedUserIds(), otherUserId];
    this.blockedUserIds.set(next);
    this.persistBlockedContacts(next);
  }

  unblockSelectedContact(): void {
    const otherUserId = this.selectedDirectMemberId();
    if (!otherUserId) return;
    const next = this.blockedUserIds().filter((id) => id !== otherUserId);
    this.blockedUserIds.set(next);
    this.persistBlockedContacts(next);
  }

  // ─── Reactions ───────────────────────────────────────────────────────────────

  react(message: MessageResponse, emoji: string): void {
    const room = this.selectedRoom();
    if (!room) return;
    this.chatService.addReaction(message.id, emoji).subscribe({
      next: () => {
        this.reloadMessages(room.id, false);
        this.realtimeService.sendReaction(room.id, message.id, emoji, false);
      },
      error: (err) => this.showError(err)
    });
  }

  sendTyping(): void {
    const room = this.selectedRoom();
    if (room) this.realtimeService.sendTyping(room.id, true);
  }

  hasUserLiked(message: MessageResponse): boolean {
    const currentUserId = this.user()?.id;
    if (!currentUserId || !message.reactions) return false;
    return message.reactions.some((r) => r.userId === currentUserId);
  }

  toggleLike(message: MessageResponse): void {
    const currentUserId = this.user()?.id;
    if (!currentUserId) return;

    const userReaction = message.reactions?.find((r) => r.userId === currentUserId);
    const isLiked = !!userReaction;

    this.messages.update((msgs) =>
      msgs.map((m) => {
        if (m.id !== message.id) return m;
        let newReactions = m.reactions ? [...m.reactions] : [];
        if (isLiked) {
          newReactions = newReactions.filter((r) => r.userId !== currentUserId);
        } else {
          newReactions.push({
            id: 'temp-' + Date.now(),
            messageId: m.id,
            userId: currentUserId,
            emoji: '❤️',
            createdAt: new Date().toISOString()
          });
        }
        return { ...m, reactions: newReactions };
      })
    );

    if (isLiked && userReaction) {
      this.chatService.removeReaction(message.id, userReaction.emoji).subscribe({
        next: () =>
          this.realtimeService.sendReaction(message.roomId, message.id, userReaction.emoji, true),
        error: (err) => {
          this.showError(err);
          this.reloadMessages(message.roomId, false);
        }
      });
    } else {
      this.chatService.addReaction(message.id, '❤️').subscribe({
        next: () => this.realtimeService.sendReaction(message.roomId, message.id, '❤️', false),
        error: (err) => {
          this.showError(err);
          this.reloadMessages(message.roomId, false);
        }
      });
    }
  }

  // ─── Media Upload ─────────────────────────────────────────────────────────────

  /** Called by photo/doc file inputs */
  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    input.value = ''; // reset so same file can be re-selected
    this.uploadFile(file);
  }

  /** Core upload+send logic shared by file inputs and camera capture */
  private uploadFile(file: File): void {
    const room = this.selectedRoom();
    if (!room) return;
    this.attachmentMenuOpen.set(false);

    this.mediaService.upload(file).subscribe({
      next: (response) => {
        this.chatService.sendMessage(room.id, response.fileUrl, 'MEDIA').subscribe({
          next: (message) => {
            this.messages.update((msgs) => [...msgs, message]);
            this.triggerScrollToBottom();
            this.realtimeService.sendRoomEvent(
              room.id,
              'MESSAGE_CREATED',
              message.id,
              message.content
            );
          },
          error: (err) => this.showError(err)
        });
      },
      error: (err) => this.showError(err)
    });
  }

  // ─── Camera capture (getUserMedia) ───────────────────────────────────────────

  /** Open the in-app camera modal using getUserMedia */
  openCamera(): void {
    this.closeAttachmentMenu();
    if (!navigator.mediaDevices?.getUserMedia) {
      this.error.set('Camera not supported in this browser.');
      return;
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then((stream) => {
        this.cameraStream = stream;
        this.cameraModalOpen.set(true);
        // attach stream to video element once modal is rendered
        setTimeout(() => {
          const video = document.getElementById('camera-preview') as HTMLVideoElement | null;
          if (video) {
            video.srcObject = stream;
            this.cameraVideoEl = video;
          }
        }, 80);
      })
      .catch(() => {
        this.error.set('Could not access camera. Please grant camera permission.');
      });
  }

  /** Capture a frame from the camera video stream and send it */
  capturePhoto(): void {
    const video = this.cameraVideoEl;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width  = video.videoWidth  || 640;
    canvas.height = video.videoHeight || 480;
    canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' });
      this.closeCameraModal();
      this.uploadFile(file);
    }, 'image/jpeg', 0.92);
  }

  /** Stop camera stream and close the modal */
  closeCameraModal(): void {
    if (this.cameraStream) {
      this.cameraStream.getTracks().forEach((t) => t.stop());
      this.cameraStream = null;
    }
    this.cameraVideoEl = null;
    this.cameraModalOpen.set(false);
  }

  markNotificationsRead(): void {
    this.notificationService.markAllRead().subscribe({
      next: () => this.loadNotifications(),
      error: (err) => this.showError(err)
    });
  }

  // ─── Display helpers ─────────────────────────────────────────────────────────

  /** Returns the unread count for a specific room */
  getUnreadCount(roomId: string): number {
    return this.unreadCounts()[roomId] ?? 0;
  }

  /**
   * Returns full avatar image URL for a contact user, or null if they have none.
   * Used so the template can show <img> vs initials fallback.
   */
  getUserAvatarUrl(userId: string): string | null {
    const u = this.contactDirectory()[userId];
    if (!u?.avatarUrl) return null;
    // avatarUrl may already be absolute (Google OAuth) or a relative media path
    if (u.avatarUrl.startsWith('http')) return u.avatarUrl;
    return `${API_BASE_URL}${u.avatarUrl}`;
  }

  /** Returns full avatar image URL for a room, or null if it has none. */
  getRoomAvatarUrl(room: RoomResponse): string | null {
    if (!room.avatarUrl) return null;
    if (room.avatarUrl.startsWith('http')) return room.avatarUrl;
    return `${API_BASE_URL}${room.avatarUrl}`;
  }

  /** Upload a new profile picture for the logged-in user */
  uploadMyAvatar(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    input.value = '';
    this.avatarUploading.set(true);
    this.mediaService.upload(file).subscribe({
      next: (media) => {
        // Persist to backend first — avatar must be saved to DB so other users see it
        this.authService.updateAvatar(media.fileUrl).subscribe({
          next: (updatedUser) => {
            // Apply from the confirmed server response so token storage stays in sync
            this.storage.updateUser({ avatarUrl: updatedUser.avatarUrl });
            this.avatarUploading.set(false);
          },
          error: (err) => {
            // Apply locally as a fallback so the UI reflects the change for this session
            this.storage.updateUser({ avatarUrl: media.fileUrl });
            this.avatarUploading.set(false);
            this.showError(err);
          }
        });
      },
      error: (err) => { this.avatarUploading.set(false); this.showError(err); }
    });
  }

  /** Upload a new profile picture for the currently selected group (admin only) */
  uploadGroupAvatar(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const room = this.selectedRoom();
    if (!room || room.type !== 'GROUP' || !this.isCurrentUserGroupAdmin()) return;
    
    const file = input.files[0];
    input.value = '';
    this.avatarUploading.set(true);
    this.mediaService.upload(file).subscribe({
      next: (media) => {
        this.chatService.updateRoomAvatar(room.id, media.fileUrl).subscribe({
          next: () => {
            this.avatarUploading.set(false);
            this.loadRooms();
          },
          error: (err) => {
            this.avatarUploading.set(false);
            this.showError(err);
          }
        });
      },
      error: (err) => { this.avatarUploading.set(false); this.showError(err); }
    });
  }

  roomDisplayName(room: RoomResponse): string {
    if (room.type === 'DIRECT') {
      const otherMemberId = this.getOtherMemberId(room);
      const otherUser = otherMemberId ? this.contactDirectory()[otherMemberId] : null;
      return otherUser?.name ?? room.name;
    }
    return room.name;
  }

  roomSecondaryText(room: RoomResponse): string {
    if (room.type === 'DIRECT') {
      const otherMemberId = this.getOtherMemberId(room);
      const otherUser = otherMemberId ? this.contactDirectory()[otherMemberId] : null;
      return otherUser?.email ?? 'Direct message';
    }
    return `${room.members.length} members`;
  }

  roomAvatar(room: RoomResponse): string {
    const displayName = this.roomDisplayName(room);
    if (room.type === 'DIRECT') {
      const letters = displayName
        .replace(/[^A-Za-z0-9 ]/g, '')
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((p) => p.charAt(0).toUpperCase())
        .join('');
      return letters || 'DM';
    }
    return displayName.replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || 'GR';
  }

  messageIsMine(message: MessageResponse): boolean {
    return message.senderId === this.user()?.id;
  }

  /**
   * Returns the display name of a message sender for group chats.
   * Falls back to a short ID fragment if the user isn't in the directory yet.
   */
  getSenderName(message: MessageResponse): string {
    const sender = this.contactDirectory()[message.senderId];
    if (sender) return sender.name;
    // Fallback: show a short version of the ID so it's still identifiable
    return message.senderId.slice(0, 8) + '…';
  }

  /**
   * Called by the <img> onerror handler for a MEDIA message.
   * Adds the URL to imageFailedUrls which causes the template to
   * re-render it as a document card instead.
   */
  markImageFailed(url: string): void {
    this.imageFailedUrls.update((set) => new Set([...set, url]));
  }

  /** Extracts a human-readable filename from a media URL */
  getFileName(url: string): string {
    try {
      const decoded = decodeURIComponent(url.split('/').pop() ?? url);
      return decoded.replace(/^\d+_/, '') || 'File';
    } catch {
      return 'File';
    }
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private reloadMessages(roomId: string, _reconnect: boolean): void {
    this.chatService.getMessages(roomId).subscribe({
      next: (page) => {
        this.messages.set([...page.content].reverse());
        this.triggerScrollToBottom();
      },
      error: (err) => this.showError(err)
    });
  }

  private loadRooms(): void {
    this.chatService.getRooms().subscribe({
      next: (rooms) => {
        rooms.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        this.rooms.set(rooms);
        this.loadDirectoryForRooms(rooms);
        this.realtimeService.connect(rooms.map((r) => r.id));

        const urlRoomId = this.route.snapshot.paramMap.get('roomId');
        const preferredRoom = urlRoomId ? rooms.find((r) => r.id === urlRoomId) : null;

        if (preferredRoom) {
          this.selectRoomInternal(preferredRoom);
        } else {
          // No room in URL — show the placeholder, let the user choose
          this.clearSelectedRoomInternal();
        }
      },
      error: (err) => this.showError(err)
    });
  }

  private loadDirectoryForRooms(rooms: RoomResponse[]): void {
    const currentUserId = this.user()?.id;
    if (!currentUserId) return;

    // Collect all unique member IDs from both DIRECT and GROUP rooms (excluding self)
    const allMemberIds = Array.from(
      new Set(
        rooms
          .flatMap((r) => r.members)
          .map((m) => m.userId)
          .filter((id): id is string => !!id && id !== currentUserId)
      )
    );

    if (allMemberIds.length === 0) return;

    this.authService.directory(allMemberIds).subscribe({
      next: (users) => {
        const next = { ...this.contactDirectory() };
        users.forEach((u) => (next[u.id] = u));
        this.contactDirectory.set(next);
      },
      error: () => undefined
    });
  }

  /**
   * Refresh directory entries for the members of a specific room.
   * Called when a room is selected so avatars are always up-to-date.
   */
  private refreshDirectoryForRoom(room: RoomResponse): void {
    const currentUserId = this.user()?.id;
    if (!currentUserId) return;

    const memberIds = room.members
      .map((m) => m.userId)
      .filter((id): id is string => !!id && id !== currentUserId);

    if (memberIds.length === 0) return;

    this.authService.directory(memberIds).subscribe({
      next: (users) => {
        const next = { ...this.contactDirectory() };
        users.forEach((u) => (next[u.id] = u));
        this.contactDirectory.set(next);
      },
      error: () => undefined
    });
  }

  private loadNotifications(): void {
    this.notificationService.list().subscribe({
      next: (page) => this.notifications.set(page.content),
      error: () => this.notifications.set([])
    });
  }

  private loadMedia(): void {
    this.mediaService.gallery().subscribe({
      next: (page) => {
        this.mediaItems.set(
          page.content.map((item) => `${API_BASE_URL}${item.thumbnailUrl ?? item.fileUrl}`)
        );
      },
      error: () => this.mediaItems.set([])
    });
  }

  private bumpRoomToTop(roomId: string): void {
    this.rooms.update((currentRooms) => {
      const index = currentRooms.findIndex((r) => r.id === roomId);
      if (index > 0) {
        const r = currentRooms[index];
        return [r, ...currentRooms.filter((x) => x.id !== roomId)];
      }
      return currentRooms;
    });
  }

  getOtherMemberId(room: RoomResponse): string | null {
    const currentUserId = this.user()?.id;
    return room.members.find((m) => m.userId !== currentUserId)?.userId ?? null;
  }

  private blockStorageKey(): string | null {
    const currentUserId = this.user()?.id;
    return currentUserId ? `${BLOCKED_CONTACTS_PREFIX}${currentUserId}` : null;
  }

  private loadBlockedContacts(): void {
    const key = this.blockStorageKey();
    if (!key) { this.blockedUserIds.set([]); return; }
    try {
      const raw = localStorage.getItem(key);
      this.blockedUserIds.set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      this.blockedUserIds.set([]);
    }
  }

  private persistBlockedContacts(ids: string[]): void {
    const key = this.blockStorageKey();
    if (!key) return;
    localStorage.setItem(key, JSON.stringify(ids));
  }

  private showError(error: unknown): void {
    const value = error as { error?: { message?: string } };
    this.error.set(value.error?.message ?? 'Request failed. Check backend services.');
  }
}
