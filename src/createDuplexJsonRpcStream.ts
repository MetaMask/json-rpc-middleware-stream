import {
  hasProperty,
  isJsonRpcRequest,
  isObject,
  JsonRpcId,
  JsonRpcNotification,
  JsonRpcRequest,
  JsonRpcResponse,
  RuntimeObject,
} from '@metamask/utils';
import { Duplex } from 'readable-stream';
import {
  DuplexJsonRpcEngine,
  JsonRpcMiddleware,
  JsonRpcNotificationHandler,
} from 'json-rpc-engine';
import { ErrorMessages, IdMapValue } from './utils';

type StreamCallback = (error?: Error | null) => void;

interface DuplexJsonRpcStreamOptions {
  receiverMiddleware?: JsonRpcMiddleware<unknown, unknown>[];
  receiverNotificationHandler?: JsonRpcNotificationHandler<unknown>;
  senderMiddleware?: JsonRpcMiddleware<unknown, unknown>[];
  senderNotificationHandler?: JsonRpcNotificationHandler<unknown>;
}

/**
 * Foobar, bar baz.
 *
 * @param options - Options bag.
 * @returns The stream wrapping the duplex JSON-RPC engine.
 */
export default function createDuplexJsonRpcStream(
  options: DuplexJsonRpcStreamOptions,
) {
  const {
    receiverMiddleware = [],
    receiverNotificationHandler = () => undefined,
    senderMiddleware = [],
    senderNotificationHandler,
  } = options;

  const outgoingIdMap: Map<JsonRpcId, IdMapValue> = new Map();
  const stream = new Duplex({
    objectMode: true,
    read: () => undefined,
    write: processMessage,
  });

  const sendNotification = (notification: JsonRpcNotification<unknown>) => {
    stream.push(notification);
    return undefined;
  };

  const _senderNotificationHandler = senderNotificationHandler
    ? async (notification: JsonRpcNotification<unknown>) => {
        await senderNotificationHandler(notification);
        return sendNotification(notification);
      }
    : sendNotification;

  const engine = new DuplexJsonRpcEngine({
    receiverNotificationHandler,
    senderNotificationHandler: _senderNotificationHandler,
  });

  receiverMiddleware.forEach((middleware) =>
    engine.addReceiverMiddleware(middleware),
  );

  senderMiddleware.forEach((middleware) =>
    engine.addSenderMiddleware(middleware),
  );

  engine.addSenderMiddleware((req, res, _next, end) => {
    // write req to stream
    stream.push(req);
    // register request on id map if
    if (isJsonRpcRequest(req)) {
      outgoingIdMap.set(req.id, { res, end });
    }
  });

  return { duplexEngine: engine, duplexEngineStream: stream };

  /**
   * Writes a JSON-RPC object to the stream.
   *
   * @param message - The message to write to the stream.
   * @param _encoding - The stream encoding, not used.
   * @param cb - The stream write callback.
   * @returns Nothing.
   */
  function processMessage(
    message: unknown,
    _encoding: unknown,
    cb: StreamCallback,
  ): void {
    let err: Error | null = null;
    try {
      if (!isObject(message)) {
        throw new Error('not an object');
      } else if (isResponse(message)) {
        receiveResponse(message);
      } else if (isRequest(message)) {
        return receiveRequest(message, cb);
      } else {
        throw new Error('neither a response nor request');
      }
    } catch (_err) {
      err = _err as Error;
    }

    // continue processing stream
    return cb(err);
  }

  /**
   * Forwards a JSON-RPC request or notification to the receiving pipeline.
   * Pushes any response from the pipeline to the stream.
   *
   * @param req - The request or notification to receive.
   * @param cb - The stream write callback.
   */
  function receiveRequest(
    req: JsonRpcRequest<unknown> | JsonRpcNotification<unknown>,
    cb: StreamCallback,
  ) {
    // TypeScript defaults to the notification overload and we don't get a
    // response unless we cast.
    engine
      .receive(req as JsonRpcRequest<unknown>)
      .then((response) => {
        if (response) {
          stream.push(response);
        }
        cb();
      })
      .catch((error) => cb(error));
  }

  /**
   * Receives a response to a request sent via the sending pipeline.
   *
   * @param res - The response to receive.
   */
  function receiveResponse(res: JsonRpcResponse<unknown>) {
    const context = outgoingIdMap.get(res.id);
    if (!context) {
      throw new Error(ErrorMessages.unknownResponse(res.id));
    }

    // Copy response received from the stream unto original response object,
    // which will be returned by the engine on this side.
    Object.assign(context.res, res);

    outgoingIdMap.delete(res.id);
    // Prevent internal stream handler from catching errors from this callback.
    setTimeout(context.end);
  }
}

/**
 * A type guard for {@link JsonRpcResponse}.
 *
 * @param message - The object to type check.
 * @returns The type check result.
 */
function isResponse(
  message: RuntimeObject,
): message is JsonRpcResponse<unknown> {
  return hasProperty(message, 'result') || hasProperty(message, 'error');
}

/**
 * A type guard for {@link JsonRpcRequest} or {@link JsonRpcNotification}.
 *
 * @param message - The object to type check.
 * @returns The type check result.
 */
function isRequest(
  message: RuntimeObject,
): message is JsonRpcRequest<unknown> | JsonRpcNotification<unknown> {
  return hasProperty(message, 'method');
}
