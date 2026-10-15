import request from 'supertest';
import { UNCATEGORIZED_ID } from '../dist/categories/default-category.js';
import { createActor, setupTestContext } from './test-context.js';
import type { Actor, ExpenseResponse } from './test-context.js';

describe('User-owned expenses and budgets (e2e)', () => {
  const context = setupTestContext();
  let owner: Actor;
  let other: Actor;
  const expense = {
    title: 'Lunch',
    amount: 12.34,
    categoryId: UNCATEGORIZED_ID,
    date: '2026-10-11',
    paymentMethod: 'CARD',
    notes: 'Cafe',
  };

  beforeAll(async () => {
    owner = await createActor(context);
    other = await createActor(context);
  });

  beforeEach(async () => {
    await context.prisma.expense.deleteMany();
    await context.prisma.budget.deleteMany();
  });

  it('creates, reads, updates, and deletes expenses while denying all cross-user operations', async () => {
    const created = await request(context.app.getHttpServer())
      .post('/expenses')
      .auth(owner.token, { type: 'bearer' })
      .send(expense)
      .expect(201);
    const record = created.body as ExpenseResponse;
    expect(record.amount).toBe('12.34');
    expect(record.userId).toBe(owner.id);
    await request(context.app.getHttpServer())
      .get(`/expenses/${record.id}`)
      .auth(owner.token, { type: 'bearer' })
      .expect(200);
    await request(context.app.getHttpServer())
      .get(`/expenses/${record.id}`)
      .auth(other.token, { type: 'bearer' })
      .expect(404);
    await request(context.app.getHttpServer())
      .patch(`/expenses/${record.id}`)
      .auth(other.token, { type: 'bearer' })
      .send({ amount: 50 })
      .expect(404);
    await request(context.app.getHttpServer())
      .delete(`/expenses/${record.id}`)
      .auth(other.token, { type: 'bearer' })
      .expect(404);
    const list = await request(context.app.getHttpServer())
      .get('/expenses')
      .auth(other.token, { type: 'bearer' })
      .expect(200);
    expect(list.body).toMatchObject({ total: 0, items: [] });
    await request(context.app.getHttpServer())
      .patch(`/expenses/${record.id}`)
      .auth(owner.token, { type: 'bearer' })
      .send({ title: 'Dinner', notes: null })
      .expect(200);
    const persisted = await context.prisma.expense.findUniqueOrThrow({
      where: { id: record.id },
    });
    expect(persisted.title).toBe('Dinner');
    expect(persisted.notes).toBeNull();
    await request(context.app.getHttpServer())
      .delete(`/expenses/${record.id}`)
      .auth(owner.token, { type: 'bearer' })
      .expect(204);
    await request(context.app.getHttpServer())
      .get(`/expenses/${record.id}`)
      .auth(owner.token, { type: 'bearer' })
      .expect(404);
  });

  it('filters and paginates without including another user expenses', async () => {
    for (const amount of [10, 20, 30]) {
      await request(context.app.getHttpServer())
        .post('/expenses')
        .auth(owner.token, { type: 'bearer' })
        .send({ ...expense, amount })
        .expect(201);
    }
    await request(context.app.getHttpServer())
      .post('/expenses')
      .auth(other.token, { type: 'bearer' })
      .send(expense)
      .expect(201);
    const page = await request(context.app.getHttpServer())
      .get('/expenses')
      .query({
        page: 2,
        limit: 1,
        minAmount: 15,
        maxAmount: 30,
        search: 'lunch',
        paymentMethod: 'CARD',
        categoryId: UNCATEGORIZED_ID,
        startDate: '2026-10-01',
        endDate: '2026-10-31',
      })
      .auth(owner.token, { type: 'bearer' })
      .expect(200);
    expect(page.body).toMatchObject({
      total: 2,
      page: 2,
      limit: 1,
      totalPages: 2,
    });
    expect((page.body as { items: ExpenseResponse[] }).items).toHaveLength(1);
    await request(context.app.getHttpServer())
      .get('/expenses?limit=101')
      .auth(owner.token, { type: 'bearer' })
      .expect(400);
    await request(context.app.getHttpServer())
      .get('/expenses?startDate=2026-10-31&endDate=2026-10-01')
      .auth(owner.token, { type: 'bearer' })
      .expect(400);
    await request(context.app.getHttpServer())
      .get('/expenses?minAmount=30&maxAmount=10')
      .auth(owner.token, { type: 'bearer' })
      .expect(400);
  });

  it('validates expenses and rejects owner injection, invalid dates, and invalid relations', async () => {
    for (const change of [
      { amount: -1 },
      { amount: 1.001 },
      { amount: '12.34' },
      { title: ' ' },
      { date: '2026-02-30' },
      { userId: other.id },
      { categoryId: 'invalid' },
    ]) {
      await request(context.app.getHttpServer())
        .post('/expenses')
        .auth(owner.token, { type: 'bearer' })
        .send({ ...expense, ...change })
        .expect(400);
    }
    await request(context.app.getHttpServer())
      .post('/expenses')
      .auth(owner.token, { type: 'bearer' })
      .send({ ...expense, categoryId: '00000000-0000-4000-8000-000000000099' })
      .expect(409);
    const created = await request(context.app.getHttpServer())
      .post('/expenses')
      .auth(owner.token, { type: 'bearer' })
      .send(expense)
      .expect(201);
    const record = created.body as ExpenseResponse;
    await request(context.app.getHttpServer())
      .patch(`/expenses/${record.id}`)
      .auth(owner.token, { type: 'bearer' })
      .send({ amount: null })
      .expect(400);
    await request(context.app.getHttpServer())
      .get('/expenses/not-a-uuid')
      .auth(owner.token, { type: 'bearer' })
      .expect(400);
  });

  it('scopes budget CRUD to the owner and enforces one budget per month', async () => {
    const payload = { amount: 500, month: 10, year: 2026 };
    const created = await request(context.app.getHttpServer())
      .post('/budgets')
      .auth(owner.token, { type: 'bearer' })
      .send(payload)
      .expect(201);
    const budget = created.body as { id: string; amount: string };
    expect(budget.amount).toBe('500');
    await request(context.app.getHttpServer())
      .post('/budgets')
      .auth(owner.token, { type: 'bearer' })
      .send(payload)
      .expect(409);
    await request(context.app.getHttpServer())
      .post('/budgets')
      .auth(other.token, { type: 'bearer' })
      .send(payload)
      .expect(201);
    await request(context.app.getHttpServer())
      .get(`/budgets/${budget.id}`)
      .auth(other.token, { type: 'bearer' })
      .expect(404);
    await request(context.app.getHttpServer())
      .patch(`/budgets/${budget.id}`)
      .auth(other.token, { type: 'bearer' })
      .send({ amount: 1 })
      .expect(404);
    await request(context.app.getHttpServer())
      .delete(`/budgets/${budget.id}`)
      .auth(other.token, { type: 'bearer' })
      .expect(404);
    await request(context.app.getHttpServer())
      .patch(`/budgets/${budget.id}`)
      .auth(owner.token, { type: 'bearer' })
      .send({ amount: 700 })
      .expect(200);
    const list = await request(context.app.getHttpServer())
      .get('/budgets?month=10&year=2026')
      .auth(owner.token, { type: 'bearer' })
      .expect(200);
    expect(list.body).toMatchObject([
      { id: budget.id, amount: '700', userId: owner.id },
    ]);
    expect(
      (
        await context.prisma.budget.findUniqueOrThrow({
          where: { id: budget.id },
        })
      ).amount.toString(),
    ).toBe('700');
    await request(context.app.getHttpServer())
      .post('/budgets')
      .auth(owner.token, { type: 'bearer' })
      .send({ ...payload, month: 13 })
      .expect(400);
    await request(context.app.getHttpServer())
      .post('/budgets')
      .auth(owner.token, { type: 'bearer' })
      .send({ ...payload, userId: other.id })
      .expect(400);
    await request(context.app.getHttpServer())
      .patch(`/budgets/${budget.id}`)
      .auth(owner.token, { type: 'bearer' })
      .send({ month: null })
      .expect(400);
    await request(context.app.getHttpServer())
      .delete(`/budgets/${budget.id}`)
      .auth(owner.token, { type: 'bearer' })
      .expect(204);
    await request(context.app.getHttpServer())
      .get(`/budgets/${budget.id}`)
      .auth(owner.token, { type: 'bearer' })
      .expect(404);
  });
});
