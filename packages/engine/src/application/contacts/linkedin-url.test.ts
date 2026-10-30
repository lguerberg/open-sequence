import { describe, expect, it } from 'vitest';
import { contactInputSchema } from './shared.js';

const parse = (linkedin_url: string) => contactInputSchema.safeParse({ linkedin_url });

describe('contact linkedin_url', () => {
  it('stores every way of writing a profile as one https URL', () => {
    for (const v of ['linkedin.com/in/dana', 'https://www.linkedin.com/in/dana/', 'http://linkedin.com/in/dana', ' www.linkedin.com/in/dana ', 'https://fr.linkedin.com/in/dana']) {
      expect(parse(v)).toMatchObject({ success: true, data: { linkedin_url: 'https://www.linkedin.com/in/dana' } });
    }
  });

  it('refuses an address that is not on linkedin.com', () => {
    expect(parse('https://linkedin.com.evil.io/in/dana').success).toBe(false);
    expect(parse('dana').success).toBe(false);
  });
});
