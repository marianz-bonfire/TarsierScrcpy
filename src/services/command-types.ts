/**
 * Remote control command type definitions
 * Used for WebRTC DataChannel transmission of touch and key events
 */

// Touch command
export interface TouchCommand {
  type: 'touch';
  action: 'down' | 'move' | 'up';
  x: number;      // Normalized coordinates 0-1
  y: number;      // Normalized coordinates 0-1
  pointerId: number;
}

// Key command
export interface KeyCommand {
  type: 'key';
  key: 'back' | 'home' | 'recents';
}

// Remote control command union type
export type RemoteControlCommand = TouchCommand | KeyCommand;

/**
 * Serialize command to JSON string
 */
export function serializeCommand(cmd: RemoteControlCommand): string {
  return JSON.stringify(cmd);
}

/**
 * Deserialize JSON string to command object
 * Returns null if parsing fails or format is invalid
 */
export function deserializeCommand(data: string): RemoteControlCommand | null {
  try {
    const parsed = JSON.parse(data);
    
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    if (parsed.type === 'touch') {
      if (
        typeof parsed.action === 'string' &&
        ['down', 'move', 'up'].includes(parsed.action) &&
        typeof parsed.x === 'number' &&
        typeof parsed.y === 'number' &&
        typeof parsed.pointerId === 'number'
      ) {
        return parsed as TouchCommand;
      }
    } else if (parsed.type === 'key') {
      if (
        typeof parsed.key === 'string' &&
        ['back', 'home', 'recents'].includes(parsed.key)
      ) {
        return parsed as KeyCommand;
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Type guard: Check if it's a TouchCommand
 */
export function isTouchCommand(cmd: RemoteControlCommand): cmd is TouchCommand {
  return cmd.type === 'touch';
}

/**
 * Type guard: Check if it's a KeyCommand
 */
export function isKeyCommand(cmd: RemoteControlCommand): cmd is KeyCommand {
  return cmd.type === 'key';
}
