import { Duplex } from 'readable-stream';
import { JsonRpcEngine, JsonRpcRequest } from 'json-rpc-engine';

interface EngineStreamOptions {
  engine: JsonRpcEngine;
}

/**
 * Takes a JsonRpcEngine and returns a Duplex stream wrapping it.
 *
 * @param opts - Options bag.
 * @param opts.engine - The JsonRpcEngine to wrap in a stream.
 * @returns The stream wrapping the engine.
 */
export default function createEngineStream(opts: EngineStreamOptions): Duplex {
  if (!opts || !opts.engine) {
    throw new Error('Missing engine parameter!');
  }

  const { engine } = opts;
  const stream = new Duplex({ objectMode: true, read, write });
  // forward notifications
  if (engine.on) {
    engine.on('notification', (message) => {
      stream.push(message);
    });
  }
  return stream;

  function read() {
    return undefined;
  }

  function write(
    req: JsonRpcRequest<unknown>,
    _encoding: unknown,
    cb: (error?: Error | null) => void,
  ) {
    engine.handle(req, (_err, res) => {
      stream.push(res);
    });
    cb();
  }
}
