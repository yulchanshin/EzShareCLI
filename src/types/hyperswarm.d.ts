declare module 'hyperswarm' {
  import { EventEmitter } from 'events';
  import { Socket } from 'net';

  interface JoinOptions {
    server?: boolean;
    client?: boolean;
  }

  interface Discovery {
    flushed(): Promise<void>;
  }

  class Hyperswarm extends EventEmitter {
    join(topic: Buffer, options?: JoinOptions): Discovery;
    flush(): Promise<void>;
    destroy(): Promise<void>;
    on(event: 'connection', listener: (socket: Socket) => void): this;
    on(event: string, listener: (...args: any[]) => void): this;
  }

  export default Hyperswarm;
}
