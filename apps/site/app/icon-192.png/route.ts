import { iconPng } from '@/lib/brand-images';

export const dynamic = 'force-static';

export function GET() {
  return iconPng(192);
}
