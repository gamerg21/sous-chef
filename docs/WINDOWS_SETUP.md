# Windows Setup Guide

## Prisma Symlink Issue on Windows

When running `npm install` or `npx prisma generate` on Windows, you may encounter this error:

```
A required privilege is not held by the client. (os error 1314)
```

This happens because Prisma tries to create a symlink from `node_modules/@prisma/client` to the custom output directory, which requires administrator privileges on Windows.

## Solutions

### Option 1: Enable Developer Mode (Recommended)

This is the easiest and most permanent solution:

1. Open **Settings** (Windows key + I)
2. Go to **Privacy & Security** → **For developers**
3. Enable **Developer Mode**
4. Restart your terminal/PowerShell
5. Run `npx prisma generate` again

Developer Mode allows Windows to create symlinks without administrator privileges.

### Option 2: Run as Administrator

1. Right-click on your terminal/PowerShell
2. Select **Run as administrator**
3. Navigate to your project directory
4. Run `npx prisma generate`

### Option 3: Manual Prisma Generate

If the above options don't work, you can manually generate the Prisma client:

```bash
npx prisma generate
```

If it still fails, you can temporarily work around it by:

1. Delete the `src/generated` directory if it exists
2. Run `npx prisma generate` with administrator privileges
3. The generated files will work even after closing the admin terminal

### Option 4: Use WSL (Windows Subsystem for Linux)

If you have WSL installed, you can run the project in a Linux environment where symlinks work without issues:

```bash
wsl
cd /mnt/e/Projects/sous-chef  # Adjust path as needed
npm install
npx prisma generate
```

## Verification

After running `npx prisma generate`, verify it worked by checking:

1. The `src/generated/prisma` directory exists
2. The `src/generated/prisma/client` directory contains Prisma client files
3. Your IDE can resolve imports from `@/generated/prisma/client`

## Additional Notes

- The `postinstall` script in `package.json` will attempt to generate Prisma client automatically after `npm install`, but it will fail gracefully if symlink creation is not possible
- You can always run `npx prisma generate` manually after installation
- This issue only affects Windows; Linux and macOS don't have this restriction

