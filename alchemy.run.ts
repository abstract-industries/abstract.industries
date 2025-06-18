import alchemy from "alchemy";
import { Astro, KVNamespace } from "alchemy/cloudflare";

const app = await alchemy("abstract-industries");

// Create KV namespace for storing emails
export const emailStore = await KVNamespace("email-store", {
  title: "ai-email-seen",
});

// Create KV namespace for storing contact form submissions
export const contactStore = await KVNamespace("contact-store", {
  title: "ai-contact-submissions",
});

export const worker = await Astro("abstract-industries", {
  command: "astro build",
  bindings: {
    EMAIL_STORE: emailStore,
    CONTACT_STORE: contactStore,
  },
});

console.log({
  url: worker.url,
});

await app.finalize();