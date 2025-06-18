# Abstract Industries

A portfolio website for our Brooklyn based engineering collective. 

## Setup

### 1. Install mise

[Mise](https://mise.jdx.dev/) is used to manage tool versions and dependencies. Install it first:

```bash
curl https://mise.jdx.dev/install.sh | sh
```

Install dependencies

```bash
mise install
```

### 2. Development

```bash
mise run dev
```

### 3. Deploy

Deployments are currently handled manually via [alchemy](https://alchemy.run).

```bash
wrangler login
mise run deploy
```

## Technologies

- [Astro](https://astro.build/) - Static site generator
- [Cloudflare Workers](https://developers.cloudflare.com/workers/) - Hosting
- [Cloudflare KV](https://developers.cloudflare.com/kv/) - Email storage
- [Alchemy](https://alchemy.run/) - IaC
- [Mise](htttps://mise.jdx.dev/) - Tool versioning
- [Vitest](https://vitest.dev/) - Testing