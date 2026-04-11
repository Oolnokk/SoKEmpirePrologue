// Stub for TextureUtils - decompress is only needed for KTX2/compressed textures.
// Standard PNG/JPG textures pass through unchanged.
export function decompress( texture, maxTextureSize ) {
  return texture;
}
