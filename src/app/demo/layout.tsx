import { BrandLogo } from '@/components/BrandLogo';
export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return <><header className="mx-auto flex max-w-xl items-center gap-3 px-8 pt-8"><BrandLogo size={48} decorative /><span className="text-xl font-semibold">Sous Chef</span></header>{children}</>;
}
