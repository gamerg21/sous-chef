#!/bin/sh
# Generate self-signed SSL certificate for Sous Chef
# This script is optional - certificates are auto-generated if not provided

set -e

CERT_DIR="${CERT_DIR:-./certs}"
CERT_FILE="${CERT_FILE:-$CERT_DIR/cert.pem}"
KEY_FILE="${KEY_FILE:-$CERT_DIR/key.pem}"

# Default hostnames
HOSTNAMES="${HOSTNAMES:-localhost 127.0.0.1}"

# Check if OpenSSL is available
if ! command -v openssl >/dev/null 2>&1; then
    echo "Error: OpenSSL is not installed. Please install OpenSSL first."
    exit 1
fi

# Create certificate directory if it doesn't exist
mkdir -p "$CERT_DIR"

# Create temporary OpenSSL config
TEMP_CONFIG=$(mktemp)
trap "rm -f $TEMP_CONFIG" EXIT

# Build Subject Alternative Names list
SAN_LIST=""
INDEX=1
for host in $HOSTNAMES; do
    if echo "$host" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$|^::'; then
        # IP address
        SAN_LIST="${SAN_LIST}IP.${INDEX} = ${host}\n"
    else
        # DNS name
        SAN_LIST="${SAN_LIST}DNS.${INDEX} = ${host}\n"
    fi
    INDEX=$((INDEX + 1))
done

# Create OpenSSL configuration
cat > "$TEMP_CONFIG" <<EOF
[req]
distinguished_name = req_distinguished_name
req_extensions = v3_req
prompt = no

[req_distinguished_name]
C = US
ST = Self-Signed
L = Local
O = Sous Chef
OU = Development
CN = $(echo $HOSTNAMES | awk '{print $1}')

[v3_req]
keyUsage = keyEncipherment, dataEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt_names

[alt_names]
${SAN_LIST}
EOF

echo "Generating self-signed SSL certificate..."
echo "Hostnames: $HOSTNAMES"
echo "Certificate: $CERT_FILE"
echo "Key: $KEY_FILE"

# Generate private key
openssl genrsa -out "$KEY_FILE" 2048

# Generate self-signed certificate (valid for 1 year)
openssl req -new -x509 -key "$KEY_FILE" -out "$CERT_FILE" -days 365 \
    -config "$TEMP_CONFIG" -extensions v3_req

# Set appropriate permissions
chmod 644 "$CERT_FILE"
chmod 600 "$KEY_FILE"

echo ""
echo "✅ Certificate generated successfully!"
echo ""
echo "⚠️  This is a self-signed certificate. Browsers will show a security warning."
echo "   This is normal and safe for self-hosted instances."
echo ""
echo "To use this certificate:"
echo "  1. Set ENABLE_HTTPS=true in your .env file"
echo "  2. Mount the certs directory in docker-compose.yml (already configured)"
echo "  3. Restart your containers"
echo ""

