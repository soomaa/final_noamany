import { BadRequestException } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { ListCategoriesDto } from './dto/inventory.dto';

describe('CategoriesService archive workflow', () => {
  it('lists inactive and legacy soft-deleted categories in the archive', async () => {
    const prisma = {
      inv_categories: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 7,
            name_ar: 'مشروبات قديمة',
            name_en: 'Old drinks',
            description: null,
            parent_category_id: null,
            is_active: true,
            is_deleted: true,
            parent: null,
            created_at: new Date(),
            updated_at: new Date(),
          },
        ]),
        count: jest.fn().mockResolvedValue(1),
      },
    };
    const service = new CategoriesService(prisma as never);
    const query = Object.assign(new ListCategoriesDto(), {
      page: 1,
      pageSize: 25,
      status: 'inactive' as const,
    });

    const result = await service.list(query);

    expect(result.data[0]).toEqual(expect.objectContaining({ id: 7, isActive: false }));
    expect(prisma.inv_categories.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        AND: [
          {
            OR: [
              { is_deleted: true },
              { is_deleted: false, is_active: false },
            ],
          },
        ],
      },
    }));
  });

  it('restores a legacy archived category when activated', async () => {
    const prisma = {
      inv_categories: {
        findUnique: jest.fn().mockResolvedValue({ id: 7 }),
        update: jest.fn().mockResolvedValue({
          id: 7,
          name_ar: 'مشروبات',
          name_en: 'Drinks',
          description: null,
          parent_category_id: null,
          is_active: true,
          is_deleted: false,
          parent: null,
          created_at: new Date(),
          updated_at: new Date(),
        }),
      },
    };
    const service = new CategoriesService(prisma as never);

    const result = await service.updateStatus(7, true);

    expect(prisma.inv_categories.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 7 },
      data: { is_active: true, is_deleted: false },
    }));
    expect(result.isActive).toBe(true);
  });

  it('blocks permanent deletion while a category is in use', async () => {
    const prisma = {
      inv_categories: {
        findUnique: jest.fn().mockResolvedValue({
          id: 7,
          is_active: false,
          is_deleted: false,
          _count: { children: 0, products: 0, cafe_products: 1 },
        }),
        delete: jest.fn(),
      },
    };
    const service = new CategoriesService(prisma as never);

    await expect(service.remove(7)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.inv_categories.delete).not.toHaveBeenCalled();
  });

  it('saves the provided category order', async () => {
    const update = jest.fn().mockResolvedValue({});
    const prisma = {
      inv_categories: {
        findMany: jest.fn().mockResolvedValue([{ id: 7 }, { id: 12 }]),
        update,
      },
      $transaction: jest.fn().mockImplementation((operations) => Promise.all(operations)),
    };
    const service = new CategoriesService(prisma as never);

    await expect(service.updateOrder([12, 7])).resolves.toEqual({ success: true });
    expect(update).toHaveBeenNthCalledWith(1, { where: { id: 12 }, data: { sort_order: 0 } });
    expect(update).toHaveBeenNthCalledWith(2, { where: { id: 7 }, data: { sort_order: 1 } });
  });
});
