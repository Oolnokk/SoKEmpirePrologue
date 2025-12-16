/**
 * Test for 3D Lighting System
 * Validates that the lighting methods exist and work correctly
 */

const { Renderer, isSupported } = require('../src/renderer/Renderer.js');

// Mock THREE.js for testing (since we're in Node environment)
const mockTHREE = {
  Scene: class Scene {
    constructor() {
      this.children = [];
      this.background = null;
    }
    add(obj) { this.children.push(obj); }
    remove(obj) {
      const idx = this.children.indexOf(obj);
      if (idx > -1) this.children.splice(idx, 1);
    }
  },
  PerspectiveCamera: class PerspectiveCamera {
    constructor(fov, aspect, near, far) {
      this.fov = fov;
      this.aspect = aspect;
      this.near = near;
      this.far = far;
      this.position = { x: 0, y: 0, z: 0, set: function(x, y, z) { this.x = x; this.y = y; this.z = z; } };
      this.rotation = { x: 0, y: 0, z: 0 };
      this.isPerspectiveCamera = true;
    }
    lookAt(x, y, z) {}
    updateProjectionMatrix() {}
  },
  WebGLRenderer: class WebGLRenderer {
    constructor(options) {
      this.domElement = { style: {} };
      this.shadowMap = { enabled: false, type: null };
    }
    setPixelRatio(ratio) {}
    setSize(width, height) {}
    render(scene, camera) {}
    dispose() {}
  },
  Color: class Color {
    constructor(color) {
      this.color = color;
    }
  },
  AmbientLight: class AmbientLight {
    constructor(color, intensity) {
      this.color = color;
      this.intensity = intensity;
      this.isLight = true;
    }
  },
  DirectionalLight: class DirectionalLight {
    constructor(color, intensity) {
      this.color = color;
      this.intensity = intensity;
      this.position = { x: 0, y: 0, z: 0, set: function(x, y, z) { this.x = x; this.y = y; this.z = z; } };
      this.castShadow = false;
      this.shadow = {
        mapSize: { width: 0, height: 0 },
        camera: { near: 0, far: 0, left: 0, right: 0, top: 0, bottom: 0 }
      };
      this.isLight = true;
    }
  },
  PointLight: class PointLight {
    constructor(color, intensity, distance, decay) {
      this.color = color;
      this.intensity = intensity;
      this.distance = distance;
      this.decay = decay;
      this.position = { x: 0, y: 0, z: 0, set: function(x, y, z) { this.x = x; this.y = y; this.z = z; } };
      this.castShadow = false;
      this.shadow = {
        mapSize: { width: 0, height: 0 }
      };
      this.isLight = true;
    }
  },
  PCFSoftShadowMap: 2
};

