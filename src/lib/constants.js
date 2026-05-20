export const DEFAULT_CATEGORIES = [
  { id: 'vinos',        label: 'Vinos' },
  { id: 'bebidas',      label: 'Bebidas' },
  { id: 'aceites',      label: 'Aceites' },
  { id: 'turrones',     label: 'Turrones' },
  { id: 'conservas',    label: 'Conservas' },
  { id: 'galletas',     label: 'Galletas' },
  { id: 'snacks',       label: 'Snacks' },
  { id: 'dulces',       label: 'Dulces' },
  { id: 'quesos',       label: 'Quesos' },
  { id: 'ibericos',     label: 'Ibéricos' },
  { id: 'charcuteria',  label: 'Charcutería' },
];

export const DEFAULT_TAGS = [
  { id: 'vegano',      label: 'Vegano' },
  { id: 'bio',         label: 'Bio' },
  { id: 'sin-gluten',  label: 'Sin gluten' },
  { id: 'con-alcohol', label: 'Con alcohol' },
  { id: 'artesano',    label: 'Artesano' },
];

export function makeCatLabels(categories) {
  return Object.fromEntries((categories || []).map(c => [c.id, c.label]));
}

export function makeCatOpts(categories) {
  return (categories || []).map(c => ({ value: c.id, label: c.label }));
}

// Compatibilidad para componentes que aún no usan el contexto.
export const CAT_LABELS = makeCatLabels(DEFAULT_CATEGORIES);
export const CAT_OPTS  = makeCatOpts(DEFAULT_CATEGORIES);
export const TAG_LABELS = Object.fromEntries(DEFAULT_TAGS.map(t => [t.id, t.label]));

