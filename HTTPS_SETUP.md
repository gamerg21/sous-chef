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

## Which Option Should I Use?

- **Tunnel (Option 1)**: Best for quick testing, works immediately, no setup
- **Local HTTPS (Option 2)**: Best for ongoing development, faster (no external service), requires one-time setup

