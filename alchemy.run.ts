import alchemy from "alchemy";
import { Astro, Queue, KVNamespace, WranglerJson } from "alchemy/cloudflare";

const app = await alchemy("abstract-industries");

// Create queue for email signups
export const emailQueue = await Queue<{
  email: string;
  timestamp?: number;
}>("email-queue", {
  name: "ai-email-signup"
});

// Create KV namespace for storing emails
export const emailStore = await KVNamespace("email-store", {
  title: "ai-email-seen",
});

export const worker = await Astro("abstract-industries", {
  command: "astro build",
  bindings: {
    EMAIL_QUEUE: emailQueue,
    EMAIL_STORE: emailStore,
  }
});

// Generate wrangler config
await WranglerJson("wrangler.jsonc", {
  worker,
});

console.log({
  url: worker.url,
});

await app.finalize();