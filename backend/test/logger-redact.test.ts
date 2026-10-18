import { describe, it, expect } from 'vitest';
import { redactUrlSecrets } from '../src/lib/logger.js';

describe('логи: секреты из URL', () => {
  it('токены из query заменяются, остальное не трогается', () => {
    expect(redactUrlSecrets('/api/notifications/stream?token=eyJabc.def&x=1'))
      .toBe('/api/notifications/stream?token=[redacted]&x=1');
    expect(redactUrlSecrets('/cb?a=1&refreshToken=zzz&token=yyy')).toBe('/cb?a=1&refreshToken=[redacted]&token=[redacted]');
    expect(redactUrlSecrets('/api/users/online?ids=1,2')).toBe('/api/users/online?ids=1,2');
  });
});
