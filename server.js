/* eslint-disable @typescript-eslint/no-require-imports */
// Ensure we're in production mode for standalone builds
process.env.NODE_ENV = process.env.NODE_ENV || 'production';

const { createServer: createHttpServer } = require('http');
const { createServer: createHttpsServer } = require('https');
const { parse } = require('url');
const next = require('next');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

// In standalone mode, always use production mode
// The dev flag should be false for standalone builds
const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);
const enableHttps = process.env.ENABLE_HTTPS === 'true';

// Certificate paths (configurable via environment variables)
const certPath = process.env.SSL_CERT_PATH || path.join(__dirname, 'certs', 'cert.pem');
const keyPath = process.env.SSL_KEY_PATH || path.join(__dirname, 'certs', 'key.pem');

// Initialize Next.js app
// In standalone mode, Next.js should detect it automatically
// We use minimal config to avoid webpack loading issues
let app;
try {
  // Try with explicit production mode settings
  app = next({ 
    dev: false,
    // Don't pass conf to avoid webpack loading
  });
} catch (initError) {
  console.error('Error initializing Next.js:', initError);
  // If initialization fails, try with even more minimal config
  app = next({});
}

const handle = app.getRequestHandler();

/**
 * Generate a self-signed certificate using OpenSSL
 * @param {string[]} hostnames - Array of hostnames/IPs to include in the certificate
 * @returns {Object} Object with cert and key as PEM strings
 */
