import alchemy from "alchemy";
import { Astro, KVNamespace } from "alchemy/cloudflare";

const app = await alchemy("abstract-industries");

// Create KV namespace for storing emails
export const emailStore = await KVNamespace("email-store", {
  title: "ai-email-seen",
});

export const worker = await Astro("abstract-industries", {
  command: "astro build",
  bindings: {
    EMAIL_STORE: emailStore,
  },
});

console.log({
  url: worker.url,
});

await app.finalize();