/**
 * CandleLight.js
 * Creates a trapezoidal frustum geometry that glows like a candle
 */

/**
 * Create a trapezoidal frustum geometry
 * @param {Object} THREE - Three.js library reference
 * @param {Object} options - Configuration options
 * @returns {THREE.Mesh} The candle light mesh
 */
export function createCandleLight(THREE, options = {}) {
  const {
    topWidth = 0.3,
    topDepth = 0.3,
    bottomWidth = 0.2,
    bottomDepth = 0.2,
    height = 0.5,
    color = 0xffbb66, // Orangy pale yellow
    emissiveIntensity = 0.8,
    opacity = 0.7
  } = options;

  // Create vertices for a trapezoidal frustum
  // Top face (larger)
  const hw_top = topWidth / 2;
  const hd_top = topDepth / 2;

  // Bottom face (smaller)
  const hw_bottom = bottomWidth / 2;
  const hd_bottom = bottomDepth / 2;
  const h_half = height / 2;

  const vertices = new Float32Array([
    // Bottom face (y = -h_half)
    -hw_bottom, -h_half, -hd_bottom,  // 0
     hw_bottom, -h_half, -hd_bottom,  // 1
     hw_bottom, -h_half,  hd_bottom,  // 2
    -hw_bottom, -h_half,  hd_bottom,  // 3

    // Top face (y = h_half)
    -hw_top, h_half, -hd_top,  // 4
     hw_top, h_half, -hd_top,  // 5
     hw_top, h_half,  hd_top,  // 6
    -hw_top, h_half,  hd_top   // 7
  ]);

  const indices = new Uint16Array([
    // Bottom face
    0, 2, 1,
    0, 3, 2,

    // Top face
    4, 5, 6,
    4, 6, 7,

    // Front face
    0, 1, 5,
    0, 5, 4,

    // Back face
    2, 3, 7,
    2, 7, 6,

    // Left face
    3, 0, 4,
    3, 4, 7,

    // Right face
    1, 2, 6,
    1, 6, 5
  ]);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();

  // Create material with emissive properties
  // Use MeshBasicMaterial for better performance and no lighting dependency
  const material = new THREE.MeshBasicMaterial({
    color: color,
    transparent: true,
    opacity: opacity,
    side: THREE.DoubleSide
  });

  // Store emissive properties for day/night system
  material.emissive = new THREE.Color(color);
  material.emissiveIntensity = emissiveIntensity;

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'candleLight';

  return mesh;
}

/**
 * Create a simple cylindrical candle light (alternative shape)
 * @param {Object} THREE - Three.js library reference
 * @param {Object} options - Configuration options
 * @returns {THREE.Mesh} The candle light mesh
 */
export function createCylindricalCandleLight(THREE, options = {}) {
  const {
    radiusTop = 0.15,
    radiusBottom = 0.1,
    height = 0.5,
    radialSegments = 8,
    color = 0xffbb66,
    emissiveIntensity = 0.8,
    opacity = 0.7
  } = options;

  const geometry = new THREE.CylinderGeometry(
    radiusTop,
    radiusBottom,
    height,
    radialSegments
  );

  const material = new THREE.MeshStandardMaterial({
    color: color,
    emissive: color,
    emissiveIntensity: emissiveIntensity,
    transparent: true,
    opacity: opacity
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'candleLight';

  return mesh;
}

/**
 * Create a candle light with a point light for extra glow
 * @param {Object} THREE - Three.js library reference
 * @param {Object} options - Configuration options
 * @returns {THREE.Group} Group containing mesh and point light
 */
export function createCandleLightWithGlow(THREE, options = {}) {
  const {
    lightColor = 0xffaa44,
    lightIntensity = 2,
    lightDistance = 3,
    lightDecay = 2
  } = options;

  const group = new THREE.Group();
  group.name = 'candleLightGroup';

  // Create the frustum mesh
  const candleMesh = createCandleLight(THREE, options);
  group.add(candleMesh);

  // Create a point light for glow effect
  const pointLight = new THREE.PointLight(
    lightColor,
    lightIntensity,
    lightDistance,
    lightDecay
  );
  pointLight.position.set(0, options.height / 4 || 0.125, 0);
  pointLight.name = 'candlePointLight';
  group.add(pointLight);

  // Store reference to light for day/night toggling
  group.userData.pointLight = pointLight;

  return group;
}

/**
 * Helper to create multiple candle lights in a pattern
 * @param {Object} THREE - Three.js library reference
 * @param {Array} positions - Array of {x, y, z} positions
 * @param {Object} options - Configuration options
 * @returns {THREE.Group} Group containing all candle lights
 */
export function createCandleLightArray(THREE, positions, options = {}) {
  const group = new THREE.Group();
  group.name = 'candleLightArray';

  for (let i = 0; i < positions.length; i++) {
    const pos = positions[i];
    const candle = options.withGlow
      ? createCandleLightWithGlow(THREE, options)
      : createCandleLight(THREE, options);

    candle.position.set(pos.x, pos.y, pos.z);
    group.add(candle);
  }

  return group;
}