function generateSelfSignedCert(hostnames = ['localhost', '127.0.0.1']) {
  console.log('\n🔐 Generating self-signed SSL certificate...');
  console.log(`   Hostnames: ${hostnames.join(', ')}`);
  
  // Add container hostname if available
  const containerHostname = os.hostname();
  if (containerHostname && containerHostname !== 'localhost' && !hostnames.includes(containerHostname)) {
    hostnames.push(containerHostname);
  }

  // Create temporary directory for OpenSSL operations
  const tempDir = path.join(__dirname, 'certs', '.tmp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const tempKeyPath = path.join(tempDir, 'temp-key.pem');
  const tempCertPath = path.join(tempDir, 'temp-cert.pem');
  const tempConfigPath = path.join(tempDir, 'openssl.conf');

  try {
    // Create OpenSSL config file with Subject Alternative Names
    const sanList = hostnames.map((host, index) => {
      const isIP = /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.startsWith('::');
      const type = isIP ? 'IP' : 'DNS';
      return `${type}.${index + 1} = ${host}`;
    }).join('\n');

    const opensslConfig = `[req]
distinguished_name = req_distinguished_name
req_extensions = v3_req
prompt = no

[req_distinguished_name]
C = US
ST = Self-Signed
L = Local
O = Sous Chef
OU = Development
CN = ${hostnames[0] || 'localhost'}

[v3_req]
basicConstraints = CA:FALSE
keyUsage = digitalSignature, keyEncipherment, dataEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt_names

[alt_names]
${sanList}
`;

    fs.writeFileSync(tempConfigPath, opensslConfig);

    // Generate private key
    execSync(`openssl genrsa -out "${tempKeyPath}" 2048`, { stdio: 'pipe' });

    // Generate self-signed certificate (valid for 1 year)
    execSync(
      `openssl req -new -x509 -key "${tempKeyPath}" -out "${tempCertPath}" -days 365 -config "${tempConfigPath}" -extensions v3_req`,
      { stdio: 'pipe' }
    );

    // Read the generated files
    const cert = fs.readFileSync(tempCertPath, 'utf8');
    const key = fs.readFileSync(tempKeyPath, 'utf8');

    // Clean up temporary files
    try {
      fs.unlinkSync(tempKeyPath);
      fs.unlinkSync(tempCertPath);
      fs.unlinkSync(tempConfigPath);
      if (fs.existsSync(tempDir)) {
        fs.rmdirSync(tempDir);
      }
    } catch (cleanupError) {
      // Ignore cleanup errors
    }

    console.log('✅ Self-signed certificate generated successfully');
    console.log(`⚠️  Browsers will show a security warning for self-signed certificates`);
    console.log(`   This is normal and safe for self-hosted instances. You can proceed by accepting the warning.\n`);

    return { cert, key };
  } catch (error) {
    // Clean up on error
    try {
      if (fs.existsSync(tempKeyPath)) fs.unlinkSync(tempKeyPath);
      if (fs.existsSync(tempCertPath)) fs.unlinkSync(tempCertPath);
      if (fs.existsSync(tempConfigPath)) fs.unlinkSync(tempConfigPath);
      if (fs.existsSync(tempDir)) fs.rmdirSync(tempDir);
    } catch (cleanupError) {
      // Ignore cleanup errors
    }

    throw new Error(`Failed to generate certificate: ${error.message}`);
  }
}

/**
 * Ensure certificate directory exists and has correct permissions
 */
function ensureCertDirectory() {
  const certDir = path.dirname(certPath);
  if (!fs.existsSync(certDir)) {
    fs.mkdirSync(certDir, { recursive: true, mode: 0o755 });
    console.log(`📁 Created certificate directory: ${certDir}`);
  }
}

/**
 * Load or generate SSL certificates
 * @returns {Object|null} Object with key, cert, and wasGenerated flag, or null if HTTPS is disabled
 */
function getHttpsOptions() {
  if (!enableHttps) {
    return null;
  }

  // Check if certificates exist
  const certExists = fs.existsSync(certPath);
  const keyExists = fs.existsSync(keyPath);

  if (certExists && keyExists) {
    console.log('🔐 Using existing SSL certificates');
    console.log(`   Certificate: ${certPath}`);
    console.log(`   Key: ${keyPath}\n`);
    return {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
      wasGenerated: false,
    };
  }

  // Auto-generate self-signed certificates
  console.log('⚠️  SSL certificates not found, generating self-signed certificates...');
  ensureCertDirectory();

  try {
    const { cert, key } = generateSelfSignedCert(['localhost', '127.0.0.1', '0.0.0.0']);
    
    // Save certificates to disk for reuse
    fs.writeFileSync(certPath, cert, { mode: 0o644 });
    fs.writeFileSync(keyPath, key, { mode: 0o600 });
    
    console.log(`💾 Saved certificates to:`);
    console.log(`   Certificate: ${certPath}`);
    console.log(`   Key: ${keyPath}\n`);

    return {
      key,
      cert,
      wasGenerated: true,
    };
  } catch (error) {
    console.error('❌ Failed to generate self-signed certificate:', error.message);
    console.error('   Falling back to HTTP mode\n');
    return null;
  }
}

// Start the server
app.prepare().then(() => {
  const httpsOptions = getHttpsOptions();
  const useHttps = enableHttps && httpsOptions !== null;
  const wasGenerated = httpsOptions?.wasGenerated || false;

  if (useHttps) {
    // Start HTTPS server
    const { key, cert } = httpsOptions;
    createHttpsServer({ key, cert }, async (req, res) => {
      try {
        const parsedUrl = parse(req.url, true);
        await handle(req, res, parsedUrl);
      } catch (err) {
        console.error('Error occurred handling', req.url, err);
        res.statusCode = 500;
        res.end('internal server error');
      }
    }).listen(port, hostname, (err) => {
      if (err) throw err;
      console.log(`\n✅ Ready on https://${hostname === '0.0.0.0' ? 'localhost' : hostname}:${port}`);
      if (wasGenerated) {
        console.log('⚠️  Using auto-generated self-signed certificate');
        console.log('   Browsers will show a security warning - this is normal for self-signed certs');
        console.log('   Safari will still allow barcode scanning despite the warning\n');
      } else {
        console.log('⚠️  You may need to accept the self-signed certificate in your browser\n');
      }
    });
  } else {
    // Start HTTP server
    if (enableHttps) {
      console.log('⚠️  HTTPS was requested but certificate generation failed, starting HTTP server\n');
    } else {
      console.log('🌐 Starting HTTP server (HTTPS disabled)\n');
    }

    createHttpServer(async (req, res) => {
      try {
        const parsedUrl = parse(req.url, true);
        await handle(req, res, parsedUrl);
      } catch (err) {
        console.error('Error occurred handling', req.url, err);
        res.statusCode = 500;
        res.end('internal server error');
      }
    }).listen(port, hostname, (err) => {
      if (err) throw err;
      console.log(`\n✅ Ready on http://${hostname === '0.0.0.0' ? 'localhost' : hostname}:${port}\n`);
    });
  }
});

