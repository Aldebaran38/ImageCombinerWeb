# ImageCombiner Web

A simple web app to combine multiple photos and animated GIFs into a single grid image. It runs completely inside your browser, so your files are never uploaded to any server.

---

## Features

- **Private and local**: All image handling happens in your browser using HTML5 Canvas. Your photos never leave your device.
- **Mix photos and GIFs**: You can combine static images (PNG, JPG, WebP, SVG, BMP) and animated GIFs in the same grid.
- **Animation preview**: Play, pause, scrub through frames, adjust playback speed (0.5x, 1x, 2x), and set start delays to sync animations.
- **Automatic and custom layouts**: Automatically calculates a balanced grid so photos stay close to square, or pick a fixed column count (1 to 4 columns, or a single row).
- **Crop, pan, and zoom**: Images fit neatly into cells without distortion. You can drag images in the preview to pan, use Shift + mouse wheel to zoom, or use the sliders in the sidebar.
- **Text and captions**: Add top, center, or bottom captions. You can split captions across different photos using `//` (for example: `Before // After`).
- **Borders and colors**: Adjust the spacing between images and around the edges. Pick any background color or set it to transparent.
- **Custom aspect ratios**: Choose standard formats (1:1, 16:9, 9:16, 4:3, etc.) or set exact pixel dimensions. Supports high-resolution exports (up to 16+ megapixels).
- **Export formats**: Save your finished image as PNG, JPG, WebP, animated GIF, or animated WebP.

---

## How to Run

### Option 1: Open index.html (Easiest)
You do not need to install anything. Just double-click `index.html` or drag it into any modern web browser (Chrome, Firefox, Edge, Safari).

### Option 2: Run a local server
If you prefer running it through a local development server:

**With Python:**
```bash
python -m http.server 8000
```
Then open `http://localhost:8000` in your browser.

**With Node.js:**
```bash
npx serve
```


---

## Libraries Used

The app is written in plain HTML, CSS, and JavaScript without heavy frameworks. It uses a few small helper scripts:

- **omggif** (by Dean McNamee, MIT License): Reads and decodes animated GIF files in the browser.
- **gifenc** (by Matt DesLauriers, MIT License): Encodes frames into animated GIF files on export.
- **webp-muxer** (`js/libs/webp-muxer.js`): Packages frames into animated WebP files.
- **Google Fonts**: Inter, JetBrains Mono, and Newsreader for clean interface text.

---

## License

This project is licensed under the **GNU General Public License v3.0 (GPL-3.0)**. See the [LICENSE](LICENSE) file for details.

In short: you are free to use, modify, and share this software. If you share modified versions, they must also be open source under the same GPL-3.0 license.

The helper libraries in `js/libs/` (`omggif` and `gifenc`) are used under their original MIT licenses.