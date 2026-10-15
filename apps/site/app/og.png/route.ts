import { ogPng } from '@/lib/brand-images';

export const dynamic = 'force-static';

export function GET() {
  return ogPng();
}
