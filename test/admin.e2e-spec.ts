import request from 'supertest';
import { Role } from '../dist/generated/prisma/client.js';
import { UNCATEGORIZED_ID } from '../dist/categories/default-category.js';
import type { AdminService } from '../dist/admin/admin.service.js';
import { createActor, setupTestContext } from './test-context.js';
import type { Actor } from './test-context.js';

describe('Admin categories and insights (e2e)', () => {
  const context = setupTestContext();
  let admin: Actor;
  let owner: Actor;
  let other: Actor;

  beforeAll(async () => {
    admin = await createActor(context, Role.ADMIN);
    owner = await createActor(context);
    other = await createActor(context);
  });

  beforeEach(async () => {
    await context.prisma.expense.deleteMany();
    await context.prisma.category.deleteMany({
      where: { id: { not: UNCATEGORIZED_ID } },
    });
    await context.prisma.user.update({
      where: { id: admin.id },
      data: { role: Role.ADMIN },
    });
  });

  it('restricts category writes and insights to admins, using the current database role', async () => {
    await request(context.app.getHttpServer()).get('/categories').expect(401);
    await request(context.app.getHttpServer())
      .get('/categories')
      .auth(owner.token, { type: 'bearer' })
      .expect(200);
    await request(context.app.getHttpServer())
      .get('/admin/insights')
      .auth(owner.token, { type: 'bearer' })
      .expect(403);
    await request(context.app.getHttpServer())
      .post('/categories')
      .auth(owner.token, { type: 'bearer' })
      .send({ name: 'Food' })
      .expect(403);
    await request(context.app.getHttpServer())
      .patch(`/categories/${UNCATEGORIZED_ID}`)
      .auth(owner.token, { type: 'bearer' })
      .send({ name: 'Changed' })
      .expect(403);
    await request(context.app.getHttpServer())
      .delete(`/categories/${UNCATEGORIZED_ID}`)
      .auth(owner.token, { type: 'bearer' })
      .expect(403);
    const created = await request(context.app.getHttpServer())
      .post('/categories')
      .auth(admin.token, { type: 'bearer' })
      .send({ name: 'Food', isDefault: false })
      .expect(201);
    const category = created.body as { id: string };
    await request(context.app.getHttpServer())
      .patch(`/categories/${category.id}`)
      .auth(admin.token, { type: 'bearer' })
      .send({ name: 'Groceries' })
      .expect(200);
    await request(context.app.getHttpServer())
      .get(`/categories/${category.id}`)
      .auth(owner.token, { type: 'bearer' })
      .expect(200);
    await request(context.app.getHttpServer())
      .patch(`/categories/${category.id}`)
      .auth(admin.token, { type: 'bearer' })
      .send({ isDefault: null })
      .expect(400);
    await context.prisma.user.update({
      where: { id: admin.id },
      data: { role: Role.USER },
    });
    await request(context.app.getHttpServer())
      .get('/admin/insights')
      .auth(admin.token, { type: 'bearer' })
      .expect(403);
  });

  it('reassigns every affected expense before deleting a category and protects Uncategorized', async () => {
    const created = await request(context.app.getHttpServer())
      .post('/categories')
      .auth(admin.token, { type: 'bearer' })
      .send({ name: 'Transport' })
      .expect(201);
    const category = created.body as { id: string };
    for (const actor of [owner, other]) {
      await request(context.app.getHttpServer())
        .post('/expenses')
        .auth(actor.token, { type: 'bearer' })
        .send({
          title: 'Bus',
          amount: 2.5,
          categoryId: category.id,
          date: '2026-10-11',
          paymentMethod: 'CASH',
        })
        .expect(201);
    }
    await request(context.app.getHttpServer())
      .delete(`/categories/${category.id}`)
      .auth(admin.token, { type: 'bearer' })
      .expect(204);
    expect(
      await context.prisma.category.findUnique({ where: { id: category.id } }),
    ).toBeNull();
    const expenses = await context.prisma.expense.findMany();
    expect(expenses).toHaveLength(2);
    expect(
      expenses.every((expense) => expense.categoryId === UNCATEGORIZED_ID),
    ).toBe(true);
    await request(context.app.getHttpServer())
      .delete(`/categories/${UNCATEGORIZED_ID}`)
      .auth(admin.token, { type: 'bearer' })
      .expect(409);
    await request(context.app.getHttpServer())
      .patch(`/categories/${UNCATEGORIZED_ID}`)
      .auth(admin.token, { type: 'bearer' })
      .send({ name: 'Renamed' })
      .expect(409);
    await request(context.app.getHttpServer())
      .get(`/categories/${category.id}`)
      .auth(owner.token, { type: 'bearer' })
      .expect(404);
  });

  it('rolls back deletion if reassignment cannot complete', async () => {
    const category = await context.prisma.category.create({
      data: { name: 'Rollback' },
    });
    const expense = await context.prisma.expense.create({
      data: {
        title: 'Keep me',
        amount: 10,
        categoryId: category.id,
        date: new Date('2026-10-11'),
        paymentMethod: 'CASH',
        userId: owner.id,
      },
    });
    await context.prisma.category.delete({ where: { id: UNCATEGORIZED_ID } });
    try {
      await request(context.app.getHttpServer())
        .delete(`/categories/${category.id}`)
        .auth(admin.token, { type: 'bearer' })
        .expect(409);
      expect(
        await context.prisma.category.findUnique({
          where: { id: category.id },
        }),
      ).not.toBeNull();
      expect(
        (
          await context.prisma.expense.findUniqueOrThrow({
            where: { id: expense.id },
          })
        ).categoryId,
      ).toBe(category.id);
    } finally {
      await context.prisma.category.create({
        data: { id: UNCATEGORIZED_ID, name: 'Uncategorized', isDefault: true },
      });
    }
  });

  it('returns exact totals, UTC monthly spending, rankings including zeroes, and safe recent records', async () => {
    const empty = await request(context.app.getHttpServer())
      .get('/admin/insights')
      .auth(admin.token, { type: 'bearer' })
      .expect(200);
    expect(empty.body).toMatchObject({
      totalExpensesRecorded: 0,
      totalValueOfExpenses: '0.00',
      currentMonth: { totalExpenses: 0, totalValue: '0.00' },
    });
    const now = new Date();
    const currentDate = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    )
      .toISOString()
      .slice(0, 10);
    const previousDate = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0),
    )
      .toISOString()
      .slice(0, 10);
    const amounts = [10.1, 20.2, 30.3, 40.4, 50.5, 60.6];
    const categories: { id: string; name: string }[] = [];
    for (const [index, amount] of amounts.entries()) {
      const response = await request(context.app.getHttpServer())
        .post('/categories')
        .auth(admin.token, { type: 'bearer' })
        .send({ name: `Category ${index}` })
        .expect(201);
      const category = response.body as { id: string; name: string };
      categories.push(category);
      await request(context.app.getHttpServer())
        .post('/expenses')
        .auth(owner.token, { type: 'bearer' })
        .send({
          title: `Expense ${index}`,
          amount,
          categoryId: category.id,
          date: currentDate,
          paymentMethod: 'CARD',
        })
        .expect(201);
    }
    await context.prisma.expense.create({
      data: {
        title: 'Previous month, added recently',
        amount: 1000,
        date: new Date(previousDate),
        categoryId: categories[0].id,
        userId: other.id,
        paymentMethod: 'CASH',
        createdAt: new Date(Date.now() + 1000),
      },
    });
    const password = (
      await context.prisma.user.findUniqueOrThrow({ where: { id: owner.id } })
    ).password;
    for (let index = 0; index < 4; index++) {
      await context.prisma.user.create({
        data: {
          email: `recent-${index}@retain.test`,
          password,
          createdAt: new Date(Date.now() + (index + 1) * 1000),
        },
      });
    }
    const response = await request(context.app.getHttpServer())
      .get('/admin/insights')
      .auth(admin.token, { type: 'bearer' })
      .expect(200);
    const insights = response.body as Awaited<
      ReturnType<AdminService['insights']>
    >;
    expect(insights.totalRegisteredUsers).toBe(7);
    expect(insights.totalExpensesRecorded).toBe(7);
    expect(insights.totalValueOfExpenses).toBe('1212.10');
    expect(insights.currentMonth).toMatchObject({
      totalExpenses: 6,
      totalValue: '212.10',
      month: now.getUTCMonth() + 1,
      year: now.getUTCFullYear(),
    });
    expect(insights.spendingPerCategory).toHaveLength(7);
    expect(insights.top5Categories).toHaveLength(5);
    expect(insights.top5Categories[0]).toMatchObject({
      categoryId: categories[0].id,
      totalValue: '1010.10',
      totalExpenses: 2,
    });
    expect(insights.bottom5Categories).toHaveLength(5);
    expect(insights.bottom5Categories[0]).toMatchObject({
      categoryId: UNCATEGORIZED_ID,
      totalValue: '0.00',
    });
    expect(insights.recentExpenses).toHaveLength(5);
    expect(insights.recentExpenses[0].title).toBe(
      'Previous month, added recently',
    );
    expect(insights.recentUsers).toHaveLength(5);
    expect(insights.recentUsers[0].email).toBe('recent-3@retain.test');
    expect(JSON.stringify(insights)).not.toContain('password');
  });
});
