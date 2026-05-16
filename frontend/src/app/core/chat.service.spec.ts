import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';

import { ChatService } from './chat.service';
import { API_BASE_URL } from './api.config';
import { RoomResponse, MessageResponse } from './models';

const mockRoom: RoomResponse = {
  id: 'room-001',
  name: 'Test Group',
  avatarUrl: null,
  type: 'GROUP',
  createdBy: 'user-123',
  createdAt: new Date().toISOString(),
  members: [],
};

const mockMessage: MessageResponse = {
  id: 'msg-001',
  roomId: 'room-001',
  senderId: 'user-123',
  content: 'Hello World',
  type: 'TEXT',
  edited: false,
  deleted: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  reactions: [],
};

describe('ChatService', () => {
  let service: ChatService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [ChatService],
    });
    service = TestBed.inject(ChatService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('getRooms() should make GET request to /api/chat/rooms', () => {
    service.getRooms().subscribe((rooms) => {
      expect(rooms.length).toBe(1);
      expect(rooms[0].name).toBe('Test Group');
    });

    const req = httpMock.expectOne(`${API_BASE_URL}/api/chat/rooms`);
    expect(req.request.method).toBe('GET');
    req.flush([mockRoom]);
  });

  it('createRoom() should POST room name', () => {
    service.createRoom('New Room').subscribe((room) => {
      expect(room.name).toBe('Test Group');
    });

    const req = httpMock.expectOne(`${API_BASE_URL}/api/chat/rooms`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ name: 'New Room' });
    req.flush(mockRoom);
  });

  it('createDirectRoom() should POST otherUserId', () => {
    service.createDirectRoom('user-456', 'Alice').subscribe();

    const req = httpMock.expectOne(`${API_BASE_URL}/api/chat/rooms/direct`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ otherUserId: 'user-456', displayName: 'Alice' });
    req.flush(mockRoom);
  });

  it('sendMessage() should POST to room messages endpoint', () => {
    service.sendMessage('room-001', 'Hello World').subscribe((msg) => {
      expect(msg.content).toBe('Hello World');
    });

    const req = httpMock.expectOne(`${API_BASE_URL}/api/chat/rooms/room-001/messages`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ content: 'Hello World', type: 'TEXT' });
    req.flush(mockMessage);
  });

  it('deleteMessage() should send DELETE request', () => {
    service.deleteMessage('msg-001').subscribe();

    const req = httpMock.expectOne(`${API_BASE_URL}/api/chat/messages/msg-001`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });

  it('leaveRoom() should send DELETE to members/me', () => {
    service.leaveRoom('room-001').subscribe();

    const req = httpMock.expectOne(`${API_BASE_URL}/api/chat/rooms/room-001/members/me`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });
});
