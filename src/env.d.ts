// Auto-generated Cloudflare binding types.
// @see https://alchemy.run/docs/concepts/bindings.html#type-safe-bindings

import type { worker } from "../alchemy.run.ts";

export type CloudflareEnv = typeof worker.Env;
type Runtime = import('@astrojs/cloudflare').Runtime<Env>;

declare global {
  type Env = CloudflareEnv;

  declare namespace App {
    interface Locals extends Runtime { }
  }
}


declare module "cloudflare:workers" {
  namespace Cloudflare {
    export interface Env extends CloudflareEnv { }
  }
}