describe('3D Lighting System', () => {
  let renderer;

  beforeEach(() => {
    // Mock global THREE
    global.THREE = mockTHREE;
    global.globalThis = global;
    
    renderer = new Renderer({ container: null, width: 800, height: 600 });
  });

  afterEach(() => {
    if (renderer) {
      renderer.dispose();
    }
    delete global.THREE;
  });

  test('Renderer initializes with lighting support', async () => {
    await renderer.init();
    
    expect(renderer.initialized).toBe(true);
    expect(renderer.lights).toBeDefined();
    expect(renderer.lights.ambient).toBeNull();
    expect(renderer.lights.directional).toBeNull();
    expect(renderer.lights.point).toEqual([]);
  });

  test('enableLighting creates ambient and directional lights', async () => {
    await renderer.init();
    
    renderer.enableLighting({
      ambientIntensity: 0.4,
      directionalIntensity: 0.8
    });
    
    expect(renderer.lightingEnabled).toBe(true);
    expect(renderer.lights.ambient).toBeDefined();
    expect(renderer.lights.ambient.intensity).toBe(0.4);
    expect(renderer.lights.directional).toBeDefined();
    expect(renderer.lights.directional.intensity).toBe(0.8);
    expect(renderer.scene.children).toContain(renderer.lights.ambient);
    expect(renderer.scene.children).toContain(renderer.lights.directional);
  });

  test('enableLighting with custom colors', async () => {
    await renderer.init();
    
    renderer.enableLighting({
      ambientColor: 0x404060,
      directionalColor: 0xfff8e7
    });
    
    expect(renderer.lights.ambient.color).toBe(0x404060);
    expect(renderer.lights.directional.color).toBe(0xfff8e7);
  });

  test('enableLighting enables shadows when requested', async () => {
    await renderer.init();
    
    renderer.enableLighting({
      castShadows: true
    });
    
    expect(renderer.lights.directional.castShadow).toBe(true);
    expect(renderer.lights.directional.shadow.mapSize.width).toBe(2048);
    expect(renderer.lights.directional.shadow.mapSize.height).toBe(2048);
  });

  test('disableLighting removes all lights', async () => {
    await renderer.init();
    
    renderer.enableLighting();
    expect(renderer.lightingEnabled).toBe(true);
    expect(renderer.lights.ambient).not.toBeNull();
    
    renderer.disableLighting();
    expect(renderer.lightingEnabled).toBe(false);
    expect(renderer.lights.ambient).toBeNull();
    expect(renderer.lights.directional).toBeNull();
    expect(renderer.lights.point).toEqual([]);
  });

  test('addPointLight creates point light with defaults', async () => {
    await renderer.init();
    
    const pointLight = renderer.addPointLight();
    
    expect(pointLight).toBeDefined();
    expect(pointLight.intensity).toBe(1.0);
    expect(pointLight.color).toBe(0xffffcc);
    expect(pointLight.distance).toBe(10);
    expect(pointLight.decay).toBe(2);
    expect(renderer.lights.point).toContain(pointLight);
    expect(renderer.scene.children).toContain(pointLight);
  });

  test('addPointLight with custom parameters', async () => {
    await renderer.init();
    
    const pointLight = renderer.addPointLight({
      color: 0xff0000,
      intensity: 2.0,
      distance: 20,
      decay: 1,
      position: { x: 5, y: 10, z: 3 }
    });
    
    expect(pointLight.color).toBe(0xff0000);
    expect(pointLight.intensity).toBe(2.0);
    expect(pointLight.distance).toBe(20);
    expect(pointLight.decay).toBe(1);
    expect(pointLight.position.x).toBe(5);
    expect(pointLight.position.y).toBe(10);
    expect(pointLight.position.z).toBe(3);
  });

  test('removePointLight removes light from scene', async () => {
    await renderer.init();
    
    const pointLight = renderer.addPointLight();
    expect(renderer.lights.point).toContain(pointLight);
    
    renderer.removePointLight(pointLight);
    expect(renderer.lights.point).not.toContain(pointLight);
    expect(renderer.scene.children).not.toContain(pointLight);
  });

  test('multiple point lights can be added', async () => {
    await renderer.init();
    
    const light1 = renderer.addPointLight({ intensity: 1.0 });
    const light2 = renderer.addPointLight({ intensity: 2.0 });
    const light3 = renderer.addPointLight({ intensity: 0.5 });
    
    expect(renderer.lights.point.length).toBe(3);
    expect(renderer.lights.point).toContain(light1);
    expect(renderer.lights.point).toContain(light2);
    expect(renderer.lights.point).toContain(light3);
  });

  test('updateMaterialsForLighting method exists', async () => {
    await renderer.init();
    
    expect(typeof renderer.updateMaterialsForLighting).toBe('function');
  });

  test('shadow map is enabled in renderer', async () => {
    await renderer.init();
    
    expect(renderer.renderer.shadowMap.enabled).toBe(true);
    expect(renderer.renderer.shadowMap.type).toBe(mockTHREE.PCFSoftShadowMap);
  });
});

// Run tests if this file is executed directly
if (require.main === module) {
  console.log('Running lighting system tests...\n');
  
  // Simple test runner
  const tests = [
    'Renderer initializes with lighting support',
    'enableLighting creates ambient and directional lights',
    'enableLighting with custom colors',
    'enableLighting enables shadows when requested',
    'disableLighting removes all lights',
    'addPointLight creates point light with defaults',
    'addPointLight with custom parameters',
    'removePointLight removes light from scene',
    'multiple point lights can be added',
    'updateMaterialsForLighting method exists',
    'shadow map is enabled in renderer'
  ];
  
  console.log(`✓ All ${tests.length} test cases defined`);
  console.log('\nTest suite ready. Run with Jest or another test runner.');
  console.log('Example: npm test tests/lighting-system.test.js');
}
