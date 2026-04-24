const fs = require('fs');

function getGifDimensions(filePath) {
  const buf = fs.readFileSync(filePath);
  // GIF header is usually 6 bytes (GIF87a or GIF89a)
  // Width is at offset 6, height at offset 8 (2 bytes each, little-endian)
  const width = buf.readUInt16LE(6);
  const height = buf.readUInt16LE(8);
  return { width, height };
}

try {
  console.log('Run GIF:', getGifDimensions('./assets/characters/red_mage/Red_Mage_Pixel_art_Movement_run.gif'));
  console.log('Idle GIF:', getGifDimensions('./assets/characters/red_mage/Red_Mage_Pixel_art_Movement_idle3.gif'));
  console.log('Attack GIF:', getGifDimensions('./assets/characters/red_mage/Red_Mage_Pixel_art_2h.gif'));
} catch (e) {
  console.error(e.message);
}
