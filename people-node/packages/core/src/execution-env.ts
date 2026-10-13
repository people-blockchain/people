import { AsyncLocalStorage } from "node:async_hooks";
export interface ExecutionEnv {
  timestamp: number;
  blockNumber: number;
  proposer: string;
  chainId: string;
  remainingBlockGas: number;
  /** M12-4: whether the coordinated consensus upgrade #1 is active at this block height. */
  consensusUpgrade1?: boolean;
}

const context = new AsyncLocalStorage<ExecutionEnv>();
export function getExecutionEnv(): ExecutionEnv | null { return context.getStore() ?? null; }
export function withExecutionEnv<T>(env: ExecutionEnv, fn: () => T): T { return context.run(env, fn); }
export function withExecutionEnvAsync<T>(env: ExecutionEnv, fn: () => Promise<T>): Promise<T> { return context.run(env, fn); }
