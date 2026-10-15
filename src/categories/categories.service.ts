import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateCategoryDto, UpdateCategoryDto } from './categories.dto.js';
import { UNCATEGORIZED_ID } from './default-category.js';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.category.findMany({ orderBy: { name: 'asc' } });
  }

  async findOne(id: string) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }

  create(dto: CreateCategoryDto) {
    this.checkReservedName(dto.name);
    return this.prisma.category.create({ data: dto });
  }

  update(id: string, dto: UpdateCategoryDto) {
    this.checkMutable(id);
    if (dto.name !== undefined) this.checkReservedName(dto.name);
    return this.prisma.category.update({ where: { id }, data: dto });
  }

  async remove(id: string): Promise<void> {
    this.checkMutable(id);
    await this.prisma.$transaction(async (transaction) => {
      const category = await transaction.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "Category" WHERE "id" = ${id}::uuid FOR UPDATE
      `;
      if (!category.length) throw new NotFoundException('Category not found');
      await transaction.expense.updateMany({
        where: { categoryId: id },
        data: { categoryId: UNCATEGORIZED_ID },
      });
      await transaction.category.delete({ where: { id } });
    });
  }

  private checkMutable(id: string): void {
    if (id === UNCATEGORIZED_ID)
      throw new ConflictException(
        'The Uncategorized category cannot be changed or deleted',
      );
  }

  private checkReservedName(name: string): void {
    if (name.toLowerCase() === 'uncategorized')
      throw new ConflictException('Uncategorized is a reserved category name');
  }
}
