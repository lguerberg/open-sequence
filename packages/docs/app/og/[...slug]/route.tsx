import { notFound } from 'next/navigation';
import { ogImage } from '@/lib/og';
import { operations, pageDescription, pageTitle, sectionNames } from '@/lib/seo';
import { getPageImage, siteDescription } from '@/lib/shared';
import { source } from '@/lib/source';

export const dynamic = 'force-static';
export const revalidate = false;

/**
 * `/og/<page>/image.png`: the link preview card of every page, written as a PNG at build time
 * (static export). `/og/image.png` is the home page's card and the site default.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await ctx.params;
  const slugs = slug.slice(0, -1); // drop the trailing "image.png"
  if (slugs.length === 0) {
    return ogImage({ title: 'Sales sequences, as code', description: siteDescription.replace(/:.*$/, '.'), section: 'Documentation' });
  }
  const page = source.getPage(slugs);
  if (!page) notFound();
  const op = operations(page)[0];
  return ogImage({
    title: pageTitle(page),
    description: op ? `${op.path}` : pageDescription(page),
    section: sectionNames(page).join(' / '),
    method: op?.method,
  });
}

export function generateStaticParams() {
  return [{ slug: getPageImage([]).segments }, ...source.getPages().map((page) => ({ slug: getPageImage(page.slugs).segments }))];
}
