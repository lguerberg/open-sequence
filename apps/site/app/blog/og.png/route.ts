import { postOgPng } from '@/lib/brand-images';

export const dynamic = 'force-static';

export function GET() {
  return postOgPng({ title: 'Notes on owning your sales sequencing.', eyebrow: 'Blog' });
}
