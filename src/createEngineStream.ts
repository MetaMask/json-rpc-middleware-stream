import { JsonRpcRequest } from '@metamask/utils';
import { Duplex } from 'readable-stream';
import { JsonRpcEngine } from 'json-rpc-engine';

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
  const { engine } = opts;
  const stream = new Duplex({ objectMode: true, read: () => undefined, write });
  return stream;

  /**
   * Write a JSON-RPC request to the stream.
   *
   * @param req - The JSON-rpc request.
   * @param _encoding - The stream encoding, not used.
   * @param cb - The stream write callback.
   */
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
