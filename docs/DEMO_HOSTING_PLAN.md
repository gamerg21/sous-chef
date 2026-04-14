# Sous Chef Demo Hosting Plan

A comprehensive guide for hosting a public demo of Sous Chef so potential users can see the application in action before running it themselves.

## Overview

Sous Chef is a Next.js 16 application with a PostgreSQL database and Supabase for file storage. This guide covers the best options for quickly deploying a demo instance with minimal configuration.

**TL;DR:** Use [Railway](#recommended-provider-railway) for the fastest setup. It handles PostgreSQL, environment variables, and automatic deployments with minimal friction.

---

## Table of Contents

1. [Recommended Provider: Railway](#recommended-provider-railway)
2. [Alternative: Render](#alternative-render)
3. [Alternative: Fly.io](#alternative-flyio)
4. [Alternative: Coolify (Self-Hosted)](#alternative-coolify-self-hosted)
5. [Demo Site Configuration](#demo-site-configuration)
6. [One-Click Deploy Button](#one-click-deploy-button)
7. [Budget Estimates](#budget-estimates)

---

## Recommended Provider: Railway

[Railway.com](https://railway.app/) is the best choice for Sous Chef because:

- **PostgreSQL addon**: One-click database setup
- **Open-source friendly**: Strong support for AGPL-3.0 projects
- **Generous free tier**: $5/month in credits during the first month (requires credit card)
- **Simple environment variables**: Auto-loaded from `.env` or Railway dashboard
- **Next.js optimized**: Auto-detects and deploys with zero configuration
- **Git-based deploys**: Automatically deploy when you push to GitHub

### Step-by-Step Setup

#### 1. Create a Railway Account and Link GitHub

1. Go to [railway.app](https://railway.app/) and sign up
2. Connect your GitHub account during signup
3. Authorize Railway to access your Sous Chef repository

#### 2. Create a New Project

1. Click **New Project** on your Railway dashboard
2. Select **Deploy from GitHub**
3. Choose your `sous-chef` repository from the list
4. Railway will automatically detect it's a Next.js app

#### 3. Add PostgreSQL Service

1. After the initial Next.js service is created, click **+ Add Service**
2. Select **PostgreSQL** from the marketplace
3. Railway will:
   - Provision a PostgreSQL 15+ database
   - Automatically set `DATABASE_URL` environment variable
   - Handle backups and SSL connections

#### 4. Configure Environment Variables

In the Railway dashboard, go to **Variables** for your project and set:

```
# NextAuth Configuration
NEXTAUTH_URL="https://your-railway-app.up.railway.app"
APP_BASE_URL="https://your-railway-app.up.railway.app"

# Generate a new secret with: openssl rand -base64 32
NEXTAUTH_SECRET="<your-generated-secret>"

# Generate another 32-byte key for encryption
APP_ENCRYPTION_KEY="<your-generated-encryption-key>"

# Email Configuration (SMTP)
# For demo: Use a service like Resend, SendGrid, or Brevo's free tier
SMTP_HOST="smtp.resend.com"
SMTP_PORT="587"
SMTP_USER="default"
SMTP_PASSWORD="<your-resend-api-key>"
SMTP_FROM="demo@sous-chef.example.com"

# Supabase Configuration (for file storage)
# Sign up at supabase.com, create a project, then get these from your dashboard
NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="<your-anon-key>"

# Optional: Open Food Facts for barcode lookup
OPEN_FOOD_FACTS_ENABLED="true"
OPEN_FOOD_FACTS_API_BASE_URL="https://world.openfoodfacts.org"
OPEN_FOOD_FACTS_USER_AGENT="SousChef-Demo/0.1 (+https://github.com/yourusername/sous-chef)"
```

**Note**: PostgreSQL's `DATABASE_URL` is automatically set by Railway and will appear in the variables list.

#### 5. Set Up Initial Data (Optional)

After deployment, you can seed demo data:

1. Run Prisma migrations:
   ```bash
   npx prisma migrate deploy
   ```

2. Create a demo user via the sign-up page, or use the `set-password` script to configure a test account:
   ```bash
   npm run set-password
   ```

   This will prompt you to create a user with a known password for testing.

#### 6. Deploy and Monitor

1. Railway automatically deploys when you push to GitHub
2. Check the **Deployments** tab to see build logs
3. Once live, your app is available at `https://your-app-name.up.railway.app`

### Estimated Monthly Costs

**Free Trial (First Month):**
- $5 in credits (covers small database and web service)
- No additional charges if you stay under limits

**After Free Trial / Production:**
- **Hobby Plan**: $5/month base + usage
  - Small Next.js app: ~$10-15/month
  - PostgreSQL: ~$5-10/month (depends on storage/connections)
  - **Total**: ~$15-25/month for low-traffic demo

- **Pro Plan**: $20/month base + usage (better for scaling)

**Saving money**: If demo traffic is minimal, stay on Hobby. Use Railway's cost estimator in the dashboard.

---

## Alternative: Render

[Render.com](https://render.com/) is a solid alternative if you prefer a different UI or have specific needs.

### Pros

- **Web service free tier**: Free static site and web service hosting
- **PostgreSQL free tier**: 1 GB storage, 256 MB RAM (expires after 30 days)
- **Simple YAML config**: `render.yaml` for infrastructure as code
- **Good documentation**: Clear guides for Next.js and PostgreSQL

### Cons

- **PostgreSQL expiration**: Free database expires after 30 days; you must upgrade to paid
- **Cold starts**: Free tier can have longer cold-start times
- **Less open-source focus**: Smaller active community around AGPL projects

### Quick Setup

1. Push `render.yaml` to your repo (see [One-Click Deploy](#one-click-deploy-button) below)
2. Go to [render.com](https://render.com/) and sign up
3. Create a new web service and link your GitHub repo
4. Render auto-reads `render.yaml` and creates all services (web + PostgreSQL)
5. Set environment variables in the Render dashboard
6. Deploy

### Estimated Monthly Costs

- **Free tier**: $0 (for first 30 days; includes $5 credits)
- **After 30 days**: ~$7/month (web service) + ~$15/month (PostgreSQL) = **~$22/month**

---

## Alternative: Fly.io

[Fly.io](https://fly.io/) offers global deployment with edge-compute benefits.

### Pros

- **Global deployment**: Apps deployed to regions near your users
- **No free tier** (as of 2026): 2-hour free trial, then pay-as-you-go
- **Generous pricing**: Shared-CPU machines are affordable (~$2/month per machine)
- **PostgreSQL support**: Via Fly Postgres or external providers

### Cons

- **Learning curve**: Different deployment model than Railway/Render (requires `fly.toml`)
- **Pay-as-you-go**: No flat monthly free credits like Railway
- **Less ideal for beginners**: Steeper onboarding for first-time users

### Quick Setup

1. Install Fly CLI: `curl -L https://fly.io/install.sh | sh`
2. Run `fly auth login` and sign up
3. Run `fly launch` in your `sous-chef` directory
4. Follow prompts to create app name and region
5. Fly will generate `fly.toml` and ask about creating PostgreSQL
6. Deploy: `fly deploy`

### Estimated Monthly Costs

- **Shared-CPU machine**: ~$2-5/month
- **PostgreSQL**: ~$15-30/month (depending on usage)
- **Total**: ~$20-35/month

**Note**: Fly.io is best if you need global edge deployment. For a simple demo, Railway is more cost-effective.

---

## Alternative: Coolify (Self-Hosted)

[Coolify](https://coolify.io/) is a fully open-source PaaS that you can self-host.

### Pros

- **100% open source**: Full control, no vendor lock-in
- **AGPL-3.0 friendly**: Perfect alignment with your project license
- **One-time cost**: Run on your own server (e.g., Hetzner, DigitalOcean)
- **All features included**: No separate tiers or upgrade walls
- **Self-hosted database**: Keep all data on your own infrastructure

### Cons

- **Server management required**: You manage the underlying VPS
- **Initial setup**: More hands-on than click-and-deploy services
- **Infrastructure costs**: Must pay for a VPS (~$5-10/month minimum)

### Quick Overview

1. Provision a small VPS (2GB RAM, 20GB disk on Hetzner or DigitalOcean)
2. Install Coolify via one-liner: `curl -sSL https://get.coollabs.io/install.sh | bash`
3. Access Coolify dashboard at `https://your-server-ip:4000`
4. Add your GitHub repository and configure:
   - Build command: `npm run build`
   - Start command: `npm start`
   - Port: `3000`
5. Create PostgreSQL service in the Coolify UI
6. Deploy

### Estimated Monthly Costs

- **VPS** (Hetzner CX11 or equivalent): ~$5-8/month
- **No software licensing**: Coolify is free
- **Total**: ~$5-8/month (lowest cost option)

### When to Choose Coolify

Choose Coolify if you:
- Want zero vendor lock-in for an AGPL-3.0 project
- Are comfortable managing a VPS
- Want the lowest long-term hosting costs
- Want full control over your data and infrastructure

---

## Demo Site Configuration

### Demo User Account

For an interactive public demo, create a default demo account:

**Option 1: Create via UI**
1. Use the app's sign-up flow to create a user: `demo@sous-chef.example.com`
2. Set a simple password: `demo-password-123`
3. Add sample data (recipes, inventory, shopping lists) through the UI

**Option 2: Use the set-password Script**
```bash
npm run set-password
```
This prompts you to set a password for an existing user. Combine with database seeding for full control.

### Read-Only vs. Reset Strategy

Choose one approach for your demo:

**Option A: Read-Only Mode (Recommended for Production Demo)**
- Users can view the demo data but cannot make changes
- Requires adding a middleware check in your API routes
- Best for preventing accidental data loss

Implementation:
```typescript
// app/api/middleware.ts or similar
const isReadOnlyDemo = process.env.DEMO_READ_ONLY === 'true';

if (isReadOnlyDemo && req.method !== 'GET') {
  return res.status(403).json({ error: 'Demo mode is read-only' });
}
```

**Option B: Reset Every 24 Hours**
- Users can interact fully with demo data
- Database resets daily to a known good state
- Requires a scheduled job/cron

Implementation (Using Vercel Crons or similar):
1. Create a backup of your "clean" database state
2. Schedule a cron job to restore from backup daily
3. Add to `vercel.json`:
   ```json
   {
     "crons": [{
       "path": "/api/cron/reset-demo",
       "schedule": "0 0 * * *"
     }]
   }
   ```

4. In `app/api/cron/reset-demo.ts`:
   ```typescript
   import { restoreDemoDatabase } from '@/lib/demo-backup';

   export async function GET(req: Request) {
     // Verify cron secret
     if (req.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
       return Response.json({ error: 'Unauthorized' }, { status: 401 });
     }

     await restoreDemoDatabase();
     return Response.json({ success: true, timestamp: new Date().toISOString() });
   }
   ```

### Disable Signup on Demo

To prevent abuse, you can disable new user registration:

```typescript
// app/api/auth/register.ts or signup route
const isDemo = process.env.DEMO_MODE === 'true';

if (isDemo) {
  return Response.json(
    { error: 'Signup is disabled on the demo. Run Sous Chef locally to create a new account.' },
    { status: 403 }
  );
}
```

Set `DEMO_MODE=true` in your demo environment.

### Rate Limiting for Public Demo

Add rate limiting to prevent abuse:

```typescript
// lib/rate-limit.ts
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(100, '1 h'), // 100 requests per hour
});

export async function checkRateLimit(identifier: string) {
  const result = await ratelimit.limit(identifier);
  return result.success;
}
```

Use in API routes to throttle requests by IP address.

### Required Environment Variables for Demo

```bash
# Core Demo Settings
DEMO_MODE=true
DEMO_READ_ONLY=false  # or true for read-only mode
DEMO_RESET_ENABLED=true

# NextAuth & Security
NEXTAUTH_URL=https://demo.sous-chef.example.com
NEXTAUTH_SECRET=<random-32-byte-base64>
APP_ENCRYPTION_KEY=<random-32-byte-base64>
APP_BASE_URL=https://demo.sous-chef.example.com

# Database (auto-set by Railway/Render)
DATABASE_URL=postgresql://...

# Email (optional for demo, but needed for password reset links)
SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_USER=default
SMTP_PASSWORD=<your-api-key>
SMTP_FROM=demo@sous-chef.example.com

# Supabase (for file uploads)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>

# Feature Flags
OPEN_FOOD_FACTS_ENABLED=true

# Rate Limiting (if using Upstash)
UPSTASH_REDIS_REST_URL=<from-upstash-console>
UPSTASH_REDIS_REST_TOKEN=<from-upstash-console>
```

---

## One-Click Deploy Button

Add a deploy button to your README so users can deploy with a single click.

### Railway Deploy Button

Add this to your README:

```markdown
[![Deploy to Railway](https://railway.app/button.svg)](https://railway.app/new?template=https%3A%2F%2Fgithub.com%2Fyourusername%2Fsous-chef)
```

**Requirements:**
1. Create a `railway.json` in your project root:

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "npm start",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 5
  },
  "plugins": {
    "postgres": {
      "version": "15"
    }
  }
}
```

2. Update the URL in the button to point to your repository:
   ```
   https://railway.app/new?template=https%3A%2F%2Fgithub.com%2FYOUR_USERNAME%2FSOUS_CHEF_REPO
   ```

### Render Deploy Button

```markdown
[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https%3A%2F%2Fgithub.com%2Fyourusername%2Fsous-chef)
```

**Requirements:**
1. Create a `render.yaml` in your project root:

```yaml
services:
  - type: web
    name: sous-chef
    runtime: node
    buildCommand: npm install && npm run build
    startCommand: npm start
    envVars:
      - key: NEXTAUTH_URL
        fromService:
          type: web
          property: host
          prefix: https://
      - key: APP_BASE_URL
        fromService:
          type: web
          property: host
          prefix: https://
      - key: NEXTAUTH_SECRET
        generateValue: true
      - key: APP_ENCRYPTION_KEY
        generateValue: true
      - key: DATABASE_URL
        fromDatabase:
          name: sous-chef-db
          property: connectionString

databases:
  - name: sous-chef-db
    ipAllowList: []
```

2. Update the repo URL:
   ```
   https://render.com/deploy?repo=https%3A%2F%2Fgithub.com%2FYOUR_USERNAME%2FSOUS_CHEF_REPO
   ```

---

## Budget Estimates

### Scenario 1: Low-Traffic Demo (100-500 requests/day)

| Provider | First Month | Ongoing Monthly | Notes |
|----------|-------------|-----------------|-------|
| **Railway** | $5 (trial) | $15-25 | Best value, auto-scaling |
| **Render** | $5 (trial) | $22+ | Free DB expires after 30 days |
| **Fly.io** | $0 (2-hr trial) | $20-35 | Pay-as-you-go, global deployment |
| **Coolify** | $5-10 (VPS) | $5-10 | Lowest ongoing cost, self-hosted |

### Scenario 2: Medium-Traffic Demo (5,000-10,000 requests/day)

| Provider | First Month | Ongoing Monthly | Notes |
|----------|-------------|-----------------|-------|
| **Railway** | $5 (trial) | $30-50 | Scales automatically |
| **Render** | $5 (trial) | $50-100 | Higher traffic can be expensive |
| **Fly.io** | $0 (2-hr trial) | $40-60 | Reasonable for moderate use |
| **Coolify** | $10-20 (VPS) | $10-20 | Upgrade VPS spec if needed |

### Scenario 3: High-Traffic Demo (50,000+ requests/day)

- **Railway**: $100-200+/month (with auto-scaling)
- **Render**: $150-300+/month (expensive at scale)
- **Fly.io**: $100-150+/month (distributed globally)
- **Coolify**: $30-50/month (dedicated server needed)

### Cost Optimization Tips

1. **Use free tier credits**: Both Railway and Render offer credits in first month
2. **Set resource limits**: Cap memory/CPU to prevent runaway costs
3. **Enable auto-scaling**: Let infrastructure scale down during low-traffic periods
4. **Combine free services**: Use Supabase free tier for files, Resend free tier for email
5. **Monitor usage**: Check dashboard weekly to catch unexpected spikes

---

## Next Steps

1. **Choose a provider** based on your needs (Railway recommended for fastest start)
2. **Create an account** and link your GitHub repository
3. **Deploy** using the provider's dashboard or one-click button
4. **Configure environment variables** from the list above
5. **Run Prisma migrations** to set up the database schema
6. **Seed demo data** using the UI or `set-password` script
7. **Test the demo** and share the link with the community
8. **Monitor costs** monthly to stay within budget

For questions or issues, refer to the hosting provider's documentation or open an issue on GitHub.

---

## References

- [Railway Pricing](https://railway.app/pricing) - Updated 2026
- [Render Pricing](https://render.com/pricing) - Updated 2026
- [Fly.io Pricing](https://fly.io/docs/about/pricing/) - Updated 2026
- [Coolify Documentation](https://coolify.io/docs/) - Open Source Self-Hosted PaaS
- [Sous Chef Repository](https://github.com/yourusername/sous-chef)
