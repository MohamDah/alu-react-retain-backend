import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  BudgetQueryDto,
  CreateBudgetDto,
  UpdateBudgetDto,
} from './budgets.dto.js';

@Injectable()
export class BudgetsService {
  constructor(private readonly prisma: PrismaService) {}

  create(userId: string, dto: CreateBudgetDto) {
    return this.prisma.budget.create({ data: { ...dto, userId } });
  }

  findAll(userId: string, query: BudgetQueryDto) {
    return this.prisma.budget.findMany({
      where: { userId, month: query.month, year: query.year },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });
  }

  async findOne(userId: string, id: string) {
    const budget = await this.prisma.budget.findUnique({
      where: { id, userId },
    });
    if (!budget) throw new NotFoundException('Budget not found');
    return budget;
  }

  update(userId: string, id: string, dto: UpdateBudgetDto) {
    return this.prisma.budget.update({ where: { id, userId }, data: dto });
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.prisma.budget.delete({ where: { id, userId } });
  }
}
