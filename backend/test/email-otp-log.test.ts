import { describe, it, expect, afterEach, vi } from 'vitest';
import { sendOtpEmail } from '../src/modules/auth/email.service.js';

describe('email: OTP без BREVO_API_KEY', () => {
  const env = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = env;
    vi.restoreAllMocks();
  });

  it('в production код не попадает в логи', async () => {
    process.env.NODE_ENV = 'production';
    const logs: unknown[][] = [];
    vi.spyOn(console, 'log').mockImplementation((...a) => { logs.push(a) });
    vi.spyOn(console, 'error').mockImplementation((...a) => { logs.push(a) });

    await sendOtpEmail('victim@example.com', '731942', 'reset');

    expect(JSON.stringify(logs)).not.toContain('731942');
  });

  it('вне production код пишется в лог для разработки', async () => {
    process.env.NODE_ENV = 'development';
    const logs: unknown[][] = [];
    vi.spyOn(console, 'log').mockImplementation((...a) => { logs.push(a) });

    await sendOtpEmail('dev@example.com', '731942', 'reset');

    expect(JSON.stringify(logs)).toContain('731942');
  });
});
