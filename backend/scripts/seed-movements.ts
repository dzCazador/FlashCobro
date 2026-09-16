import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const NAMES = [
  'María González',
  'Jorge Ramírez',
  'Lucía Fernández',
  'Carlos Pérez',
  'Ana Martínez',
  'Diego Sánchez',
  'Valentina López',
  'Martín Díaz',
  'Sofía Romero',
  'Nicolás Silva',
  'Camila Torres',
  'Facundo Ríos',
  'Agustina Vega',
  'Franco Acosta',
  'Milagros Castro',
  'Bruno Navarro',
  'Florencia Herrera',
  'Mateo Aguirre',
  'Josefina Benítez',
  'Santiago Medina',
  'Constanza Farías',
  'Ignacio Molina',
  'Paula Sosa',
  'Tomás Cabrera',
  'Rocío Campos',
  'Lautaro Roldán',
  'Bárbara Prieto',
  'Emiliano Godoy',
  'Noelia Juárez',
  'Sebastián Peralta',
];

async function main() {
  const now = new Date();
  const data = [];

  for (let i = 0; i < 30; i++) {
    const fecha = new Date(now);
    fecha.setDate(fecha.getDate() - randomBetween(1, 9));
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
      payerName: NAMES[i % NAMES.length],
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