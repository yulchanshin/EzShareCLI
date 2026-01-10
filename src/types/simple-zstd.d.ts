/**
 * Type declarations for simple-zstd package
 */

declare module 'simple-zstd' {
  import { Duplex } from 'node:stream';

  export interface ZSTDOpts {
    dictionary?: Buffer | string;
  }

  export interface PoolOpts {
    compressPoolSize?: number;
    compressLevel?: number;
    decompressPoolSize?: number;
  }

  /**
   * Create a compression stream
   * @param compLevel - Compression level 1-22 (default 3)
   * @param opts - Optional configuration
   */
  export function compress(compLevel?: number, opts?: ZSTDOpts): Promise<Duplex>;

  /**
   * Compress a buffer
   */
  export function compressBuffer(
    buffer: Buffer,
    compLevel?: number,
    opts?: ZSTDOpts
  ): Promise<Buffer>;

  /**
   * Create a decompression stream
   */
  export function decompress(opts?: ZSTDOpts): Promise<Duplex>;

  /**
   * Decompress a buffer
   */
  export function decompressBuffer(buffer: Buffer, opts?: ZSTDOpts): Promise<Buffer>;

  /**
   * Clear the dictionary cache
   */
  export function clearDictionaryCache(): Promise<void>;

  /**
   * Pooled ZSTD instance for better performance
   */
  export class SimpleZSTD {
    static create(poolOptions?: PoolOpts): Promise<SimpleZSTD>;
    destroy(): Promise<void>;
    compress(compLevel?: number): Promise<Duplex>;
    compressBuffer(buffer: Buffer, compLevel?: number): Promise<Buffer>;
    decompress(): Promise<Duplex>;
    decompressBuffer(buffer: Buffer): Promise<Buffer>;
  }
}

// Type declarations for the ES module (.mjs) entry point
declare module 'simple-zstd/dist/index.mjs' {
  export * from 'simple-zstd';
}
