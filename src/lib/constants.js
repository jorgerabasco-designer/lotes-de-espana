export const CAT_LABELS = {
  vinos: 'Vinos',
  aceites: 'Aceites',
  turrones: 'Turrones',
  conservas: 'Conservas',
  galletas: 'Galletas',
  snacks: 'Snacks',
  dulces: 'Dulces',
};

export const CAT_OPTS = Object.entries(CAT_LABELS).map(([value, label]) => ({ value, label }));

export const TAG_LABELS = {
  vegano: 'Vegano',
  bio: 'Bio',
  'sin-gluten': 'Sin gluten',
  'con-alcohol': 'Con alcohol',
  artesano: 'Artesano',
};

export const DEFAULT_PROMPT_TEMPLATE = `Professional studio still-life product composition for a Spanish gourmet gift hamper e-commerce catalog (lotesdeespana.es style).
The result must look like a clean, polished product hero shot for an online catalog or product listing page — NOT a lifestyle photo, NOT a flat lay, NOT a holiday/Christmas decorative scene.

PRODUCTS TO INCLUDE
Use the attached reference images EXACTLY as shown. Do NOT redesign, recolor, retypeset or rewrite any label, logo, brand name or text on the packaging. Preserve every typography, color, illustration and detail of the original packaging with photographic, label-accurate fidelity. The viewer must be able to clearly read all brand names.

{PRODUCTS}

COMPOSITION — strict rules
The arrangement follows a clear three-tier pyramid structure:

BACK TIER (tallest items, ~20–30 cm): wine bottles, oil bottles, spirits, tall vertical boxes. Standing upright, vertical, forming a back "wall" across the width of the frame. Large flat boxes (>15 cm wide) are also placed STANDING UP VERTICALLY in this back tier, with their largest face toward the camera, like books on a shelf — NOT lying flat.

MIDDLE TIER (medium items, ~10–18 cm): vertical boxes of biscuits, chocolates, medium tins. Placed in front of the back tier, OVERLAPPING the bottles at their base by 20–30% of the bottle's width (real physical overlap, not just proximity). They partially hide the lower portion of the back-tier products.

FRONT TIER (smallest / flat items, < 10 cm): small jars, flat tins, flat turrón boxes. Lying flat or slightly tilted toward the camera (10–15° tilt) so the top label is readable. Forming a horizontal row across the front, overlapping the middle tier at their base.

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
No text overlays, captions, logos or watermarks added by the generator. No people, no hands, no body parts. No props (no leaves, flowers, ribbons, baskets, trays, fabric, wood textures, marble, kitchen items). No Christmas / holiday decorations. No invented or modified product labels, no fictional brands. No duplicated products (each reference appears exactly once). No reflections of windows, no studio equipment visible. No motion blur, no film grain, no vintage filter. No coloured background, no grey background, no gradient, no vignette — STRICTLY PURE WHITE. No long cast shadows on the background. No decorative sparkles or graphic embellishments.

The final image must contain EXACTLY {N} products, one of each reference listed above. No more, no less.`;
