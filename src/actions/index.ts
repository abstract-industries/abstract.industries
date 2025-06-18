import { ActionError, defineAction } from "astro:actions";
import { z } from "astro:schema";
import { RATE_LIMIT_CONFIGS, RateLimiter } from "../utils/rateLimiter";

export const server = {
	signup: defineAction({
		accept: "form",
		input: z.object({
			email: z.string().email("Please enter a valid email address"),
		}),
		handler: async (input, context) => {
			try {
				const { email } = input;

				// Access Cloudflare bindings from locals
				const { EMAIL_STORE } = context.locals.runtime.env;

				if (!EMAIL_STORE) {
					throw new ActionError({
						code: "INTERNAL_SERVER_ERROR",
						message: "Email store not configured",
					});
				}

				const clientIP =
					context.request.headers.get("CF-Connecting-IP") || "unknown";
				const rateLimiter = new RateLimiter(EMAIL_STORE);

				// Apply rate limiting for both email and IP
				await rateLimiter.enforceRateLimit(
					email,
					RATE_LIMIT_CONFIGS.SIGNUP_EMAIL,
				);
				await rateLimiter.enforceRateLimit(
					clientIP,
					RATE_LIMIT_CONFIGS.SIGNUP_IP,
				);

				// Check if email already exists in KV store
				const existingEmail = await EMAIL_STORE.get(email);
				if (existingEmail) {
					return {
						success: true,
						message: "You are already subscribed!",
						alreadyExists: true,
					};
				}

				// Prepare email data for storage
				const emailData = {
					email,
					timestamp: new Date().toISOString(),
					ip: clientIP,
					userAgent: context.request.headers.get("User-Agent"),
					source: "works-page-signup",
				};

				await EMAIL_STORE.put(
					email,
					JSON.stringify({
						...emailData,
						status: "stored",
					}),
				);

				return {
					success: true,
					message: "Thank you! We'll notify you when we launch.",
					email,
				};
			} catch (error) {
				console.error("Email signup error:", error);

				if (error instanceof ActionError) {
					throw error;
				}

				throw new ActionError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Something went wrong. Please try again.",
				});
			}
		},
	}),

	contact: defineAction({
		accept: "form",
		input: z.object({
			name: z
				.string()
				.min(1, "Name is required")
				.max(100, "Name must be less than 100 characters"),
			email: z.string().email("Please enter a valid email address"),
			company: z
				.string()
				.max(100, "Company name must be less than 100 characters")
				.optional(),
			message: z
				.string()
				.min(10, "Message must be at least 10 characters")
				.max(2000, "Message must be less than 2000 characters"),
		}),
		handler: async (input, context) => {
			try {
				const { name, email, company, message } = input;

				// Access Cloudflare bindings from locals
				const { CONTACT_STORE } = context.locals.runtime.env;

				if (!CONTACT_STORE) {
					throw new ActionError({
						code: "INTERNAL_SERVER_ERROR",
						message: "Contact store not configured",
					});
				}

				const clientIP =
					context.request.headers.get("CF-Connecting-IP") || "unknown";
				const timestamp = new Date().toISOString();
				const rateLimiter = new RateLimiter(CONTACT_STORE);

				// Apply rate limiting for both email and IP
				await rateLimiter.enforceRateLimit(
					email,
					RATE_LIMIT_CONFIGS.CONTACT_EMAIL,
				);
				await rateLimiter.enforceRateLimit(
					clientIP,
					RATE_LIMIT_CONFIGS.CONTACT_IP,
				);

				// Create a unique key for this contact submission
				const contactId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

				// Prepare contact data for storage
				const contactData = {
					id: contactId,
					name,
					email,
					company: company || null,
					message,
					timestamp,
					ip: clientIP,
					userAgent: context.request.headers.get("User-Agent"),
					source: "contact-page",
					status: "new",
				};

				// Store contact submission in KV store
				await CONTACT_STORE.put(contactId, JSON.stringify(contactData));

				// Also store by email for easy lookup (optional)
				const emailKey = `email:${email}:${Date.now()}`;
				await CONTACT_STORE.put(
					emailKey,
					JSON.stringify({
						contactId,
						timestamp,
					}),
				);

				return {
					success: true,
					message: "Thank you for your message! We'll get back to you soon.",
					contactId,
				};
			} catch (error) {
				console.error("Contact form error:", error);

				if (error instanceof ActionError) {
					throw error;
				}

				throw new ActionError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Something went wrong. Please try again.",
				});
			}
		},
	}),
};
