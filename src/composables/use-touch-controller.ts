/**
 * Touch Control Hook
 * Used to handle touch and key events from the viewer side, convert them to control commands and send to the sharing side
 */

import type { KeyCommand, RemoteControlCommand, TouchCommand } from '@/services/command-types';
import { clientToNormalized } from '@/services/coord-utils';
import type { Ref } from 'vue';
import { onUnmounted, ref } from 'vue';

export interface UseTouchControllerReturn {
  // Event handlers bound to video element
  onPointerDown: (e: PointerEvent) => void;
  onPointerMove: (e: PointerEvent) => void;
  onPointerUp: (e: PointerEvent) => void;
  onPointerCancel: (e: PointerEvent) => void;
  
  // Key handling
  sendBackKey: () => void;
  sendHomeKey: () => void;
  sendRecentsKey: () => void;
  
  // Active touch points
  activePointers: Ref<Map<number, { x: number; y: number }>>;
}

export function useTouchController(
  sendCommand: (cmd: RemoteControlCommand) => void,
  videoElement: Ref<HTMLVideoElement | HTMLElement | null>
): UseTouchControllerReturn {
  // Track active touch points
  const activePointers = ref<Map<number, { x: number; y: number }>>(new Map());

  /**
   * Create touch command
   */
  function createTouchCommand(
    action: 'down' | 'move' | 'up',
    x: number,
    y: number,
    pointerId: number
  ): TouchCommand {
    return {
      type: 'touch',
      action,
      x,
      y,
      pointerId,
    };
  }

  /**
   * Create key command
   */
  function createKeyCommand(key: 'back' | 'home' | 'recents'): KeyCommand {
    return {
      type: 'key',
      key,
    };
  }

  /**
   * Handle pointer down event
   */
  function onPointerDown(e: PointerEvent): void {
    if (!videoElement.value) return;

    // Prevent default behavior (e.g., text selection)
    e.preventDefault();

    // Capture pointer to receive subsequent events
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    // Calculate normalized coordinates
    const { x, y } = clientToNormalized(e.clientX, e.clientY, videoElement.value);

    // Record active touch points
    activePointers.value.set(e.pointerId, { x, y });

    // Send touch command
    const command = createTouchCommand('down', x, y, e.pointerId);
    sendCommand(command);
  }

  /**
   * Handle pointer move event
   */
  function onPointerMove(e: PointerEvent): void {
    if (!videoElement.value) return;

    // Only handle already pressed touch points
    if (!activePointers.value.has(e.pointerId)) return;

    e.preventDefault();

    // Calculate normalized coordinates
    const { x, y } = clientToNormalized(e.clientX, e.clientY, videoElement.value);

    // Update touch point position
    activePointers.value.set(e.pointerId, { x, y });

    // Send touch command
    const command = createTouchCommand('move', x, y, e.pointerId);
    sendCommand(command);
  }

  /**
   * Handle pointer up event
   */
  function onPointerUp(e: PointerEvent): void {
    if (!videoElement.value) return;

    // Only handle already pressed touch points
    if (!activePointers.value.has(e.pointerId)) return;

    e.preventDefault();

    // Release pointer capture
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);

    // Calculate normalized coordinates
    const { x, y } = clientToNormalized(e.clientX, e.clientY, videoElement.value);

    // Remove active touch points
    activePointers.value.delete(e.pointerId);

    // Send touch command
    const command = createTouchCommand('up', x, y, e.pointerId);
    sendCommand(command);
  }

  /**
   * Handle pointer cancel event
   */
  function onPointerCancel(e: PointerEvent): void {
    if (!videoElement.value) return;

    // Only handle already pressed touch points
    if (!activePointers.value.has(e.pointerId)) return;

    // Release pointer capture
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // Ignore error
    }

    // Get last known position
    const lastPos = activePointers.value.get(e.pointerId) || { x: 0.5, y: 0.5 };

    // Remove active touch points
    activePointers.value.delete(e.pointerId);

    // Send up command to end touch
    const command = createTouchCommand('up', lastPos.x, lastPos.y, e.pointerId);
    sendCommand(command);
  }

  /**
   * Send back key
   */
  function sendBackKey(): void {
    const command = createKeyCommand('back');
    sendCommand(command);
  }

  /**
   * Send home key
   */
  function sendHomeKey(): void {
    const command = createKeyCommand('home');
    sendCommand(command);
  }

  /**
   * Send recents key
   */
  function sendRecentsKey(): void {
    const command = createKeyCommand('recents');
    sendCommand(command);
  }

  // Clean up when component is unmounted
  onUnmounted(() => {
    activePointers.value.clear();
  });

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    sendBackKey,
    sendHomeKey,
    sendRecentsKey,
    activePointers,
  };
}
