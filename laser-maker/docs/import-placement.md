# Import Placement & Scaling

How Laser Maker places SVG and raster files when you import them.

## SVG Import

SVG files are never scaled. Whatever size they were designed at, they arrive at that exact size.

**If the SVG matches the canvas size (36 × 24 inches by default):**
The shapes land exactly where they were drawn. A box at 2 inches from the top-left in Illustrator appears at 2 inches from the top-left in Laser Maker. This is intentional — students and teachers can design precise parts in Illustrator and import them with confidence that nothing has shifted.

**If the SVG has a different size, or no defined size:**
The shapes are placed with their top-left corner at the canvas origin (0, 0). Nothing is scaled.

**Illustrator SVGs without explicit dimensions:**
Illustrator sometimes exports SVGs with no `width`/`height` attributes — only a `viewBox`. Illustrator's internal unit is the point (72 pt = 1 inch), so a 36 × 24 inch artboard produces `viewBox="0 0 2592 1728"`. Laser Maker detects this and treats the viewBox numbers as points, converting them correctly to inches. A 36 × 24 artboard still matches the canvas and shapes still land at their designed coordinates.

**Drag-and-drop SVG:**
- Matching canvas size → same as button import; drop point is ignored, natural coordinates are preserved.
- Non-matching size → top-left of the SVG lands at your drop cursor.

## Raster Image Import (Photos & Graphics)

Raster images (PNG, JPG, GIF, WebP, BMP) are capped at **4 inches on the longest side**. If the image is smaller than 4 inches, it arrives at its natural size. If it's larger, it is scaled down proportionally.

This prevents huge phone photos from flooding the canvas — a 4000-pixel photo would otherwise be over 40 inches wide, far larger than the laser table.

**Button import:** Image lands with its top-left at the canvas origin (0, 0).

**Drag-and-drop import:** Image is centered on the drop cursor.

## Canvas Size

The default canvas matches the Epilog Fusion Edge 36 laser table: **36 × 24 inches**. Students can change this in the status bar. The "matches canvas" check for SVG import uses whatever the current canvas dimensions are, not the hardcoded 36 × 24 default.
