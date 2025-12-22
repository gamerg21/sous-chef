# Local Development Setup

## Important: Database Configuration

When running locally (not in Docker), you need to update your `.env` file to use `localhost` instead of the Docker hostname `postgres`.

### For Local Development (Outside Docker)

Your `.env` file should have:

```env
# Use localhost instead of 'postgres' hostname
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/souschef?schema=public

# Make sure NEXTAUTH_URL matches your actual port
NEXTAUTH_URL=http://localhost:3000
# Or if you're running on a different port:
# NEXTAUTH_URL=http://localhost:3001
```

### For Docker Development

If you're using Docker Compose, use:

```env
# Use 'postgres' hostname (Docker service name)
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/souschef?schema=public

NEXTAUTH_URL=http://localhost:3000
```

## Port Configuration

If your app is running on a different port (e.g., 3001), make sure `NEXTAUTH_URL` matches:

```env
NEXTAUTH_URL=http://localhost:3001
```

## Common Issues

### 500 Error from `/api/auth/session`

If you see a 500 error with "Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON":

1. **Check your DATABASE_URL**: Make sure it's correct for your environment (localhost for local, postgres for Docker)
2. **Check your NEXTAUTH_URL**: Must match the port your app is actually running on
3. **Check if database is running**: Ensure PostgreSQL is accessible at the configured URL
4. **Check terminal output**: Look for actual error messages in the `next dev` output

### Database Connection Issues

If Prisma can't connect to the database:

1. **Local development**: Make sure PostgreSQL is running locally and accessible at `localhost:5432`
2. **Docker**: Make sure Docker Compose services are running (`docker-compose up`)
3. **Check connection string**: Verify username, password, host, port, and database name are correct

## Quick Fix Checklist

- [ ] `.env` file exists and has correct `DATABASE_URL` for your environment
- [ ] `NEXTAUTH_URL` matches the port your app is running on
- [ ] Database is running and accessible
- [ ] Prisma client is generated (`npx prisma generate`)
- [ ] Migrations are run (`npx prisma migrate dev`)

