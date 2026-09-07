export interface MeetingRoom {
  id: number;
  code: string;
  name: string;
  location: string;
  capacity: number;
  equipment: string | null;
  available: boolean;
  createdAt: string;
}

export interface MeetingBooking {
  id: number;
  title: string;
  roomId: number;
  roomName: string;
  roomCode: string;
  organizer: string;
  startTime: string;
  endTime: string;
  notes: string | null;
  status: 'booked' | 'cancelled';
  createdAt: string;
}

export interface MeetingRoomInput {
  code: string;
  name: string;
  location: string;
  capacity: number;
  equipment?: string | null;
  available: boolean;
}

export interface MeetingBookingInput {
  title: string;
  roomId: number;
  organizer: string;
  startTime: string;
  endTime: string;
  notes?: string | null;
}

export interface MeetingBookingListFilters {
  roomId?: number;
  date?: string;
  search?: string;
}

export interface ApiErrorPayload {
  code?: string;
  message?: string;
}
