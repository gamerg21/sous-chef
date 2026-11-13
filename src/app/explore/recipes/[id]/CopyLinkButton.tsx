'use client';
import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { buttonClassName, cx } from '@/components/ui/kit';

/** Copies the share link. An enhancement: the link itself is on the page and works without JavaScript. */
export function CopyLinkButton({ url }: { url: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setState('copied');
    } catch {
      setState('failed');
    }
  };
  return (
    <>
      <button type="button" onClick={() => void copy()} className={cx(buttonClassName('secondary'), 'min-h-11')}>
        {state === 'copied' ? <Check className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" /> : <Copy className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />}
        {state === 'copied' ? 'Copied' : 'Copy link'}
      </button>
      <span role="status" className="sr-only">
        {state === 'copied' ? 'Link copied' : state === 'failed' ? 'Couldn’t copy. Select the link and copy it instead.' : ''}
      </span>
    </>
  );
}
