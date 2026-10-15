import { getAllPosts, getPost } from '@/lib/blog';
import { postOgPng } from '@/lib/brand-images';

export const dynamic = 'force-static';
export const dynamicParams = false;

export async function generateStaticParams() {
  return (await getAllPosts()).map((p) => ({ slug: p.slug }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const post = await getPost((await params).slug);
  if (!post) return new Response('Not found', { status: 404 });
  return postOgPng({ title: post.h1, eyebrow: post.tags[0] ? `Blog · ${post.tags[0]}` : 'Blog' });
}
