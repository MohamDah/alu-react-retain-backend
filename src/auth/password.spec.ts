import { hashPassword, verifyPassword } from './password.js';

describe('Password hashing', () => {
  it('uses unique salts and validates only the correct password', async () => {
    const first = await hashPassword('Strong-password-123');
    const second = await hashPassword('Strong-password-123');
    expect(first).not.toBe(second);
    expect(await verifyPassword('Strong-password-123', first)).toBe(true);
    expect(await verifyPassword('wrong-password', first)).toBe(false);
    expect(await verifyPassword('Strong-password-123', 'invalid')).toBe(false);
  });
});
