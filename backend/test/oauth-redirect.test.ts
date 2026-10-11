import { describe, it, expect, afterEach } from 'vitest';
import { isAllowedMobileRedirect } from '../src/modules/auth/oauth.service.js';

describe('oauth: mobile redirect allowlist', () => {
  const env = process.env.NODE_ENV;
  afterEach(() => { process.env.NODE_ENV = env; });

  it('в production принимается только bloomly://', () => {
    process.env.NODE_ENV = 'production';
    expect(isAllowedMobileRedirect('bloomly://auth/callback')).toBe(true);
    expect(isAllowedMobileRedirect('exp://192.168.0.5:8081/--/auth')).toBe(false);
    expect(isAllowedMobileRedirect('exp://evil.example/--/x')).toBe(false);
  });

  it('вне production exp:// разрешён, но чужие схемы и https — нет', () => {
    process.env.NODE_ENV = 'development';
    expect(isAllowedMobileRedirect('exp://192.168.0.5:8081/--/auth')).toBe(true);
    expect(isAllowedMobileRedirect('exps://evil.example/x')).toBe(false);
    expect(isAllowedMobileRedirect('https://evil.example/x')).toBe(false);
    expect(isAllowedMobileRedirect('javascript:alert(1)')).toBe(false);
  });
});
