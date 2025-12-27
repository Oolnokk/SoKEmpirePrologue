// TextureUtils.js - Stub for GLTFExporter compatibility
// This is a simplified version that doesn't decompress compressed textures

/**
 * Decompresses a compressed texture if needed.
 * For basic exports without compressed textures, this just returns the input.
 *
 * @param {Texture} texture - The texture to decompress
 * @param {number} maxTextureSize - Optional max texture size
 * @returns {Texture} The decompressed texture (or original if not compressed)
 */
export function decompress(texture, maxTextureSize) {
	// If texture is not compressed, return as-is
	if (!texture || !texture.isCompressedTexture) {
		return texture;
	}

	// For compressed textures, we would need to decompress them here
	// For now, just return the original and log a warning
	console.warn('GLTFExporter: Compressed textures are not fully supported in this build. Texture may not export correctly.');

	return texture;
}
