import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export default async function Home() {
  const session = await getServerSession(authOptions);

  // Redirect authenticated users to inventory
  if (session) {
    redirect("/inventory");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50 font-sans dark:bg-stone-950">
      <main className="flex min-h-screen w-full max-w-3xl flex-col items-center justify-between py-32 px-16 bg-white dark:bg-stone-950 sm:items-start">
        <div className="flex flex-col items-center gap-6 text-center sm:items-start sm:text-left">
          <h1 className="max-w-xs text-3xl font-semibold leading-10 tracking-tight text-stone-900 dark:text-stone-50" style={{ fontFamily: 'var(--font-heading)' }}>
            Sous Chef 🍳
          </h1>
          <p className="max-w-md text-lg leading-8 text-stone-600 dark:text-stone-400" style={{ fontFamily: 'var(--font-body)' }}>
            Your personal kitchen assistant
          </p>
          <Link
            href="/auth/signin"
            className="mt-4 inline-block rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition-colors"
          >
            Sign in
          </Link>
        </div>
      </main>
    </div>
  );
}
