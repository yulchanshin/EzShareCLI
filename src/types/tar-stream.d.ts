declare module 'tar-stream' {
  import { Readable, Writable } from 'stream';

  interface Header {
    name: string;
    size?: number;
    mode?: number;
    mtime?: Date;
    type?: 'file' | 'directory' | string;
  }

  interface Pack extends Readable {
    entry(header: Header, callback?: (err?: Error) => void): Writable;
    entry(header: Header): Writable;
    finalize(): void;
  }

  interface Extract extends Writable {
    on(event: 'entry', listener: (header: Header, stream: Readable, next: (err?: Error) => void) => void): this;
    on(event: string, listener: (...args: any[]) => void): this;
  }

  export function pack(): Pack;
  export function extract(): Extract;

  const tarStream: {
    pack: () => Pack;
    extract: () => Extract;
  };

  export default tarStream;
}
