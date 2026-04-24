const fs = require('fs');

function getPngDimensions(filePath) {
  const buf = fs.readFileSync(filePath);
  // PNG signature is 8 bytes. IHDR chunk starts at offset 8.
  // Chunk length (4 bytes), Type 'IHDR' (4 bytes).
  // Width (4 bytes) at offset 16, Height (4 bytes) at offset 20 (big-endian).
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return { width, height };
}

try {
  console.log('Stand Sheet:', getPngDimensions('./assets/characters/bruxa/bruxa-stand-sheet.png'));
  console.log('Attack Sheet:', getPngDimensions('./assets/characters/bruxa/bruxa-attack-sheet.png'));
} catch (e) {
  console.error(e.message);
}
