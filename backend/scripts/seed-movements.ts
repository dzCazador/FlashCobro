import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function main() {
  const now = new Date();
  const data = [];

  for (let i = 0; i < 30; i++) {
    const fecha = new Date(now);
    fecha.setDate(fecha.getDate() - randomBetween(0, 9));
    fecha.setHours(randomBetween(9, 21), randomBetween(0, 59), randomBetween(0, 59), 0);

    data.push({
      mercadoPagoPaymentId: `seed-${now.getTime()}-${i}`,
      amount: randomBetween(500, 40000),
      currency: 'ARS',
      status: 'approved',
      paymentMethod:
        randomBetween(0, 1) === 0
          ? 'Billetera (Saldo en cuenta)'
          : 'Tarjeta de crédito',
      payerName: `Comprador ${randomBetween(1, 99)}`,
      createdAt: fecha,
    });
  }

  const result = await prisma.payment.createMany({ data });
  console.log(`Creados ${result.count} movimientos aleatorios.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());