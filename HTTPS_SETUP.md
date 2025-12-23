# HTTPS Setup for Local Development

Safari requires HTTPS to access the camera API. Here are two ways to enable HTTPS for local development:

## Option 1: Quick Testing with Tunnel (Easiest)

Use a tunnel service to get an HTTPS URL instantly:

### Using Cloudflare Tunnel (Recommended)
```bash
# Install cloudflared (if not already installed)
# macOS:
brew install cloudflared

# Linux: Download from https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/

# Run the tunnel script
npm run dev:tunnel
```

This will:
1. Start your Next.js dev server on port 3000
2. Create an HTTPS tunnel (e.g., `https://random-subdomain.trycloudflare.com`)
3. Access your app via the HTTPS URL on your iPhone

### Using ngrok (Alternative)
```bash
# Install ngrok: https://ngrok.com/download
# Or use npx (no installation needed):
npx ngrok http 3000

# Then start your dev server in another terminal:
npm run dev
```

## Option 2: Local HTTPS Server (Permanent Solution)

Set up a local HTTPS server with self-signed certificates:

### Step 1: Install mkcert
```bash
# macOS:
brew install mkcert

# Linux (Ubuntu/Debian):
sudo apt install libnss3-tools
# Then download from: https://github.com/FiloSottile/mkcert/releases
# Or use the installer:
curl -JLO "https://dl.filippo.io/mkcert/latest?for=linux/amd64"
chmod +x mkcert-v*-linux-amd64
sudo mv mkcert-v*-linux-amd64 /usr/local/bin/mkcert
```

### Step 2: Install the local CA
```bash
mkcert -install
```

### Step 3: Generate certificates
```bash
cd /home/george/projects/sous-chef
mkcert localhost 127.0.0.1 ::1

# Rename the generated files
mv localhost+2.pem localhost.pem
mv localhost+2-key.pem localhost-key.pem
```

### Step 4: Run the HTTPS dev server
```bash
npm run dev:https
```

Your app will be available at `https://localhost:3000`

**Note:** Safari will show a security warning for the self-signed certificate. Click "Show Details" → "visit this website" to proceed.

## Troubleshooting

### Safari Certificate Warning
1. Open `https://localhost:3000` in Safari
2. You'll see a security warning
3. Click "Show Details"
4. Click "visit this website"
5. The certificate will be trusted for this session

### Certificate Not Trusted on iPhone
If accessing from your iPhone on the same network:
1. Find your computer's local IP: `ip addr show` (Linux) or `ifconfig` (macOS)
2. Update the certificate generation to include your IP:
   ```bash
   mkcert localhost 127.0.0.1 ::1 <your-local-ip>
   ```
3. Access via `https://<your-local-ip>:3000` on your iPhone
4. Accept the certificate warning in Safari

### Port Already in Use
If port 3000 is busy, you can change it in `server.js`:
```javascript
const port = 3001; // or any available port
```

## Option 3: Docker/Production HTTPS Setup

For Docker deployments, HTTPS can be enabled with automatic self-signed certificate generation:

### Quick Setup (Auto-generated Certificates)

1. **Enable HTTPS in your `.env` file:**
   ```env
   ENABLE_HTTPS=true
   NEXTAUTH_URL=https://localhost:3000
   ```

2. **Start your containers:**
   ```bash
   docker-compose up -d
   ```

That's it! The app will automatically generate self-signed certificates on first startup. Safari will show a security warning, but you can proceed and barcode scanning will work.

### Using Custom Certificates

If you want to provide your own certificates:

1. **Generate certificates** (optional - you can use the provided script):
   ```bash
   # Using the provided script
   ./scripts/generate-self-signed-cert.sh
   
   # Or manually with OpenSSL
   mkdir -p certs
   openssl req -x509 -newkey rsa:2048 -keyout certs/key.pem -out certs/cert.pem -days 365 -nodes
   ```

2. **Mount certificates in docker-compose.yml** (already configured):
   ```yaml
   volumes:
     - ./certs:/app/certs:rw
   ```

3. **Set environment variables** (optional - defaults work):
   ```env
   ENABLE_HTTPS=true
   SSL_CERT_PATH=/app/certs/cert.pem
   SSL_KEY_PATH=/app/certs/key.pem
   ```

### Using nginx Proxy (HTTP Backend)

If you're using nginx or another reverse proxy for SSL termination:

1. **Keep HTTPS disabled in the app:**
   ```env
   ENABLE_HTTPS=false
   NEXTAUTH_URL=https://yourdomain.com
   ```

2. **Configure nginx to handle SSL** and proxy to the HTTP backend:
   ```nginx
   server {
       listen 443 ssl;
       server_name yourdomain.com;
       
       ssl_certificate /path/to/cert.pem;
       ssl_certificate_key /path/to/key.pem;
       
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

## Which Option Should I Use?

- **Tunnel (Option 1)**: Best for quick testing, works immediately, no setup
- **Local HTTPS (Option 2)**: Best for ongoing development, faster (no external service), requires one-time setup
- **Docker Auto-generated (Option 3)**: Best for Docker deployments, works out-of-the-box, self-signed certs
- **Docker Custom Certificates (Option 3)**: Best for production Docker deployments with your own certificates
- **nginx Proxy (Option 3)**: Best for production with proper SSL certificates (Let's Encrypt, etc.)


