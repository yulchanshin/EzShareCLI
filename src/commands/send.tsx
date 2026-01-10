import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { Spinner, ProgressBar } from '@inkjs/ui';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { generateTopicKey, deriveKey, createEncryptStream } from '../utils/crypto.js';
import { createCompressStream, shouldCompress } from '../utils/compression.js';
import { createPackStream, getTransferMetadata } from '../utils/tar.js';
import { createSenderSwarm, cleanupSwarm } from '../utils/network.js';

interface SendCommandProps {
  path: string;
  onComplete?: () => void;
  onError?: (error: Error) => void;
}

type SendState = 'init' | 'waiting' | 'sending' | 'done' | 'error';

export function SendCommand({ path, onComplete, onError }: SendCommandProps) {
  const [state, setState] = useState<SendState>('init');
  const [shareKey, setShareKey] = useState('');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<{ totalSize: number; fileCount: number } | null>(null);

  useEffect(() => {
    startSending();
  }, []);

  const startSending = async () => {
    try {
      // Generate topic and display key
      const { topic, displayKey } = generateTopicKey();
      setShareKey(displayKey);

      // Derive encryption key from topic
      const encryptionKey = deriveKey(topic);

      // Get transfer metadata
      const transferMetadata = await getTransferMetadata(path);
      setMetadata({
        totalSize: transferMetadata.totalSize,
        fileCount: transferMetadata.fileCount,
      });

      // Create sender swarm
      setState('waiting');
      const { swarm, waitForPeer } = await createSenderSwarm(topic);

      // Wait for peer connection
      const socket = await waitForPeer();

      // Peer connected! Start sending
      setState('sending');

      // Send metadata first (JSON header)
      const metadataJson = JSON.stringify({
        totalSize: transferMetadata.totalSize,
        fileCount: transferMetadata.fileCount,
        isDirectory: transferMetadata.isDirectory,
        compressed: shouldCompress(path),
      }) + '\n';

      socket.write(metadataJson);

      // Create progress tracker
      let transferred = 0;
      const progressTracker = new Transform({
        transform(chunk, encoding, callback) {
          transferred += chunk.length;
          const pct = Math.round((transferred / transferMetadata.totalSize) * 100);
          setProgress(pct);
          callback(null, chunk);
        },
      });

      // Build the pipeline: Tar → Compress → Encrypt → Progress → Socket
      const packStream = createPackStream(path);
      const compressStream = await createCompressStream(shouldCompress(path));
      const encryptStream = createEncryptStream(encryptionKey);

      await pipeline(
        packStream,
        compressStream,
        encryptStream,
        progressTracker,
        socket
      );

      // Transfer complete
      setState('done');
      await cleanupSwarm(swarm);

      if (onComplete) {
        onComplete();
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      setState('error');

      if (onError) {
        onError(err as Error);
      }
    }
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="green">
        📤 Sending: {path.split('/').pop()}
      </Text>

      {metadata && (
        <Text dimColor>
          Size: {formatBytes(metadata.totalSize)} | Files: {metadata.fileCount}
        </Text>
      )}

      {state === 'init' && (
        <Box marginTop={1}>
          <Spinner label="Preparing transfer..." />
        </Box>
      )}

      {(state === 'waiting' || state === 'sending') && shareKey && (
        <Box marginTop={1} flexDirection="column">
          <Text color="cyan">Share this key with receiver:</Text>
          <Text bold>{shareKey}</Text>
        </Box>
      )}

      {state === 'waiting' && (
        <Box marginTop={1}>
          <Spinner label="Waiting for peer to connect..." />
        </Box>
      )}

      {state === 'sending' && progress > 0 && progress < 100 && (
        <Box marginTop={1} flexDirection="column">
          <ProgressBar value={progress} />
          <Text> {progress}%</Text>
        </Box>
      )}

      {state === 'done' && (
        <Box marginTop={1} flexDirection="column">
          <Text color="green" bold>
            ✓ Transfer complete!
          </Text>
          <Text dimColor>Press Esc to return</Text>
        </Box>
      )}

      {state === 'error' && (
        <Box marginTop={1} flexDirection="column">
          <Text color="red" bold>
            ✗ Transfer failed
          </Text>
          <Text color="red">{error}</Text>
          <Text dimColor>Press Esc to return</Text>
        </Box>
      )}
    </Box>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
