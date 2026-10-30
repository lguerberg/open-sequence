/**
 * Module logos: the sidebar icon, the mark next to a module page's title and the overview table.
 *
 * The files live in public/logos and are never hotlinked. Gmail, Google, Model Context Protocol and
 * TypeScript come from Simple Icons (CC0-1.0, simple-icons 16.35.0); the Attio logomark from
 * attio.com/brand; the Allo app icon from withallo.com; the LinkedIn "in" bug from LinkedIn's
 * brand guidelines (brand.linkedin.com), in LinkedIn blue #0A66C2. Microsoft Outlook has no mark we can
 * redistribute, so outlook.svg is a neutral placeholder. Third-party marks only identify the
 * integration: they imply no endorsement. Email, SMS, CRM and webhooks use Lucide icons.
 *
 * Every mark sits on a white tile with a hairline border, so single-colour marks stay legible in
 * the dark theme.
 */
import { Building2, Mail, MessageSquareText, Webhook } from 'lucide-react';
import type { ReactNode } from 'react';

const files: Record<string, { src: string; alt: string }> = {
  gmail: { src: '/logos/gmail.svg', alt: 'Gmail' },
  google: { src: '/logos/google.svg', alt: 'Google Workspace' },
  outlook: { src: '/logos/outlook.svg', alt: 'Microsoft Outlook' },
  allo: { src: '/logos/allo.svg', alt: 'Allo' },
  attio: { src: '/logos/attio.svg', alt: 'Attio' },
  linkedin: { src: '/logos/linkedin.svg', alt: 'LinkedIn' },
  mcp: { src: '/logos/mcp.svg', alt: 'Model Context Protocol' },
  typescript: { src: '/logos/typescript.svg', alt: 'TypeScript' },
};

const lucide: Record<string, { Icon: typeof Mail; alt: string }> = {
  email: { Icon: Mail, alt: 'Email' },
  webhook: { Icon: Webhook, alt: 'Webhooks' },
  sms: { Icon: MessageSquareText, alt: 'SMS' },
  crm: { Icon: Building2, alt: 'CRM' },
};

export function hasLogo(name: string | undefined): name is string {
  return !!name && (name in files || name in lucide);
}

/** One mark on a white tile. `size` is the tile's side in pixels. */
export function ModuleLogo({ name, size = 20 }: { name: string; size?: number }): ReactNode {
  const pad = Math.max(2, Math.round(size / 8));
  const inner = size - pad * 2;
  const tile = 'inline-flex shrink-0 items-center justify-center rounded-[22%] border border-black/10 bg-white align-middle';
  const file = files[name];
  if (file) {
    return (
      <span className={tile} style={{ width: size, height: size }}>
        <img src={file.src} alt={file.alt} width={inner} height={inner} style={{ width: inner, height: inner }} />
      </span>
    );
  }
  const icon = lucide[name];
  if (!icon) return null;
  return (
    <span className={tile} style={{ width: size, height: size }} role="img" aria-label={icon.alt}>
      <icon.Icon style={{ width: inner, height: inner }} color="#374151" strokeWidth={2} aria-hidden />
    </span>
  );
}

/** For the page tree: an `icon` name in frontmatter or meta.json becomes a 16px tile. */
export function treeIcon(name: string | undefined): ReactNode {
  return hasLogo(name) ? <ModuleLogo name={name} size={16} /> : undefined;
}
