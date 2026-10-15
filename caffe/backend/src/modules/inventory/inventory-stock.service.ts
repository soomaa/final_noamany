import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  InventoryTxnType,
  MovementDirection,
  Prisma,
  inv_stock_balances,
  inv_transactions,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { toDecimal, toNumber } from './inventory.utils';

export type StockOperation = 'add' | 'subtract' | 'set';

export interface ApplyMovementDto {
  productId: number;
  warehouseId: number;
  direction: MovementDirection;
  quantity: Prisma.Decimal | number;
  txnType: InventoryTxnType;
  unitCost?: Prisma.Decimal | number;
  docType: string;
  docRef?: string;
  branchId?: number;
  createdBy?: number;
  allowNegative?: boolean;
  transactionId?: number;
  /** When set, quantity is treated as absolute target stock (count/adjustment). */
  operation?: StockOperation;
}

export interface ApplyTransactionLineDto {
  productId: number;
  quantity: Prisma.Decimal | number;
  unitCost?: Prisma.Decimal | number;
  itemName?: string;
  itemCode?: string;
  unit?: string;
  price?: Prisma.Decimal | number;
  notes?: string;
}

export interface ApplyTransactionDto {
  transactionId: number;
  txnType: InventoryTxnType;
  branchId: number;
  sourceWarehouseId?: number | null;
  targetWarehouseId?: number | null;
  lines: ApplyTransactionLineDto[];
  docRef?: string;
  createdBy?: number;
  allowNegative?: boolean;
}

