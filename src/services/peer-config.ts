/**
 * PeerJS configuration
 * Contains STUN/TURN server configuration and Peer creation utilities
 */

import Peer from 'peerjs';

export const PEER_CONFIG = {
  config: {
    iceServers: [
      // STUN server (free, used for NAT traversal to discover public IP)
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun.relay.metered.ca:80' },
      // TURN server (used for relaying when direct connection is not possible)
      {
        urls: 'turn:global.relay.metered.ca:80',
        username: 'e8dd65c92f6a9f24b4928132',
        credential: 'uWdWNmkhvyqTW1QP',
      },
      {
        urls: 'turn:global.relay.metered.ca:443',
        username: 'e8dd65c92f6a9f24b4928132',
        credential: 'uWdWNmkhvyqTW1QP',
      },
      {
        urls: 'turns:global.relay.metered.ca:443?transport=tcp',
        username: 'e8dd65c92f6a9f24b4928132',
        credential: 'uWdWNmkhvyqTW1QP',
      },
    ],
    iceCandidatePoolSize: 10,
  },
};

/**
 * Generate share code
 */
export function generateShareId(prefix = 'SHR'): string {
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  const timestamp = Date.now().toString(36).slice(-4).toUpperCase();
  return `${prefix}${random}${timestamp}`;
}

/**
 * Create PeerJS instance
 */
export function createPeer(customId?: string): Peer {
  if (customId) {
    return new Peer(customId, PEER_CONFIG);
  }
  return new Peer(PEER_CONFIG);
}

/**
 * Validate share code format
 */
export function isValidShareId(shareId: string): boolean {
  return /^SHR[A-Z0-9]{10}$/.test(shareId);
}
