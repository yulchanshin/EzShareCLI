import Hyperswarm from 'hyperswarm';
import type { Socket } from 'net';
import { appendFileSync } from 'node:fs';

const CONNECTION_TIMEOUT = 30000; // 30 seconds
const LOG_FILE = '/tmp/ezshare_debug.log';

function debugLog(message: string) {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] ${message}\n`;
  try {
    appendFileSync(LOG_FILE, logLine);
  } catch (e) {
    // Ignore file write errors
  }
  console.error(message); // Use stderr to avoid Ink interference
}

/**
 * Create a sender swarm that announces to the DHT and waits for a peer connection
 * @param topic - The topic buffer to join (32 bytes)
 * @returns Swarm instance and a function to wait for the first peer connection
 */
export async function createSenderSwarm(topic: Buffer): Promise<{
  swarm: Hyperswarm;
  waitForPeer: () => Promise<Socket>;
}> {
  const swarm = new Hyperswarm();

  debugLog('[Sender] Creating sender swarm...');
  debugLog('[Sender] Topic hash: ' + topic.toString('hex'));
  debugLog('[Sender] Topic base64url: ' + topic.toString('base64url'));

  // Enable both server and client for better NAT traversal
  const discovery = swarm.join(topic, { server: true, client: true });

  debugLog('[Sender] Announcing to DHT...');
  // Wait for the topic to be fully announced to the DHT
  await discovery.flushed();
  debugLog('[Sender] DHT announcement complete, waiting for peer...');

  // Create a promise that resolves when a peer connects
  const waitForPeer = (): Promise<Socket> => {
    return new Promise((resolve, reject) => {
      // Set timeout for connection
      const timeout = setTimeout(() => {
        reject(new Error(
          `Connection timeout after ${CONNECTION_TIMEOUT/1000}s. ` +
          'Peer may not be online or DHT discovery failed. ' +
          'Ensure both peers are started within a few seconds of each other.'
        ));
      }, CONNECTION_TIMEOUT);

      swarm.once('connection', (socket: Socket) => {
        clearTimeout(timeout);
        debugLog('[Sender] Peer connected!');
        resolve(socket);
      });

      // Debug: log peer discovery
      swarm.on('peer-add', () => {
        debugLog('[Sender] Peer discovered via DHT');
      });
    });
  };

  return { swarm, waitForPeer };
}

/**
 * Create a receiver swarm that connects to a sender
 * @param topic - The topic buffer to join (32 bytes)
 * @returns Swarm instance and a function to wait for the first peer connection
 */
export async function createReceiverSwarm(topic: Buffer): Promise<{
  swarm: Hyperswarm;
  connectionPromise: Promise<Socket>;
}> {
  const swarm = new Hyperswarm();

  debugLog('[Receiver] Creating receiver swarm...');
  debugLog('[Receiver] Topic hash: ' + topic.toString('hex'));
  debugLog('[Receiver] Topic base64url: ' + topic.toString('base64url'));

  // CRITICAL: Register connection listener BEFORE joining/flushing
  // Otherwise we miss the connection event in the race condition
  const connectionPromise = new Promise<Socket>((resolve, reject) => {
    // Set timeout for connection
    const timeout = setTimeout(() => {
      reject(new Error(
        `Connection timeout after ${CONNECTION_TIMEOUT/1000}s. ` +
        'Could not find or connect to sender. ' +
        'Ensure sender is running and you entered the correct share key.'
      ));
    }, CONNECTION_TIMEOUT);

    swarm.once('connection', (socket: Socket) => {
      clearTimeout(timeout);
      debugLog('[Receiver] Connected to peer!');
      resolve(socket);
    });

    // Debug: log peer discovery
    swarm.on('peer-add', () => {
      debugLog('[Receiver] Peer discovered via DHT, connecting...');
    });
  });

  // Enable both server and client for better NAT traversal
  swarm.join(topic, { server: true, client: true });

  debugLog('[Receiver] Looking up peers in DHT...');
  // Flush the swarm to start connecting
  await swarm.flush();
  debugLog('[Receiver] DHT lookup complete, waiting for connection...');

  return { swarm, connectionPromise };
}

/**
 * Clean up and destroy a swarm instance
 * @param swarm - The Hyperswarm instance to clean up
 */
export async function cleanupSwarm(swarm: Hyperswarm): Promise<void> {
  // Destroy the swarm and close all connections
  await swarm.destroy();
}
