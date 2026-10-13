import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  handleJsonRpcBatch,
  handleJsonRpcRequest,
  jsonRpcBatchTooLarge,
  jsonRpcMaxBatch,
  jsonRpcParseError,
  parseJsonRpcBody,
  type EvmJsonRpcHost
} from "@ovn/core";
import { allowKeyedRate } from "./rate-limit.js";
import type { NodeService } from "./node-service.js";

function isJsonRpcRequest(request: FastifyRequest): boolean {
  const contentType = request.headers["content-type"] ?? "";
  return contentType.includes("json") || contentType.includes("application/json");
}

/**
 * M16-1: the per-IP budget is spent per JSON-RPC call, not per HTTP request, so a
 * single `POST /rpc` carrying a long batch cannot bypass the limiter.
 */
const callRateMap = new Map<string, { count: number; windowStart: number }>();
const CALL_RATE_LIMIT = Number(process.env.PUBLIC_RPC_CALL_RATE_LIMIT ?? 600);
const CALL_RATE_WINDOW_MS = Number(process.env.PUBLIC_RATE_WINDOW_MS ?? 60_000);

export function registerJsonRpcRoutes(server: FastifyInstance, node: NodeService): void {
  const host = (request: FastifyRequest): EvmJsonRpcHost => ({
    chainState: node.chainState,
    headHeight: node.getHead().height,
    stringChainId: node.config.chainId,
    // Same gas ceiling and per-IP budget as POST /contracts/call.
    maxCallGas: node.getContractCallMaxGas(),
    allowCall: () => node.allowContractCall(request.ip || "unknown")
  });

  const handle = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!isJsonRpcRequest(request)) {
      return reply.code(415).send({ error: "content_type_required" });
    }
    const parsed = parseJsonRpcBody(request.body);
    if (parsed === null) {
      return reply.send(jsonRpcParseError());
    }
    const calls = Array.isArray(parsed) ? parsed : [parsed];
    if (calls.length === 0) {
      return reply.send(jsonRpcParseError());
    }
    if (calls.length > jsonRpcMaxBatch()) {
      // Refused before any call runs.
      return reply.send(jsonRpcBatchTooLarge());
    }
    const ip = request.ip || "unknown";
    if (
      !allowKeyedRate(callRateMap, ip, CALL_RATE_LIMIT, CALL_RATE_WINDOW_MS, Date.now(), calls.length)
    ) {
      return reply.code(429).send({ error: "rate_limited" });
    }
    if (Array.isArray(parsed)) {
      return reply.send(await handleJsonRpcBatch(host(request), parsed));
    }
    return reply.send(await handleJsonRpcRequest(host(request), parsed));
  };

  server.post("/rpc", handle);
  server.post("/", async (request, reply) => {
    if (!isJsonRpcRequest(request)) {
      return reply.code(405).send({ error: "method_not_allowed" });
    }
    return handle(request, reply);
  });
}
