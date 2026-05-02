/**
 * Viewer End Hook
 * Used to connect to the sharing end and receive video stream, send control commands
 */

import { ref, onUnmounted } from 'vue';
import type { Ref } from 'vue';
import Peer from 'peerjs';
import type { MediaConnection, DataConnection } from 'peerjs';
import { PEER_CONFIG } from '@/services/peer-config';
import type { RemoteControlCommand } from '@/services/command-types';

export type ViewerConnectionState = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';

export interface UseScreenViewerReturn {
  isConnected: Ref<boolean>;
  connectionState: Ref<ViewerConnectionState>;
  error: Ref<string | null>;
  remoteStream: Ref<MediaStream | null>;
  connect: (hostPeerId: string) => Promise<void>;
  disconnect: () => void;
  sendCommand: (command: RemoteControlCommand) => void;
}

export function useScreenViewer(): UseScreenViewerReturn {
  const isConnected = ref(false);
  const connectionState = ref<ViewerConnectionState>('idle');
  const error = ref<string | null>(null);
  const remoteStream = ref<MediaStream | null>(null);
  
  let peer: Peer | null = null;
  let call: MediaConnection | null = null;
  let dataConn: DataConnection | null = null;
  let timeout: ReturnType<typeof setTimeout> | null = null;

  /**
   * Connect to the sharing end
   */
  async function connect(remotePeerId: string): Promise<void> {
    // Clean up old connection
    if (peer && !peer.destroyed) {
      peer.destroy();
    }
    if (timeout) {
      clearTimeout(timeout);
    }

    error.value = null;
    connectionState.value = 'connecting';
    isConnected.value = false;
    remoteStream.value = null;

    return new Promise((resolve, reject) => {
      peer = new Peer(PEER_CONFIG);

      // 30 second timeout
      timeout = setTimeout(() => {
        if (peer && !peer.destroyed) {
          peer.destroy();
        }
        connectionState.value = 'error';
        error.value = 'Connection timed out, please check if the share code is correct';
        reject(new Error('Connection timeout'));
      }, 30000);

      // ========== Signaling Event 1: Local Peer Connection Successful ==========
      peer.on('open', (id) => {
        console.log('[Viewer] Connected to signaling server, local ID:', id);

        // ========== Signaling Event 2: Establish Data Channel ==========
        dataConn = peer!.connect(remotePeerId, { reliable: true });
        
        dataConn.on('open', () => {
          console.log('[Viewer] Data channel established');
        });

        dataConn.on('error', (err) => {
          console.warn('[Viewer] Data channel error:', err);
        });

        dataConn.on('close', () => {
          console.log('[Viewer] Data channel closed');
        });

        // Create dummy video stream for SDP negotiation
        // WebRTC requires bidirectional media negotiation, even if the viewer does not send actual video
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 480;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = 'black';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        const dummyStream = canvas.captureStream(1);

        // ========== Signaling Event 3: Initiate Video Request ==========
        call = peer!.call(remotePeerId, dummyStream);
        console.log('[Viewer] Initiating video request, target:', remotePeerId);

        if (!call) {
          if (timeout) clearTimeout(timeout);
          connectionState.value = 'error';
          error.value = 'Unable to connect to the sharing end';
          reject(new Error('Unable to connect to the sharing end'));
          return;
        }

        // ========== Signaling Event 4: Received Remote Video Stream ==========
        call.on('stream', (stream) => {
          console.log('[Viewer] Received remote video stream');
          console.log('[Viewer] Video track count:', stream.getVideoTracks().length);
          console.log('[Viewer] Audio track count:', stream.getAudioTracks().length);
          
          const videoTracks = stream.getVideoTracks();
          if (videoTracks.length > 0) {
            const track = videoTracks[0];
            console.log('[Viewer] Video track status:', track.readyState, 'enabled:', track.enabled);
            const settings = track.getSettings();
            console.log('[Viewer] Video settings:', settings);
          }
          
          if (timeout) {
            clearTimeout(timeout);
            timeout = null;
          }

          remoteStream.value = stream;
          isConnected.value = true;
          connectionState.value = 'connected';
          error.value = null;
          resolve();
        });

        call.on('error', (err) => {
          console.error('[Viewer] Media connection error:', err);
          if (timeout) clearTimeout(timeout);
          connectionState.value = 'error';
          error.value = err.message;
          reject(err);
        });

        call.on('close', () => {
          console.log('[Viewer] Media connection closed');
          isConnected.value = false;
          connectionState.value = 'disconnected';
          remoteStream.value = null;
        });
      });

      // ========== Signaling Event 5: Connection Error ==========
      peer.on('error', (err) => {
        console.error('[Viewer] Peer error:', err);
        if (timeout) clearTimeout(timeout);
        connectionState.value = 'error';

        if (err.type === 'peer-unavailable') {
          error.value = 'Cannot find that share, it may have stopped sharing or the share code is incorrect';
        } else if (err.type === 'network') {
          error.value = 'Network connection failed';
        } else if (err.type === 'server-error') {
          error.value = 'Signaling server connection failed';
        } else {
          error.value = err.message;
        }
        reject(err);
      });

      peer.on('disconnected', () => {
        console.warn('[Viewer] Peer disconnected');
        if (isConnected.value) {
          connectionState.value = 'disconnected';
        }
      });
    });
  }

  /**
   * Disconnect
   */
  function disconnect(): void {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }

    dataConn?.close();
    dataConn = null;

    call?.close();
    call = null;

    peer?.destroy();
    peer = null;

    isConnected.value = false;
    connectionState.value = 'idle';
    remoteStream.value = null;
    error.value = null;

    console.log('[Viewer] Disconnected');
  }

  /**
   * Send touch event
   */
  function sendCommand(command: RemoteControlCommand): void {
    if (!dataConn?.open) {
      console.warn('[Viewer] Data channel not established, unable to send command');
      return;
    }
    dataConn.send(command);
  }

  onUnmounted(() => {
    disconnect();
  });

  return {
    isConnected,
    connectionState,
    error,
    remoteStream,
    connect,
    disconnect,
    sendCommand,
  };
}
