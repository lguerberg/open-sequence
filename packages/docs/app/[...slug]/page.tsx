import { DocsBody, DocsDescription, DocsPage, DocsTitle, EditOnGitHub, MarkdownCopyButton, ViewOptionsPopover } from 'fumadocs-ui/layouts/notebook/page';
import { createRelativeLink } from 'fumadocs-ui/mdx';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { OpenAPIPage } from '@/components/api-page';
import { getMDXComponents } from '@/components/mdx';
import { jsonLdHtml, pageGithubUrl, pageJsonLd, pageMetadata } from '@/lib/seo';
import { getPageMarkdownUrl } from '@/lib/shared';
import { source } from '@/lib/source';

type Params = { params: Promise<{ slug: string[] }> };

export default async function Page(props: Params) {
  const { slug } = await props.params;
  const page = source.getPage(slug);
  if (!page) notFound();

  const markdownUrl = getPageMarkdownUrl(page).url;
  const githubUrl = pageGithubUrl(page);
  const jsonLd = <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdHtml(pageJsonLd(page))} />;

  if (page.type === 'openapi') {
    // One virtual page per operation; the source of truth is apps/server/openapi.json.
    return (
      <DocsPage full toc={page.data.toc}>
        {jsonLd}
        <h1 className="text-[1.75em] font-semibold">{page.data.title}</h1>
        <div className="flex flex-row gap-2 items-center border-b pb-6">
          <EditOnGitHub href={githubUrl} />
        </div>
        <DocsBody>
          <OpenAPIPage {...page.data.getOpenAPIPageProps()} />
        </DocsBody>
      </DocsPage>
    );
  }

  const MDX = page.data.body;

  return (
    <DocsPage toc={page.data.toc} full={page.data.full}>
      {jsonLd}
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription className="mb-0">{page.data.description}</DocsDescription>
      <div className="flex flex-row flex-wrap gap-2 items-center border-b pb-6">
        <MarkdownCopyButton markdownUrl={markdownUrl} />
        <ViewOptionsPopover markdownUrl={markdownUrl} githubUrl={githubUrl} />
        <EditOnGitHub href={githubUrl} />
      </div>
      <DocsBody>
        <MDX components={getMDXComponents({ a: createRelativeLink(source, page) })} />
      </DocsBody>
    </DocsPage>
  );
}

export async function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata(props: Params): Promise<Metadata> {
  const { slug } = await props.params;
  const page = source.getPage(slug);
  if (!page) notFound();
  return pageMetadata(page);
}
