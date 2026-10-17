import { register } from "node:module";
import "./no-live-rpc.mjs";

register("./node-test-alias-loader.mjs", import.meta.url);