export const DEFAULT_PROMPT_TEMPLATE = `Professional studio still-life product composition for a Spanish gourmet gift hamper e-commerce catalog (lotesdeespana.es style).
The result must look like a clean, polished product hero shot for an online catalog or product listing page — NOT a lifestyle photo, NOT a flat lay, NOT a holiday/Christmas decorative scene.

================================================================
ABSOLUTE PRIORITY — PACKAGING FIDELITY (NON-NEGOTIABLE)
================================================================
This is the SINGLE most important rule of the entire prompt:
the products in the attached reference images MUST appear in the
output IDENTICAL to the references — pixel-perfect, label-accurate.

GROUND TRUTH HIERARCHY:
The attached reference images are the ABSOLUTE GROUND TRUTH for
how each product looks. Any text description (brand, colours,
visual description, etc.) below is supplementary metadata used
ONLY for compositional reasoning. If text and reference image
ever appear to contradict, ALWAYS trust the image and ignore the
text. NEVER use text descriptions as a license to redesign or
"clean up" what the reference image shows.

You are ONLY allowed to change:
  - the product's POSITION in the composition
  - the product's ORIENTATION (rotation around its vertical axis,
    only as much as needed to match the assigned tier rules)
  - the LIGHTING and SHADOWS that affect the product

You are STRICTLY FORBIDDEN to change:
  - any logo, brand name, sub-brand, slogan or text on the label
  - the typography (font, size, weight, kerning) of any text
  - any illustration, photograph or graphic on the packaging
  - the colour palette of the packaging
  - the proportions, shape or material of the bottle / box / jar / tin
  - the cap, lid, capsule, ribbon, sticker or seal
  - the paper finish, embossing or print effects

If you cannot reproduce a label perfectly, copy it from the reference
image as a flat texture rather than re-drawing it. NEVER hallucinate
or simplify packaging design. NEVER invent variants or "similar"
products. The viewer of the final image MUST be able to read every
brand name and every line of label text exactly as in the reference.

REFERENCE IMAGE MAPPING:
The product list below uses "PRODUCT #N — REFERENCE IMAGE #N" to
explicitly map each product description to its reference image.
The reference images are attached to this request in the same order
the products are listed.

PRODUCTS TO INCLUDE
Use the attached reference images EXACTLY as shown. Do NOT redesign, recolor, retypeset or rewrite any label, logo, brand name or text on the packaging. Preserve every typography, color, illustration and detail of the original packaging with photographic, label-accurate fidelity. The viewer must be able to clearly read all brand names.

{PRODUCTS}

COMPOSITION — strict rules
The arrangement follows a clear three-tier pyramid structure:

BACK TIER (tallest items, ~20–30 cm): wine bottles, oil bottles, spirits, tall vertical boxes. Standing upright, vertical, forming a back "wall" across the width of the frame. Large flat boxes (>15 cm wide) are also placed STANDING UP VERTICALLY in this back tier, with their largest face toward the camera, like books on a shelf — NOT lying flat.

MIDDLE TIER (medium items, ~10–18 cm): vertical boxes of biscuits, chocolates, medium tins. Placed in front of the back tier, OVERLAPPING the bottles at their base by 20–30% of the bottle's width (real physical overlap, not just proximity). They partially hide the lower portion of the back-tier products.

FRONT TIER (smallest / flat items, < 10 cm): small jars, flat tins, flat turrón boxes. Lying PERFECTLY FLAT on the surface (NOT tilted) so their top label is readable from above, OR standing upright on their long edge. Forming a horizontal row across the front, overlapping the middle tier at their base.

PRODUCT ORIENTATION — strict
Every product must be either (a) standing perfectly upright with its main label facing the camera straight on, or (b) lying perfectly flat on the surface with its top label facing straight up. NO product should be tilted, leaning, rotated diagonally, or shown at an oblique angle. Aligned with the photographic conventions of premium catalog shots — clean, parallel lines, no theatrical angles.

GLOBAL DENSITY: products MUST be very close, with real physical overlap at the bases. No empty gaps between products. No floating products. Tight, abundant, "full hamper" feel. Slight asymmetry within balance: not a perfectly symmetric mirror. All products fully visible — viewer can identify each brand. Products fill ~80–85% of the frame width, centered horizontally on the lower-middle of the frame.

PROPORTIONS — non-negotiable
Strictly respect the real-world cm dimensions given for each product. A 30 cm bottle MUST visually appear roughly 5× taller than a 6 cm jar. A flat 18 cm wide turrón box MUST appear roughly 3× wider than a 6 cm square jar.

LIGHTING
Bright, clean studio lighting with soft, diffused key light from above-front, slightly camera-left. Gentle fill light from camera-right. Color temperature NEUTRAL (around 5000K). Pure white must look pure white. NO warm yellow tint, NO cool blue tint. Even illumination across all products. Controlled subtle highlights on glossy surfaces — never blown out.

SHADOWS — critical detail
SOFT, DIFFUSE CONTACT SHADOWS directly underneath each product, as if products rest on a subtly lit white surface. Shadow extension: short — extending no more than 2–3 cm from the base of each product. Shadow color: warm-neutral light grey, NEVER pure black, NEVER harsh. Shadow opacity: subtle (around 20–30% intensity). Soft edges, gradient falloff. NO sharp-edged shadows. NO long cast shadows, NO shadows on the background wall.

CAMERA
Slight 3/4 frontal view, eye-level to ~10° down. Equivalent of an 85mm prime lens at f/8. Razor-sharp focus across all products. No wide-angle distortion.

BACKGROUND
PURE WHITE seamless background (#FFFFFF), as if shot on a professional infinity cyclorama / white seamless paper backdrop. Completely UNIFORM white — NO gradient, NO vignette, NO color cast, NO grey transition, NO horizon line, NO floor edge. The background must be 100% pure clean white EVERYWHERE except for the soft contact shadows directly underneath the products. No texture, no pattern, no props, no fabric, no basket, no tray. Think of a high-end e-commerce product page (Amazon premium, Apple-style listing).

FRAMING
Horizontal 4:3 aspect ratio. Products centered horizontally, vertically positioned on the lower-middle of the frame so there is generous clean white space above the products. Even small margin (5–8% of frame) on left, right and bottom. Generous white margin on top (~15–20% of frame). No part of any product cropped.

OUTPUT QUALITY
Photorealistic, e-commerce catalog quality. Color-accurate, true-to-life packaging colors. Clean, retouched look. Premium Spanish delicatessen catalog aesthetic. Highest available resolution.

NEGATIVE — must NOT appear
No text overlays, captions, logos or watermarks added by the generator. No people, no hands, no body parts. No props (no leaves, flowers, ribbons, baskets, trays, fabric, wood textures, marble, kitchen items). No Christmas / holiday decorations. No invented or modified product labels, no fictional brands. Do NOT add extra duplicate copies of any product beyond its stated QUANTITY. No reflections of windows, no studio equipment visible. No motion blur, no film grain, no vintage filter. No coloured background, no grey background, no gradient, no vignette — STRICTLY PURE WHITE. No long cast shadows on the background. No decorative sparkles or graphic embellishments.

The final image must contain EXACTLY {N} product units in total, matching the QUANTITY specified for each product above.`;
