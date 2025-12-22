// Prisma config for runtime (doesn't require dotenv)
// DATABASE_URL is provided via environment variable in Docker
module.exports = {
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
};

