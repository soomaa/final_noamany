const { PrismaClient } = require('@prisma/client');
const { reconcileCafeFinance } = require('../dist/modules/finance/reconcile-cafe-finance');
const db = new PrismaClient();
reconcileCafeFinance(db).then(result => console.log('ONE80 finance projections reconciled:', result)).catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.$disconnect());
