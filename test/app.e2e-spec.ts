import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { setupTestContext } from './test-context.js';
import type { AuthResponse } from './test-context.js';

describe('Retain authentication (e2e)', () => {
  const context = setupTestContext();

  it('/ (GET)', () => {
    return request(context.app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('rejects missing, forged, and expired tokens', async () => {
    await request(context.app.getHttpServer()).get('/expenses').expect(401);
    await request(context.app.getHttpServer())
      .get('/budgets')
      .set('Authorization', 'Bearer forged')
      .expect(401);
    const token = new JwtService().sign(
      { sub: '00000000-0000-4000-8000-000000000002' },
      {
        secret: process.env.JWT_SECRET,
        algorithm: 'HS256',
        issuer: 'retain',
        audience: 'retain-api',
        expiresIn: -1,
      },
    );
    await request(context.app.getHttpServer())
      .get('/categories')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });

  it('signs up and signs in without exposing passwords or allowing role injection', async () => {
    const signup = await request(context.app.getHttpServer())
      .post('/auth/signup')
      .send({ email: ' Person@Retain.Test ', password: 'Strong-password-123' })
      .expect(201);
    const auth = signup.body as AuthResponse;
    expect(auth.user.email).toBe('person@retain.test');
    expect(auth.user.role).toBe('USER');
    expect(auth.user).not.toHaveProperty('password');
    expect(auth.expiresIn).toBe(3600);
    const stored = await context.prisma.user.findUniqueOrThrow({
      where: { id: auth.user.id },
    });
    expect(stored.password).not.toBe('Strong-password-123');
    expect(stored.password).toMatch(/^[a-f0-9]{32}:[a-f0-9]{128}$/);
    await request(context.app.getHttpServer())
      .post('/auth/signup')
      .send({ email: 'person@retain.test', password: 'Strong-password-123' })
      .expect(409);
    await request(context.app.getHttpServer())
      .post('/auth/signup')
      .send({
        email: 'admin@retain.test',
        password: 'Strong-password-123',
        role: 'ADMIN',
      })
      .expect(400);
    await request(context.app.getHttpServer())
      .post('/auth/signin')
      .send({ email: 'person@retain.test', password: 'wrong-password' })
      .expect(401);
    await request(context.app.getHttpServer())
      .post('/auth/signin')
      .send({ email: 'missing@retain.test', password: 'wrong-password' })
      .expect(401);
    const signin = await request(context.app.getHttpServer())
      .post('/auth/signin')
      .send({ email: 'PERSON@RETAIN.TEST', password: 'Strong-password-123' })
      .expect(200);
    const signedIn = signin.body as AuthResponse;
    await request(context.app.getHttpServer())
      .get('/categories')
      .set('Authorization', `Bearer ${signedIn.accessToken}`)
      .expect(200);
    await context.prisma.user.delete({ where: { id: auth.user.id } });
    await request(context.app.getHttpServer())
      .get('/expenses')
      .set('Authorization', `Bearer ${signedIn.accessToken}`)
      .expect(401);
  });

  it('rejects invalid signup payloads', async () => {
    await request(context.app.getHttpServer())
      .post('/auth/signup')
      .send({ email: 'not-an-email', password: 'short' })
      .expect(400);
  });
});
