'use client';
import { io, Socket } from 'socket.io-client';

let _socket: Socket | null = null;

export function getSocket(): Socket {
  if (!_socket) {
    _socket = io({
      // Connect to the same origin; Apache proxies /testing/v60/socket.io/ → Flask
      path: '/testing/v60/socket.io/',
      // Werkzeug can't handle WebSocket upgrades — polling works reliably via Apache proxy
      transports: ['polling'],
      withCredentials: true,
      autoConnect: false,
    });
  }
  return _socket;
}

export type SocketArtifactEvent = {
  artifact_id: string;
  artifact_name: string;
  artifact_type: string;
  case_id: string;
};

export type SocketTaskEvent = {
  task_id: string;
  done: number;
  total: number;
  status: 'progress' | 'complete' | 'error';
  message?: string;
};
