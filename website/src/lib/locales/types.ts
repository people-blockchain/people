type DeepString<T> = T extends string
  ? string
  : T extends Array<infer U>
  ? Array<DeepString<U>>
  : T extends object
  ? { [K in keyof T]: DeepString<T[K]> }
  : T;

import type { en } from "./en";
export type LocaleContent = DeepString<typeof en>;
