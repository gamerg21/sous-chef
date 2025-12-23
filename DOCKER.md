# Docker Deployment Guide

This guide explains how to deploy Sous Chef using Docker and Docker Compose for self-hosting.

## For End Users

If you're an end user who just wants to run Sous Chef, see [DEPLOYMENT.md](./DEPLOYMENT.md) for instructions on using pre-built Docker images. You don't need to build from source!

## For Developers

This guide covers building from source. For production deployments, we recommend using the pre-built images (see [DEPLOYMENT.md](./DEPLOYMENT.md)).

## Prerequisites

- Docker Engine 20.10+ 
- Docker Compose 2.0+
- At least 2GB of available RAM
- At least 10GB of available disk space

## Quick Start

### 1. Clone the Repository

```bash
git clone <repository-url>
cd sous-chef
```

### 2. Configure Environment Variables

Create a `.env` file in the root directory:

```bash
cp env.example .env
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

**Important Security Notes:**
- Change `POSTGRES_PASSWORD` to a strong password
- Generate a secure `NEXTAUTH_SECRET` using: `openssl rand -base64 32`
- Update `NEXTAUTH_URL` to your actual domain if deploying publicly

### Running Docker Compose without interfering with CLI local dev

If you're also doing local development via Supabase CLI + `pnpm dev`, use a separate docker env file (different ports) so both can run off the same codebase:

```bash
cp env.docker.example .env.docker
docker compose --env-file .env.docker -p souschef_docker up -d --build
```

### 3. Build and Start Services

```bash
# Build and start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Check service status
docker-compose ps
```

The application will be available at `http://localhost:3000` (or your configured port).

### 4.5. Enable HTTPS (Optional)

Safari on iPhones requires HTTPS for barcode scanning. You can enable HTTPS in two ways:

#### Option A: Auto-generated Self-signed Certificates (Easiest)

1. **Set `ENABLE_HTTPS=true` in your `.env` file:**
   ```env
   ENABLE_HTTPS=true
   NEXTAUTH_URL=https://localhost:3000
   ```

2. **Restart containers:**
   ```bash
   docker-compose up -d
   ```

The app will automatically generate self-signed certificates on first startup. Browsers will show a security warning, but you can proceed and Safari barcode scanning will work.

#### Option B: Custom Certificates

1. **Generate or obtain your SSL certificates** and place them in a `certs` directory:
   ```bash
   mkdir -p certs
   # Copy your cert.pem and key.pem files here
   # Or use the provided script:
   ./scripts/generate-self-signed-cert.sh
   ```

2. **Enable HTTPS in `.env`:**
   ```env
   ENABLE_HTTPS=true
   SSL_CERT_PATH=/app/certs/cert.pem
   SSL_KEY_PATH=/app/certs/key.pem
   NEXTAUTH_URL=https://yourdomain.com
   ```

3. **The certificates will be automatically mounted** via the volume in `docker-compose.yml`

**Note:** For production with proper SSL certificates, consider using a reverse proxy (nginx, Traefik, Caddy) with `ENABLE_HTTPS=false` and let the proxy handle SSL termination.

### 4. Run Database Migrations

Migrations run automatically on container startup. If you need to run them manually:

```bash
docker-compose exec app npx prisma migrate deploy
```

### 5. Create Your First Admin User

```bash
# Set a password for a user (creates user if doesn't exist)
docker-compose exec app npm run set-password -- <email> <password>

# Then make them an admin in the database
docker-compose exec postgres psql -U postgres -d souschef -c "UPDATE \"User\" SET \"isAppAdmin\" = true WHERE email = '<email>';"
```

## Production Deployment

### Using a Reverse Proxy

For production, use a reverse proxy (nginx, Traefik, Caddy) in front of the application. This is the recommended approach for production deployments.

**Important:** When using a reverse proxy, keep `ENABLE_HTTPS=false` in your `.env` file and let the proxy handle SSL termination.

#### Example nginx configuration with SSL:

```nginx
server {
    listen 80;
    server_name souschef.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name souschef.yourdomain.com;

    # SSL certificates (use Let's Encrypt for production)
    ssl_certificate /etc/letsencrypt/live/souschef.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/souschef.yourdomain.com/privkey.pem;
    
    # SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

#### Update NEXTAUTH_URL

In your `.env` file, set:

```env
ENABLE_HTTPS=false  # Let nginx handle SSL
NEXTAUTH_URL=https://souschef.yourdomain.com
```

### Using External PostgreSQL

If you want to use an external PostgreSQL database instead of the Docker container:

1. Remove or comment out the `postgres` service in `docker-compose.yml`
2. Update `DATABASE_URL` in `.env` to point to your external database
3. Ensure your database is accessible from the Docker network

Example `DATABASE_URL`:
```env
DATABASE_URL=postgresql://user:password@your-db-host:5432/souschef?schema=public
```

### SSL/TLS with Let's Encrypt

Use a reverse proxy like Caddy or Traefik that handles SSL automatically, or use certbot with nginx.

## Maintenance

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f app
docker-compose logs -f postgres
```

### Backup Database

```bash
# Create backup
docker-compose exec postgres pg_dump -U postgres souschef > backup_$(date +%Y%m%d_%H%M%S).sql

# Restore backup
docker-compose exec -T postgres psql -U postgres souschef < backup_20240101_120000.sql
```

