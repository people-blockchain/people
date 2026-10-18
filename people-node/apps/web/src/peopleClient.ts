import { PeopleClient } from "@people/sdk";

export const people = new PeopleClient({
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
  PeopleApiError
} from "@people/sdk";
