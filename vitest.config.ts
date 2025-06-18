/// <reference types="vitest" />

import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";
import { getViteConfig } from "astro/config";

export default getViteConfig(
	defineWorkersConfig({
		test: {
			poolOptions: {
				workers: {
					wrangler: { configPath: "./wrangler.jsonc" },
				},
			},
		},
	}),
);

// This is how cloudflare recommends configuring vitest
// It's missing the special astro config
// export default defineWorkersConfig({
//   test: {
//     poolOptions: {
//       workers: {
//         wrangler: { configPath: "./wrangler.jsonc" },
//       },
//     },
//   },
// });

// This is how astro recommends to configure vitest
// @see https://docs.astro.build/en/guides/testing/#vitest
// export default getViteConfig({})