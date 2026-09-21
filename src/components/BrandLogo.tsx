import Image from 'next/image';

/** Approved transparent mark, backed by stone so white details remain visible. */
export function BrandLogo({ size = 40, className = '', decorative = false }: { size?: number; className?: string; decorative?: boolean }) {
  return <span className={className} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, width: size, height: size, borderRadius: Math.round(size * 0.25), background: '#1c1917', verticalAlign: 'middle' }}>
    <Image src="/brand/sous-chef.svg" alt={decorative ? '' : 'Sous Chef'} width={Math.round(size * 0.72)} height={Math.round(size * 0.78)} unoptimized />
  </span>;
}
