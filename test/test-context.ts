import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../dist/app.module.js';
import { configureApp } from '../dist/configure-app.js';
import { PrismaService } from '../dist/prisma/prisma.service.js';
import { Role } from '../dist/generated/prisma/client.js';

export interface Actor {
  token: string;
  id: string;
  email: string;
}

export interface AuthResponse {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  user: { id: string; email: string; role: Role };
}

export interface ExpenseResponse {
  id: string;
  title: string;
  amount: string;
  categoryId: string;
  userId: string;
  notes: string | null;
}

interface TestContext {
  app: INestApplication<App>;
  prisma: PrismaService;
}

export function setupTestContext(): TestContext {
  const context = {} as TestContext;
  const schema = `retain_test_${randomUUID().replaceAll('-', '')}`;
  const originalUrl = process.env.DATABASE_URL;
  const originalSecret = process.env.JWT_SECRET;
  let pool: Pool | undefined;

  beforeAll(async () => {
    if (!originalUrl)
      throw new Error(
        'DATABASE_URL is required for PostgreSQL integration tests',
      );
    pool = new Pool({ connectionString: originalUrl });
    const client = await pool.connect();
    try {
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET search_path TO "${schema}"`);
      const migrations = join(process.cwd(), 'prisma', 'migrations');
      for (const entry of readdirSync(migrations, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .sort((left, right) => left.name.localeCompare(right.name))) {
        await client.query(
          readFileSync(join(migrations, entry.name, 'migration.sql'), 'utf8'),
        );
      }
    } finally {
      client.release();
    }
    const url = new URL(originalUrl);
    url.searchParams.set('schema', schema);
    process.env.DATABASE_URL = url.toString();
    process.env.JWT_SECRET =
      'retain-integration-test-only-secret-at-least-32-characters';
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    context.app = module.createNestApplication();
    configureApp(context.app);
    await context.app.init();
    context.prisma = context.app.get(PrismaService);
    const [location] = await context.prisma.$queryRaw<
      { schema: string }[]
    >`SELECT current_schema() AS schema`;
    expect(location.schema).toBe(schema);
  }, 30_000);

  afterAll(async () => {
    try {
      if (context.app) await context.app.close();
    } finally {
      if (originalUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = originalUrl;
      if (originalSecret === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = originalSecret;
      if (pool) {
        try {
          await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        } finally {
          await pool.end();
        }
      }
    }
  });
  return context;
}

export async function createActor(
  context: TestContext,
  role: Role = Role.USER,
): Promise<Actor> {
  const email = `${randomUUID()}@retain.test`;
  const response = await request(context.app.getHttpServer())
    .post('/auth/signup')
    .send({ email, password: 'Strong-password-123' })
    .expect(201);
  const auth = response.body as AuthResponse;
  if (role !== Role.USER)
    await context.prisma.user.update({
      where: { id: auth.user.id },
      data: { role },
    });
  return { token: auth.accessToken, id: auth.user.id, email };
}
