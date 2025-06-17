import { ActionError } from 'astro:actions';

// Rate limiting configuration
export const RATE_LIMIT_CONFIG = {
  maxAttempts: 3, // Maximum submissions per time window
  windowMinutes: 15, // Time window in minutes
  blockDurationMinutes: 60 // How long to block after exceeding limit
};

interface RateLimitResult {
  allowed: boolean;
  remainingAttempts?: number;
  resetTime?: Date;
  blockExpiry?: Date;
}

export class RateLimiter {
  private kvStore: any;
  private config: typeof RATE_LIMIT_CONFIG;

  constructor(kvStore: any, config: typeof RATE_LIMIT_CONFIG = RATE_LIMIT_CONFIG) {
    this.kvStore = kvStore;
    this.config = config;
  }

  async checkRateLimit(clientIP: string): Promise<RateLimitResult> {
    if (!this.kvStore) {
      // If no KV store available, allow the request
      return { allowed: true };
    }

    const rateLimitKey = `rate_limit:${clientIP}`;
    const blockKey = `blocked:${clientIP}`;

    // Check if IP is currently blocked
    const blockData = await this.kvStore.get(blockKey);
    if (blockData) {
      try {
        const blockInfo = JSON.parse(blockData);
        const blockExpiry = new Date(blockInfo.expiresAt);

        if (new Date() < blockExpiry) {
          return {
            allowed: false,
            blockExpiry
          };
        } else {
          // Block has expired, remove it
          await this.kvStore.delete(blockKey);
        }
      } catch (error) {
        // Invalid JSON, remove the corrupted entry
        await this.kvStore.delete(blockKey);
      }
    }

    // Check current rate limit
    const rateLimitData = await this.kvStore.get(rateLimitKey);
    let attempts = 0;
    let windowStart = new Date();

    if (rateLimitData) {
      try {
        const rateInfo = JSON.parse(rateLimitData);
        const windowExpiry = new Date(rateInfo.windowExpiry);

        if (new Date() < windowExpiry) {
          // Still within the same window
          attempts = rateInfo.attempts;
          windowStart = new Date(rateInfo.windowStart);

          if (attempts >= this.config.maxAttempts) {
            // Block the IP
            const blockExpiry = new Date(Date.now() + this.config.blockDurationMinutes * 60 * 1000);
            await this.kvStore.put(blockKey, JSON.stringify({
              ip: clientIP,
              blockedAt: new Date().toISOString(),
              expiresAt: blockExpiry.toISOString(),
              reason: 'Rate limit exceeded'
            }), {
              expirationTtl: this.config.blockDurationMinutes * 60
            });

            return {
              allowed: false,
              blockExpiry
            };
          }
        } else {
          // Window has expired, reset
          attempts = 0;
          windowStart = new Date();
        }
      } catch (error) {
        // Invalid JSON, treat as new request
        attempts = 0;
        windowStart = new Date();
      }
    }

    // Increment attempts
    attempts++;
    const windowExpiry = new Date(windowStart.getTime() + this.config.windowMinutes * 60 * 1000);

    await this.kvStore.put(rateLimitKey, JSON.stringify({
      ip: clientIP,
      attempts,
      windowStart: windowStart.toISOString(),
      windowExpiry: windowExpiry.toISOString(),
      lastAttempt: new Date().toISOString()
    }), {
      expirationTtl: this.config.windowMinutes * 60
    });

    const remainingAttempts = this.config.maxAttempts - attempts;

    return {
      allowed: true,
      remainingAttempts,
      resetTime: windowExpiry
    };
  }

  /**
   * Convenience method that throws ActionError if rate limit is exceeded
   */
  async enforceRateLimit(clientIP: string): Promise<void> {
    const result = await this.checkRateLimit(clientIP);

    if (!result.allowed) {
      if (result.blockExpiry) {
        const minutesRemaining = Math.ceil((result.blockExpiry.getTime() - Date.now()) / (1000 * 60));
        throw new ActionError({
          code: 'TOO_MANY_REQUESTS',
          message: `Too many attempts. Please try again in ${minutesRemaining} minutes.`
        });
      }
    }
  }
}

/**
 * Utility function to create a rate limiter instance
 */
export function createRateLimiter(kvStore: any, config?: typeof RATE_LIMIT_CONFIG): RateLimiter {
  return new RateLimiter(kvStore, config);
} 