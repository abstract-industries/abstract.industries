import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RateLimiter, RATE_LIMIT_CONFIG, createRateLimiter } from './rateLimiter';

// Mock KV store implementation
class MockKVStore {
  private store = new Map<string, { value: string; ttl?: number; timestamp: number }>();

  async get(key: string): Promise<string | null> {
    const item = this.store.get(key);
    if (!item) return null;

    // Check if item has expired
    if (item.ttl && Date.now() - item.timestamp > item.ttl * 1000) {
      this.store.delete(key);
      return null;
    }

    return item.value;
  }

  async put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void> {
    this.store.set(key, {
      value,
      ttl: options?.expirationTtl,
      timestamp: Date.now()
    });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  // Helper method for testing
  clear(): void {
    this.store.clear();
  }

  // Helper method to simulate time passing
  simulateTimePass(seconds: number): void {
    for (const [key, item] of this.store.entries()) {
      if (item.ttl) {
        item.timestamp -= seconds * 1000;
      }
    }
  }
}

describe('RateLimiter', () => {
  let mockKVStore: MockKVStore;
  let rateLimiter: RateLimiter;
  const testIP = '192.168.1.1';

  beforeEach(() => {
    mockKVStore = new MockKVStore();
    rateLimiter = new RateLimiter(mockKVStore);
    vi.clearAllMocks();
  });

  describe('checkRateLimit', () => {
    it('should allow first request', async () => {
      const result = await rateLimiter.checkRateLimit(testIP);

      expect(result.allowed).toBe(true);
      expect(result.remainingAttempts).toBe(2); // 3 max - 1 used = 2 remaining
      expect(result.resetTime).toBeInstanceOf(Date);
    });

    it('should track multiple attempts within window', async () => {
      // First attempt
      const result1 = await rateLimiter.checkRateLimit(testIP);
      expect(result1.allowed).toBe(true);
      expect(result1.remainingAttempts).toBe(2);

      // Second attempt
      const result2 = await rateLimiter.checkRateLimit(testIP);
      expect(result2.allowed).toBe(true);
      expect(result2.remainingAttempts).toBe(1);

      // Third attempt
      const result3 = await rateLimiter.checkRateLimit(testIP);
      expect(result3.allowed).toBe(true);
      expect(result3.remainingAttempts).toBe(0);
    });

    it('should block after exceeding rate limit', async () => {
      // Use up all attempts
      await rateLimiter.checkRateLimit(testIP);
      await rateLimiter.checkRateLimit(testIP);
      await rateLimiter.checkRateLimit(testIP);

      // Fourth attempt should be blocked
      const result = await rateLimiter.checkRateLimit(testIP);
      expect(result.allowed).toBe(false);
      expect(result.blockExpiry).toBeInstanceOf(Date);
    });

    it('should reset attempts after window expires', async () => {
      // Use up all attempts
      await rateLimiter.checkRateLimit(testIP);
      await rateLimiter.checkRateLimit(testIP);
      await rateLimiter.checkRateLimit(testIP);

      // Simulate time passing beyond the window
      mockKVStore.simulateTimePass(RATE_LIMIT_CONFIG.windowMinutes * 60 + 1);

      // Should allow new attempts
      const result = await rateLimiter.checkRateLimit(testIP);
      expect(result.allowed).toBe(true);
      expect(result.remainingAttempts).toBe(2);
    });

    it('should handle different IPs independently', async () => {
      const ip1 = '192.168.1.1';
      const ip2 = '192.168.1.2';

      // Use up attempts for IP1
      await rateLimiter.checkRateLimit(ip1);
      await rateLimiter.checkRateLimit(ip1);
      await rateLimiter.checkRateLimit(ip1);

      // IP1 should be blocked
      const result1 = await rateLimiter.checkRateLimit(ip1);
      expect(result1.allowed).toBe(false);

      // IP2 should still be allowed
      const result2 = await rateLimiter.checkRateLimit(ip2);
      expect(result2.allowed).toBe(true);
      expect(result2.remainingAttempts).toBe(2);
    });

    it('should allow requests when no KV store is available', async () => {
      const rateLimiterNoKV = new RateLimiter(null);
      const result = await rateLimiterNoKV.checkRateLimit(testIP);

      expect(result.allowed).toBe(true);
      expect(result.remainingAttempts).toBeUndefined();
    });

    it('should remove expired blocks automatically', async () => {
      // Block the IP
      await rateLimiter.checkRateLimit(testIP);
      await rateLimiter.checkRateLimit(testIP);
      await rateLimiter.checkRateLimit(testIP);
      await rateLimiter.checkRateLimit(testIP); // This creates the block

      // Simulate time passing beyond block duration
      mockKVStore.simulateTimePass(RATE_LIMIT_CONFIG.blockDurationMinutes * 60 + 1);

      // Should allow new attempts
      const result = await rateLimiter.checkRateLimit(testIP);
      expect(result.allowed).toBe(true);
    });
  });

  describe('enforceRateLimit', () => {
    it('should not throw for allowed requests', async () => {
      await expect(rateLimiter.enforceRateLimit(testIP)).resolves.not.toThrow();
    });

    it('should throw ActionError when rate limit exceeded', async () => {
      // Use up all attempts
      await rateLimiter.checkRateLimit(testIP);
      await rateLimiter.checkRateLimit(testIP);
      await rateLimiter.checkRateLimit(testIP);
      await rateLimiter.checkRateLimit(testIP); // This blocks

      await expect(rateLimiter.enforceRateLimit(testIP)).rejects.toThrow('Too many attempts');
    });

    it('should include remaining time in error message', async () => {
      // Block the IP
      await rateLimiter.checkRateLimit(testIP);
      await rateLimiter.checkRateLimit(testIP);
      await rateLimiter.checkRateLimit(testIP);
      await rateLimiter.checkRateLimit(testIP);

      try {
        await rateLimiter.enforceRateLimit(testIP);
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).toMatch(/Please try again in \d+ minutes/);
      }
    });
  });

  describe('custom configuration', () => {
    it('should use custom rate limit configuration', async () => {
      const customConfig = {
        maxAttempts: 2,
        windowMinutes: 10,
        blockDurationMinutes: 30
      };

      const customRateLimiter = new RateLimiter(mockKVStore, customConfig);

      // First attempt
      const result1 = await customRateLimiter.checkRateLimit(testIP);
      expect(result1.allowed).toBe(true);
      expect(result1.remainingAttempts).toBe(1);

      // Second attempt
      const result2 = await customRateLimiter.checkRateLimit(testIP);
      expect(result2.allowed).toBe(true);
      expect(result2.remainingAttempts).toBe(0);

      // Third attempt should be blocked
      const result3 = await customRateLimiter.checkRateLimit(testIP);
      expect(result3.allowed).toBe(false);
    });
  });

  describe('createRateLimiter factory function', () => {
    it('should create RateLimiter with default config', () => {
      const limiter = createRateLimiter(mockKVStore);
      expect(limiter).toBeInstanceOf(RateLimiter);
    });

    it('should create RateLimiter with custom config', () => {
      const customConfig = {
        maxAttempts: 5,
        windowMinutes: 30,
        blockDurationMinutes: 120
      };

      const limiter = createRateLimiter(mockKVStore, customConfig);
      expect(limiter).toBeInstanceOf(RateLimiter);
    });
  });

  describe('edge cases', () => {
    it('should handle malformed data in KV store gracefully', async () => {
      // Put invalid JSON in the store
      await mockKVStore.put('rate_limit:192.168.1.1', 'invalid json');

      // Should not throw and should treat as first attempt
      const result = await rateLimiter.checkRateLimit(testIP);
      expect(result.allowed).toBe(true);
      expect(result.remainingAttempts).toBe(2);
    });

    it('should handle KV store errors gracefully', async () => {
      // Mock KV store that throws errors
      const errorKVStore = {
        get: vi.fn().mockRejectedValue(new Error('KV store error')),
        put: vi.fn().mockRejectedValue(new Error('KV store error')),
        delete: vi.fn().mockRejectedValue(new Error('KV store error'))
      };

      const errorRateLimiter = new RateLimiter(errorKVStore);

      // Should handle errors gracefully and not crash
      await expect(errorRateLimiter.checkRateLimit(testIP)).rejects.toThrow();
    });

    it('should handle concurrent requests properly', async () => {
      // Simulate multiple concurrent requests
      const promises = Array(5).fill(null).map(() =>
        rateLimiter.checkRateLimit(testIP)
      );

      const results = await Promise.all(promises);

      // At least some should be allowed, some might be blocked
      const allowedCount = results.filter(r => r.allowed).length;
      expect(allowedCount).toBeGreaterThanOrEqual(3);
    });
  });
}); 