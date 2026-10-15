import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  CreateExpenseDto,
  ExpenseQueryDto,
  UpdateExpenseDto,
} from './expenses.dto.js';

@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  create(userId: string, dto: CreateExpenseDto) {
    return this.prisma.expense.create({
      data: { ...dto, date: new Date(dto.date), userId },
      include: { category: true },
    });
  }

  async findAll(userId: string, query: ExpenseQueryDto) {
    if (query.startDate && query.endDate && query.startDate > query.endDate) {
      throw new BadRequestException('startDate must not be after endDate');
    }
    if (
      query.minAmount !== undefined &&
      query.maxAmount !== undefined &&
      query.minAmount > query.maxAmount
    ) {
      throw new BadRequestException('minAmount must not exceed maxAmount');
    }
    const where: Prisma.ExpenseWhereInput = {
      userId,
      categoryId: query.categoryId,
      paymentMethod: query.paymentMethod,
      title: query.search
        ? { contains: query.search, mode: 'insensitive' }
        : undefined,
      date: {
        gte: query.startDate ? new Date(query.startDate) : undefined,
        lte: query.endDate ? new Date(query.endDate) : undefined,
      },
      amount: { gte: query.minAmount, lte: query.maxAmount },
    };
    const [items, total] = await this.prisma.$transaction(
      [
        this.prisma.expense.findMany({
          where,
          include: { category: true },
          orderBy: [{ date: 'desc' }, { id: 'asc' }],
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        }),
        this.prisma.expense.count({ where }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    return {
      items,
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.ceil(total / query.limit),
    };
  }

  async findOne(userId: string, id: string) {
    const expense = await this.prisma.expense.findUnique({
      where: { id, userId },
      include: { category: true },
    });
    if (!expense) throw new NotFoundException('Expense not found');
    return expense;
  }

  update(userId: string, id: string, dto: UpdateExpenseDto) {
    return this.prisma.expense.update({
      where: { id, userId },
      data: {
        ...dto,
        date: dto.date === undefined ? undefined : new Date(dto.date),
      },
      include: { category: true },
    });
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.prisma.expense.delete({ where: { id, userId } });
  }
}
