type InMemoryPayment = {
  id: string;
  mercadoPagoPaymentId: string;
  amount: number;
  currency: string;
  status: string;
  statusDetail: string | null;
  paymentMethod: string | null;
  payerName: string | null;
  payerEmail: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type CreatedPaymentInput = Omit<InMemoryPayment, 'id' | 'createdAt' | 'updatedAt'>;

export function createInMemoryPrisma() {
  const records = new Map<string, InMemoryPayment>();
  let counter = 0;

  const payment = {
    async upsert(args: {
      where: { mercadoPagoPaymentId: string };
      update: Partial<CreatedPaymentInput>;
      create: CreatedPaymentInput;
    }): Promise<InMemoryPayment> {
      const now = new Date();
      const existing = records.get(args.where.mercadoPagoPaymentId);
      if (existing) {
        const updated: InMemoryPayment = {
          ...existing,
          ...args.update,
          updatedAt: now,
        };
        records.set(updated.mercadoPagoPaymentId, updated);
        return updated;
      }
      const created: InMemoryPayment = {
        id: `test_payment_${++counter}`,
        mercadoPagoPaymentId: args.where.mercadoPagoPaymentId,
        amount: args.create.amount,
        currency: args.create.currency,
        status: args.create.status,
        statusDetail: args.create.statusDetail ?? null,
        paymentMethod: args.create.paymentMethod ?? null,
        payerName: args.create.payerName ?? null,
        payerEmail: args.create.payerEmail ?? null,
        createdAt: now,
        updatedAt: now,
      };
      records.set(created.mercadoPagoPaymentId, created);
      return created;
    },

    async findUnique(args: {
      where: { mercadoPagoPaymentId: string };
    }): Promise<InMemoryPayment | null> {
      return records.get(args.where.mercadoPagoPaymentId) ?? null;
    },

    async findMany(args: {
      where?: { status?: string; createdAt?: { gte?: Date; lte?: Date } };
      orderBy?: { createdAt?: 'asc' | 'desc' };
      take?: number;
      select?: { amount?: boolean; createdAt?: boolean };
    }): Promise<Array<Partial<InMemoryPayment>>> {
      let rows = [...records.values()];

      const status = args.where?.status;
      if (status) {
        rows = rows.filter((r) => r.status === status);
      }

      const gte = args.where?.createdAt?.gte;
      if (gte) {
        rows = rows.filter((r) => r.createdAt >= gte);
      }

      const lte = args.where?.createdAt?.lte;
      if (lte) {
        rows = rows.filter((r) => r.createdAt <= lte);
      }

      const dir = args.orderBy?.createdAt === 'asc' ? 1 : -1;
      rows.sort((a, b) => {
        if (a.createdAt > b.createdAt) return dir;
        if (a.createdAt < b.createdAt) return -dir;
        return 0;
      });

      if (args.take !== undefined) {
        rows = rows.slice(0, args.take);
      }

      if (args.select) {
        return rows.map((r) => {
          const selected: Partial<InMemoryPayment> = {};
          if (args.select?.amount) selected.amount = r.amount;
          if (args.select?.createdAt) selected.createdAt = r.createdAt;
          return selected;
        });
      }

      return rows;
    },
  };

  return {
    payment,
    __reset: (): void => {
      records.clear();
      counter = 0;
    },
    __count: (): number => records.size,
  };
}