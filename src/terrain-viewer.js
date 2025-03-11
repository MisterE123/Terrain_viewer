/**
 * TerrainViewer class
 * Renders the terrain using THREE.js with voxel-based visualization, LOD (Level of Detail),
 * improved controls and advanced shading.
 */

import * as THREE from 'three';
import { showToast } from './utils';

// Vertex shader for voxel terrain
const voxelVertexShader = `
varying vec3 vPosition;
varying vec3 vNormal;
varying vec3 vColor;
varying vec2 vUv;

void main() {
  vPosition = position;
  vNormal = normal;
  vColor = color;
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// Fragment shader for voxel terrain with improved shading
const voxelFragmentShader = `
varying vec3 vPosition;
varying vec3 vNormal;
varying vec3 vColor;
varying vec2 vUv;

uniform bool wireframe;
uniform float gridStrength;
uniform vec3 lightDir;
uniform vec3 viewPosition;
uniform float ambientStrength;
uniform float diffuseStrength;
uniform float specularStrength;
uniform float shininess;

void main() {
  // Basic lighting calculation
  vec3 normal = normalize(vNormal);
  vec3 light = normalize(lightDir);
  
  // Ambient light component
  float ambient = ambientStrength;
  
  // Diffuse light component
  float diffuse = max(0.0, dot(normal, light)) * diffuseStrength;
  
  // Specular component (Blinn-Phong)
  vec3 viewDir = normalize(viewPosition - vPosition);
  vec3 halfwayDir = normalize(light + viewDir);
  float spec = pow(max(dot(normal, halfwayDir), 0.0), shininess);
  float specular = spec * specularStrength;
  
  // Combined lighting
  float lighting = ambient + diffuse + specular;
  
  // Apply lighting to color
  vec3 litColor = vColor * lighting;
  
  // Grid overlay for voxel edges when wireframe is enabled
  if (wireframe) {
    // Calculate distance to nearest voxel edge
    // We use modulo 1 (fract) to get the position within each unit cube
    vec3 grid = abs(fract(vPosition) - 0.5);
    float line = max(max(grid.x, grid.y), grid.z);
    
    // Apply grid overlay - black grid lines
    if (line > (1.0 - gridStrength)) {
      // Edge detected - make it black
      gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    } else {
      // Normal voxel face
      gl_FragColor = vec4(litColor, 1.0);
    }
  } else {
    // Normal rendering without grid
    gl_FragColor = vec4(litColor, 1.0);
  }
}
`;

// Water shader
const waterVertexShader = `
varying vec2 vUv;
varying vec3 vPosition;
varying vec3 vNormal;

