/**
 * WeatherPlaneManager.js
 * Manages weather planes (sky, clouds, jungle) for atmospheric effects
 */

export class WeatherPlaneManager {
  constructor(scene, THREE, textureLoader, sceneBounds = null) {
    this.scene = scene;
    this.THREE = THREE;
    this.textureLoader = textureLoader;
    this.planes = new Map(); // id -> { mesh, config, animation }
    this.time = 0;

    // Scene bounds for auto-sizing weather planes
    // If not provided, use sensible defaults
    this.sceneBounds = sceneBounds || {
      minX: -1000,
      maxX: 1000,
      minZ: -500,
      maxZ: 500,
      spanX: 2000,
      spanZ: 1000
    };
  }

  /**
   * Create a sky background plane with gradient
   * Auto-sizes to span the entire scene bounds
   */
  async createSkyPlane(config, position, scale) {
    const { gradient } = config.extraConfig || {};

    // Auto-size to span the scene with margin
    const margin = 1.5; // Extend beyond scene bounds
    const width = this.sceneBounds.spanX * margin;
    const height = 1800; // Fixed vertical size

    // Create canvas texture with gradient
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, gradient?.top || '#0b1430');
    grad.addColorStop(0.6, gradient?.middle || '#5fa0d0');
    grad.addColorStop(1, gradient?.bottom || '#e6eef5');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Add subtle sun halo
    const r = canvas.width * 0.62;
    const halo = ctx.createRadialGradient(
      canvas.width / 2, canvas.height * 0.30, 0,
      canvas.width / 2, canvas.height * 0.30, r
    );
    halo.addColorStop(0, 'rgba(255,255,255,0.33)');
    halo.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const texture = new this.THREE.CanvasTexture(canvas);
    const material = new this.THREE.MeshBasicMaterial({
      map: texture,
      transparent: false,
      side: this.THREE.DoubleSide,
      depthWrite: false
    });

    const geometry = new this.THREE.PlaneGeometry(width * scale.x, height * scale.y);
    const mesh = new this.THREE.Mesh(geometry, material);

    mesh.position.set(position.x, position.y, position.z);
    mesh.renderOrder = -1000; // Render first

