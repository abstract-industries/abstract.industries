import { ActionError } from "astro:actions";

export interface RateLimitConfig {
	windowMinutes: number;
	keyPrefix: string;
	errorMessage?: string;
}

export interface RateLimitStore {
	get(key: string): Promise<string | null>;
	put(
		key: string,
		value: string,
		options?: { expirationTtl?: number },
	): Promise<void>;
}

export interface RateLimitResult {
	allowed: boolean;
	remainingMinutes?: number;
	errorMessage?: string;
}

export class RateLimiter {
	constructor(private store: RateLimitStore) {}

	async checkRateLimit(
		identifier: string,
		config: RateLimitConfig,
	): Promise<RateLimitResult> {
		const rateLimitKey = `${config.keyPrefix}:${identifier}`;
		const lastSubmissionData = await this.store.get(rateLimitKey);

		if (lastSubmissionData) {
			const lastSubmission = JSON.parse(lastSubmissionData);
			const lastSubmissionTime = new Date(lastSubmission.timestamp);
			const currentTime = new Date();
			const timeDifferenceMinutes =
				(currentTime.getTime() - lastSubmissionTime.getTime()) / (1000 * 60);

			if (timeDifferenceMinutes < config.windowMinutes) {
				const remainingMinutes = Math.ceil(
					config.windowMinutes - timeDifferenceMinutes,
				);
				const errorMessage =
					config.errorMessage ||
					`Please wait ${remainingMinutes} minute${remainingMinutes !== 1 ? "s" : ""} before trying again.`;

				return {
					allowed: false,
					remainingMinutes,
					errorMessage,
				};
			}
		}

		return { allowed: true };
	}

	async updateRateLimit(
		identifier: string,
		config: RateLimitConfig,
		metadata: Record<string, unknown> = {},
	): Promise<void> {
		const rateLimitKey = `${config.keyPrefix}:${identifier}`;
		const timestamp = new Date().toISOString();

		await this.store.put(
			rateLimitKey,
			JSON.stringify({
				timestamp,
				...metadata,
			}),
			{
				expirationTtl: config.windowMinutes * 60,
			},
		);
	}

	async enforceRateLimit(
		identifier: string,
		config: RateLimitConfig,
		metadata: Record<string, unknown> = {},
	): Promise<void> {
		const result = await this.checkRateLimit(identifier, config);

		if (!result.allowed) {
			throw new ActionError({
				code: "TOO_MANY_REQUESTS",
				message: result.errorMessage || "Rate limit exceeded",
			});
		}

		await this.updateRateLimit(identifier, config, metadata);
	}
}

// Rate limiting configurations
export const RATE_LIMIT_CONFIGS = {
	CONTACT_EMAIL: {
		windowMinutes: 5,
		keyPrefix: "contact_email_rate_limit",
		errorMessage:
			"You can only send one message every 5 minutes. Please wait before sending another message.",
	} as RateLimitConfig,

	CONTACT_IP: {
		windowMinutes: 2,
		keyPrefix: "contact_ip_rate_limit",
		errorMessage:
			"Too many contact requests from your location. Please wait before trying again.",
	} as RateLimitConfig,

	SIGNUP_EMAIL: {
		windowMinutes: 10,
		keyPrefix: "signup_email_rate_limit",
		errorMessage:
			"You can only sign up once every 10 minutes. Please wait before trying again.",
	} as RateLimitConfig,

	SIGNUP_IP: {
		windowMinutes: 5,
		keyPrefix: "signup_ip_rate_limit",
		errorMessage:
			"Too many signup requests from your location. Please wait before trying again.",
	} as RateLimitConfig,
};
