/**
 * Sharing End Hook
 * Used to capture Scrcpy canvas video stream and share it to remote viewers via WebRTC
 */

import scrcpyState from '@/components/Scrcpy/scrcpy-state';
import { deserializeCommand, isKeyCommand, isTouchCommand } from '@/services/command-types';
import { normalizedToDevice } from '@/services/coord-utils';
import { PEER_CONFIG, generateShareId } from '@/services/peer-config';
import type { DataConnection, MediaConnection } from 'peerjs';
import Peer from 'peerjs';
import type { Ref, ShallowRef } from 'vue';
import { computed, onUnmounted, ref, shallowRef } from 'vue';

export type ConnectionState = 'idle' | 'initializing' | 'ready' | 'error';

export interface ViewerConnection {
  id: string;
  mediaConnection: MediaConnection;
  dataConnection: DataConnection | null;
  connectedAt: Date;
}

export interface UseScreenShareReturn {
  isSharing: Ref<boolean>;
  peerId: Ref<string | null>;
  viewerCount: Ref<number>;
  connectionState: Ref<ConnectionState>;
  error: Ref<string | null>;
  startSharing: (canvas: HTMLCanvasElement | HTMLVideoElement, frameRate?: number) => Promise<void>;
  stopSharing: () => void;
  viewers: ShallowRef<ViewerConnection[]>;
}

