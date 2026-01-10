import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { Spinner, ProgressBar } from '@inkjs/ui';
import { pipeline } from 'node:stream/promises';
import { Transform, PassThrough } from 'node:stream';
import { parseTopicKey, deriveKey, createDecryptStream } from '../utils/crypto.js';
import { createDecompressStream } from '../utils/compression.js';
import { createExtractStream } from '../utils/tar.js';
import { createReceiverSwarm, cleanupSwarm } from '../utils/network.js';

interface ReceiveCommandProps {
  shareKey: string;
  outputPath?: string;
  onComplete?: () => void;
  onError?: (error: Error) => void;
}

type ReceiveState = 'connecting' | 'receiving' | 'done' | 'error';

interface TransferMetadata {
  totalSize: number;
  fileCount: number;
  isDirectory: boolean;
  compressed: boolean;
}

export function ReceiveCommand({ shareKey, outputPath = process.cwd(), onComplete, onError }: ReceiveCommandProps) {
  const [state, setState] = useState<ReceiveState>('connecting');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<TransferMetadata | null>(null);

  useEffect(() => {
    startReceiving();
  }, []);

  const startReceiving = async () => {
    try {
      // Parse share key to get topic
      const topic = parseTopicKey(shareKey);

      // Derive encryption key from topic
      const encryptionKey = deriveKey(topic);

      // Create receiver swarm
      const { swarm, waitForPeer } = await createReceiverSwarm(topic);

      // Wait for peer connection
      const socket = await waitForPeer();

      // Read metadata first (JSON header followed by newline)
      const metadataBuffer: Buffer[] = [];
      let metadataReceived = false;
      let transferMetadata: TransferMetadata | null = null;

      // Create a passthrough to split metadata from file data
      const metadataExtractor = new Transform({
        transform(chunk, encoding, callback) {
          if (!metadataReceived) {
            metadataBuffer.push(chunk);
            const combined = Buffer.concat(metadataBuffer);
            const newlineIndex = combined.indexOf('\n');

            if (newlineIndex !== -1) {
              // Found metadata
              const metadataJson = combined.slice(0, newlineIndex).toString();
              transferMetadata = JSON.parse(metadataJson);
              setMetadata(transferMetadata);

              // Push remaining data after newline
              const remainingData = combined.slice(newlineIndex + 1);
              if (remainingData.length > 0) {
                this.push(remainingData);
              }

              metadataReceived = true;
            }
            callback();
          } else {
            // Pass through file data
            callback(null, chunk);
          }
        },
      });

      // Create progress tracker
      let transferred = 0;
      const progressTracker = new Transform({
        transform(chunk, encoding, callback) {
          if (transferMetadata) {
            transferred += chunk.length;
            const pct = Math.round((transferred / transferMetadata.totalSize) * 100);
            setProgress(Math.min(pct, 100));
          }
          callback(null, chunk);
        },
      });

      // Start receiving
      setState('receiving');

      // Build the pipeline: Socket → Metadata Extractor → Progress → Decrypt → Decompress → Tar Extract
      const decryptStream = createDecryptStream(encryptionKey);
      const decompressStream = await createDecompressStream();
      const extractStream = createExtractStream(outputPath);

      await pipeline(
        socket,
        metadataExtractor,
        progressTracker,
        decryptStream,
        decompressStream,
        extractStream
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
      <Text bold color="blue">
        📥 Receiving file(s)
      </Text>

      {metadata && (
        <Text dimColor>
          Size: {formatBytes(metadata.totalSize)} | Files: {metadata.fileCount}
        </Text>
      )}

      {state === 'connecting' && (
        <Box marginTop={1}>
          <Spinner label="Connecting to peer..." />
        </Box>
      )}

      {state === 'receiving' && progress === 0 && (
        <Box marginTop={1}>
          <Spinner label="Starting transfer..." />
        </Box>
      )}

      {state === 'receiving' && progress > 0 && progress < 100 && (
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
          <Text dimColor>Saved to: {outputPath}</Text>
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
