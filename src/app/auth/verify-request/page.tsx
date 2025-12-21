export default function VerifyRequest() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50 font-sans dark:bg-stone-950">
      <div className="w-full max-w-md space-y-8 rounded-lg bg-white p-8 shadow-sm dark:bg-stone-900 border border-stone-200 dark:border-stone-800 text-center">
        <h1 className="text-3xl font-semibold leading-tight tracking-tight text-stone-900 dark:text-stone-50" style={{ fontFamily: 'var(--font-heading)' }}>
          Check your email
        </h1>
        <p className="mt-2 text-sm text-stone-600 dark:text-stone-400" style={{ fontFamily: 'var(--font-body)' }}>
          A sign-in link has been sent to your email address. Click the link in
          the email to sign in.
        </p>
      </div>
    </div>
  );
}
