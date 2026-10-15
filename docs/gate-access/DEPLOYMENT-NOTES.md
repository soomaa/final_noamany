# ONE80 Gate Access deployment notes

Deploy the backend + built frontend together before commissioning the Windows
agent. The standard safe deploy path already performs the required steps:

1. Back up the production database.
2. `npx prisma migrate deploy`
3. `npm run db:seed:rbac`
4. Build/restart the NestJS application.

The additive migration is:

`prisma/migrations/20260729090000_c3_gate_access/migration.sql`

After deploy, a super-admin opens `/club/gate-access`, creates the C3-200
controller, and copies the one-time Agent Token into the secure installer values
file. Do not create the token until the operator is ready to transmit it
privately to the on-site installer.

The agent endpoint is outbound HTTPS only:

`https://one80.alatheertech.com/api/gate-agent/<controllerId>/...`

Never expose the controller itself to the public Internet.
