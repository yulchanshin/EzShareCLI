import Hyperswarm from 'hyperswarm';
import type { Socket } from 'net';

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

  // Join as server (announce to DHT, don't connect as client)
  const discovery = swarm.join(topic, { server: true, client: false });

  // Wait for the topic to be fully announced to the DHT
  await discovery.flushed();

  // Create a promise that resolves when a peer connects
  const waitForPeer = (): Promise<Socket> => {
    return new Promise((resolve) => {
      swarm.on('connection', (socket: Socket) => {
        resolve(socket);
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
  waitForPeer: () => Promise<Socket>;
}> {
  const swarm = new Hyperswarm();

  // Join as client (connect to server, don't announce)
  swarm.join(topic, { server: false, client: true });

  // Flush the swarm to start connecting
  await swarm.flush();

  // Create a promise that resolves when connected to peer
  const waitForPeer = (): Promise<Socket> => {
    return new Promise((resolve) => {
      swarm.on('connection', (socket: Socket) => {
        resolve(socket);
      });
    });
  };

  return { swarm, waitForPeer };
}

/**
 * Clean up and destroy a swarm instance
 * @param swarm - The Hyperswarm instance to clean up
 */
export async function cleanupSwarm(swarm: Hyperswarm): Promise<void> {
  // Destroy the swarm and close all connections
  await swarm.destroy();
}
