export type JsonValue = null | boolean | number | string | JsonValue[] | { [k: string]: JsonValue };

export type JsonRpcId = string | number | null;

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: JsonRpcId;
  method: string;
  params?: unknown;
}

export interface JsonRpcErrorObject {
  code: number;
  message: string;
  data?: JsonValue;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: JsonRpcId;
  result?: JsonValue;
  error?: JsonRpcErrorObject;
}

export interface McpToolDefinition {
  name: string;
  description?: string;
  inputSchema?: JsonValue;
}