@Injectable()
export class InventoryStockService {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: Prisma.TransactionClient) {
    return tx ?? this.prisma;
  }

  async applyMovement(dto: ApplyMovementDto, tx?: Prisma.TransactionClient): Promise<inv_stock_balances> {
    // Always run inside a transaction: the atomic stock change, the movement ledger row and the
    // branch sync must commit together, and a negative-stock rejection must roll the change back.
    if (!tx) {
      return this.prisma.$transaction((t) => this.applyMovement(dto, t));
    }
    const db = this.client(tx);
    const qty = toDecimal(dto.quantity);
    const absQty = Math.abs(toNumber(qty));
    if (dto.operation !== 'set' && absQty <= 0) {
      throw new BadRequestException('كمية حركة المخزون يجب أن تكون أكبر من صفر');
    }

    // Ensure the balance row exists (upsert closes the concurrent create-vs-create race).
    const productThreshold = await db.inv_products.findUnique({
      where: { id: dto.productId },
      select: { min_stock: true, max_stock: true, reorder_point: true },
    });
    if (!productThreshold) throw new NotFoundException('المنتج غير موجود');

    const balance = await db.inv_stock_balances.upsert({
      where: {
        product_id_warehouse_id: {
          product_id: dto.productId,
          warehouse_id: dto.warehouseId,
        },
      },
      create: {
        product_id: dto.productId,
        warehouse_id: dto.warehouseId,
        current_stock: new Prisma.Decimal(0),
        min_stock: productThreshold.min_stock,
        reorder_point: productThreshold.reorder_point,
        max_stock: productThreshold.max_stock,
      },
      update: {},
    });

    let newStock: number;
    let signedQty: number;
    let direction = dto.direction;
    let updated: inv_stock_balances;

    if (dto.operation === 'set') {
      // Absolute set: last-write-wins by design (no delta race to lose).
      const target = toNumber(qty);
      if (target < 0 && !dto.allowNegative) {
        throw new BadRequestException('لا يمكن تعيين رصيد سالب للمخزون');
      }
      signedQty = target - toNumber(balance.current_stock);
      newStock = target;
      direction = signedQty >= 0 ? MovementDirection.in : MovementDirection.out;
      updated = await db.inv_stock_balances.update({
        where: { id: balance.id },
        data: { current_stock: new Prisma.Decimal(newStock) },
      });
    } else {
      signedQty = dto.direction === MovementDirection.in ? absQty : -absQty;
      // Atomic DB-level increment/decrement — no read-compute-write, so no lost update.
      updated = await db.inv_stock_balances.update({
        where: { id: balance.id },
        data: { current_stock: { increment: signedQty } },
      });
      newStock = toNumber(updated.current_stock);
      if (newStock < 0 && !dto.allowNegative) {
        // Rolls back the increment above (we are guaranteed to be inside a transaction).
        throw new BadRequestException('الكمية غير كافية بالمخزون');
      }
    }

    await db.inv_movements.create({
      data: {
        txn_type: dto.txnType,
        direction,
        product_id: dto.productId,
        warehouse_id: dto.warehouseId,
        quantity: new Prisma.Decimal(signedQty),
        unit_cost: dto.unitCost != null ? toDecimal(dto.unitCost) : new Prisma.Decimal(0),
        balance_after: new Prisma.Decimal(newStock),
        doc_type: dto.docType,
        doc_ref: dto.docRef ?? null,
        transaction_id: dto.transactionId ?? null,
        branch_id: dto.branchId ?? null,
        created_by: dto.createdBy ?? null,
      },
    });

    if (dto.branchId != null) {
      await this.syncProductBranch(
        db,
        dto.productId,
        dto.branchId,
        signedQty,
        dto.operation === 'set' ? newStock : undefined,
        dto.allowNegative === true,
      );
    }

    return updated;
  }

  private async syncProductBranch(
    db: Prisma.TransactionClient | PrismaService,
    productId: number,
    branchId: number,
    delta: number,
    absolute?: number,
    allowNegative = false,
  ) {
    if (absolute != null) {
      // Branch mirror on 'set' assumes single-warehouse branches (absolute overwrite, last-write-wins).
      await db.inv_product_branches.upsert({
        where: { product_id_branch_id: { product_id: productId, branch_id: branchId } },
        create: {
          product_id: productId,
          branch_id: branchId,
          stock_quantity: new Prisma.Decimal(absolute),
        },
        update: { stock_quantity: new Prisma.Decimal(absolute) },
      });
      return;
    }
    // Atomic DB-level increment — no read-compute-write, so concurrent movements don't lose updates.
    await db.inv_product_branches.upsert({
      where: { product_id_branch_id: { product_id: productId, branch_id: branchId } },
      create: {
        product_id: productId,
        branch_id: branchId,
        stock_quantity: new Prisma.Decimal(allowNegative ? delta : Math.max(0, delta)),
      },
      update: { stock_quantity: { increment: delta } },
    });
  }

  async applyTransaction(dto: ApplyTransactionDto, tx?: Prisma.TransactionClient): Promise<inv_transactions> {
    if (tx) return this.applyTransactionInternal(dto, tx);
    return this.prisma.$transaction((inner) => this.applyTransactionInternal(dto, inner));
  }

  private async applyTransactionInternal(
    dto: ApplyTransactionDto,
    tx: Prisma.TransactionClient,
  ): Promise<inv_transactions> {
    const txn = await tx.inv_transactions.findFirst({
      where: { id: dto.transactionId, is_deleted: false },
      include: { items: true },
    });
    if (!txn) throw new NotFoundException('الحركة المخزنية غير موجودة');

    const lines = dto.lines.length
      ? dto.lines
      : txn.items
          .filter((i) => i.product_id != null)
          .map((i) => ({
            productId: i.product_id!,
            quantity: i.quantity,
            unitCost: i.price,
            itemName: i.item_name,
            itemCode: i.item_code ?? undefined,
            unit: i.unit ?? undefined,
            price: i.price,
            notes: i.notes ?? undefined,
          }));

    for (const line of lines) {
      if (!line.productId) {
        throw new BadRequestException('معرف المنتج مطلوب لكل بند');
      }
      await this.dispatchLine(tx, dto, line);
    }

    return txn;
  }

  private async dispatchLine(
    tx: Prisma.TransactionClient,
    dto: ApplyTransactionDto,
    line: ApplyTransactionLineDto,
  ) {
    const base = {
      productId: line.productId,
      txnType: dto.txnType,
      docType: 'inventory_transaction',
      docRef: dto.docRef ?? String(dto.transactionId),
      branchId: dto.branchId,
      createdBy: dto.createdBy,
      allowNegative: dto.allowNegative,
      transactionId: dto.transactionId,
      unitCost: line.unitCost ?? line.price ?? 0,
      quantity: line.quantity,
    };

    switch (dto.txnType) {
      case InventoryTxnType.receipt:
        await this.applyMovement(
          {
            ...base,
            warehouseId: dto.targetWarehouseId ?? dto.sourceWarehouseId!,
            direction: MovementDirection.in,
          },
          tx,
        );
        break;

      // Purchase return = goods go back to the supplier → stock OUT.
      case InventoryTxnType.purchase_return:
        await this.applyMovement(
          {
            ...base,
            warehouseId: dto.sourceWarehouseId ?? dto.targetWarehouseId!,
            direction: MovementDirection.out,
          },
          tx,
        );
        break;

      case InventoryTxnType.issue:
      case InventoryTxnType.damage:
        await this.applyMovement(
          {
            ...base,
            warehouseId: dto.sourceWarehouseId ?? dto.targetWarehouseId!,
            direction: MovementDirection.out,
          },
          tx,
        );
        break;

      // Sales return = customer brings goods back → stock IN.
      case InventoryTxnType.sales_return:
        await this.applyMovement(
          {
            ...base,
            warehouseId: dto.targetWarehouseId ?? dto.sourceWarehouseId!,
            direction: MovementDirection.in,
          },
          tx,
        );
        break;

      case InventoryTxnType.count:
      case InventoryTxnType.adjustment:
        await this.applyMovement(
          {
            ...base,
            warehouseId: dto.sourceWarehouseId ?? dto.targetWarehouseId!,
            direction: MovementDirection.in,
            operation: 'set',
          },
          tx,
        );
        break;

      case InventoryTxnType.transfer: {
        if (!dto.sourceWarehouseId || !dto.targetWarehouseId) {
          throw new BadRequestException('مستودع المصدر والهدف مطلوبان للتحويل');
        }
        if (dto.sourceWarehouseId === dto.targetWarehouseId) {
          throw new BadRequestException('لا يمكن التحويل إلى نفس المستودع');
        }
        await this.applyMovement(
          {
            ...base,
            warehouseId: dto.sourceWarehouseId,
            direction: MovementDirection.out,
          },
          tx,
        );
        await this.applyMovement(
          {
            ...base,
            warehouseId: dto.targetWarehouseId,
            direction: MovementDirection.in,
          },
          tx,
        );
        break;
      }

      default:
        throw new BadRequestException(`نوع حركة غير مدعوم: ${dto.txnType}`);
    }
  }

  async updateStockByBalanceId(
    balanceId: number,
    quantity: number,
    operation: StockOperation,
    opts: {
      txnType: InventoryTxnType;
      docType: string;
      docRef?: string;
      branchId?: number;
      createdBy?: number;
      allowNegative?: boolean;
    },
  ) {
    const balance = await this.prisma.inv_stock_balances.findUnique({ where: { id: balanceId } });
    if (!balance) throw new NotFoundException('رصيد المخزون غير موجود');

    if (operation === 'set') {
      return this.applyMovement({
        productId: balance.product_id,
        warehouseId: balance.warehouse_id,
        direction: MovementDirection.in,
        quantity,
        operation: 'set',
        txnType: opts.txnType,
        docType: opts.docType,
        docRef: opts.docRef,
        branchId: opts.branchId,
        createdBy: opts.createdBy,
        allowNegative: opts.allowNegative,
      });
    }

    return this.applyMovement({
      productId: balance.product_id,
      warehouseId: balance.warehouse_id,
      direction: operation === 'add' ? MovementDirection.in : MovementDirection.out,
      quantity,
      txnType: opts.txnType,
      docType: opts.docType,
      docRef: opts.docRef,
      branchId: opts.branchId,
      createdBy: opts.createdBy,
      allowNegative: opts.allowNegative,
    });
  }
}
