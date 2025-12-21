const { createServer } = require('https');
const { parse } = require('url');
const next = require('next');
const fs = require('fs');
const path = require('path');

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = 3000;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Paths to certificate files
const certPath = path.join(__dirname, 'localhost.pem');
const keyPath = path.join(__dirname, 'localhost-key.pem');

// Check if certificates exist
if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
  console.error('\n❌ SSL certificates not found!');
  console.error('\nTo generate certificates, run:');
  console.error('  1. Install mkcert: https://github.com/FiloSottile/mkcert');
  console.error('  2. Run: mkcert -install');
  console.error('  3. Run: mkcert localhost 127.0.0.1 ::1');
  console.error('  4. Move the generated files:');
  console.error('     mv localhost+2.pem localhost.pem');
  console.error('     mv localhost+2-key.pem localhost-key.pem');
  console.error('\nAlternatively, use the tunnel script: npm run dev:tunnel\n');
  process.exit(1);
}

const httpsOptions = {
  key: fs.readFileSync(keyPath),
  cert: fs.readFileSync(certPath),
};

app.prepare().then(() => {
  createServer(httpsOptions, async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  }).listen(port, (err) => {
    if (err) throw err;
    console.log(`\n✅ Ready on https://${hostname}:${port}\n`);
    console.log('⚠️  You may need to accept the self-signed certificate in your browser\n');
  });
});

