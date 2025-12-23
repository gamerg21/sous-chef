// Prisma config for runtime
// Load environment variables from .env file if available
require("dotenv/config");

module.exports = {
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
};

