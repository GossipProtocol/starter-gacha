/* ─────────────────────────────────────────────────────────────────────────
   THRIFT MACHINE — house inventory seed (~40 real-feeling vintage tees).
   We own all of it (source: 'house'). estValue is set at intake; rarity +
   value bands roughly track the tier table in config.ts so every tier can
   resolve a pull. Drop real flat-lay JPEGs into /public/tees and list them
   in `images` to replace the vector placeholder per piece.
   ───────────────────────────────────────────────────────────────────────── */

import type { Category, Rarity, Size, Tee } from './types';

function t(
  id: string,
  name: string,
  brand: string,
  era: string,
  category: Category,
  size: Size,
  rarity: Rarity,
  grade: number,
  estValue: number,
  origin?: string
): Tee {
  return {
    id, name, brand, era, category, size, rarity, grade, estValue,
    images: [], source: 'house', status: 'available', origin,
  };
}

export const SEED_TEES: Tee[] = [
  // ── Music ───────────────────────────────────────────────────────────────
  t('m-01', 'Nirvana Smiley Tee', 'Giant Tag', "'92", 'music', 'L', 'rare', 8.5, 120, 'Single-stitch'),
  t('m-02', 'Metallica · And Justice For All', 'Brockum', "'88", 'music', 'XL', 'uncommon', 7.5, 95, 'Made in USA'),
  t('m-03', 'Grateful Dead · Steal Your Face', 'Brockum', "'87", 'music', 'M', 'rare', 8.0, 240, 'Single-stitch'),
  t('m-04', 'Pink Floyd · Dark Side', 'Brockum', "'94", 'music', 'L', 'uncommon', 8.5, 80),
  t('m-05', 'Tupac · All Eyez On Me', 'Death Row', "'96", 'music', 'XL', 'epic', 7.0, 520),
  t('m-06', 'Wu-Tang Forever', 'Wu Wear', "'97", 'music', 'XXL', 'rare', 7.5, 300),
  t('m-07', 'Nine Inch Nails · Self Destruct', 'Giant Tag', "'94", 'music', 'M', 'uncommon', 8.0, 110),
  t('m-08', 'Rolling Stones · Tongue', 'Brockum', "'89", 'music', 'L', 'common', 7.0, 60, 'Single-stitch'),
  t('m-09', 'The Beatles · Abbey Road', 'Apple Corps', "'95", 'music', 'S', 'common', 8.0, 45),
  t('m-10', 'Misfits · Fiend Club', 'Fruit of the Loom', "'95", 'music', 'M', 'rare', 6.5, 180),

  // ── College / Sports ─────────────────────────────────────────────────────
  t('sp-01', 'Bulls · 1996 Champions', 'Starter', "'96", 'sports', 'XL', 'uncommon', 8.0, 130),
  t('sp-02', 'Bulls · Three-Peat', 'Salem Sportswear', "'93", 'sports', 'L', 'rare', 7.5, 220, 'Single-stitch'),
  t('sp-03', 'Champion Reverse Weave Blank', 'Champion', "'85", 'sports', 'L', 'common', 7.0, 70, 'Made in USA'),
  t('sp-04', 'NY Yankees · Logo', 'Nutmeg Mills', "'96", 'sports', 'M', 'common', 7.5, 55),
  t('sp-05', 'Cowboys · Super Bowl XXVII', 'Salem Sportswear', "'93", 'sports', 'XL', 'uncommon', 8.0, 95),
  t('sp-06', 'Jordan · "Air" Caricature', 'Nike Gray Tag', "'90", 'sports', 'L', 'epic', 7.0, 480, 'Single-stitch'),
  t('sp-07', 'LA Raiders · Script', 'Nutmeg Mills', "'91", 'sports', 'XXL', 'uncommon', 7.5, 140),
  t('sp-08', 'Penn State · Nittany Lions', 'Champion', "'88", 'sports', 'M', 'common', 7.0, 60),
  t('sp-09', "USA '94 World Cup", 'Apex One', "'94", 'sports', 'L', 'rare', 8.0, 160),
  t('sp-10', 'Michigan · Fab Five', 'Nike Gray Tag', "'92", 'sports', 'XL', 'rare', 7.5, 260),

  // ── Designer ─────────────────────────────────────────────────────────────
  t('d-01', 'Dior · Saddle Promo', 'Dior', "'00", 'designer', 'M', 'epic', 8.5, 900),
  t('d-02', 'Margiela · AIDS Charity Tee', 'Maison Margiela', "'04", 'designer', 'L', 'grail', 8.0, 2200),
  t('d-03', 'Raf Simons · Riot Riot Riot', 'Raf Simons', "'01", 'designer', 'M', 'grail', 7.0, 5200),
  t('d-04', 'Versace · Medusa', 'Gianni Versace', "'94", 'designer', 'L', 'epic', 7.5, 760),
  t('d-05', 'Helmut Lang · Bondage', 'Helmut Lang', "'98", 'designer', 'M', 'rare', 8.0, 420),
  t('d-06', 'JPG · Cyberbaba Mesh', 'Jean Paul Gaultier', "'95", 'designer', 'S', 'epic', 7.0, 1200),
  t('d-07', 'CdG · PLAY Heart', 'Comme des Garçons', "'10", 'designer', 'L', 'rare', 9.0, 200),
  t('d-08', 'Vivienne Westwood · Orb', 'Vivienne Westwood', "'05", 'designer', 'M', 'uncommon', 8.0, 240),
  t('d-09', 'Yohji Yamamoto · Pour Homme', 'Yohji Yamamoto', "'99", 'designer', 'L', 'rare', 8.0, 360),
  t('d-10', 'Number (N)ine · Hi-Standard', 'Number (N)ine', "'03", 'designer', 'M', 'epic', 7.5, 1100),

  // ── Surprise Me ──────────────────────────────────────────────────────────
  t('su-01', 'Harley-Davidson · Eagle', 'Harley-Davidson', "'92", 'surprise', 'XXL', 'uncommon', 7.0, 120, 'Single-stitch'),
  t('su-02', 'NASCAR · Earnhardt #3', 'Chase Authentics', "'98", 'surprise', 'XL', 'rare', 7.5, 150),
  t('su-03', 'Jurassic Park · Promo', 'Stanley Desantis', "'93", 'surprise', 'L', 'epic', 7.0, 600, 'Single-stitch'),
  t('su-04', 'Coca-Cola · Polar Bear', 'Coca-Cola', "'95", 'surprise', 'M', 'common', 7.5, 40),
  t('su-05', 'Looney Tunes · Taz', 'Acme Clothing', "'94", 'surprise', 'L', 'uncommon', 7.0, 90),
  t('su-06', 'Crazy Shirts · Hawaii', 'Crazy Shirts', "'88", 'surprise', 'L', 'common', 7.5, 65),
  t('su-07', 'Grand Canyon · Souvenir', 'Hanes', "'90", 'surprise', 'S', 'common', 7.0, 30),
  t('su-08', 'Universal Monsters · Frankenstein', 'Universal', "'91", 'surprise', 'M', 'rare', 7.0, 200, 'Single-stitch'),
  t('su-09', 'Big Dogs · Graphic', 'Big Dogs', "'96", 'surprise', 'XL', 'common', 7.0, 35),
  t('su-10', 'Mighty Ducks · Movie Promo', 'Disney', "'92", 'surprise', 'M', 'uncommon', 7.5, 110),
];
