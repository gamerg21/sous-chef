import { cache } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Bookmark, ChefHat, Clock, Download, EyeOff, Heart, Star, Users } from 'lucide-react';
import { publicRecipe } from '@/server/kitchen/communityPublic';
import { unitLabel } from '@/lib/units';
import { buttonClassName, cardClassName, chipClassName, cx, EmptyState, eyebrowClassName, headingFont, Pill, rowsClassName, Section } from '@/components/ui/kit';
import { CommunityUnavailable, ExploreShell, GUIDELINES_URL, Rating, RecipePhoto, textLinkClassName } from '../../parts';
import { countLabel, dateLabel, downloadHref, durationLabel, exploreHref, quantityLabel, recipeHref, summaryLine } from '../../query';
import { CopyLinkButton } from './CopyLinkButton';

export const dynamic = 'force-dynamic';

// The page and its metadata read the same recipe: one request for both.
const load = cache((id: string) => publicRecipe(id));

function appOrigin(): string | undefined {
  try { return process.env.APP_URL ? new URL(process.env.APP_URL).origin : undefined; } catch { return undefined; }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const result = await load(id);
  if (result.state !== 'ok') return { title: result.state === 'missing' ? 'Recipe not found · Sous Chef' : 'Community unavailable · Sous Chef', robots: { index: false, follow: false } };
  const { detail } = result;
  const author = detail.author.name || 'a community cook';
  const title = `${detail.title} · Sous Chef community`;
  const description = summaryLine(detail.description, `A recipe by ${author}, shared in the Sous Chef community.`);
  // Unlisted recipes are for people with the link. A v1 service doesn't say which are unlisted, so none are indexed.
  const listed = detail.visibility === 'public' && !result.legacy;
  return {
    title,
    description,
    ...(listed ? {} : { robots: { index: false, follow: false } }),
    openGraph: { type: 'article', title, description, url: recipeHref(detail.id), ...(detail.photoUrl ? { images: [{ url: detail.photoUrl, alt: detail.title }] } : {}) },
    twitter: { card: detail.photoUrl ? 'summary_large_image' : 'summary', title, description, ...(detail.photoUrl ? { images: [detail.photoUrl] } : {}) },
  };
}

const backLink = (
  <Link className="-ml-2 flex min-h-11 w-fit items-center gap-2 rounded-full px-2 text-sm text-stone-600 hover:bg-stone-100 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-emerald-600 dark:text-stone-400 dark:hover:bg-stone-900 dark:hover:text-stone-100" href="/explore">
    <ArrowLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
    All community recipes
  </Link>
);

