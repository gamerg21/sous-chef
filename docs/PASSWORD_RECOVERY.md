# Password recovery and optional email setup

Forgot your password? Open **Forgot password?** on the sign-in page.

- **Email is set up:** enter your sign-in email, check your inbox and spam folder,
  and open the newest reset link. Links expire after one hour and can be used once.
- **Email is not set up, or the message never arrives:** follow the steps below.
  You do not need the old password or any SQLite/database knowledge.

If you installed Sous Chef yourself, you are the person who can recover your
account. If a household member installed it, ask them to follow these instructions
for your sign-in email. The recovery screen does not notify anyone automatically.
The same instructions are available without signing in at `/auth/recovery`.

## Reset without email

1. Open Terminal on the computer running Sous Chef. If it runs on another computer,
   connect using SSH or open that computer's console first.
2. Choose your installation method below. Replace `you@example.com` with the email
   you use to sign in. The email goes in the command; the password does not.
3. Enter a new password of 8–128 characters when prompted. Nothing appears as you
   type. Press Enter, and confirm it if asked.
4. Wait for `Password updated; existing local sessions revoked.` Then sign in with
   your email and new password. Sign in again on your other devices too.

Your recipes, inventory, and household are preserved. Only this account's local
password, sessions, and old reset links change. A recipe community account has
its own separate password.

### Docker container (installed with docker run)

```sh
docker exec -it sous-chef node scripts/local-admin.mjs reset-password you@example.com
```

If you chose a different container name, replace `sous-chef` with that name.
Docker Desktop users can run this in their computer's Terminal while Docker
Desktop is running.

### Docker Compose

Run from the folder containing your Compose file:

```sh
docker compose exec app node scripts/local-admin.mjs reset-password you@example.com
```

### Installed with homelab.sh

Run from your Sous Chef project folder:

```sh
./homelab.sh reset-password you@example.com
```

### Running directly from source (without Docker)

Run from your Sous Chef project folder:

```sh
pnpm reset-password you@example.com
```

Use the same environment and data directory as the running app. For example,
if your service stores data in `/var/lib/sous-chef`, run:

```sh
SOUS_CHEF_DATA_DIR=/var/lib/sous-chef pnpm reset-password you@example.com
```

Use the operating-system account that runs the service, or an administrator
with access to that directory. No app login is needed.

### Older versions that read the password from standard input

If the command appears to wait silently instead of showing a password prompt,
press Ctrl+C. You can reset without upgrading. Start Bash (`bash`), then run
these lines one at a time, replacing the email:

```bash
read -r -s -p 'New password: ' kitchen_password; echo
printf '%s' "$kitchen_password" | docker exec -i sous-chef node scripts/local-admin.mjs reset-password you@example.com
unset kitchen_password
```

For Compose, replace `docker exec -i sous-chef` with `docker compose exec -T app`.
For a direct source installation, replace the command after `|` with
`SOUS_CHEF_DATA_DIR=/your/data/directory node scripts/local-admin.mjs reset-password you@example.com`.
`homelab.sh` already supplies its own hidden prompt on older releases.

### If it does not work

- **Account not found:** check your sign-in email and that the command targets
  the same installation you use in your browser.
- **No kitchen database found:** for a source install, set `SOUS_CHEF_DATA_DIR`
  to the directory used by the running app. For Docker, use the existing app
  container, which already has the right storage attached.
- **Container not found:** run `docker ps` and use your app's container name.
- **Permission denied:** use the computer account that manages the installation.
- **Passwords do not match:** nothing was changed; run the command again.

Do not delete the data directory, recreate the database, or remove a Docker
volume to recover a password.

## Optional: set up password reset emails

Email is optional. Sous Chef sends reset links through **Resend's HTTPS API**.
It does not currently support a general SMTP server, Gmail SMTP, or an email
verification flow. `SMTP_FROM` is the sender address despite its historical name.
No verification email is required to create or use a local kitchen account.

### 1. Prepare a sender in Resend

Create a [Resend account](https://resend.com), add a domain you own, and add the
DNS records Resend shows at the company managing your domain. Wait until Resend
marks the domain verified. See [Resend's domain guide](https://resend.com/docs/dashboard/domains/introduction).

Create an API key with sending access for that domain in Resend's API Keys page.
See [API key instructions](https://resend.com/docs/dashboard/api-keys/introduction).
Keep the key private. Choose a sender on the verified domain, such as
`Kitchen <kitchen@yourdomain.com>`; do not use a personal Gmail address as sender.
The default `onboarding@resend.dev` address is for restricted testing, not household
recovery. See [Resend's testing limitation](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain).

If you do not have a domain or do not want an email service, use recovery without
email above. Email setup is not needed to unlock your account.

### 2. Save these three settings

Replace the examples with your values:

```dotenv
APP_URL=https://kitchen.yourdomain.com
RESEND_API_KEY=re_REPLACE_WITH_YOUR_KEY
SMTP_FROM="Kitchen <kitchen@yourdomain.com>"
```

`APP_URL` is the exact address you use to open Sous Chef, including the port if
needed, with no page path. A LAN address such as `http://192.168.1.20:3000` works
when the recipient opens the link on that network. HTTPS is recommended; the
sender's domain and the kitchen's address do not have to match. The app needs
outbound internet access to send through Resend.

Where to put the settings depends on how you installed:

| Installation | Where to save settings | Apply changes |
| --- | --- | --- |
| `homelab.sh` | `.env.homelab` in the project folder | `./homelab.sh up` |
| Docker Compose | `.env` beside the Compose file | `docker compose up -d --force-recreate app` |
| Direct source, `pnpm dev` | `.env.local` in the project folder | Stop and restart `pnpm dev` |
| Source running as a system service | The service's existing environment file | Restart that service |

For `docker run`, create a private file called `sous-chef.env` on the host with
these three settings. For this file, write `SMTP_FROM=Kitchen <kitchen@yourdomain.com>`
**without quotes**; Docker's `--env-file` keeps quotes literally. On Linux/macOS,
run `chmod 600 sous-chef.env`. Back up first, then recreate the container with
your original ports, volume, and other settings plus `--env-file`:

```sh
docker stop sous-chef
docker rm sous-chef
docker run -d --name sous-chef --restart unless-stopped \
  --env-file ./sous-chef.env \
  -p 3000:3000 -v sous-chef-data:/data \
  ghcr.io/gamerg21/sous-chef:latest
```

This example uses the README's container and volume names. Preserve any custom
image, volume, ports, and environment options from your original command. Removing
the container keeps its named volume; never delete the volume. A simple container
restart does not load changed environment values. See [Docker instructions](../DOCKER.md).

### 3. Test delivery

Open a private browser window, go to your kitchen's sign-in page, select
**Forgot password?**, and enter an existing account's email. Check its inbox and
spam folder. Open the newest link, choose a new password, and confirm you can sign
in. A link is valid for one hour; requesting another replaces the earlier link.

If no email arrives, check Resend's email delivery dashboard and the app logs
(`docker logs sous-chef`, `docker compose logs app`, or `./homelab.sh logs`). Check
all three settings, the sender's verified domain, API key permissions, and that
you restarted/recreated the app. The form uses the same response for unknown
addresses to avoid revealing who has an account. It does not prove delivery.
You can always use the no-email recovery steps above.