    return mesh;
  }

  /**
   * Create a cloud plane with texture and breathing animation
   * Auto-sizes to span the scene bounds
   */
  async createCloudPlane(config, position, scale) {
    const texture = await this.textureLoader.load(config.imagePath);
    texture.wrapS = this.THREE.RepeatWrapping;
    texture.wrapT = this.THREE.RepeatWrapping;

    const material = new this.THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      side: this.THREE.DoubleSide,
      depthWrite: false,
      opacity: 1.0
    });

    // Auto-size to span the scene with margin
    const margin = 1.3;
    const aspectRatio = texture.image.width / texture.image.height;
    const baseWidth = this.sceneBounds.spanX * margin;
    const width = baseWidth * scale.x;
    const height = (baseWidth / aspectRatio) * scale.y;

    const geometry = new this.THREE.PlaneGeometry(width, height);
    const mesh = new this.THREE.Mesh(geometry, material);

    mesh.position.set(position.x, position.y, position.z);
    mesh.renderOrder = -500;

    // Flip if needed
    if (config.extraConfig?.flipX) {
      mesh.scale.x *= -1;
    }

    return {
      mesh,
      animation: config.extraConfig?.breathe ? {
        type: 'breathe',
        seed: Math.random() * 100,
        baseScale: { x: mesh.scale.x, y: mesh.scale.y }
      } : null
    };
  }

  /**
   * Create jungle foliage plane with wiggle shader
   * Auto-sizes to span the scene bounds
   */
  async createJunglePlane(config, position, scale) {
    const texture = await this.textureLoader.load(config.imagePath);
    texture.wrapS = this.THREE.RepeatWrapping;
    texture.wrapT = this.THREE.RepeatWrapping;

    const wiggleAmount = config.extraConfig?.wiggleAmount || 0.55;
    const wiggleHeight = config.extraConfig?.wiggleHeight || 0.55;

    // Custom shader for wiggle effect
    const material = new this.THREE.ShaderMaterial({
      uniforms: {
        uTexture: { value: texture },
        uTime: { value: 0 },
        uWiggleAmount: { value: wiggleAmount },
        uWiggleHeight: { value: wiggleHeight },
        uWindDirection: { value: new this.THREE.Vector2(1, 0.35) }
      },
      vertexShader: `
        varying vec2 vUv;
        varying float vWiggleFactor;
        uniform float uTime;
        uniform float uWiggleAmount;
        uniform float uWiggleHeight;
        uniform vec2 uWindDirection;

        void main() {
          vUv = uv;

          // Calculate wiggle based on UV.y (top of texture wiggles more)
          float topWeight = uWiggleHeight > 0.0001 ?
            clamp((uWiggleHeight - uv.y) / uWiggleHeight, 0.0, 1.0) : 0.0;

          // Simple sine wave for wiggle
          float phase = uTime * 1.5 + uv.y * 8.0;
          float wave = sin(phase) + 0.35 * sin(phase * 2.1 + 1.7);

          // Apply wiggle offset
          float wiggleOffset = uWiggleAmount * 20.0 * topWeight * wave;
          vec3 pos = position;
          pos.x += wiggleOffset * uWindDirection.x;
          pos.y += wiggleOffset * uWindDirection.y * 0.35;

          vWiggleFactor = topWeight;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D uTexture;
        varying vec2 vUv;
        varying float vWiggleFactor;

        void main() {
          vec4 texColor = texture2D(uTexture, vUv);
          gl_FragColor = texColor;
        }
      `,
      transparent: true,
      side: this.THREE.DoubleSide,
      depthWrite: false
    });

    // Auto-size to span the scene with margin
    const margin = 1.3;
    const aspectRatio = texture.image.width / texture.image.height;
    const baseWidth = this.sceneBounds.spanX * margin;
    const width = baseWidth * scale.x;
    const height = (baseWidth / aspectRatio) * scale.y;

    const geometry = new this.THREE.PlaneGeometry(width, height, 32, 32); // More segments for wiggle
    const mesh = new this.THREE.Mesh(geometry, material);

    mesh.position.set(position.x, position.y, position.z);
    mesh.renderOrder = 200;

    return {
      mesh,
      animation: config.extraConfig?.wiggle ? {
        type: 'wiggle',
        material
      } : null
    };
  }

  /**
   * Add a weather plane to the scene
   */
  async addWeatherPlane(id, config, instanceConfig) {
    const baseScale = config.baseScale || { x: 1, y: 1, z: 1 };
    const instanceScale = {
      x: baseScale.x * (instanceConfig.scaleX || 1),
      y: baseScale.y * (instanceConfig.scaleY || 1),
      z: baseScale.z * (instanceConfig.scaleZ || 1)
    };

    const position = {
      x: instanceConfig.offsetX || 0,
      y: (config.yOffset || 0) + (instanceConfig.offsetY || 0),
      z: config.zDepth || 0
    };

    let planeData;

    switch (config.weatherType) {
      case 'sky':
        const skyMesh = await this.createSkyPlane(config, position, instanceScale);
        planeData = { mesh: skyMesh, animation: null };
        break;

      case 'cloud':
        planeData = await this.createCloudPlane(config, position, instanceScale);
        break;

      case 'jungle':
        planeData = await this.createJunglePlane(config, position, instanceScale);
        break;

      default:
        console.warn(`Unknown weather type: ${config.weatherType}`);
        return;
    }

    this.scene.add(planeData.mesh);
    this.planes.set(id, { ...planeData, config });
  }

  /**
   * Update animations
   */
  update(deltaTime, windDirection = 25) {
    this.time += deltaTime;

    const windRad = (windDirection * Math.PI) / 180;
    const windVec = new this.THREE.Vector2(Math.cos(windRad), Math.sin(windRad));

    for (const [id, planeData] of this.planes) {
      const { mesh, animation } = planeData;

      if (!animation) continue;

      if (animation.type === 'breathe') {
        // Subtle breathing animation for clouds
        const { seed, baseScale } = animation;
        const a = 0.012;
        const scale = 1.0 +
          a * Math.sin(this.time * 0.35 + seed) +
          (a * 0.6) * Math.sin(this.time * 0.62 + seed * 1.7);

        mesh.scale.x = baseScale.x * scale;
        mesh.scale.y = baseScale.y * scale;

        // Micro-translation
        const b = 10;
        mesh.position.x += b * Math.sin(this.time * 0.18 + seed * 2.2) * deltaTime;
        mesh.position.y += (b * 0.65) * Math.sin(this.time * 0.21 + seed * 1.3) * deltaTime;
      }

      if (animation.type === 'wiggle' && animation.material) {
        // Update shader time
        animation.material.uniforms.uTime.value = this.time;
        animation.material.uniforms.uWindDirection.value = windVec;
      }
    }
  }

  /**
   * Set wind direction for all jungle planes
   */
  setWindDirection(degrees) {
    const windRad = (degrees * Math.PI) / 180;
    const windVec = new this.THREE.Vector2(Math.cos(windRad), Math.sin(windRad));

    for (const [id, planeData] of this.planes) {
      if (planeData.animation?.type === 'wiggle' && planeData.animation.material) {
        planeData.animation.material.uniforms.uWindDirection.value = windVec;
      }
    }
  }

  /**
   * Remove a weather plane
   */
  removePlane(id) {
    const planeData = this.planes.get(id);
    if (planeData) {
      this.scene.remove(planeData.mesh);
      if (planeData.mesh.geometry) planeData.mesh.geometry.dispose();
      if (planeData.mesh.material) {
        if (planeData.mesh.material.map) planeData.mesh.material.map.dispose();
        planeData.mesh.material.dispose();
      }
      this.planes.delete(id);
    }
  }

  /**
   * Clear all weather planes
   */
  clear() {
    for (const id of this.planes.keys()) {
      this.removePlane(id);
    }
  }
}
