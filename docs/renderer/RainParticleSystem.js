/**
 * RainParticleSystem.js
 * Procedural rain particle system with wind effects
 */

export class RainParticleSystem {
  constructor(scene, THREE, bounds) {
    this.scene = scene;
    this.THREE = THREE;
    this.bounds = bounds || { width: 2000, height: 800, depth: 1000 };
    this.particleSystem = null;
    this.particleCount = 1200;
    this.particles = [];
    this.intensity = 0.5;
    this.windDirection = 25; // degrees
    this.fallSpeed = 1400; // px/s
    this.sideSpeed = 900; // px/s
    this.time = 0;
  }

  /**
   * Initialize the particle system
   */
  init(config = {}) {
    this.particleCount = config.particleCount || 1200;
    this.intensity = config.intensity !== undefined ? config.intensity : 0.5;
    this.windDirection = config.windDirection || 25;
    this.fallSpeed = config.fallSpeed || 1400;
    this.sideSpeed = config.sideSpeed || 900;

    // Create particle geometry
    const geometry = new this.THREE.BufferGeometry();
    const positions = new Float32Array(this.particleCount * 3);
    const velocities = new Float32Array(this.particleCount * 3);
    const sizes = new Float32Array(this.particleCount);
    const alphas = new Float32Array(this.particleCount);

    // Initialize particle data
    for (let i = 0; i < this.particleCount; i++) {
      const i3 = i * 3;

      // Random initial position
      positions[i3] = (Math.random() - 0.5) * this.bounds.width;
      positions[i3 + 1] = Math.random() * this.bounds.height;
      positions[i3 + 2] = (Math.random() - 0.5) * this.bounds.depth;

      // Particle properties
      const s = 0.5 + Math.random();
      sizes[i] = s * 2.0;
      alphas[i] = 0.12 + Math.random() * 0.25;

      // Store particle data for updates
      this.particles[i] = {
        size: s,
        alpha: alphas[i],
        resetY: -Math.random() * 0.2 * this.bounds.height
      };
    }

    geometry.setAttribute('position', new this.THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('size', new this.THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('alpha', new this.THREE.BufferAttribute(alphas, 1));

    // Custom shader for rain streaks
    const material = new this.THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new this.THREE.Color(0xdcebff) },
        uOpacity: { value: 1.0 }
      },
      vertexShader: `
        attribute float size;
        attribute float alpha;
        varying float vAlpha;

        void main() {
          vAlpha = alpha;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size;
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        uniform float uOpacity;
        varying float vAlpha;

        void main() {
          // Create streak effect
          vec2 coord = gl_PointCoord - vec2(0.5);
          float dist = length(coord);

          // Elongated along y-axis for streak
          float streak = 1.0 - smoothstep(0.0, 0.3, abs(coord.x));
          streak *= 1.0 - smoothstep(0.0, 0.5, coord.y);

          float alpha = streak * vAlpha * uOpacity;
          if (alpha < 0.01) discard;

          gl_FragColor = vec4(uColor, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: this.THREE.AdditiveBlending
    });

    this.particleSystem = new this.THREE.Points(geometry, material);
    this.particleSystem.renderOrder = 1000; // Render on top
    this.scene.add(this.particleSystem);
  }

  /**
   * Update particle positions
   */
  update(deltaTime) {
    if (!this.particleSystem) return;

    this.time += deltaTime;
    const dt = deltaTime;

    const positions = this.particleSystem.geometry.attributes.position.array;
    const activeCount = Math.floor(this.particleCount * this.intensity);

    const windRad = (this.windDirection * Math.PI) / 180;
    const vx = Math.cos(windRad) * this.sideSpeed;
    const vy = -this.fallSpeed; // Fall down
    const vz = Math.sin(windRad) * this.sideSpeed * 0.3; // Slight depth movement

    for (let i = 0; i < this.particleCount; i++) {
      const i3 = i * 3;

      // Only update active particles
      if (i < activeCount) {
        // Update position
        positions[i3] += vx * dt;
        positions[i3 + 1] += vy * dt;
        positions[i3 + 2] += vz * dt;

        // Wrap around bounds
        if (positions[i3] < -this.bounds.width / 2) {
          positions[i3] += this.bounds.width;
        } else if (positions[i3] > this.bounds.width / 2) {
          positions[i3] -= this.bounds.width;
        }

        if (positions[i3 + 2] < -this.bounds.depth / 2) {
          positions[i3 + 2] += this.bounds.depth;
        } else if (positions[i3 + 2] > this.bounds.depth / 2) {
          positions[i3 + 2] -= this.bounds.depth;
        }

        // Reset if below ground
        if (positions[i3 + 1] < 0) {
          positions[i3 + 1] = this.bounds.height + this.particles[i].resetY;
          positions[i3] = (Math.random() - 0.5) * this.bounds.width;
        }
      } else {
        // Hide inactive particles
        positions[i3 + 1] = -1000;
      }
    }

    this.particleSystem.geometry.attributes.position.needsUpdate = true;

    // Update material uniforms
    if (this.particleSystem.material.uniforms) {
      this.particleSystem.material.uniforms.uTime.value = this.time;
    }
  }

  /**
   * Set rain intensity (0 to 1)
   */
  setIntensity(intensity) {
    this.intensity = Math.max(0, Math.min(1, intensity));
  }

  /**
   * Set wind direction in degrees
   */
  setWindDirection(degrees) {
    this.windDirection = degrees;
  }

  /**
   * Set visibility
   */
  setVisible(visible) {
    if (this.particleSystem) {
      this.particleSystem.visible = visible;
    }
  }

  /**
   * Dispose of the particle system
   */
  dispose() {
    if (this.particleSystem) {
      this.scene.remove(this.particleSystem);
      if (this.particleSystem.geometry) {
        this.particleSystem.geometry.dispose();
      }
      if (this.particleSystem.material) {
        this.particleSystem.material.dispose();
      }
      this.particleSystem = null;
    }
  }
}
