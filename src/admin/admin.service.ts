import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async insights() {
    const now = new Date();
    const month = now.getUTCMonth() + 1;
    const year = now.getUTCFullYear();
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 1));

    return this.prisma.$transaction(
      async (transaction) => {
        const [
          totalRegisteredUsers,
          totals,
          currentMonth,
          categories,
          grouped,
          recentExpenses,
          recentUsers,
        ] = await Promise.all([
          transaction.user.count(),
          transaction.expense.aggregate({
            _count: { _all: true },
            _sum: { amount: true },
          }),
          transaction.expense.aggregate({
            where: { date: { gte: start, lt: end } },
            _count: { _all: true },
            _sum: { amount: true },
          }),
          transaction.category.findMany({ orderBy: { name: 'asc' } }),
          transaction.expense.groupBy({
            by: ['categoryId'],
            _count: { _all: true },
            _sum: { amount: true },
          }),
          transaction.expense.findMany({
            take: 5,
            orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
            include: {
              category: true,
              user: { select: { id: true, email: true } },
            },
          }),
          transaction.user.findMany({
            take: 5,
            orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
            select: { id: true, email: true, role: true, createdAt: true },
          }),
        ]);
        const spending = new Map(
          grouped.map((group) => [group.categoryId, group]),
        );
        const perCategory = categories.map((category) => {
          const group = spending.get(category.id);
          return {
            categoryId: category.id,
            name: category.name,
            totalExpenses: group?._count._all ?? 0,
            amount: group?._sum.amount ?? new Prisma.Decimal(0),
          };
        });
        const serialize = (category: (typeof perCategory)[number]) => ({
          categoryId: category.categoryId,
          name: category.name,
          totalExpenses: category.totalExpenses,
          totalValue: category.amount.toFixed(2),
        });
        const ascending = [...perCategory].sort(
          (left, right) =>
            left.amount.comparedTo(right.amount) ||
            left.name.localeCompare(right.name),
        );
        const descending = [...perCategory].sort(
          (left, right) =>
            right.amount.comparedTo(left.amount) ||
            left.name.localeCompare(right.name),
        );
        return {
          totalRegisteredUsers,
          totalExpensesRecorded: totals._count._all,
          totalValueOfExpenses: (
            totals._sum.amount ?? new Prisma.Decimal(0)
          ).toFixed(2),
          currentMonth: {
            month,
            year,
            totalExpenses: currentMonth._count._all,
            totalValue: (
              currentMonth._sum.amount ?? new Prisma.Decimal(0)
            ).toFixed(2),
          },
          spendingPerCategory: perCategory.map(serialize),
          top5Categories: descending.slice(0, 5).map(serialize),
          bottom5Categories: ascending.slice(0, 5).map(serialize),
          recentExpenses,
          recentUsers,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
