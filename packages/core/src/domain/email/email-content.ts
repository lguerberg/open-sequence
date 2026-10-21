import { htmlToText } from './html-to-text.js';
import { assertEmailMessageSize, extractInlineImages, type InlineImage } from './inline-images.js';

/** What an email step hands the provider: the text part, and for html emails the HTML and its inline images. */
export interface EmailContent {
  text: string;
  html?: string;
  inlineImages?: InlineImage[];
}

/**
 * The parts of a rendered email (signature already inserted). An html body has its base64 images
 * moved to inline parts referenced by `cid:`, and gets a text twin with images as [alt]; hosted
 * images stay as written. Throws EmailContentError IMAGE_TOO_LARGE or MESSAGE_TOO_LARGE.
 */
export function emailContent(rendered: string, opts: { html: boolean; idSuffix: string }): EmailContent {
  if (!opts.html) {
    assertEmailMessageSize({ text: rendered });
    return { text: rendered };
  }
  const { html, images } = extractInlineImages(rendered, { idSuffix: opts.idSuffix });
  const content: EmailContent = { text: htmlToText(html), html };
  if (images.length) content.inlineImages = images;
  assertEmailMessageSize({ html, text: content.text, images });
  return content;
}
