import Link from "next/link";

const commands = [
  ["Docker container", "If you installed with docker run, open Terminal on that computer and run:", "docker exec -it sous-chef node scripts/local-admin.mjs reset-password you@example.com"],
  ["Docker Compose", "Open Terminal in the folder containing your Compose file and run:", "docker compose exec app node scripts/local-admin.mjs reset-password you@example.com"],
  ["Installed with homelab.sh", "Open Terminal in your Sous Chef project folder and run:", "./homelab.sh reset-password you@example.com"],
  ["Running directly from source", "Open Terminal in your Sous Chef project folder and run with the same data directory and environment as your running app:", "pnpm reset-password you@example.com"],
];

export default function RecoveryInstructions() {
  return (
    <main className="min-h-screen bg-stone-50 px-4 py-12 text-stone-900 dark:bg-stone-950 dark:text-stone-100">
      <article className="mx-auto max-w-2xl space-y-6 rounded-xl border border-stone-200 bg-white p-6 dark:border-stone-800 dark:bg-stone-900">
        <h1 className="text-3xl font-semibold">Reset your password without email</h1>
        <p>If you installed Sous Chef, you can reset your own password. If someone else installed it for your household, share these instructions with them. You need access to the computer running Sous Chef, not an existing app login.</p>
        <ol className="list-decimal space-y-3 pl-5">
          <li>Open Terminal on that computer. For a remote server, connect using SSH or its console first.</li>
          <li>Choose your installation method below. Replace <code>you@example.com</code> with the email you use to sign in.</li>
          <li>Run the command, then type your new password at the prompt and press Enter. Typing is hidden. Use 8–128 characters. If asked to confirm, type it again.</li>
          <li>When you see <strong>Password updated</strong>, return to the sign-in page and use your new password.</li>
        </ol>
        <div className="space-y-3">
          {commands.map(([title, description, command]) => (
            <details key={title} className="rounded-lg border border-stone-200 p-4 dark:border-stone-700">
              <summary className="cursor-pointer font-semibold">{title}</summary>
              <p className="my-3 text-sm">{description}</p>
              <pre className="overflow-x-auto rounded bg-stone-100 p-3 text-sm dark:bg-stone-950"><code>{command}</code></pre>
            </details>
          ))}
        </div>
        <p>Your recipes, pantry, and household stay intact. Existing sign-ins are ended, so sign in again on your other devices. This changes only your local kitchen password, not a separate recipe community password.</p>
        <p className="text-sm">If you see “Account not found,” check your sign-in email and that you are using the correct installation. If you see “No kitchen database found,” use the same data directory as the running app. Do not delete data or reinstall to recover a password.</p>
        <p className="text-sm">Using an older release with no password prompt? See the <a className="underline" href="https://github.com/gamerg21/sous-chef/blob/main/docs/PASSWORD_RECOVERY.md">recovery guide</a> for the hidden-input method and custom installation settings.</p>
        <Link href="/auth/signin" className="inline-block font-medium text-emerald-700 dark:text-emerald-400 underline">Back to sign in</Link>
      </article>
    </main>
  );
}
