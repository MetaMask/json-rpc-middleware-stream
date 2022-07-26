import { JsonRpcId } from '@metamask/utils';
import {
  JsonRpcEngineEndCallback,
  PendingJsonRpcResponse,
} from 'json-rpc-engine';

export interface IdMapValue {
  res: PendingJsonRpcResponse<unknown>;
  end: JsonRpcEngineEndCallback;
}

export const ErrorMessages = {
  unknownResponse: (id: JsonRpcId) =>
    `JSON-RPC stream - Received response with unknown id "${id}".`,
} as const;