function Stars({ rating }: { rating: number }) {
  const filled = Math.round(rating);
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`${filled} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map(n => <Star key={n} aria-hidden="true" className={cx('h-3.5 w-3.5', n <= filled ? 'fill-amber-400 text-amber-500' : 'text-stone-300 dark:text-stone-700')} strokeWidth={1.75} />)}
    </span>
  );
}

export default async function ExploreRecipe({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await load(id);
  if (result.state === 'missing') notFound();
  if (result.state === 'unavailable') {
    return (
      <ExploreShell width="reading">
        {backLink}
        <CommunityUnavailable />
      </ExploreShell>
    );
  }

  const { detail, legacy } = result;
  const s = detail.snapshot;
  const time = durationLabel(s.totalTimeMinutes);
  const origin = appOrigin();
  const shareUrl = detail.shareUrl ?? (origin ? `${origin}${recipeHref(detail.id)}` : undefined);
  const tips = detail.tips.filter(tip => tip.tip);

  return (
    <ExploreShell width="reading">
      {backLink}
      <article className="space-y-6">
        <RecipePhoto src={detail.photoUrl ?? s.photoDataUrl} eager className="aspect-[16/9] rounded-2xl border border-stone-200 dark:border-stone-800" />

        <header className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className={eyebrowClassName}>Community recipe</p>
            {detail.visibility === 'unlisted' && !legacy && <Pill tone="neutral"><EyeOff className="h-3 w-3" strokeWidth={2} aria-hidden="true" />Unlisted: only people with the link can see it</Pill>}
          </div>
          <h1 className="break-words text-3xl font-semibold tracking-tight text-stone-900 dark:text-stone-100" style={headingFont}>{s.title}</h1>
          <p className="break-words text-base text-stone-600 dark:text-stone-400">
            By <span className="font-medium text-stone-800 dark:text-stone-200">{detail.author.name || 'Community cook'}</span>
            {dateLabel(detail.updatedAt) && <> · Updated <time dateTime={detail.updatedAt}>{dateLabel(detail.updatedAt)}</time></>}
          </p>
          {s.description && <p className="whitespace-pre-line break-words text-base leading-relaxed text-stone-700 dark:text-stone-300">{s.description}</p>}
          <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-stone-600 dark:text-stone-400">
            {time && <li className="inline-flex items-center gap-1.5"><Clock className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />{time}</li>}
            {s.servings ? <li className="inline-flex items-center gap-1.5"><Users className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />Serves {s.servings}</li> : null}
            {!legacy && detail.rating !== undefined && detail.madeCount > 0 && <li><Rating rating={detail.rating} madeCount={detail.madeCount} /></li>}
            {!legacy && <li className="inline-flex items-center gap-1.5"><Heart className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />{countLabel(detail.likeCount, 'like')}</li>}
            {!legacy && <li className="inline-flex items-center gap-1.5"><Bookmark className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />{countLabel(detail.saveCount, 'save')}</li>}
            {!legacy && <li className="inline-flex items-center gap-1.5"><ChefHat className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />Made {countLabel(detail.madeCount, 'time')}</li>}
          </ul>
          {s.tags.length > 0 && (
            <ul aria-label="Tags" className="flex flex-wrap gap-2">
              {s.tags.map((tag, n) => (
                <li key={n} className="max-w-full">
                  {legacy ? <span className={cx(chipClassName(), 'max-w-full')}><span className="truncate">{tag}</span></span> : <Link className={cx(chipClassName(), 'max-w-full')} href={exploreHref({ tag })}><span className="truncate">{tag}</span></Link>}
                </li>
              ))}
            </ul>
          )}
        </header>

        <div className={cx(cardClassName, 'space-y-3 p-4')}>
          <div className="flex flex-wrap gap-2">
            <a className={cx(buttonClassName('primary'), 'min-h-11')} href={downloadHref(detail.id)} download>
              <Download className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              Download recipe
            </a>
            <Link className={cx(buttonClassName('secondary'), 'min-h-11')} href={`/community/recipes/${encodeURIComponent(detail.id)}`}>Open in your kitchen</Link>
            {shareUrl && <CopyLinkButton url={shareUrl} />}
          </div>
          <p className="text-sm text-stone-600 dark:text-stone-400">The download is a file for the Import command in your Sous Chef recipe library.</p>
          {shareUrl && (
            <p className="text-sm text-stone-600 dark:text-stone-400">
              Share link: <a className={cx(textLinkClassName, 'break-all')} href={shareUrl}>{shareUrl}</a>
            </p>
          )}
        </div>

        <Section title="Ingredients" id="recipe-ingredients">
          {s.ingredients.length === 0 ? (
            <p className={cx(cardClassName, 'p-4 text-sm text-stone-600 dark:text-stone-400')}>This recipe lists no ingredients.</p>
          ) : (
            <ul className={cx(cardClassName, rowsClassName)}>
              {s.ingredients.map((ingredient, n) => {
                const amount = [quantityLabel(ingredient.quantity), unitLabel(ingredient.unit, ingredient.quantity)].filter(Boolean).join(' ');
                return (
                  <li key={n} className="break-words px-4 py-3 text-base text-stone-800 dark:text-stone-200">
                    {amount && <span className="font-semibold tabular-nums">{amount} </span>}
                    {ingredient.name}
                    {ingredient.note && <span className="text-stone-600 dark:text-stone-400">, {ingredient.note}</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        <Section title="Steps" id="recipe-steps">
          {s.steps.length === 0 ? (
            <p className={cx(cardClassName, 'p-4 text-sm text-stone-600 dark:text-stone-400')}>This recipe lists no steps.</p>
          ) : (
            <ol className={cx(cardClassName, 'space-y-4 p-4')}>
              {s.steps.map((step, n) => (
                <li key={n} className="flex gap-3 text-base leading-relaxed text-stone-800 dark:text-stone-200">
                  <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200">{n + 1}</span>
                  <span className="min-w-0 whitespace-pre-line break-words pt-0.5">{step.text}</span>
                </li>
              ))}
            </ol>
          )}
        </Section>

        {s.sourceUrl && (
          <p className="text-sm text-stone-600 dark:text-stone-400">
            Source: <a className={cx(textLinkClassName, 'break-all')} href={s.sourceUrl} rel="noopener noreferrer nofollow ugc">{s.sourceUrl}</a>
          </p>
        )}

        {!legacy && (
          <Section title="From cooks who made it" id="recipe-tips" aside={detail.madeCount > 0 ? `Made ${countLabel(detail.madeCount, 'time')}` : undefined}>
            {tips.length === 0 ? (
              <div className={cardClassName}>
                <EmptyState icon={ChefHat} title="No tips yet" description="Cooks who make this recipe can rate it and leave a tip from their kitchen." />
              </div>
            ) : (
              <ul className={cx(cardClassName, rowsClassName)}>
                {tips.map(tip => (
                  <li key={tip.id} className="space-y-1 px-4 py-3">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-stone-600 dark:text-stone-400">
                      <span className="font-medium text-stone-800 dark:text-stone-200">{tip.author.name || 'Community cook'}</span>
                      <Stars rating={tip.rating} />
                      {dateLabel(tip.createdAt) && <time dateTime={tip.createdAt}>{dateLabel(tip.createdAt)}</time>}
                    </div>
                    <p className="whitespace-pre-line break-words text-base text-stone-800 dark:text-stone-200">{tip.tip}</p>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        )}

        <p className="text-sm text-stone-600 dark:text-stone-400">
          Recipes are shared by community members and follow the <a className={textLinkClassName} href={GUIDELINES_URL} rel="noopener">community guidelines</a>. To report this recipe, open it in your kitchen and choose Report.
        </p>
      </article>
    </ExploreShell>
  );
}
