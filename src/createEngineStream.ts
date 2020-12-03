import { Duplex } from 'readable-stream';
import { JsonRpcEngine, JsonRpcRequest } from 'json-rpc-engine';

interface EngineStreamOptions {
  engine: JsonRpcEngine;
}

export = function createEngineStream (opts: EngineStreamOptions): Duplex {
  if (!opts || !opts.engine) {
    throw new Error('Missing engine parameter!')
  }

  const { engine } = opts;
  const stream = new Duplex({ objectMode: true, read, write })
  // forward notifications
  if (engine.on) {
    engine.on('notification', (message) => {
      stream.push(message)
    })
  }
  return stream

  function read () {
    return false
  }

  function write (
    req: JsonRpcRequest<unknown>,
    _encoding: unknown,
    cb: (error?: Error | null) => void,
  ) {
    engine.handle(req, (_err, res) => {
      stream.push(res)
    })
    cb()
  }
}