### Update Application

#### Building from Source (Development)

```bash
# Pull latest changes
git pull

# Rebuild and restart
docker-compose up -d --build

# Run migrations if needed
docker-compose exec app npx prisma migrate deploy
```

#### Using Pre-built Images (Production)

If you're using `docker-compose.prod.yml` with published images:

```bash
# Pull latest image
docker-compose -f docker-compose.prod.yml pull

# Restart with new image (migrations run automatically)
docker-compose -f docker-compose.prod.yml up -d
```

## Building and Publishing Docker Images

### Automated Builds with GitHub Actions

The repository includes a GitHub Actions workflow (`.github/workflows/docker-build.yml`) that automatically builds and publishes Docker images when you create a version tag.

#### Setup

1. **Create a Docker Hub account** (or use GitHub Container Registry)
   - Go to https://hub.docker.com and create an account
   - Or use GitHub Container Registry (ghcr.io) - no separate account needed

2. **Add GitHub Secrets:**
   - Go to your GitHub repo → Settings → Secrets and variables → Actions
   - Add `DOCKER_USERNAME` (your Docker Hub username)
   - Add `DOCKER_PASSWORD` (your Docker Hub access token, not your password)
     - Create access token: https://hub.docker.com/settings/security

3. **Update the workflow file** (`.github/workflows/docker-build.yml`):
   - Replace `yourusername` in the `IMAGE_NAME` environment variable
   - If using GitHub Container Registry, uncomment the GitHub Container Registry login step and comment out Docker Hub login

4. **Create a version tag** to trigger the build:
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```

The workflow will automatically:
- Build the Docker image
- Tag it with the version (e.g., `v1.0.0`, `v1.0`, `v1`, `latest`)
- Push it to the container registry

#### Manual Build and Push

You can also build and push manually:

```bash
# Build the image
docker build -t yourusername/sous-chef:latest .

# Login to Docker Hub
docker login

# Push the image
docker push yourusername/sous-chef:latest

# Tag and push a specific version
docker tag yourusername/sous-chef:latest yourusername/sous-chef:v1.0.0
docker push yourusername/sous-chef:v1.0.0
```

### Versioning Strategy

- `latest` - Always points to the most recent release
- `v1.0.0` - Specific version tags (semantic versioning)
- `v1.0` - Major.minor version (for minor updates)
- `v1` - Major version (for major updates)

Users can pin to specific versions in `docker-compose.prod.yml`:

```yaml
app:
  image: yourusername/sous-chef:v1.0.0  # Use specific version
```

### Stop Services

```bash
# Stop services (keeps data)
docker-compose stop

# Stop and remove containers (keeps volumes/data)
docker-compose down

# Stop and remove everything including volumes (⚠️ deletes data)
docker-compose down -v
```

## Troubleshooting

### Database Connection Issues

1. Check if PostgreSQL is healthy:
   ```bash
   docker-compose ps postgres
   ```

2. Check database logs:
   ```bash
   docker-compose logs postgres
   ```

3. Verify DATABASE_URL matches your configuration

### Application Won't Start

1. Check application logs:
   ```bash
   docker-compose logs app
   ```

2. Verify all required environment variables are set:
   ```bash
   docker-compose exec app env | grep -E 'DATABASE_URL|NEXTAUTH'
   ```

3. Ensure migrations have run:
   ```bash
   docker-compose exec app npx prisma migrate status
   ```

### Port Already in Use

If port 3000 is already in use, change `APP_PORT` in `.env`:

```env
APP_PORT=3001
```

Then update your reverse proxy configuration accordingly.

### Permission Issues

If you encounter permission issues with volumes:

```bash
# Fix PostgreSQL data directory permissions
sudo chown -R 999:999 ./postgres_data
```

## Environment Variables Reference

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `POSTGRES_USER` | Yes | PostgreSQL username | `postgres` |
| `POSTGRES_PASSWORD` | Yes | PostgreSQL password | `postgres` |
| `POSTGRES_DB` | Yes | Database name | `souschef` |
| `POSTGRES_PORT` | No | PostgreSQL port (host) | `5432` |
| `DATABASE_URL` | Yes | Full database connection string | - |
| `NEXTAUTH_SECRET` | Yes | Secret for NextAuth.js | - |
| `NEXTAUTH_URL` | Yes | Public URL of your application | `http://localhost:3000` |
| `APP_PORT` | No | Application port (host) | `3000` |
| `ENABLE_HTTPS` | No | Enable HTTPS mode (auto-generates self-signed certs if not provided) | `false` |
| `SSL_CERT_PATH` | No | Path to SSL certificate file | `/app/certs/cert.pem` |
| `SSL_KEY_PATH` | No | Path to SSL private key file | `/app/certs/key.pem` |
| `HOSTNAME` | No | Hostname to bind to | `0.0.0.0` |
| `SMTP_HOST` | No | SMTP server hostname | - |
| `SMTP_PORT` | No | SMTP server port | `587` |
| `SMTP_USER` | No | SMTP username | - |
| `SMTP_PASSWORD` | No | SMTP password | - |
| `SMTP_FROM` | No | Email sender address | `noreply@souschef.local` |

## Support

For issues and questions:
- Check the [main README](./README.md)
- Review application logs: `docker-compose logs -f`
- Open an issue on GitHub