export function useScreenShare(): UseScreenShareReturn {
  const isSharing = ref(false);
  const peerId = ref<string | null>(null);
  const connectionState = ref<ConnectionState>('idle');
  const error = ref<string | null>(null);
  const viewers = shallowRef<ViewerConnection[]>([]);
  
  let peer: Peer | null = null;
  let mediaStream: MediaStream | null = null;
  const mediaConnections: MediaConnection[] = [];
  const dataConnections: DataConnection[] = [];

  const viewerCount = computed(() => viewers.value.length);

  /**
   * Handle control commands from viewers
   */
  function handleCommand(data: unknown): void {
    const command = typeof data === 'string' ? deserializeCommand(data) : data as any;
    if (!command) {
      console.warn('[Host] Received invalid control command:', data);
      return;
    }

    console.log('[Host] Received control command:', command);

    if (isTouchCommand(command)) {
      const deviceCoords = normalizedToDevice(
        command.x,
        command.y,
        scrcpyState.width,
        scrcpyState.height,
        scrcpyState.rotation
      );

      const controller = scrcpyState.scrcpy?.controller;
      if (controller) {
        const actionMap: Record<string, number> = {
          'down': 0,
          'move': 2,
          'up': 1,
        };
        
        controller.injectTouch({
            action: actionMap[command.action] as any,
            pointerId: BigInt(command.pointerId),
            pointerX: deviceCoords.x,
            pointerY: deviceCoords.y,
            pressure: command.action === 'up' ? 0 : 1,
            actionButton: 0,
            buttons: command.action === 'up' ? 0 : 1,
            videoWidth: 0,
            videoHeight: 0
        });
      }
    } else if (isKeyCommand(command)) {
      const keyMap: Record<string, string> = {
        'back': 'Back',
        'home': 'AndroidHome',
        'recents': 'AppSwitch',
      };
      
      const keyName = keyMap[command.key];
      if (keyName && scrcpyState.keyboard) {
        scrcpyState.keyboard.down(keyName);
        setTimeout(() => {
          scrcpyState.keyboard?.up(keyName);
        }, 50);
      }
    }
  }

  /**
   * Start Sharing Screen
   */
  async function startSharing(
    canvas: HTMLCanvasElement | HTMLVideoElement,
    frameRate: number = 30
  ): Promise<void> {
    if (isSharing.value) {
      console.warn('[Host] Already sharing');
      return;
    }

    try {
      connectionState.value = 'initializing';
      error.value = null;

      // Capture video stream (now uniformly using Canvas renderer)
      if (canvas instanceof HTMLCanvasElement) {
        console.log('[Host] Capturing video stream from Canvas, dimensions:', canvas.width, 'x', canvas.height);
        mediaStream = canvas.captureStream(frameRate);
      } else {
        throw new Error('Unsupported element type, please ensure using Canvas renderer');
      }

      if (!mediaStream) {
        throw new Error('Unable to get video stream');
      }

      // Clean up old connection
      if (peer && !peer.destroyed) {
        peer.destroy();
      }

      const customId = generateShareId();
      
      await new Promise<void>((resolve, reject) => {
        peer = new Peer(customId, PEER_CONFIG);

        // ========== Signaling Event 1: Peer Connection Successful ==========
        peer.on('open', (id) => {
          console.log('[Host] Connected to signaling server, share code:', id);
          peerId.value = id;
          isSharing.value = true;
          connectionState.value = 'ready';
          resolve();
        });

        // ========== Signaling Event 2: Received Video Request ==========
        peer.on('call', (call: MediaConnection) => {
          console.log('[Host] Received video request from:', call.peer);
          
          if (!mediaStream) {
            call.close();
            return;
          }

          // Answer and send video stream
          call.answer(mediaStream);
          mediaConnections.push(call);

          // Add to viewer list
          const viewerConnection: ViewerConnection = {
            id: call.peer,
            mediaConnection: call,
            dataConnection: null,
            connectedAt: new Date(),
          };
          viewers.value = [...viewers.value, viewerConnection];

          call.on('close', () => {
            console.log('[Host] Media connection closed:', call.peer);
            const idx = mediaConnections.indexOf(call);
            if (idx > -1) mediaConnections.splice(idx, 1);
            viewers.value = viewers.value.filter(v => v.id !== call.peer);
          });

          call.on('error', (err) => {
            console.error('[Host] Media connection error:', err);
            const idx = mediaConnections.indexOf(call);
            if (idx > -1) mediaConnections.splice(idx, 1);
            viewers.value = viewers.value.filter(v => v.id !== call.peer);
          });
        });

        // ========== Signaling Event 3: Received Data Connection (for remote control) ==========
        peer.on('connection', (dataConn: DataConnection) => {
          console.log('[Host] Received data connection from:', dataConn.peer);
          dataConnections.push(dataConn);

          // Update the corresponding viewer's dataConnection
          const viewer = viewers.value.find(v => v.id === dataConn.peer);
          if (viewer) {
            viewer.dataConnection = dataConn;
          }

          dataConn.on('data', (data) => {
            handleCommand(data);
          });

          dataConn.on('close', () => {
            console.log('[Host] Data connection closed:', dataConn.peer);
            const idx = dataConnections.indexOf(dataConn);
            if (idx > -1) dataConnections.splice(idx, 1);
          });

          dataConn.on('error', (err) => {
            console.error('[Host] Data connection error:', err);
            const idx = dataConnections.indexOf(dataConn);
            if (idx > -1) dataConnections.splice(idx, 1);
          });
        });

        // ========== Signaling Event 4: Connection Error ==========
        peer.on('error', (err) => {
          console.error('[Host] Peer error:', err);
          
          if (err.type === 'unavailable-id') {
            // ID is occupied, try random ID
            peer?.destroy();
            peer = new Peer(PEER_CONFIG);
            peer.on('open', (id) => {
              peerId.value = id;
              isSharing.value = true;
              connectionState.value = 'ready';
              resolve();
            });
          } else {
            error.value = err.message;
            connectionState.value = 'error';
            reject(err);
          }
        });

        peer.on('disconnected', () => {
          console.warn('[Host] Disconnected, attempting to reconnect...');
          peer?.reconnect();
        });
      });

      console.log('[Host] Started sharing, share code:', peerId.value);

    } catch (err) {
      console.error('[Host] Failed to start sharing:', err);
      error.value = err instanceof Error ? err.message : 'Unknown error';
      connectionState.value = 'error';
      stopSharing();
      throw err;
    }
  }

  /**
   * Stop Sharing
   */
  function stopSharing(): void {
    mediaConnections.forEach(c => c.close());
    mediaConnections.length = 0;
    
    dataConnections.forEach(c => c.close());
    dataConnections.length = 0;

    mediaStream?.getTracks().forEach(t => t.stop());
    mediaStream = null;

    peer?.destroy();
    peer = null;

    isSharing.value = false;
    peerId.value = null;
    connectionState.value = 'idle';
    error.value = null;
    viewers.value = [];

    console.log('[Host] Stopped sharing');
  }

  onUnmounted(() => {
    stopSharing();
  });

  return {
    isSharing,
    peerId,
    viewerCount,
    connectionState,
    error,
    startSharing,
    stopSharing,
    viewers,
  };
}
