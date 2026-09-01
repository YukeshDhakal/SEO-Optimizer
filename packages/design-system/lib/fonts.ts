import { cn } from '@repo/design-system/lib/utils';
import { Archivo_Black, Space_Grotesk } from 'next/font/google';

// Body font (Space Grotesk) and display/heading font (Archivo Black) per
// the neobrutalism handoff (Quillrun Neobrutalism.dc.html's <helmet> font
// import). Archivo Black ships exactly one weight (900) — that's the
// entire point of the family, not an oversight.
const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-space-grotesk',
  display: 'swap',
});

const archivoBlack = Archivo_Black({
  subsets: ['latin'],
  weight: ['400'],
  variable: '--font-archivo-black',
  display: 'swap',
});

export const fonts = cn(
  spaceGrotesk.variable,
  archivoBlack.variable,
  'touch-manipulation font-sans antialiased'
);
