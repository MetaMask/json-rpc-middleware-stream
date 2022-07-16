import { Duplex } from 'readable-stream';
import { JsonRpcMiddleware } from 'json-rpc-engine';
import { isJsonRpcRequest, JsonRpcId, JsonRpcResponse } from '@metamask/utils';
import { ErrorMessages, IdMapValue } from './utils';

/**
 * Creates a JsonRpcEngine middleware with an associated Duplex stream and
 * EventEmitter. The middleware, and by extension stream, assume that middleware
 * parameters are properly formatted. No runtime type checking or validation is
 * performed.
 *
 * @returns The event emitter, middleware, and stream.
 */
export default function createStreamMiddleware() {
  const idMap: Map<JsonRpcId, IdMapValue> = new Map();
  const stream = new Duplex({
    objectMode: true,
    read: () => undefined,
    write: processMessage,
  });

  const middleware: JsonRpcMiddleware<unknown, unknown> = (
    req,
    res,
    _next,
    end,
  ) => {
    // write req to stream
    stream.push(req);
    // register request on id map
    if (isJsonRpcRequest(req)) {
      idMap.set(req.id, { res, end });
    }
  };

  return { middleware, stream };

  /**
   * Writes a JSON-RPC object to the stream.
   *
   * @param res - The JSON-RPC response object.
   * @param _encoding - The stream encoding, not used.
   * @param cb - The stream write callback.
   */
  function processMessage(
    res: JsonRpcResponse<unknown>,
    _encoding: unknown,
    cb: (error?: Error | null) => void,
  ) {
    let err: Error | null = null;
    try {
      processResponse(res);
    } catch (_err) {
      err = _err as Error;
    }

    // continue processing stream
    cb(err);
  }

  /**
   * Processes a JSON-RPC response.
   *
   * @param res - The response to process.
   */
  function processResponse(res: JsonRpcResponse<unknown>) {
    const context = idMap.get(res.id);
    if (!context) {
      throw new Error(ErrorMessages.unknownResponse(res.id));
    }

    // Copy response received from the stream unto original response object,
    // which will be returned by the engine on this side.
    Object.assign(context.res, res);

    idMap.delete(res.id);
    // Prevent internal stream handler from catching errors from this callback.
    setTimeout(context.end);
  }
}
