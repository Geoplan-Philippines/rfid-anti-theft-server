import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

// Default bootstrap superadmin. Change the password via the running app
// (or delete the row and re-seed) immediately after first login. Do NOT
// deploy with these defaults in place.
const ADMIN_EMAIL = 'admin@geoplan.ph';
const ADMIN_PASSWORD = 'admin123';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('Missing DATABASE_URL in environment.');
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg(new Pool({ connectionString: DATABASE_URL })),
});

async function main() {
  const email = ADMIN_EMAIL.trim().toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Superadmin already exists: ${existing.email} (id=${existing.id}). Skipping.`);
    return;
  }

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);

  const created = await prisma.user.create({
    data: {
      email,
      password: passwordHash,
      role: 'SUPER_ADMIN',
    },
    select: { id: true, email: true, role: true, createdAt: true },
  });

  console.log(`Superadmin created: ${created.email} (id=${created.id}, role=${created.role})`);
  console.log(`Default password: ${ADMIN_PASSWORD} — change it after first login.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
