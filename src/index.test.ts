import { Writable } from 'readable-stream';
import { JsonRpcEngine, JsonRpcMiddleware } from 'json-rpc-engine';
import {
  createStreamMiddleware,
  createEngineStream,
  createDuplexJsonRpcStream,
} from '.';

const jsonrpc = '2.0' as const;

describe('createStreamMiddleware', () => {
  it('processes a request', async () => {
    const jsonRpcConnection = createStreamMiddleware();
    const req = { id: 1, jsonrpc, method: 'test' };
    const initRes = { id: 1, jsonrpc };
    const res = { id: 1, jsonrpc, result: 'test' };

    await new Promise<void>((resolve, reject) => {
      // listen for incoming requests
      jsonRpcConnection.stream.on('data', (_req) => {
        try {
          expect(req).toStrictEqual(_req);
        } catch (err) {
          return reject(err);
        }
        return jsonRpcConnection.stream.write(res);
      });

      // run middleware, expect end fn to be called
      jsonRpcConnection.middleware(
        req,
        initRes,
        () => {
          reject(new Error('should not call next'));
        },
        (err) => {
          try {
            // eslint-disable-next-line jest/no-restricted-matchers
            expect(err).toBeFalsy();
            expect(initRes).toStrictEqual(res);
          } catch (error) {
            return reject(error);
          }
          return resolve();
        },
      );
    });
  });
});

describe('createEngineStream', () => {
  it('processes a request', async () => {
    const engine = new JsonRpcEngine();
    engine.addMiddleware((_req, res, _next, end) => {
      res.result = 'test';
      end();
    });

    const stream = createEngineStream({ engine });
    const req = { id: 1, jsonrpc, method: 'test' };
    const res = { id: 1, jsonrpc, result: 'test' };

    await new Promise<void>((resolve, reject) => {
      // listen for incoming requests
      stream.on('data', (_res) => {
        try {
          expect(res).toStrictEqual(_res);
        } catch (error) {
          return reject(error);
        }
        return resolve();
      });

      stream.on('error', (err) => {
        reject(err);
      });

      stream.write(req);
    });
  });
});

describe('middleware and engine to stream', () => {
  it('forwards messages between streams', async () => {
    // create guest
    const engineA = new JsonRpcEngine();
    const jsonRpcConnection = createStreamMiddleware();
    engineA.addMiddleware(jsonRpcConnection.middleware);

    // create host
    const engineB = new JsonRpcEngine();
    engineB.addMiddleware((_req, res, _next, end) => {
      res.result = 'test';
      end();
    });

    // connect both
    const clientSideStream = jsonRpcConnection.stream;
    const hostSideStream = createEngineStream({ engine: engineB });
    clientSideStream.pipe(hostSideStream).pipe(clientSideStream);

    // request and expected result
    const req = { id: 1, jsonrpc, method: 'test' };
    const res = { id: 1, jsonrpc, result: 'test' };

    const response = await engineA.handle(req);
    expect(response).toStrictEqual(res);
  });
});

describe('createDuplexJsonRpcStream', () => {
  it('processes inbound and outbound requests and responses', async () => {
    // Add receiver middleware
    const receiverMiddleware: JsonRpcMiddleware<unknown, unknown>[] = [
      (_req, res, _next, end) => {
        res.result = 'received';
        end();
      },
    ];

    const { duplexEngine, duplexEngineStream } = createDuplexJsonRpcStream({
      receiverMiddleware,
    });

    // Pipe the duplex engine stream to a sink that stores outgoing JSON-RPC
    // messages.
    const outgoingMessages: any[] = [];
    duplexEngineStream.pipe(
      new Writable({
        objectMode: true,
        write: (obj, _encoding, callback) => {
          outgoingMessages.push(obj);
          callback();
        },
      }),
    );

    // request and expected result
    const incomingReq = { id: 1, jsonrpc, method: 'testIn' };
    const outgoingReq = { id: 2, jsonrpc, method: 'testOut' };
    // const outgoingNotif = { jsonrpc, method: 'notifOut' }
    // const incomingNotif = { jsonrpc, method: 'notifIn' };

    duplexEngineStream.write({ ...incomingReq });
    const outgoingReqPromise = duplexEngine.send({ ...outgoingReq });

    // Yield the event loop so the stream can finish processing.
    await new Promise<void>((resolve) => setTimeout(resolve, 1));

    // Write the mock response to the outgoing request, and wait for it to be
    // resolved by the deferred promise.
    const expectedResponse = { id: outgoingReq.id, jsonrpc, result: 'foo' };
    duplexEngineStream.write({ ...expectedResponse });
    const receivedResponse = await outgoingReqPromise;

    // The received response should be equal to the written response.
    expect(receivedResponse).toStrictEqual(expectedResponse);

    expect(outgoingMessages).toHaveLength(2);
    // The first message should be the outgoing request.
    expect(outgoingMessages[0]).toStrictEqual({ ...outgoingReq });
    // The second message should be the response to the incoming request.
    expect(outgoingMessages[1]).toStrictEqual({
      id: 1,
      jsonrpc,
      result: 'received',
    });
  });

  it('processes inbound and outbound notifications', async () => {
    const receiverNotificationHandler = jest.fn();
    const senderNotificationHandler = jest.fn();

    const { duplexEngine, duplexEngineStream } = createDuplexJsonRpcStream({
      receiverNotificationHandler,
      senderNotificationHandler,
    });

    // Pipe the duplex engine stream to a sink that stores outgoing JSON-RPC
    // messages.
    const outgoingMessages: any[] = [];
    duplexEngineStream.pipe(
      new Writable({
        objectMode: true,
        write: (obj, _encoding, callback) => {
          outgoingMessages.push(obj);
          callback();
        },
      }),
    );

    // request and expected result
    const incomingNotif = { jsonrpc, method: 'notifIn' };
    const outgoingNotif = { jsonrpc, method: 'notifOut' };

    duplexEngineStream.write({ ...incomingNotif });
    expect(await duplexEngine.send({ ...outgoingNotif })).toBeUndefined();

    // Yield the event loop so the stream can finish processing.
    await new Promise<void>((resolve) => setTimeout(resolve, 1));

    expect(receiverNotificationHandler).toHaveBeenCalledTimes(1);
    expect(receiverNotificationHandler).toHaveBeenCalledWith({
      ...incomingNotif,
    });

    expect(senderNotificationHandler).toHaveBeenCalledTimes(1);
    expect(senderNotificationHandler).toHaveBeenCalledWith({
      ...outgoingNotif,
    });

    expect(outgoingMessages).toHaveLength(1);
    expect(outgoingMessages[0]).toStrictEqual({ ...outgoingNotif });
  });
});
