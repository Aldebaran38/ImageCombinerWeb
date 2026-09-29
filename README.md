# ImageCombiner Web

A fast, private, and simple web application to combine multiple photos into a single clean collage image right inside your browser.

---

## Features

- **100% Client-Side & Private:** All image processing runs locally in your browser's memory using HTML5 Canvas. Your photos are never uploaded to any server.
- **Smart Balanced Layout:** Automatically calculates the cleanest grid distribution so photos are close to square and balanced.
- **Center-Crop Fit:** Automatically fits and crops photos from the center to fill cells with zero distortion or black bars.
- **Aspect Ratio & Megapixel Engine:** Select common shapes (`1:1`, `16:9`, `4:3`, `9:16`, `Custom`) and adjust resolution up to 16+ Megapixels.
- **Custom Borders, Spacing & Backgrounds:** Control outer border frames and inner gaps between photos independently, pick custom border/background colors or choose transparent.
- **Easy Reordering:** Drag-and-drop thumbnail cards or use arrow buttons to arrange your photos.
- **Export Formats:** Download as PNG (lossless), JPEG, or WEBP with quality controls.

---

## How to Run

### Option 1: Open Directly
Double-click `index.html` to open and use the application directly in any modern browser (Chrome, Firefox, Edge, Safari). No installation, Node.js, or build step required.

### Option 2: Run with a Local Server
If you prefer running a local development server:
```bash
# Python 3
python -m http.server 8000

# or Node.js / npx
npx serve
```
Then visit `http://localhost:8000` in your browser.

---

## Deployment to GitHub Pages

1. Push your repository to GitHub.
2. In your GitHub repository, navigate to **Settings** > **Pages**.
3. Under **Branch**, select `main` and root `/`, then click **Save**.
4. Your site will be live within seconds!

---

## Project Structure

```
ImageCombinerWeb/
├── index.html       # Application UI, controls, and About dialog
├── css/
│   └── style.css    # Minimalist dark theme and responsive styling
├── js/
│   ├── layout.js    # Mathematical grid layout engine
│   ├── combiner.js  # Canvas compositing and center-crop math
│   └── app.js       # User interactions, drag-and-drop, and state
├── .gitignore       # Standard ignore rules for OS and editor files
└── README.md        # Project documentation
```

---

## License

MIT License. Free for personal and commercial use.