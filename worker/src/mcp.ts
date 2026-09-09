import { toJstDateKey } from "./feed";
import {
  type AgentShiftsResult,
  isValidAgentName,
  isValidDateKey,
} from "./agentShifts";

const PROTOCOL_VERSION = "2025-03-26";

type JsonRpcId = string | number | null;
type JsonObject = Record<string, unknown>;

export interface McpDependencies {
  getShifts(input: { date: string; name: string }): Promise<AgentShiftsResult>;
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}

function response(id: JsonRpcId, result: unknown): Response {
  return json(200, { jsonrpc: "2.0", id, result });
}

function error(id: JsonRpcId, code: number, message: string, data?: unknown): Response {
  return json(200, {
    jsonrpc: "2.0",
    id,
    error: { code, message, ...(data === undefined ? {} : { data }) },
  });
}

function isRequestId(value: unknown): value is JsonRpcId {
  return typeof value === "string" || typeof value === "number" || value === null;
}

function toolError(reason: string): { content: { type: "text"; text: string }[]; isError: true } {
  return { content: [{ type: "text", text: reason }], isError: true };
}

const GET_SHIFT_TOOL = {
  name: "get_shift",
  title: "シフトを取得",
  description:
    "指定したメンバーの指定日のシフトを取得します。読み取り専用です。氏名はシフト表の表示名を指定してください。",
  inputSchema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "シフト表に登録されている氏名",
        maxLength: 200,
      },
      date: {
        type: "string",
        description: "Asia/Tokyo 基準の YYYY-MM-DD。省略時は当日。",
        pattern: "^\\d{4}-\\d{2}-\\d{2}$",
      },
    },
    required: ["name"],
    additionalProperties: false,
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
} as const;

/**
 * Streamable HTTP の最小構成。状態を持たないので `Mcp-Session-Id` や SSE は発行しない。
 * ChatGPT を含む MCP クライアントは、POST の application/json 応答を受け取れる。
 */
export async function handleMcpRequest(request: Request, deps: McpDependencies): Promise<Response> {
  if (request.method === "GET") {
    return new Response(null, { status: 405, headers: { Allow: "POST" } });
  }
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return error(null, -32700, "Parse error");
  }
  if (!isRecord(raw) || raw.jsonrpc !== "2.0" || typeof raw.method !== "string") {
    return error(null, -32600, "Invalid Request");
  }

  // notifications は応答を返さない。初期化完了通知だけを受け入れる。
  if (!("id" in raw)) {
    return raw.method === "notifications/initialized"
      ? new Response(null, { status: 202 })
      : new Response(null, { status: 202 });
  }
  if (!isRequestId(raw.id)) return error(null, -32600, "Invalid Request");
  const id = raw.id;
  const params = isRecord(raw.params) ? raw.params : {};

  if (raw.method === "initialize") {
    const requestedVersion = params.protocolVersion;
    if (typeof requestedVersion !== "string") return error(id, -32602, "Invalid params");
    return response(id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "copia-shift", version: "1.0.0" },
      instructions: "シフト確認専用です。書き込みや変更は行えません。",
    });
  }

  if (raw.method === "ping") return response(id, {});

  if (raw.method === "tools/list") return response(id, { tools: [GET_SHIFT_TOOL] });

  if (raw.method !== "tools/call") return error(id, -32601, "Method not found");

  if (params.name !== "get_shift") return error(id, -32602, "Unknown tool");
  const args = isRecord(params.arguments) ? params.arguments : null;
  if (!args || Object.keys(args).some((key) => key !== "name" && key !== "date")) {
    return error(id, -32602, "Invalid arguments");
  }
  const name = args.name;
  if (typeof name !== "string" || !isValidAgentName(name)) {
    return response(id, toolError("氏名を1〜200文字で指定してください。"));
  }
  const date = args.date ?? toJstDateKey(new Date());
  if (typeof date !== "string" || !isValidDateKey(date)) {
    return response(id, toolError("日付は実在する YYYY-MM-DD で指定してください。"));
  }

  try {
    const result = await deps.getShifts({ date, name });
    if (!result.ok) return response(id, toolError(result.reason));
    return response(id, {
      content: [{ type: "text", text: JSON.stringify(result.payload) }],
      structuredContent: result.payload,
      isError: false,
    });
  } catch (cause) {
    console.error("copia-shift-ics-feed: failed to serve MCP get_shift", cause);
    return response(id, toolError("internal_error"));
  }
}
