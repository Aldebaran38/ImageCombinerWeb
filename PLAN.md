# ImageCombiner Web — Implementation Plan

A minimalist, high-performance web version of the ImageCombiner desktop application. Designed to run completely client-side in the browser with zero server dependencies, ready for instant deployment on GitHub Pages or Cloudflare Pages.

---

## 1. Architectural Decisions

- **Tech Stack:** Plain HTML5, CSS3, and modern Vanilla JavaScript (ES6+).
  - No Node.js, npm, or build step required.
  - Can be opened directly in any browser (`index.html`) or pushed to GitHub / Cloudflare Pages.
- **Hosting / Backend:**
  - 100% Client-Side. Images never leave the user's computer.
  - Zero server costs, zero bandwidth bills, maximum privacy.
- **Theme & Aesthetic:**
  - Minimalist dark/neutral gray styling (`#18181b`, `#27272a`, `#3f3f46`, `#e4e4e7`).
  - Clean typography, smooth transitions, and distraction-free workspace.
- **Header:**
  - **Left:** "ImageCombiner" logo / branding.
  - **Right:** "About" button.
- **About Section:**
  - Clean modal/dialog overlay that explains all processing is local and private.
  - Does not navigate away from the page, preserving any uploaded images and settings.

---

## 2. Core Features & Controls

### A. Image Upload & Queue
- **Dropzone & File Picker:** Supports dragging & dropping or browsing multiple image files (PNG, JPG, WEBP, BMP, GIF, SVG).
- **Visual Thumbnail Queue:** Displays uploaded images as thumbnail cards.
- **Reordering & Removal:**
  - Drag-and-drop card reordering for an intuitive web experience.
  - Up and Down arrow buttons on each card as an accessible alternative.
  - Remove button on each image card.
  - "Clear All" button to reset the list.

### B. Canvas Dimensions (Aspect Ratio + Megapixel Engine)
- **Aspect Ratio Dropdown:**
  - `1:1` (Square — default)
  - `2:3` (Portrait)
  - `3:2` (Landscape)
  - `3:4` (Portrait)
  - `4:3` (Landscape)
  - `16:9` (Widescreen)
  - `9:16` (Story / Vertical)
  - `21:9` (Ultrawide)
  - `9:21` (Tall Portrait)
  - `Custom` (Manual width and height inputs)
- **Megapixel (MP) Input:**
  - Float number input (default: `2.0` MP).
  - Automatically calculates target pixel width and height:
    $$\text{height} = \text{round}\left(\sqrt{\frac{\text{MP} \times 1,000,000}{\text{aspect\_ratio}}}\right)$$
    $$\text{width} = \text{round}\left(\text{height} \times \text{aspect\_ratio}\right)$$
  - Real-time indicator displaying the exact calculated resolution (e.g., `1414 × 1414 px`).

### C. Gaps and Colors
- **Gap Size Slider:** 0 px to 100 px (real-time live update).
- **Background / Gap Color Picker:** Standard color input with quick presets (Black `#000000`, White `#ffffff`, Transparent, Slate Gray `#27272a`).

### D. Grid Layout Engine (Ported from `layout_engine.py`)
- Evaluates distributions of rows and columns to find aspect ratios closest to 1:1.
- Distributes pixel remainders cleanly so there are no sub-pixel gaps or seams.

### E. Image Compositing (Ported from `combiner.py`)
- **Center-Crop Fill:** Replicates `center_crop_fit`. Scales images to completely cover the grid cell and crops from the center, guaranteeing no black bars or aspect ratio distortion.
- Uses HTML5 Canvas `drawImage(img, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight)` for hardware-accelerated, crystal-clear rendering.

### F. Real-Time Live Preview & Export
- **Live Preview:** Canvas updates automatically whenever photos are added, removed, reordered, or settings change.
- **Export Options:**
  - Generates full target resolution output using an off-screen canvas.
  - Format selector: **PNG** (lossless default), **JPEG** (with quality slider), and **WEBP**.
  - One-click "Download Combined Image" button.

---

## 3. Project File Structure
```
ImageCombinerWeb/
├── index.html          # Application structure, controls, preview canvas, and About modal
├── css/
│   └── style.css       # Minimalist dark-gray theme, responsive layout, drag-and-drop styles
├── js/
│   ├── layout.js       # Mathematical grid layout engine (translated from layout_engine.py)
│   ├── combiner.js     # Canvas drawing, center-crop calculations, and image export
│   └── app.js          # UI event listeners, drag-and-drop queue, modal toggle, state management
└── PLAN.md             # This implementation plan
```

---

## 4. Execution Phases

### Phase 1: Foundation & Layout
- Create `index.html` structure with header, split workspace (Controls on left/top, Canvas Preview on right/bottom), and the hidden About modal.
- Create `css/style.css` implementing the minimalist gray palette and responsive design.

### Phase 2: Math & Image Engine
- Port `layout_engine.py` into `js/layout.js`.
- Port `combiner.py` into `js/combiner.js` with canvas drawing and center-crop math.
- Implement the Aspect Ratio + Megapixels calculator.

### Phase 3: Interactivity & Upload Queue
- Build drag-and-drop file upload zone in `js/app.js`.
- Render thumbnail cards with drag-reordering, up/down arrow buttons, and delete buttons.
- Connect sliders, color pickers, and ratio selectors to trigger live canvas re-renders.

### Phase 4: Export & Polish
- Wire the high-resolution download button for PNG, JPEG, and WEBP.
- Test edge cases (single image, odd numbers of images, huge resolutions, mobile screens).
