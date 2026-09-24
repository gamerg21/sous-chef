import { BrandLogo } from '@/components/BrandLogo';
import { headingFont } from '@/components/ui/kit';
export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-stone-50 dark:bg-stone-950"><header className="mx-auto flex max-w-xl items-center gap-3 px-4 pt-8 sm:px-6"><BrandLogo size={44} decorative /><span className="text-xl font-semibold tracking-tight" style={headingFont}>Sous Chef</span></header>{children}</div>;
}
