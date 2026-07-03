Icon File Instructions
======================

For the application to build properly, you need an icon file:

Windows: icon.ico
macOS: icon.icns
Linux: icon.png (512x512 or 256x256)

OPTION 1: Use an online converter
----------------------------------
1. Create or find a mixer/fader icon image (PNG, 512x512 recommended)
2. Go to https://convertico.com/ or https://icoconvert.com/
3. Upload your image
4. Download as .ico file
5. Save as: installer/icon.ico

OPTION 2: Create with GIMP (free)
----------------------------------
1. Download GIMP: https://www.gimp.org/
2. Create 512x512 image with mixer/fader icon
3. Export as .ico (Windows) or .icns (macOS)
4. Save to installer/ folder

OPTION 3: Use emoji as temporary icon
--------------------------------------
You can use an emoji converter:
1. Go to https://favicon.io/emoji-favicons/
2. Search for "control knobs" 🎛️ or "level slider" 🎚️
3. Download ICO file
4. Rename to icon.ico and place in installer/

For now, the build will use Electron's default icon if this file is missing.

Recommended Icon Design:
------------------------
- Theme: Mixer fader or control surface
- Style: Modern, flat design
- Colors: Blue/purple (matches AI theme in app)
- Elements: Fader, waveform, or mixing console silhouette
