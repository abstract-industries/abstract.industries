import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro:schema';

export const server = {
  signup: defineAction({
    accept: 'form',
    input: z.object({
      email: z.string().email('Please enter a valid email address'),
    }),
    handler: async (input, context) => {
      try {
        const { email } = input;

        // Access Cloudflare bindings from locals
        const { EMAIL_STORE } = context.locals.runtime.env;

        const clientIP = context.request.headers.get('CF-Connecting-IP') || 'unknown';

        // Check if email already exists in KV store
        if (EMAIL_STORE) {
          const existingEmail = await EMAIL_STORE.get(email);
          if (existingEmail) {
            return {
              success: true,
              message: 'You are already subscribed!',
              alreadyExists: true
            };
          }
        }

        // Prepare email data for storage
        const emailData = {
          email,
          timestamp: new Date().toISOString(),
          ip: clientIP,
          userAgent: context.request.headers.get('User-Agent'),
          source: 'works-page-signup'
        };

        // Store email in KV store
        if (!EMAIL_STORE) {
          throw new ActionError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Email store not configured'
          });
        }

        await EMAIL_STORE.put(email, JSON.stringify({
          ...emailData,
          status: 'stored'
        }));

        return {
          success: true,
          message: 'Thank you! We\'ll notify you when we launch.',
          email
        };

      } catch (error) {
        console.error('Email signup error:', error);

        if (error instanceof ActionError) {
          throw error;
        }

        throw new ActionError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Something went wrong. Please try again.'
        });
      }
    }
  })
}; 