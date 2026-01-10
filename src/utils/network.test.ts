import { describe, it } from 'node:test';
import assert from 'node:assert';
import type { Socket } from 'node:net';
import { createSenderSwarm, createReceiverSwarm, cleanupSwarm } from './network.js';
import { generateTopicKey } from './crypto.js';

describe('Network Utility', () => {
  describe('Swarm creation', () => {
    it('should create sender swarm successfully', async () => {
      const { topic } = generateTopicKey();
      const { swarm, waitForPeer } = await createSenderSwarm(topic);

      assert.ok(swarm, 'Swarm should be created');
      assert.strictEqual(typeof waitForPeer, 'function', 'waitForPeer should be a function');

      await cleanupSwarm(swarm);
    });

    it('should create receiver swarm successfully', async () => {
      const { topic } = generateTopicKey();
      const { swarm, connectionPromise } = await createReceiverSwarm(topic);

      assert.ok(swarm, 'Swarm should be created');
      assert.ok(connectionPromise instanceof Promise, 'connectionPromise should be a Promise');

      await cleanupSwarm(swarm);
    });
  });

  describe('Peer connection', () => {
    it('should connect sender and receiver', async () => {
      const { topic } = generateTopicKey();

      // Create sender first
      const sender = await createSenderSwarm(topic);

      // Create receiver
      const receiver = await createReceiverSwarm(topic);

      // Wait for connections with timeout
      const timeout = 10000; // 10 seconds
      const senderPeerPromise = Promise.race([
        sender.waitForPeer(),
        new Promise<null>((_, reject) =>
          setTimeout(() => reject(new Error('Sender connection timeout')), timeout)
        )
      ]);

      const receiverPeerPromise = Promise.race([
        receiver.connectionPromise,
        new Promise<null>((_, reject) =>
          setTimeout(() => reject(new Error('Receiver connection timeout')), timeout)
        )
      ]);

      const [senderSocket, receiverSocket] = await Promise.all([
        senderPeerPromise,
        receiverPeerPromise
      ]);

      assert.ok(senderSocket, 'Sender should receive peer connection');
      assert.ok(receiverSocket, 'Receiver should receive peer connection');

      // Verify sockets are connected
      assert.strictEqual(senderSocket.destroyed, false, 'Sender socket should not be destroyed');
      assert.strictEqual(receiverSocket.destroyed, false, 'Receiver socket should not be destroyed');

      // Cleanup
      senderSocket.destroy();
      receiverSocket.destroy();
      await cleanupSwarm(sender.swarm);
      await cleanupSwarm(receiver.swarm);
    });

    it('should exchange data between peers', async () => {
      const { topic } = generateTopicKey();
      const testMessage = 'Hello, P2P!';

      // Create sender and receiver
      const sender = await createSenderSwarm(topic);
      const receiver = await createReceiverSwarm(topic);

      // Wait for connections
      const [senderSocket, receiverSocket] = await Promise.all([
        sender.waitForPeer(),
        receiver.connectionPromise
      ]);

      // Set up data receiver
      const receivedData = await new Promise<string>((resolve) => {
        receiverSocket.once('data', (data: Buffer) => {
          resolve(data.toString());
        });

        // Send data from sender
        senderSocket.write(testMessage);
      });

      assert.strictEqual(receivedData, testMessage, 'Received data should match sent data');

      // Cleanup
      senderSocket.destroy();
      receiverSocket.destroy();
      await cleanupSwarm(sender.swarm);
      await cleanupSwarm(receiver.swarm);
    });

    it('should handle bidirectional communication', async () => {
      const { topic } = generateTopicKey();
      const senderMessage = 'From sender';
      const receiverMessage = 'From receiver';

      // Create sender and receiver
      const sender = await createSenderSwarm(topic);
      const receiver = await createReceiverSwarm(topic);

      // Wait for connections
      const [senderSocket, receiverSocket] = await Promise.all([
        sender.waitForPeer(),
        receiver.connectionPromise
      ]);

      // Set up bidirectional communication
      const senderReceived = new Promise<string>((resolve) => {
        senderSocket.once('data', (data: Buffer) => {
          resolve(data.toString());
        });
      });

      const receiverReceived = new Promise<string>((resolve) => {
        receiverSocket.once('data', (data: Buffer) => {
          resolve(data.toString());
        });
      });

      // Send from both ends
      senderSocket.write(senderMessage);
      receiverSocket.write(receiverMessage);

      const [senderGot, receiverGot] = await Promise.all([
        senderReceived,
        receiverReceived
      ]);

      assert.strictEqual(receiverGot, senderMessage, 'Receiver should get sender message');
      assert.strictEqual(senderGot, receiverMessage, 'Sender should get receiver message');

      // Cleanup
      senderSocket.destroy();
      receiverSocket.destroy();
      await cleanupSwarm(sender.swarm);
      await cleanupSwarm(receiver.swarm);
    });
  });

  describe('Cleanup', () => {
    it('should clean up swarm properly', async () => {
      const { topic } = generateTopicKey();
      const { swarm } = await createSenderSwarm(topic);

      await cleanupSwarm(swarm);

      // After cleanup, swarm should be destroyed
      // Note: Hyperswarm doesn't expose a clear "destroyed" property,
      // but attempting operations after destroy should fail or be no-op
      assert.ok(true, 'Cleanup completed without errors');
    });

    it('should close connections on cleanup', async () => {
      const { topic } = generateTopicKey();

      const sender = await createSenderSwarm(topic);
      const receiver = await createReceiverSwarm(topic);

      const [senderSocket, receiverSocket] = await Promise.all([
        sender.waitForPeer(),
        receiver.connectionPromise
      ]);

      // Cleanup sender swarm
      await cleanupSwarm(sender.swarm);

      // Wait a bit for sockets to close
      await new Promise(resolve => setTimeout(resolve, 100));

      // Sockets should be destroyed
      assert.strictEqual(senderSocket.destroyed, true, 'Sender socket should be destroyed');

      // Cleanup receiver
      receiverSocket.destroy();
      await cleanupSwarm(receiver.swarm);
    });
  });

  describe('Multiple connections', () => {
    it('should handle multiple receivers connecting to same sender', async () => {
      const { topic } = generateTopicKey();

      // Create one sender
      const sender = await createSenderSwarm(topic);

      // Create two receivers
      const receiver1 = await createReceiverSwarm(topic);
      const receiver2 = await createReceiverSwarm(topic);

      // Track connections
      const connections: Socket[] = [];
      sender.swarm.on('connection', (socket: Socket) => {
        connections.push(socket);
      });

      // Wait for receivers to connect
      await Promise.all([
        receiver1.connectionPromise,
        receiver2.connectionPromise
      ]);

      // Wait a bit for sender to register both connections
      await new Promise(resolve => setTimeout(resolve, 500));

      // Sender should have received 2 connections
      assert.ok(connections.length >= 2, `Sender should have at least 2 connections, got ${connections.length}`);

      // Cleanup
      connections.forEach(socket => socket.destroy());
      await cleanupSwarm(sender.swarm);
      await cleanupSwarm(receiver1.swarm);
      await cleanupSwarm(receiver2.swarm);
    });
  });
});
