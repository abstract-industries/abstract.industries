import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RateLimiter, RATE_LIMIT_CONFIGS, type RateLimitStore, type RateLimitConfig } from './rateLimiter';
import { ActionError } from 'astro:actions';

// Mock store implementation for testing
class MockRateLimitStore implements RateLimitStore {
  private storage = new Map<string, { value: string; expiry?: number }>();

  async get(key: string): Promise<string | null> {
    const item = this.storage.get(key);
    if (!item) return null;

    // Check if expired
    if (item.expiry && Date.now() > item.expiry) {
      this.storage.delete(key);
      return null;
    }

    return item.value;
  }

  async put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void> {
    const expiry = options?.expirationTtl ? Date.now() + (options.expirationTtl * 1000) : undefined;
    this.storage.set(key, { value, expiry });
  }

  clear() {
    this.storage.clear();
  }

  size() {
    return this.storage.size;
  }
}

describe('RateLimiter', () => {
  let store: MockRateLimitStore;
  let rateLimiter: RateLimiter;
  let mockConfig: RateLimitConfig;

  beforeEach(() => {
    vi.useFakeTimers();
    store = new MockRateLimitStore();
    rateLimiter = new RateLimiter(store);
    mockConfig = {
      windowMinutes: 5,
      keyPrefix: 'test_rate_limit',
      errorMessage: 'Test rate limit exceeded'
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('checkRateLimit', () => {
    it('should allow requests when no previous record exists', async () => {
      const result = await rateLimiter.checkRateLimit('test@example.com', mockConfig);

      expect(result.allowed).toBe(true);
      expect(result.remainingMinutes).toBeUndefined();
      expect(result.errorMessage).toBeUndefined();
    });

    it('should block requests within the rate limit window', async () => {
      const identifier = 'test@example.com';

      // First request - should be allowed and create rate limit record
      await rateLimiter.updateRateLimit(identifier, mockConfig);

      // Advance time by 3 minutes (less than 5 minute window)
      vi.advanceTimersByTime(3 * 60 * 1000);

      // Second request - should be blocked
      const result = await rateLimiter.checkRateLimit(identifier, mockConfig);

      expect(result.allowed).toBe(false);
      expect(result.remainingMinutes).toBe(2); // 5 - 3 = 2 minutes remaining
      expect(result.errorMessage).toBe('Test rate limit exceeded');
    });

    it('should allow requests after the rate limit window expires', async () => {
      const identifier = 'test@example.com';

      // First request
      await rateLimiter.updateRateLimit(identifier, mockConfig);

      // Advance time by 6 minutes (more than 5 minute window)
      vi.advanceTimersByTime(6 * 60 * 1000);

      // Second request - should be allowed
      const result = await rateLimiter.checkRateLimit(identifier, mockConfig);

      expect(result.allowed).toBe(true);
    });

    it('should use default error message when none provided', async () => {
      const configWithoutMessage = { ...mockConfig, errorMessage: undefined };
      const identifier = 'test@example.com';

      await rateLimiter.updateRateLimit(identifier, configWithoutMessage);
      vi.advanceTimersByTime(2 * 60 * 1000); // 2 minutes

      const result = await rateLimiter.checkRateLimit(identifier, configWithoutMessage);

      expect(result.allowed).toBe(false);
      expect(result.errorMessage).toBe('Please wait 3 minutes before trying again.');
    });

    it('should handle singular minute in default error message', async () => {
      const configWithoutMessage = { ...mockConfig, errorMessage: undefined };
      const identifier = 'test@example.com';

      await rateLimiter.updateRateLimit(identifier, configWithoutMessage);
      vi.advanceTimersByTime(4.5 * 60 * 1000); // 4.5 minutes

      const result = await rateLimiter.checkRateLimit(identifier, configWithoutMessage);

      expect(result.allowed).toBe(false);
      expect(result.errorMessage).toBe('Please wait 1 minute before trying again.');
    });
  });

  describe('updateRateLimit', () => {
    it('should store rate limit record with timestamp', async () => {
      const identifier = 'test@example.com';
      const metadata = { contactId: '123', source: 'test' };

      await rateLimiter.updateRateLimit(identifier, mockConfig, metadata);

      const storedData = await store.get('test_rate_limit:test@example.com');
      expect(storedData).not.toBeNull();

      const parsed = JSON.parse(storedData!);
      expect(parsed.timestamp).toBeDefined();
      expect(parsed.contactId).toBe('123');
      expect(parsed.source).toBe('test');
    });

    it('should set TTL based on window minutes', async () => {
      const identifier = 'test@example.com';

      await rateLimiter.updateRateLimit(identifier, mockConfig);

      // Advance time to just before expiry
      vi.advanceTimersByTime((5 * 60 - 1) * 1000);
      expect(await store.get('test_rate_limit:test@example.com')).not.toBeNull();

      // Advance past expiry
      vi.advanceTimersByTime(2 * 1000);
      expect(await store.get('test_rate_limit:test@example.com')).toBeNull();
    });
  });

  describe('enforceRateLimit', () => {
    it('should not throw when rate limit allows request', async () => {
      const identifier = 'test@example.com';

      await expect(
        rateLimiter.enforceRateLimit(identifier, mockConfig)
      ).resolves.not.toThrow();
    });

    it('should throw ActionError when rate limit is exceeded', async () => {
      const identifier = 'test@example.com';

      // First request
      await rateLimiter.enforceRateLimit(identifier, mockConfig);

      // Second request within window - should throw
      await expect(
        rateLimiter.enforceRateLimit(identifier, mockConfig)
      ).rejects.toThrow(ActionError);
    });

    it('should throw ActionError with correct message and code', async () => {
      const identifier = 'test@example.com';

      await rateLimiter.enforceRateLimit(identifier, mockConfig);

      try {
        await rateLimiter.enforceRateLimit(identifier, mockConfig);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(ActionError);
        expect((error as ActionError).code).toBe('TOO_MANY_REQUESTS');
        expect((error as ActionError).message).toBe('Test rate limit exceeded');
      }
    });

    it('should update rate limit record after successful check', async () => {
      const identifier = 'test@example.com';
      const metadata = { source: 'test' };

      await rateLimiter.enforceRateLimit(identifier, mockConfig, metadata);

      const storedData = await store.get('test_rate_limit:test@example.com');
      expect(storedData).not.toBeNull();

      const parsed = JSON.parse(storedData!);
      expect(parsed.source).toBe('test');
    });
  });

  describe('RATE_LIMIT_CONFIGS', () => {
    it('should have correct configuration for contact email rate limiting', () => {
      expect(RATE_LIMIT_CONFIGS.CONTACT_EMAIL).toEqual({
        windowMinutes: 5,
        keyPrefix: 'contact_email_rate_limit',
        errorMessage: 'You can only send one message every 5 minutes. Please wait before sending another message.'
      });
    });

    it('should have correct configuration for contact IP rate limiting', () => {
      expect(RATE_LIMIT_CONFIGS.CONTACT_IP).toEqual({
        windowMinutes: 2,
        keyPrefix: 'contact_ip_rate_limit',
        errorMessage: 'Too many contact requests from your location. Please wait before trying again.'
      });
    });

    it('should have correct configuration for signup email rate limiting', () => {
      expect(RATE_LIMIT_CONFIGS.SIGNUP_EMAIL).toEqual({
        windowMinutes: 10,
        keyPrefix: 'signup_email_rate_limit',
        errorMessage: 'You can only sign up once every 10 minutes. Please wait before trying again.'
      });
    });

    it('should have correct configuration for signup IP rate limiting', () => {
      expect(RATE_LIMIT_CONFIGS.SIGNUP_IP).toEqual({
        windowMinutes: 5,
        keyPrefix: 'signup_ip_rate_limit',
        errorMessage: 'Too many signup requests from your location. Please wait before trying again.'
      });
    });
  });

  describe('Integration scenarios', () => {
    it('should handle different identifiers independently', async () => {
      const email1 = 'user1@example.com';
      const email2 = 'user2@example.com';

      // Block first email
      await rateLimiter.enforceRateLimit(email1, mockConfig);

      // Second email should still work
      await expect(
        rateLimiter.enforceRateLimit(email2, mockConfig)
      ).resolves.not.toThrow();

      // First email should still be blocked
      await expect(
        rateLimiter.enforceRateLimit(email1, mockConfig)
      ).rejects.toThrow(ActionError);
    });

    it('should handle different key prefixes independently', async () => {
      const identifier = 'test@example.com';
      const config1 = { ...mockConfig, keyPrefix: 'prefix1' };
      const config2 = { ...mockConfig, keyPrefix: 'prefix2' };

      // Block with first prefix
      await rateLimiter.enforceRateLimit(identifier, config1);

      // Same identifier with different prefix should work
      await expect(
        rateLimiter.enforceRateLimit(identifier, config2)
      ).resolves.not.toThrow();
    });

    it('should handle edge case of very short rate limit windows', async () => {
      const shortConfig = { ...mockConfig, windowMinutes: 0.1 }; // 6 seconds
      const identifier = 'test@example.com';

      await rateLimiter.enforceRateLimit(identifier, shortConfig);

      // Should be blocked immediately
      await expect(
        rateLimiter.enforceRateLimit(identifier, shortConfig)
      ).rejects.toThrow();

      // Should be allowed after window
      vi.advanceTimersByTime(7 * 1000);
      await expect(
        rateLimiter.enforceRateLimit(identifier, shortConfig)
      ).resolves.not.toThrow();
    });
  });
}); 