# Abstract Industries

A modern portfolio website built with Astro and Cloudflare Workers.

## Features

- **Email Signup Form**: Powered by [Astro Actions](https://docs.astro.build/en/guides/actions/) with Cloudflare Queue integration
- **Modern UI**: Clean, responsive design with animated backgrounds
- **Serverless**: Built for Cloudflare Pages with queue processing

## Setup

### 1. Install mise

[Mise](https://mise.jdx.dev/) is used to manage tool versions and dependencies. Install it first:

```bash
curl https://mise.jdx.dev/install.sh | sh
```

Then install the project dependencies:

```bash
mise install
```

### 2. Configure Cloudflare

Login to Cloudflare:
```bash
wrangler login
```

### 3. Update Configuration

After running the setup script, update the KV namespace IDs in `wrangler.jsonc`:

1. Get your namespace IDs: `wrangler kv:namespace list`
2. Update the `kv_namespaces` section with the actual IDs

### 4. Development

```bash
mise run dev
```

The email signup form will now:
- Validate email addresses using Zod
- Send email data to Cloudflare Queue
- Store emails in KV store for duplicate prevention
- Show success/error messages

### 5. Deploy

```bash
mise run build
wrangler pages deploy dist
```

## Email Processing

The signup form sends emails to a Cloudflare Queue. You'll need to create a separate worker project to consume and process these emails (send to email service, database, etc.).

## Technologies

- [Astro](https://astro.build/) - Static site generator
- [Astro Actions](https://docs.astro.build/en/guides/actions/) - Server-side form handling
- [Cloudflare Pages](https://pages.cloudflare.com/) - Hosting
- [Cloudflare Queues](https://developers.cloudflare.com/queues/) - Email processing queue
- [Cloudflare KV](https://developers.cloudflare.com/kv/) - Email storage
- [Tailwind CSS](https://tailwindcss.com/) - Styling