void main() {
  vUv = uv;
  vPosition = position;
  vNormal = normal;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const waterFragmentShader = `
varying vec2 vUv;
varying vec3 vPosition;
varying vec3 vNormal;

uniform float time;
uniform vec3 waterColor;
uniform vec3 viewPosition;
uniform vec3 lightDir;

void main() {
  // Wave effect
  float wave1 = sin(vPosition.x * 0.1 + time * 0.5) * 0.5 + 0.5;
  float wave2 = sin(vPosition.z * 0.1 + time * 0.3) * 0.5 + 0.5;
  float waves = (wave1 + wave2) * 0.5;
  
  // Base water color
  vec3 color = waterColor;
  
  // Add wave highlights
  color = mix(color, vec3(1.0, 1.0, 1.0), waves * 0.1);
  
  // Reflective properties
  vec3 viewDir = normalize(viewPosition - vPosition);
  vec3 normal = normalize(vNormal);
  float fresnel = pow(1.0 - max(dot(viewDir, normal), 0.0), 3.0);
  
  // Add fresnel effect (more reflective at glancing angles)
  color = mix(color, vec3(0.9, 0.9, 1.0), fresnel * 0.5);
  
  // Lighting
  float diffuse = max(dot(normal, normalize(lightDir)), 0.0);
  float ambient = 0.5;
  float lighting = ambient + diffuse * 0.5;
  
  // Specular highlight
  vec3 reflectDir = reflect(-normalize(lightDir), normal);
  float spec = pow(max(dot(viewDir, reflectDir), 0.0), 32.0);
  vec3 specColor = vec3(1.0, 1.0, 1.0) * spec * 0.3;
  
  gl_FragColor = vec4(color * lighting + specColor, 0.8); // Semi-transparent
}
`;

class TerrainViewer {
  constructor(nodeGraph, canvas) {
    this.nodeGraph = nodeGraph;
    this.canvas = canvas;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.clock = new THREE.Clock();
    this.resolution = 64;
    this.scale = 256;
    this.wireframe = false;
    this.gridStrength = 0.05; // Width of voxel grid lines
    this.terrainMesh = null;
    this.waterMesh = null;
    this.terrainMaterial = null;
    this.renderMode = 'shader'; // 'shader', 'voxel', or 'surface'
    this.showWireframe = false;
    this.useShader = true;
    this.showWater = true;
    this.lodLevels = 3; // Number of LOD levels
    this.lodSettings = {
      threshold1: 500,  // Distance threshold for LOD level 1
      threshold2: 1000, // Distance threshold for LOD level 2
      maxDistance: 5000 // Maximum render distance
    };
    
    // Camera settings
    this.cameraHeight = 120;
    this.cameraTilt = 45; // degrees
    
    // Lighting settings
    this.lightingParams = {
      ambientStrength: 0.3,
      diffuseStrength: 0.7,
      specularStrength: 0.2,
      shininess: 30
    };
    
    // Controls state
    this.controlsState = {
      moveForward: false,
      moveBackward: false,
      moveLeft: false,
      moveRight: false,
      moveUp: false,
      moveDown: false,
      run: false
    };
    
    // Camera physics
    this.cameraVelocity = new THREE.Vector3(0, 0, 0);
    this.cameraAcceleration = 0.2;
    this.cameraDrag = 0.9;
    this.cameraMaxSpeed = 2;
    this.cameraRunMultiplier = 2.5;
    
    // Mouse look
    this.mouseLook = {
      enabled: false,
      sensitivity: 0.2,
      pitch: 0,
      yaw: 0
    };
    
    // LDO groups to manage different detail levels
    this.lodGroups = [];
    
    this.setupThree();
    this.setupAdvancedControls();
    this.setupControls();
    this.addKeyboardHelp();
    this.addLODIndicator();
    this.updateTerrain();
    this.animate();
  }
  
  /**
   * Add keyboard controls help UI element
   */
  addKeyboardHelp() {
    const keysHelp = document.createElement('div');
    keysHelp.className = 'keys-help';
    
    keysHelp.innerHTML = `
      <div><span class="key">W</span><span class="key">A</span><span class="key">S</span><span class="key">D</span> - Move camera</div>
      <div><span class="key">Space</span> - Move up</div>
      <div><span class="key">Shift</span> - Run faster</div>
      <div><span class="key">C</span> - Center camera</div>
      <div><span class="key">R</span> - Regenerate terrain</div>
      <div>Mouse drag - Look around</div>
      <div>Mouse wheel - Zoom</div>
    `;
    
    const terrainViewer = document.getElementById('terrain-viewer');
    terrainViewer.appendChild(keysHelp);
  }
  
  /**
   * Add LOD level indicator
   */
  addLODIndicator() {
    const lodIndicator = document.createElement('div');
    lodIndicator.className = 'lod-indicator';
    lodIndicator.textContent = 'LOD: Auto';
    lodIndicator.id = 'lod-indicator';
    
    const terrainViewer = document.getElementById('terrain-viewer');
    terrainViewer.appendChild(lodIndicator);
  }
  
  /**
   * Set up the Three.js scene and renderer
   */
  setupThree() {
    // Create scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87CEEB); // Sky blue background
    this.scene.fog = new THREE.FogExp2(0x87CEEB, 0.0007); // Add distance fog
    
    // Create camera
    const aspect = this.canvas.clientWidth / this.canvas.clientHeight;
    this.camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 10000);
    
    // Center camera over terrain
    this.centerCamera();
    
    // Create renderer with antialiasing
    this.renderer = new THREE.WebGLRenderer({ 
      canvas: this.canvas, 
      antialias: true,
      alpha: true
    });
    this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    
    // Add lights
    const ambientLight = new THREE.AmbientLight(0x606060);
    this.scene.add(ambientLight);
    
    // Main directional light (sun)
    const directionalLight = new THREE.DirectionalLight(0xffffaa, 0.8);
    directionalLight.position.set(1, 1, 0.5);
    directionalLight.castShadow = true;
    
    // Configure shadow properties
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = this.scale * 3;
    directionalLight.shadow.camera.left = -this.scale;
    directionalLight.shadow.camera.right = this.scale;
    directionalLight.shadow.camera.top = this.scale;
    directionalLight.shadow.camera.bottom = -this.scale;
    
    this.sun = directionalLight;
    this.scene.add(directionalLight);
    
    // Secondary fill light
    const fillLight = new THREE.DirectionalLight(0xaaccff, 0.3);
    fillLight.position.set(-1, 0.5, -1);
    this.scene.add(fillLight);
    
    // Create "sky" using a large sphere with shader material
    this.createSkyDome();
    
    // Add coordinate axes helper with appropriate scale
    const axesHelper = new THREE.AxesHelper(this.scale / 4);
    this.scene.add(axesHelper);
    
    // Create LOD groups for different detail levels
    this.createLODGroups();
    
    // Handle resize
    window.addEventListener('resize', () => {
      const viewerElement = document.getElementById('terrain-viewer');
      if (viewerElement && viewerElement.style.display === 'none') return;
      
      const newWidth = this.canvas.clientWidth;
      const newHeight = this.canvas.clientHeight;
      this.camera.aspect = newWidth / newHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(newWidth, newHeight);
    });
  }
  
  /**
   * Create sky dome using a large sphere with gradient shader
   */
  createSkyDome() {
    const skyGeometry = new THREE.SphereGeometry(this.scale * 10, 32, 32);
    // Flip the sphere inside out
    skyGeometry.scale(-1, 1, 1);
    
    const skyMaterial = new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: new THREE.Color(0x0077ff) },
        bottomColor: { value: new THREE.Color(0xffffff) },
        offset: { value: 33 },
        exponent: { value: 0.6 }
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform float offset;
        uniform float exponent;
        
        varying vec3 vWorldPosition;
        
        void main() {
          float h = normalize(vWorldPosition + offset).y;
          gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
        }
      `,
      side: THREE.BackSide
    });
    
    const sky = new THREE.Mesh(skyGeometry, skyMaterial);
    this.scene.add(sky);
  }
  
  /**
   * Create LOD groups for different detail levels
   */
  createLODGroups() {
    // Clear existing LOD groups
    this.lodGroups.forEach(group => {
      if (group.parent) group.parent.remove(group);
    });
    
    this.lodGroups = [];
    
    // Create groups for each LOD level
    for (let i = 0; i < this.lodLevels; i++) {
      const group = new THREE.Group();
      group.name = `LOD-${i}`;
      this.scene.add(group);
      this.lodGroups.push(group);
    }
  }
  
  /**
   * Set up advanced camera controls (WASD + mouse look)
   */
  setupAdvancedControls() {
    // Keyboard controls
    window.addEventListener('keydown', (e) => {
      this.updateControlState(e.code, true);
    });
    
    window.addEventListener('keyup', (e) => {
      this.updateControlState(e.code, false);
    });
    
    // Mouse controls for looking around
    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) { // Left mouse button
        this.mouseLook.enabled = true;
        
        // Hide cursor when in mouse look mode
        this.canvas.style.cursor = 'none';
        
        // Save initial mouse position
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
        
        // Request pointer lock for smoother mouse movement
        this.canvas.requestPointerLock = this.canvas.requestPointerLock ||
                                        this.canvas.mozRequestPointerLock ||
                                        this.canvas.webkitRequestPointerLock;
        this.canvas.requestPointerLock();
      }
    });
    
    // Handle pointer lock change
    document.addEventListener('pointerlockchange', this.handlePointerLockChange.bind(this));
    document.addEventListener('mozpointerlockchange', this.handlePointerLockChange.bind(this));
    document.addEventListener('webkitpointerlockchange', this.handlePointerLockChange.bind(this));
    
    // Mouse movement for looking around
    document.addEventListener('mousemove', (e) => {
      if (!this.mouseLook.enabled) return;
      
      let movementX, movementY;
      
      if (document.pointerLockElement === this.canvas ||
          document.mozPointerLockElement === this.canvas ||
          document.webkitPointerLockElement === this.canvas) {
        // Pointer is locked, use movement
        movementX = e.movementX || e.mozMovementX || e.webkitMovementX || 0;
        movementY = e.movementY || e.mozMovementY || e.webkitMovementY || 0;
      } else {
        // Fallback if pointer lock isn't available
        movementX = e.clientX - this.lastMouseX;
        movementY = e.clientY - this.lastMouseY;
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
      }
      
      // Update camera orientation
      this.updateCameraRotation(movementX, movementY);
    });
    
    // Mouse up to stop looking around
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) { // Left mouse button
        this.mouseLook.enabled = false;
        this.canvas.style.cursor = 'default';
        
        // Exit pointer lock
        document.exitPointerLock = document.exitPointerLock ||
                                 document.mozExitPointerLock ||
                                 document.webkitExitPointerLock;
        document.exitPointerLock();
      }
    });
    
    // Prevent context menu on right click
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    
    // Mouse wheel for zoom
    this.canvas.addEventListener('wheel', (e) => {
      const zoomSpeed = 0.1;
      const delta = -Math.sign(e.deltaY) * zoomSpeed * this.scale / 10;
      
      // Move camera forward/backward in its looking direction
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
      this.camera.position.addScaledVector(forward, delta);
    });
  }
  
  /**
   * Handle pointer lock change events
   */
  handlePointerLockChange() {
    if (document.pointerLockElement !== this.canvas &&
        document.mozPointerLockElement !== this.canvas &&
        document.webkitPointerLockElement !== this.canvas) {
      // Pointer lock was exited
      this.mouseLook.enabled = false;
      this.canvas.style.cursor = 'default';
    }
  }
  
  /**
   * Update camera rotation based on mouse movement
   */
  updateCameraRotation(movementX, movementY) {
    this.mouseLook.yaw -= movementX * this.mouseLook.sensitivity * 0.01;
    this.mouseLook.pitch -= movementY * this.mouseLook.sensitivity * 0.01;
    
    // Clamp pitch to avoid flipping
    this.mouseLook.pitch = Math.max(-Math.PI/2 + 0.1, Math.min(Math.PI/2 - 0.1, this.mouseLook.pitch));
    
    // Apply rotation
    this.camera.rotation.order = 'YXZ'; // Important for proper FPS camera behavior
    this.camera.rotation.x = this.mouseLook.pitch;
    this.camera.rotation.y = this.mouseLook.yaw;
  }
  
  /**
   * Update control state based on key press/release
   */
  updateControlState(code, pressed) {
    switch (code) {
      case 'KeyW':
        this.controlsState.moveForward = pressed;
        break;
      case 'KeyS':
        this.controlsState.moveBackward = pressed;
        break;
      case 'KeyA':
        this.controlsState.moveLeft = pressed;
        break;
      case 'KeyD':
        this.controlsState.moveRight = pressed;
        break;
      case 'Space':
        this.controlsState.moveUp = pressed;
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        this.controlsState.run = pressed;
        break;
      case 'KeyC':
        if (pressed) this.centerCamera();
        break;
      case 'KeyR':
        if (pressed) this.updateTerrain();
        break;
    }
  }
  
  /**
   * Update camera position based on control state
   */
  updateCameraPosition(deltaTime) {
    // Reset acceleration
    const acceleration = new THREE.Vector3(0, 0, 0);
    
    // Set movement speed based on run state
    const speed = this.controlsState.run ? 
      this.cameraAcceleration * this.cameraRunMultiplier : 
      this.cameraAcceleration;
    
    // Calculate movement direction in local camera space
    if (this.controlsState.moveForward) {
      acceleration.z -= speed;
    }
    if (this.controlsState.moveBackward) {
      acceleration.z += speed;
    }
    if (this.controlsState.moveLeft) {
      acceleration.x -= speed;
    }
    if (this.controlsState.moveRight) {
      acceleration.x += speed;
    }
    if (this.controlsState.moveUp) {
      acceleration.y += speed;
    }
    if (this.controlsState.moveDown) {
      acceleration.y -= speed;
    }
    
    // Convert local acceleration to world space
    const worldAcceleration = acceleration.clone().applyQuaternion(this.camera.quaternion);
    
    // Update velocity with acceleration and drag
    this.cameraVelocity.add(worldAcceleration);
    this.cameraVelocity.multiplyScalar(this.cameraDrag);
    
    // Limit maximum speed
    const maxSpeed = this.controlsState.run ? 
      this.cameraMaxSpeed * this.cameraRunMultiplier * deltaTime * 60 : 
      this.cameraMaxSpeed * deltaTime * 60;
    
    if (this.cameraVelocity.length() > maxSpeed) {
      this.cameraVelocity.normalize().multiplyScalar(maxSpeed);
    }
    
    // Apply velocity to position
    this.camera.position.add(this.cameraVelocity);
  }
  
  /**
   * Set up the UI controls
   */
  setupControls() {
    // Resolution control
    document.getElementById('resolution').addEventListener('change', (e) => {
      this.resolution = parseInt(e.target.value);
      this.updateTerrain();
    });
    
    // Wireframe control
    document.getElementById('wireframe').addEventListener('change', (e) => {
      this.wireframe = e.target.checked;
      this.updateWireframeState();
    });
    
    // Center view button
    document.getElementById('btn-center').addEventListener('click', () => {
      this.centerCamera();
    });
    
    // Scale presets
    document.querySelectorAll('.scale-preset').forEach(btn => {
      btn.addEventListener('click', () => {
        this.scale = parseInt(btn.dataset.scale);
        this.updateTerrain();
        this.centerCamera();
      });
    });
    
    // Add render mode selector to HTML
    this.addRenderModeControl();
    
    // Add water toggle control
    this.addWaterToggleControl();
    
    // Add grid strength slider for voxel grid lines
    this.addGridStrengthControl();
    
    // Add lighting controls
    this.addLightingControls();
    
    // Handle window resize
    window.addEventListener('resize', () => {
      if (this.renderer && this.camera) {
        const aspect = this.canvas.clientWidth / this.canvas.clientHeight;
        this.camera.aspect = aspect;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
      }
    });
  }
  
  /**
   * Add water toggle control to UI
   */
  addWaterToggleControl() {
    // Check if control already exists
    if (document.getElementById('water-toggle')) return;
    
    // Create the water toggle control
    const controlRow = document.createElement('div');
    controlRow.className = 'control-row';
    
    const label = document.createElement('label');
    label.textContent = 'Show Water:';
    controlRow.appendChild(label);
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = 'water-toggle';
    checkbox.checked = this.showWater;
    
    checkbox.addEventListener('change', (e) => {
      this.showWater = e.target.checked;
      if (this.waterMesh) {
        this.waterMesh.visible = this.showWater;
      } else if (this.showWater) {
        this.addWaterPlane();
      }
    });
    
    controlRow.appendChild(checkbox);
    
    // Add to the viewer controls
    const wireframeRow = document.querySelector('#wireframe').closest('.control-row');
    if (wireframeRow && wireframeRow.nextElementSibling) {
      const controlsContainer = document.querySelector('.viewer-controls');
      controlsContainer.insertBefore(controlRow, wireframeRow.nextElementSibling);
    }
  }
  
  /**
   * Add lighting controls to UI
   */
  addLightingControls() {
    // Check if controls already exist
    if (document.getElementById('light-controls')) return;
    
    // Create container for lighting controls
    const lightSection = document.createElement('div');
    lightSection.id = 'light-controls';
    lightSection.className = 'control-section';
    
    const heading = document.createElement('h3');
    heading.textContent = 'Lighting';
    heading.style.margin = '10px 0 5px 0';
    heading.style.fontSize = '14px';
    lightSection.appendChild(heading);
    
    // Create controls for each lighting parameter
    const lightParams = [
      { id: 'ambient-strength', name: 'Ambient', min: 0, max: 1, step: 0.05, param: 'ambientStrength' },
      { id: 'diffuse-strength', name: 'Diffuse', min: 0, max: 1, step: 0.05, param: 'diffuseStrength' },
      { id: 'specular-strength', name: 'Specular', min: 0, max: 1, step: 0.05, param: 'specularStrength' },
      { id: 'shininess', name: 'Shininess', min: 1, max: 100, step: 1, param: 'shininess' }
    ];
    
    lightParams.forEach(param => {
      const controlRow = document.createElement('div');
      controlRow.className = 'control-row';
      
      const label = document.createElement('label');
      label.textContent = `${param.name}:`;
      label.style.minWidth = '80px';
      controlRow.appendChild(label);
      
      const slider = document.createElement('input');
      slider.type = 'range';
      slider.id = param.id;
      slider.min = param.min;
      slider.max = param.max;
      slider.step = param.step;
      slider.value = this.lightingParams[param.param];
      
      slider.addEventListener('input', (e) => {
        this.lightingParams[param.param] = parseFloat(e.target.value);
        this.updateShaderUniforms();
      });
      
      controlRow.appendChild(slider);
      lightSection.appendChild(controlRow);
    });
    
    // Add to the viewer controls
    const controlsContainer = document.querySelector('.viewer-controls');
    if (controlsContainer) {
      controlsContainer.appendChild(lightSection);
    }
  }
  
  /**
   * Update shader uniforms with current lighting parameters
   */
  updateShaderUniforms() {
    // Update shader material uniforms if using shader mode
    if (this.terrainMaterial && this.terrainMaterial.uniforms) {
      this.terrainMaterial.uniforms.ambientStrength.value = this.lightingParams.ambientStrength;
      this.terrainMaterial.uniforms.diffuseStrength.value = this.lightingParams.diffuseStrength;
      this.terrainMaterial.uniforms.specularStrength.value = this.lightingParams.specularStrength;
      this.terrainMaterial.uniforms.shininess.value = this.lightingParams.shininess;
      
      // Update view position for specular highlights
      this.terrainMaterial.uniforms.viewPosition.value.copy(this.camera.position);
    }
    
    // Update water shader if present
    if (this.waterMesh && this.waterMesh.material.uniforms) {
      this.waterMesh.material.uniforms.viewPosition.value.copy(this.camera.position);
    }
  }
  
  /**
   * Add grid strength control for voxel grid lines
   */
  addGridStrengthControl() {
    // Check if control already exists
    if (document.getElementById('grid-strength')) return;
    
    // Create the grid strength control
    const controlRow = document.createElement('div');
    controlRow.className = 'control-row';
    
    const label = document.createElement('label');
    label.textContent = 'Grid Strength:';
    controlRow.appendChild(label);
    
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.id = 'grid-strength';
    slider.min = '0';
    slider.max = '0.2';
    slider.step = '0.01';
    slider.value = this.gridStrength;
    
    slider.addEventListener('input', (e) => {
      this.gridStrength = parseFloat(e.target.value);
      
      // Update shader uniform if applicable
      if (this.terrainMaterial && 
          this.terrainMaterial.uniforms && 
          this.terrainMaterial.uniforms.gridStrength) {
        this.terrainMaterial.uniforms.gridStrength.value = this.gridStrength;
      }
    });
    
    controlRow.appendChild(slider);
    
    // Add to the viewer controls after wireframe checkbox
    const wireframeRow = document.querySelector('#wireframe').closest('.control-row');
    if (wireframeRow && wireframeRow.nextElementSibling) {
      const controlsContainer = document.querySelector('.viewer-controls');
      controlsContainer.insertBefore(controlRow, wireframeRow.nextElementSibling);
    }
  }
  
  /**
   * Add render mode control to the UI
   */
  addRenderModeControl() {
    // Check if the control already exists
    if (document.getElementById('render-mode')) return;
    
    // Create the render mode control
    const controlRow = document.createElement('div');
    controlRow.className = 'control-row';
    
    const label = document.createElement('label');
    label.textContent = 'Render Mode:';
    controlRow.appendChild(label);
    
    const modeSelect = document.createElement('select');
    modeSelect.id = 'render-mode';
    
    const modes = [
      { value: 'shader', text: 'Shader (Voxel)' },
      { value: 'surface', text: 'Surface' },
      { value: 'voxel', text: 'Voxel (Box)' }
    ];
    
    modes.forEach(mode => {
      const option = document.createElement('option');
      option.value = mode.value;
      option.textContent = mode.text;
      if (mode.value === this.renderMode) {
        option.selected = true;
      }
      modeSelect.appendChild(option);
    });
    
    modeSelect.addEventListener('change', (e) => {
      this.renderMode = e.target.value;
      this.updateTerrain();
    });
    
    controlRow.appendChild(modeSelect);
    
    // Add to the viewer controls
    const controlsContainer = document.querySelector('.viewer-controls');
    if (controlsContainer) {
      controlsContainer.insertBefore(controlRow, controlsContainer.firstChild.nextSibling);
    }
  }
  
  /**
   * Center the camera view on the terrain
   */
  centerCamera() {
    // Position camera in center of terrain, elevated and looking down at an angle
    const centerX = this.scale / 2;
    const centerZ = this.scale / 2;
    
    // Set camera position at an elevation with some distance
    this.camera.position.set(
      centerX - Math.sin(Math.PI/4) * this.cameraHeight * 1.5,
      this.cameraHeight,
      centerZ + Math.cos(Math.PI/4) * this.cameraHeight * 1.5
    );
    
    // Calculate yaw and pitch for looking at center
    const direction = new THREE.Vector3(centerX, 0, centerZ).sub(this.camera.position);
    
    // Set yaw (horizontal rotation)
    this.mouseLook.yaw = Math.atan2(-direction.x, -direction.z);
    
    // Set pitch (vertical rotation)
    const horizontalDistance = Math.sqrt(direction.x * direction.x + direction.z * direction.z);
    this.mouseLook.pitch = Math.atan2(direction.y, horizontalDistance);
    
    // Apply rotation
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.x = this.mouseLook.pitch;
    this.camera.rotation.y = this.mouseLook.yaw;
    
    // Reset velocity
    this.cameraVelocity.set(0, 0, 0);
  }
  
  /**
   * Generate a 3D voxel grid from the node graph with LOD
   * @returns {Object} voxelData - Contains terrainGrid (3D array) and colorMap (lookup)
   */
  generateVoxelData() {
    const step = this.scale / this.resolution;
    const outputNode = this.nodeGraph.getOutputNode();
    
    // Create 3D grid to store terrain data
    const terrainGrid = new Array(this.resolution + 1);
    for (let x = 0; x <= this.resolution; x++) {
      terrainGrid[x] = new Array(this.resolution + 1);
      for (let y = 0; y <= this.resolution; y++) {
        terrainGrid[x][y] = new Array(this.resolution + 1).fill(null);
      }
    }
    
    // Cache terrain types
    const terrainNodes = this.nodeGraph.nodes.filter(node => node.type === 'terrain-type');
    const terrainTypes = {};
    const defaultColor = '#66aa66'; // Default green
    
    terrainNodes.forEach(node => {
      terrainTypes[node.id] = {
        name: node.params.name,
        type: node.params.type,
        color: node.params.color || defaultColor
      };
    });
    
    // Evaluate voxels at each point
    console.log(`Generating voxel data with resolution ${this.resolution}`);
    showToast(`Generating voxel terrain...`, 'info');
    
    // Color map to avoid duplicate colors in geometry
    const colorMap = {};
    let colorIndex = 0;
    
    // Use dynamic resolution based on scale
    let actualResolution;
    if (this.scale > 2000) {
      actualResolution = Math.min(this.resolution, 32);
    } else if (this.scale > 1000) {
      actualResolution = Math.min(this.resolution, 48);
    } else {
      actualResolution = this.resolution;
    }
    
    // Scan through the 3D grid with step size
    let waterLevel = 0;
    
    for (let xi = 0; xi <= actualResolution; xi++) {
      // Show progress every 10% for large resolutions
      if (actualResolution > 32 && xi % Math.floor(actualResolution / 10) === 0) {
        console.log(`Voxel generation: ${Math.floor(xi / actualResolution * 100)}% complete`);
      }
      
      const worldX = (xi / actualResolution) * this.scale;
      
      for (let yi = 0; yi <= actualResolution; yi++) {
        const worldY = (yi / actualResolution) * this.scale;
        
        for (let zi = 0; zi <= actualResolution; zi++) {
          const worldZ = (zi / actualResolution) * this.scale;
          
          // Evaluate terrain at this point
          try {
            const terrain = this.nodeGraph.evaluateTerrain(worldX, worldY, worldZ);
            
            // Skip air/null values to optimize
            if (!terrain || terrain.type !== 'solid') {
              continue;
            }
            
            // Store terrain in grid
            // Ensure the grid index doesn't exceed array bounds
            if (xi <= this.resolution && yi <= this.resolution && zi <= this.resolution) {
              terrainGrid[xi][yi][zi] = terrain;
              
              // Add to color map
              const color = terrain.color || defaultColor;
              if (!colorMap[color]) {
                colorMap[color] = colorIndex++;
              }
            }
          } catch (error) {
            console.error(`Error evaluating terrain at (${worldX}, ${worldY}, ${worldZ}):`, error);
            // Continue with other voxels
          }
        }
      }
    }
    
    console.log(`Voxel data generation complete. Found ${Object.keys(colorMap).length} unique colors.`);
    return { terrainGrid, colorMap, waterLevel };
  }
  
  /**
   * Create a box-based voxel mesh with LOD
   * @param {Object} voxelData - Contains terrainGrid and colorMap
   * @returns {THREE.Group} - Group containing all voxel mesh instances
   */
  createBoxVoxelMesh(voxelData) {
    const { terrainGrid, colorMap } = voxelData;
    const step = this.scale / this.resolution;
    
    // Create color array
    const colors = [];
    for (const color in colorMap) {
      colors[colorMap[color]] = new THREE.Color(color);
    }
    
    // Create merged meshes for each color for performance
    const colorGroups = Array(colors.length).fill().map(() => []);
    
    // Collect positions for voxels, grouped by color
    for (let xi = 0; xi <= this.resolution; xi++) {
      for (let yi = 0; yi <= this.resolution; yi++) {
        for (let zi = 0; zi <= this.resolution; zi++) {
          const terrain = terrainGrid[xi][yi][zi];
          
          // Skip if no terrain or not solid
          if (!terrain || terrain.type !== 'solid') {
            continue;
          }
          
          const worldX = xi * step;
          const worldY = yi * step;
          const worldZ = zi * step;
          
          // Get color index from map
          const colorIdx = colorMap[terrain.color || '#66aa66'];
          
          // Add box position to the appropriate color group
          colorGroups[colorIdx].push({
            position: new THREE.Vector3(worldX, worldY, worldZ),
            lodLevel: this.calculateLODLevel(worldX, worldY, worldZ)
          });
        }
      }
    }
    
    // Create meshes for each LOD level
    const lodGroups = this.lodGroups;
    
    // For each color, create LOD-specific meshes
    colorGroups.forEach((voxels, colorIdx) => {
      if (voxels.length === 0) return;
      
      // Organize voxels by LOD level
      const voxelsByLOD = new Array(this.lodLevels).fill().map(() => []);
      
      voxels.forEach(voxel => {
        voxelsByLOD[voxel.lodLevel].push(voxel.position);
      });
      
      // Process each LOD level
      voxelsByLOD.forEach((positions, lodLevel) => {
        if (positions.length === 0) return;
        
        const material = new THREE.MeshLambertMaterial({
          color: colors[colorIdx],
          wireframe: this.wireframe
        });
        
        // Adjust voxel size based on LOD level
        const voxelSize = step * (0.98 - lodLevel * 0.02);
        const boxGeometry = new THREE.BoxGeometry(voxelSize, voxelSize, voxelSize);
        
        // For large numbers of voxels, use instanced mesh
        if (positions.length > 500) {
          const instancedMesh = new THREE.InstancedMesh(
            boxGeometry,
            material,
            positions.length
          );
          
          const matrix = new THREE.Matrix4();
          positions.forEach((pos, i) => {
            matrix.setPosition(pos);
            instancedMesh.setMatrixAt(i, matrix);
          });
          
          instancedMesh.instanceMatrix.needsUpdate = true;
          lodGroups[lodLevel].add(instancedMesh);
        } else {
          // For smaller numbers, merge geometries
          const mergedGeometry = new THREE.BufferGeometry();
          
          // Create position array
          const vertices = [];
          
          positions.forEach(pos => {
            // Clone box geometry and move it to the position
            const tempGeo = boxGeometry.clone();
            tempGeo.translate(pos.x, pos.y, pos.z);
            
            // Extract positions and add to array
            const posArray = tempGeo.getAttribute('position').array;
            for (let i = 0; i < posArray.length; i++) {
              vertices.push(posArray[i]);
            }
          });
          
          // Set attributes
          mergedGeometry.setAttribute(
            'position', 
            new THREE.Float32BufferAttribute(vertices, 3)
          );
          
          // Compute normals
          mergedGeometry.computeVertexNormals();
          
          // Create and add mesh
          const mesh = new THREE.Mesh(mergedGeometry, material);
          lodGroups[lodLevel].add(mesh);
        }
      });
    });
    
    // Create a group to contain all LOD groups
    const mainGroup = new THREE.Group();
    lodGroups.forEach(group => {
      mainGroup.add(group);
    });
    
    return mainGroup;
  }
  
  /**
   * Create a surface mesh from voxel data with LOD
   * @param {Object} voxelData - Contains terrainGrid and colorMap
   * @returns {THREE.Mesh} - Surface mesh
   */
  createSurfaceMesh(voxelData) {
    const { terrainGrid, colorMap } = voxelData;
    const step = this.scale / this.resolution;
    
    // Initialize arrays for surface geometry
    const vertices = [];
    const colors = [];
    const normals = [];
    const indices = [];
    const uvs = [];
    
    // Helper function to check if a voxel exists at a grid position
    const hasVoxel = (x, y, z) => {
      if (x < 0 || y < 0 || z < 0 || 
          x > this.resolution || y > this.resolution || z > this.resolution) {
        return false;
      }
      return terrainGrid[x][y][z] !== null && terrainGrid[x][y][z].type === 'solid';
    };
    
    // Create a color array from color map
    const colorArray = [];
    for (const colorHex in colorMap) {
      const color = new THREE.Color(colorHex);
      colorArray[colorMap[colorHex]] = color;
    }
    
    // Generate surface faces with LOD
    for (let xi = 0; xi <= this.resolution; xi++) {
      for (let yi = 0; yi <= this.resolution; yi++) {
        for (let zi = 0; zi <= this.resolution; zi++) {
          const terrain = terrainGrid[xi][yi][zi];
          
          // Skip if no terrain or not solid
          if (!terrain || terrain.type !== 'solid') {
            continue;
          }
          
          // Get world position of current voxel
          const worldX = xi * step;
          const worldY = yi * step;
          const worldZ = zi * step;
          
          // Get color
          const color = new THREE.Color(terrain.color || '#66aa66');
          
          // Skip distant voxels based on LOD
          const lodLevel = this.calculateLODLevel(worldX, worldY, worldZ);
          
          // Skip some faces for higher LOD levels to reduce geometry
          // For LOD 1 and 2, skip some faces based on voxel position
          if (lodLevel > 0) {
            if ((xi + yi + zi) % (lodLevel + 1) !== 0) {
              continue;
            }
          }
          
          // Check each of the 6 faces
          // Only add a face if the neighboring voxel is empty (for optimization)
          
          // Top face (Y+)
          if (!hasVoxel(xi, yi + 1, zi)) {
            const baseVertex = vertices.length / 3;
            
            // Add vertices in counter-clockwise order
            vertices.push(
              worldX, worldY + step, worldZ,          // Top left
              worldX + step, worldY + step, worldZ,   // Top right
              worldX + step, worldY + step, worldZ + step, // Bottom right
              worldX, worldY + step, worldZ + step    // Bottom left
            );
            
            // Add UVs for texture mapping
            uvs.push(
              0, 0,
              1, 0,
              1, 1,
              0, 1
            );
            
            // Add colors (same for all vertices of this face)
            for (let i = 0; i < 4; i++) {
              colors.push(color.r, color.g, color.b);
            }
            
            // Add normal (same for all vertices of this face)
            for (let i = 0; i < 4; i++) {
              normals.push(0, 1, 0); // Y+
            }
            
            // Add indices for two triangles (counter-clockwise)
            indices.push(
              baseVertex, baseVertex + 1, baseVertex + 2,
              baseVertex, baseVertex + 2, baseVertex + 3
            );
          }
          
          // Bottom face (Y-)
          if (!hasVoxel(xi, yi - 1, zi)) {
            const baseVertex = vertices.length / 3;
            
            vertices.push(
              worldX, worldY, worldZ + step,          // Bottom left
              worldX + step, worldY, worldZ + step,   // Bottom right
              worldX + step, worldY, worldZ,          // Top right
              worldX, worldY, worldZ                  // Top left
            );
            
            // Add UVs
            uvs.push(
              0, 0,
              1, 0,
              1, 1,
              0, 1
            );
            
            for (let i = 0; i < 4; i++) {
              colors.push(color.r, color.g, color.b);
              normals.push(0, -1, 0); // Y-
            }
            
            indices.push(
              baseVertex, baseVertex + 1, baseVertex + 2,
              baseVertex, baseVertex + 2, baseVertex + 3
            );
          }
          
          // Front face (Z+)
          if (!hasVoxel(xi, yi, zi + 1)) {
            const baseVertex = vertices.length / 3;
            
            vertices.push(
              worldX, worldY, worldZ + step,          // Bottom left
              worldX + step, worldY, worldZ + step,   // Bottom right
              worldX + step, worldY + step, worldZ + step, // Top right
              worldX, worldY + step, worldZ + step    // Top left
            );
            
            // Add UVs
            uvs.push(
              0, 0,
              1, 0,
              1, 1,
              0, 1
            );
            
            for (let i = 0; i < 4; i++) {
              colors.push(color.r, color.g, color.b);
              normals.push(0, 0, 1); // Z+
            }
            
            indices.push(
              baseVertex, baseVertex + 1, baseVertex + 2,
              baseVertex, baseVertex + 2, baseVertex + 3
            );
          }
          
          // Back face (Z-)
          if (!hasVoxel(xi, yi, zi - 1)) {
            const baseVertex = vertices.length / 3;
            
            vertices.push(
              worldX + step, worldY, worldZ,          // Bottom right
              worldX, worldY, worldZ,                 // Bottom left
              worldX, worldY + step, worldZ,          // Top left
              worldX + step, worldY + step, worldZ    // Top right
            );
            
            // Add UVs
            uvs.push(
              0, 0,
              1, 0,
              1, 1,
              0, 1
            );
            
            for (let i = 0; i < 4; i++) {
              colors.push(color.r, color.g, color.b);
              normals.push(0, 0, -1); // Z-
            }
            
            indices.push(
              baseVertex, baseVertex + 1, baseVertex + 2,
              baseVertex, baseVertex + 2, baseVertex + 3
            );
          }
          
          // Right face (X+)
          if (!hasVoxel(xi + 1, yi, zi)) {
            const baseVertex = vertices.length / 3;
            
            vertices.push(
              worldX + step, worldY, worldZ,          // Bottom left
              worldX + step, worldY, worldZ + step,   // Bottom right
              worldX + step, worldY + step, worldZ + step, // Top right
              worldX + step, worldY + step, worldZ    // Top left
            );
            
            // Add UVs
            uvs.push(
              0, 0,
              1, 0,
              1, 1,
              0, 1
            );
            
            for (let i = 0; i < 4; i++) {
              colors.push(color.r, color.g, color.b);
              normals.push(1, 0, 0); // X+
            }
            
            indices.push(
              baseVertex, baseVertex + 1, baseVertex + 2,
              baseVertex, baseVertex + 2, baseVertex + 3
            );
          }
          
          // Left face (X-)
          if (!hasVoxel(xi - 1, yi, zi)) {
            const baseVertex = vertices.length / 3;
            
            vertices.push(
              worldX, worldY, worldZ + step,          // Bottom right
              worldX, worldY, worldZ,                 // Bottom left
              worldX, worldY + step, worldZ,          // Top left
              worldX, worldY + step, worldZ + step    // Top right
            );
            
            // Add UVs
            uvs.push(
              0, 0,
              1, 0,
              1, 1,
              0, 1
            );
            
            for (let i = 0; i < 4; i++) {
              colors.push(color.r, color.g, color.b);
              normals.push(-1, 0, 0); // X-
            }
            
            indices.push(
              baseVertex, baseVertex + 1, baseVertex + 2,
              baseVertex, baseVertex + 2, baseVertex + 3
            );
          }
        }
      }
    }
    
    // Create geometry
    const geometry = new THREE.BufferGeometry();
    
    // Set attributes if we have vertices
    if (vertices.length > 0) {
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geometry.setIndex(indices);
    }
    
    // Create material
    let material;
    if (this.useShader) {
      // Use custom shader for voxel rendering with grid lines
      material = new THREE.ShaderMaterial({
        uniforms: {
          wireframe: { value: this.wireframe },
          gridStrength: { value: this.gridStrength },
          lightDir: { value: new THREE.Vector3(1, 1, 1).normalize() },
          viewPosition: { value: this.camera.position.clone() },
          ambientStrength: { value: this.lightingParams.ambientStrength },
          diffuseStrength: { value: this.lightingParams.diffuseStrength },
          specularStrength: { value: this.lightingParams.specularStrength },
          shininess: { value: this.lightingParams.shininess }
        },
        vertexShader: voxelVertexShader,
        fragmentShader: voxelFragmentShader,
        vertexColors: true,
        side: THREE.DoubleSide
      });
    } else {
      // Use standard material
      material = new THREE.MeshPhongMaterial({
        vertexColors: true,
        wireframe: this.wireframe,
        side: THREE.DoubleSide,
        shininess: this.lightingParams.shininess * 100
      });
    }
    
    // Create mesh
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    
    return mesh;
  }
  
  /**
   * Add a water plane to the scene
   */
  addWaterPlane() {
    if (this.waterMesh) {
      this.scene.remove(this.waterMesh);
      if (this.waterMesh.geometry) this.waterMesh.geometry.dispose();
      if (this.waterMesh.material) this.waterMesh.material.dispose();
      this.waterMesh = null;
    }
    
    if (!this.showWater) return;
    
    // Create water plane with animated shader
    const waterGeometry = new THREE.PlaneGeometry(this.scale * 1.5, this.scale * 1.5, 32, 32);
    waterGeometry.rotateX(-Math.PI / 2); // Make it horizontal
    
    const waterMaterial = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        waterColor: { value: new THREE.Color(0x3080ff) },
        viewPosition: { value: this.camera.position.clone() },
        lightDir: { value: new THREE.Vector3(1, 1, 0.5).normalize() }
      },
      vertexShader: waterVertexShader,
      fragmentShader: waterFragmentShader,
      transparent: true,
      side: THREE.DoubleSide
    });
    
    this.waterMesh = new THREE.Mesh(waterGeometry, waterMaterial);
    this.waterMesh.position.set(this.scale / 2, 0, this.scale / 2);
    this.waterMesh.receiveShadow = true;
    
    this.scene.add(this.waterMesh);
  }
  
  /**
   * Calculate LOD level for a position
   * @param {number} x - World X coordinate
   * @param {number} y - World Y coordinate 
   * @param {number} z - World Z coordinate
   * @returns {number} - LOD level (0 = highest detail, higher = less detail)
   */
  calculateLODLevel(x, y, z) {
    // Calculate distance from camera
    const pos = new THREE.Vector3(x, y, z);
    const distance = pos.distanceTo(this.camera.position);
    
    // Determine LOD level based on distance
    if (distance < this.lodSettings.threshold1) {
      return 0; // Highest detail
    } else if (distance < this.lodSettings.threshold2) {
      return 1; // Medium detail
    } else {
      return 2; // Lowest detail
    }
  }
  
  /**
   * Update the terrain mesh based on the node graph
   */
  updateTerrain() {
    // Clear existing terrain
    if (this.terrainMesh) {
      this.scene.remove(this.terrainMesh);
      
      // Dispose of geometries and materials
      if (this.terrainMesh.geometry) {
        this.terrainMesh.geometry.dispose();
      }
      
      if (this.terrainMaterial) {
        this.terrainMaterial.dispose();
      }
      
      // If the terrain was a group of meshes
      if (this.terrainMesh.isGroup) {
        this.terrainMesh.children.forEach(child => {
          if (child.geometry) child.geometry.dispose();
          if (child.material) child.material.dispose();
        });
      }
      
      this.terrainMesh = null;
      this.terrainMaterial = null;
    }
    
    // Clear LOD groups
    this.lodGroups.forEach(group => {
      while (group.children.length > 0) {
        const child = group.children[0];
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
        group.remove(child);
      }
    });
    
    try {
      // Get the output node
      const outputNode = this.nodeGraph.getOutputNode();
      if (!outputNode || outputNode.inputs.length === 0) {
        console.log("No output node or no connection to output node");
        // Add a placeholder flat plane to show coordinate system
        const planeGeometry = new THREE.PlaneGeometry(this.scale, this.scale);
        const planeMaterial = new THREE.MeshBasicMaterial({ 
          color: 0x222222, 
          wireframe: true,
          transparent: true,
          opacity: 0.5,
          side: THREE.DoubleSide 
        });
        const plane = new THREE.Mesh(planeGeometry, planeMaterial);
        plane.rotation.x = Math.PI / 2;
        plane.position.y = 0.1; // Slightly above 0 to avoid z-fighting
        this.scene.add(plane);
        return;
      }
      
      // Generate voxel data - common for all rendering modes
      const voxelData = this.generateVoxelData();
      
      // Choose rendering method based on selected mode
      switch (this.renderMode) {
        case 'voxel':
          // Box-based voxel rendering
          this.terrainMesh = this.createBoxVoxelMesh(voxelData);
          break;
          
        case 'shader':
          // Surface mesh with shader for voxel grid lines
          this.useShader = true;
          this.terrainMesh = this.createSurfaceMesh(voxelData);
          this.terrainMaterial = this.terrainMesh.material;
          break;
          
        case 'surface':
          // Standard surface mesh
          this.useShader = false;
          this.terrainMesh = this.createSurfaceMesh(voxelData);
          this.terrainMaterial = this.terrainMesh.material;
          break;
      }
      
      // Add to scene if we created a mesh
      if (this.terrainMesh) {
        this.scene.add(this.terrainMesh);
        
        // Add water plane at y=0
        this.addWaterPlane();
        
        showToast(`Terrain generated successfully using ${this.renderMode} mode`, 'success');
      } else {
        console.log("No terrain mesh generated");
        showToast(`No terrain mesh generated`, 'error');
      }
      
      // Update wireframe state
      this.updateWireframeState();
    } catch (error) {
      console.error("Error generating terrain:", error);
      showToast(`Error generating terrain: ${error.message}`, 'error');
    }
    
    // Update grid and axes helpers
    this.scene.children.forEach(child => {
      if (child instanceof THREE.GridHelper || child instanceof THREE.AxesHelper) {
        this.scene.remove(child);
      }
    });
    
    // Add grid helper at y=0
    const gridHelper = new THREE.GridHelper(this.scale, 10);
    gridHelper.position.set(this.scale / 2, 0, this.scale / 2); // Center grid on terrain
    this.scene.add(gridHelper);
    
    // Add axes helper
    const axesHelper = new THREE.AxesHelper(Math.min(100, this.scale / 4));
    this.scene.add(axesHelper);
  }
  
  /**
   * Update wireframe state across all materials
   */
  updateWireframeState() {
    if (this.terrainMaterial) {
      // For standard materials
      if (this.terrainMaterial.wireframe !== undefined) {
        this.terrainMaterial.wireframe = this.wireframe;
      }
      
      // For shader materials
      if (this.terrainMaterial.uniforms && this.terrainMaterial.uniforms.wireframe) {
        this.terrainMaterial.uniforms.wireframe.value = this.wireframe;
      }
    }
    
    // For group of meshes or LOD groups
    this.lodGroups.forEach(group => {
      group.traverse(child => {
        if (child.isMesh && child.material) {
          if (child.material.wireframe !== undefined) {
            child.material.wireframe = this.wireframe;
          }
          if (child.material.uniforms && child.material.uniforms.wireframe) {
            child.material.uniforms.wireframe.value = this.wireframe;
          }
        }
      });
    });
  }
  
  /**
   * Update LOD visibility based on camera position
   */
  updateLODVisibility() {
    const cameraPos = this.camera.position;
    
    // Show/hide LOD groups based on camera movement
    // Always show LOD 0 (highest detail)
    // Show LOD 1 and 2 based on camera distance
    // This prevents the camera from seeing "empty" areas when moving quickly
    for (let i = 0; i < this.lodGroups.length; i++) {
      if (i === 0) {
        // LOD 0 is always visible near camera
        this.lodGroups[i].visible = true;
      } else if (i === 1) {
        // LOD 1 is visible at medium distances
        this.lodGroups[i].visible = this.cameraVelocity.length() > 0.05;
      } else {
        // LOD 2 is visible at far distances or when moving quickly
        this.lodGroups[i].visible = this.cameraVelocity.length() > 0.2;
      }
    }
  }
  
  /**
   * Animation loop
   */
  animate() {
    requestAnimationFrame(() => this.animate());
    
    const delta = this.clock.getDelta();
    
    // Update camera position based on controls
    this.updateCameraPosition(delta);
    
    // Update LOD visibility
    this.updateLODVisibility();
    
    // Update shader uniforms
    this.updateShaderUniforms();
    
    // Animate water if present
    if (this.waterMesh && this.waterMesh.material.uniforms) {
      this.waterMesh.material.uniforms.time.value += delta;
    }
    
    // Update LOD indicator
    this.updateLODIndicator();
    
    this.renderer.render(this.scene, this.camera);
  }
  
  /**
   * Update LOD indicator display
   */
  updateLODIndicator() {
    const lodIndicator = document.getElementById('lod-indicator');
    if (!lodIndicator) return;
    
    // Get camera's current position
    const cameraPos = this.camera.position.clone();
    
    // Get terrain center
    const terrainCenter = new THREE.Vector3(this.scale / 2, this.scale / 2, this.scale / 2);
    
    // Calculate distance to terrain center
    const distance = cameraPos.distanceTo(terrainCenter);
    
    // Determine current LOD level
    let currentLOD;
    if (distance < this.lodSettings.threshold1) {
      currentLOD = 'High (LOD 0)';
    } else if (distance < this.lodSettings.threshold2) {
      currentLOD = 'Medium (LOD 1)';
    } else {
      currentLOD = 'Low (LOD 2)';
    }
    
    // Update indicator text
    lodIndicator.textContent = `LOD: ${currentLOD}`;
  }
}

export default TerrainViewer;