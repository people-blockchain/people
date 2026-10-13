import { OvnClient } from "@ovn/sdk";

export const ovn = new OvnClient({
  baseUrl: "/api",
  apiToken: import.meta.env.VITE_DEV_API_TOKEN
});

export {
  generateKeyPair,
  keyPairFromPrivateKey,
  signTransaction,
  formatTxMemo,
  getTxMemo,
  suggestedBatchFee,
  recommendedFeeForSend,
  DEFAULT_TRANSFER_FEE,
  MAX_BATCH_RECIPIENTS,
  OvnApiError
} from "@ovn/sdk";
