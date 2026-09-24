import { notFound } from 'next/navigation';
import { DemoEntry } from './DemoEntry';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Try Sous Chef — Your own demo kitchen', robots: { index: false, follow: false } };

export default function DemoPage() {
  if (process.env.SOUS_CHEF_DEMO !== 'true') notFound();
  return <DemoEntry />;
}
