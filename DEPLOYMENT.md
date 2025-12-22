# Deployment Guide for End Users

This guide explains how to deploy Sous Chef using pre-built Docker images. You don't need to build from source code - just pull the latest image and run it!

## Prerequisites

- Docker Engine 20.10+ 
- Docker Compose 2.0+
- At least 2GB of available RAM
- At least 10GB of available disk space

## Quick Start

### 1. Download Deployment Files

You only need these files:
- `docker-compose.prod.yml`
- `.env.example` (or create your own `.env` file)

You can download them from the repository or copy them to your deployment directory.

### 2. Configure Environment Variables

Create a `.env` file:

```bash
cp .env.example .env
```

Edit `.env` and set the following required variables:

```env
# Database Configuration
POSTGRES_USER=postgres
POSTGRES_PASSWORD=change-this-strong-password
POSTGRES_DB=souschef
POSTGRES_PORT=5432

# Database URL (for Docker Compose)
DATABASE_URL=postgresql://postgres:change-this-strong-password@postgres:5432/souschef?schema=public

# NextAuth Configuration
# Generate a secret with: openssl rand -base64 32
NEXTAUTH_SECRET=your-generated-secret-here
NEXTAUTH_URL=http://localhost:3000

# Application Port
APP_PORT=3000

# SMTP Configuration (Optional - for email authentication)
# Leave empty if you don't want email authentication
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=noreply@souschef.local
```

**Important:** 
- Replace `change-this-strong-password` with a strong password
- Generate a secure `NEXTAUTH_SECRET` using: `openssl rand -base64 32`
- Update `NEXTAUTH_URL` with your actual domain if deploying publicly

### 3. Update Docker Image Name

Edit `docker-compose.prod.yml` and replace `yourusername` with the actual Docker Hub username or GitHub Container Registry path:

```yaml
app:
  image: yourusername/sous-chef:latest
```

For example:
- Docker Hub: `myusername/sous-chef:latest`
- GitHub Container Registry: `ghcr.io/myusername/sous-chef:latest`

### 4. Start the Application

```bash
docker-compose -f docker-compose.prod.yml up -d
```

This will:
1. Pull the latest Docker images
2. Start the PostgreSQL database
3. Start the Sous Chef application
4. Automatically run database migrations

### 5. Verify Installation

Check that containers are running:

```bash
docker-compose -f docker-compose.prod.yml ps
```

View logs:

```bash
docker-compose -f docker-compose.prod.yml logs -f app
```

Access the application at `http://localhost:3000` (or your configured port).

## Updating to Latest Version

To update to the latest version:

```bash
# Pull the latest image
docker-compose -f docker-compose.prod.yml pull

# Restart with new image (database migrations run automatically)
docker-compose -f docker-compose.prod.yml up -d
```

The database will be automatically migrated on startup if there are new migrations.

## Using a Specific Version

To use a specific version instead of `latest`, edit `docker-compose.prod.yml`:

```yaml
app:
  image: yourusername/sous-chef:v1.0.0  # Use specific version
```

Then restart:

```bash
docker-compose -f docker-compose.prod.yml pull
docker-compose -f docker-compose.prod.yml up -d
```

## Stopping the Application

```bash
docker-compose -f docker-compose.prod.yml down
```

To also remove volumes (⚠️ **WARNING: This deletes all data**):

```bash
docker-compose -f docker-compose.prod.yml down -v
```

## Backup and Restore

### Backup Database

```bash
docker-compose -f docker-compose.prod.yml exec postgres pg_dump -U postgres souschef > backup.sql
```

### Restore Database

```bash
docker-compose -f docker-compose.prod.yml exec -T postgres psql -U postgres souschef < backup.sql
```

## Troubleshooting

### Container won't start

Check logs:
```bash
docker-compose -f docker-compose.prod.yml logs app
```

### Database connection errors

1. Verify `DATABASE_URL` in `.env` matches your PostgreSQL credentials
2. Ensure the database container is healthy:
   ```bash
   docker-compose -f docker-compose.prod.yml ps postgres
   ```

### Migration errors

If migrations fail, you may need to reset the database (⚠️ **WARNING: This deletes all data**):

```bash
docker-compose -f docker-compose.prod.yml down -v
docker-compose -f docker-compose.prod.yml up -d
```

### Port already in use

Change the port in `.env`:
```env
APP_PORT=3001
POSTGRES_PORT=5433
```

Then update `DATABASE_URL` accordingly and restart.

## Production Deployment Tips

1. **Use a reverse proxy** (nginx, Traefik, Caddy) for HTTPS
2. **Set strong passwords** for database and NextAuth secret
3. **Configure SMTP** for email authentication
4. **Use environment-specific tags** (e.g., `v1.0.0` instead of `latest`)
5. **Set up regular backups** of your database
6. **Monitor logs** for errors and performance issues

## Support

For issues and questions, please check the main repository or open an issue.


