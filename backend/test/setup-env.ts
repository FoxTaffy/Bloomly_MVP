// Runs before any test module is imported. Never point this at a real database:
// scripts/test-backend.sh starts a disposable postgres container and sets DATABASE_URL.
if (!process.env.DATABASE_URL || !/bloomly_test/.test(process.env.DATABASE_URL)) {
  throw new Error('Tests require DATABASE_URL pointing at the throwaway bloomly_test database');
}
process.env.NODE_ENV = 'test';
process.env.BLOOMLY_NO_LISTEN = '1';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.COOKIE_SECRET = 'test-cookie-secret';
process.env.TWO_FACTOR_ENCRYPTION_KEY = 'a'.repeat(64);
delete process.env.BREVO_API_KEY;
