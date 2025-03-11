/**
 * TerrainViewer class
 * Renders the terrain using THREE.js with voxel-based visualization
 */

import * as THREE from 'three';
import { showToast } from './utils';

// Vertex shader for voxel terrain
const voxelVertexShader = `
varying vec3 vPosition;
varying vec3 vNormal;
varying vec3 vColor;

void main() {
  vPosition = position;
  vNormal = normal;
  vColor = color;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// Fragment shader for voxel terrain
const voxelFragmentShader = `
varying vec3 vPosition;
varying vec3 vNormal;
varying vec3 vColor;

uniform bool wireframe;
uniform float gridStrength;
uniform vec3 lightDir;

void main() {
  // Basic lighting calculation
  vec3 normal = normalize(vNormal);
  vec3 light = normalize(lightDir);
  
  // Ambient light component
  float ambient = 0.3;
  
  // Diffuse light component
  float diffuse = max(0.0, dot(normal, light));
  
  // Combined lighting
  float lighting = ambient + diffuse * 0.7;
  
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

class TerrainViewer {
  constructor(nodeGraph, canvas) {
    this.nodeGraph = nodeGraph;
    this.canvas = canvas;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.resolution = 64;
    this.scale = 256;
    this.wireframe = false;
    this.gridStrength = 0.05; // Width of voxel grid lines
    this.terrainMesh = null;
    this.terrainMaterial = null;
    this.renderMode = 'shader'; // 'shader', 'voxel', or 'surface'
    this.showWireframe = false;
    this.useShader = true;
    
    this.setupThree();
    this.setupControls();
    this.updateTerrain();
    this.animate();
  }
  
  /**
   * Set up the Three.js scene and renderer
   */
  setupThree() {
    // Create scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a1a);
    
    // Create camera
    const aspect = this.canvas.clientWidth / this.canvas.clientHeight;
    this.camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 10000);
    this.camera.position.set(this.scale / 2, this.scale / 2, this.scale * 1.5);
    this.camera.lookAt(this.scale / 2, 0, this.scale / 2);
    
    // Create renderer
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    
    // Add lights
    const ambientLight = new THREE.AmbientLight(0x606060);
    this.scene.add(ambientLight);
    
    const directionalLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight1.position.set(1, 1, 1);
    this.scene.add(directionalLight1);
    
    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight2.position.set(-1, 0.5, -1);
    this.scene.add(directionalLight2);
    
    // Add coordinate axes helper with appropriate scale
    const axesHelper = new THREE.AxesHelper(this.scale / 4);
    this.scene.add(axesHelper);
    
    // Add grid helper centered on the terrain
    const gridHelper = new THREE.GridHelper(this.scale, 10);
    gridHelper.position.y = 0;
    this.scene.add(gridHelper);
    
    // Create orbit controls
    this.setupOrbitControls();
    
    // Handle resize
    window.addEventListener('resize', () => {
      const viewerElement = document.getElementById('terrain-viewer');
      if (viewerElement.style.display === 'none') return;
      
      const newWidth = this.canvas.clientWidth;
      const newHeight = this.canvas.clientHeight;
      this.camera.aspect = newWidth / newHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(newWidth, newHeight);
    });
  }
  
  /**
   * Set up the OrbitControls
   * Since we can't rely on the OrbitControls import from three/examples,
   * we implement a simple version here
   */
  setupOrbitControls() {
    this.controls = {
      enabled: true,
      target: new THREE.Vector3(this.scale / 2, 0, this.scale / 2),
      update: () => {
        this.camera.lookAt(this.controls.target);
      }
    };
    
    let isDragging = false;
    let previousMousePosition = {
      x: 0,
      y: 0
    };
    
    const getMousePosition = (evt) => {
      return {
        x: evt.clientX,
        y: evt.clientY
      };
    };
    
    const handleMouseDown = (event) => {
      if (!this.controls.enabled) return;
      
      isDragging = true;
      previousMousePosition = getMousePosition(event);
    };
    
    const handleMouseMove = (event) => {
      if (!isDragging || !this.controls.enabled) return;
      
      const currentPosition = getMousePosition(event);
      const movementX = currentPosition.x - previousMousePosition.x;
      const movementY = currentPosition.y - previousMousePosition.y;
      
      if (event.buttons === 1) {
        // Left mouse button: Rotate
        const rotationSpeed = 0.005;
        
        // Rotate camera around target
        const theta = -movementX * rotationSpeed;
        const phi = -movementY * rotationSpeed;
        
        const cameraPosition = new THREE.Vector3().subVectors(this.camera.position, this.controls.target);
        
        const radius = cameraPosition.length();
        let polar = Math.acos(cameraPosition.y / radius);
        let azimuth = Math.atan2(cameraPosition.z, cameraPosition.x);
        
        polar = Math.max(0.1, Math.min(Math.PI - 0.1, polar + phi));
        azimuth += theta;
        
        cameraPosition.x = radius * Math.sin(polar) * Math.cos(azimuth);
        cameraPosition.y = radius * Math.cos(polar);
        cameraPosition.z = radius * Math.sin(polar) * Math.sin(azimuth);
        
        this.camera.position.copy(cameraPosition.add(this.controls.target));
        this.camera.lookAt(this.controls.target);
      } else if (event.buttons === 2) {
        // Right mouse button: Pan
        const panSpeed = 0.01;
        
        const right = new THREE.Vector3();
        const up = new THREE.Vector3();
        const forward = new THREE.Vector3();
        
        forward.subVectors(this.controls.target, this.camera.position).normalize();
        right.crossVectors(this.camera.up, forward).normalize();
        up.crossVectors(forward, right);
        
        right.multiplyScalar(-movementX * panSpeed * this.scale);
        up.multiplyScalar(movementY * panSpeed * this.scale);
        
        this.camera.position.add(right);
        this.camera.position.add(up);
        this.controls.target.add(right);
        this.controls.target.add(up);
      } else if (event.buttons === 4) {
        // Middle mouse button: Zoom
        const zoomSpeed = 0.01;
        const distance = movementY * zoomSpeed * this.scale;
        
        const direction = new THREE.Vector3().subVectors(this.camera.position, this.controls.target).normalize();
        
        this.camera.position.addScaledVector(direction, distance);
      }
      
      previousMousePosition = currentPosition;
    };
    
    const handleMouseUp = () => {
      isDragging = false;
    };
    
    const handleWheel = (event) => {
      if (!this.controls.enabled) return;
      
      const zoomSpeed = 0.1;
      const delta = -Math.sign(event.deltaY) * zoomSpeed * this.scale;
      
      const direction = new THREE.Vector3().subVectors(this.camera.position, this.controls.target).normalize();
      
      this.camera.position.addScaledVector(direction, delta);
    };
    
    this.canvas.addEventListener('mousedown', handleMouseDown);
    this.canvas.addEventListener('mousemove', handleMouseMove);
    this.canvas.addEventListener('mouseup', handleMouseUp);
    this.canvas.addEventListener('wheel', handleWheel);
    
    // Prevent context menu on right click
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
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
      if (this.terrainMaterial) {
        // For standard materials
        if (this.terrainMaterial.wireframe !== undefined) {
          this.terrainMaterial.wireframe = this.wireframe;
        }
        
        // For shader materials
        if (this.terrainMaterial.uniforms && this.terrainMaterial.uniforms.wireframe) {
          this.terrainMaterial.uniforms.wireframe.value = this.wireframe;
        }
        
        // For group of meshes (box voxels)
        if (this.terrainMesh && this.terrainMesh.isGroup) {
          this.terrainMesh.traverse(child => {
            if (child.isMesh && child.material) {
              if (child.material.wireframe !== undefined) {
                child.material.wireframe = this.wireframe;
              }
            }
          });
        }
      }
    });
    
    // Center view button
    document.getElementById('btn-center').addEventListener('click', () => {
      this.centerView();
    });
    
    // Scale presets
    document.querySelectorAll('.scale-preset').forEach(btn => {
      btn.addEventListener('click', () => {
        this.scale = parseInt(btn.dataset.scale);
        this.updateTerrain();
        this.centerView();
      });
    });
    
    // Add render mode selector to HTML
    this.addRenderModeControl();
    
    // Add grid strength slider for voxel grid lines
    this.addGridStrengthControl();
    
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
  centerView() {
    this.camera.position.set(this.scale / 2, this.scale / 2, this.scale * 1.5);
    this.controls.target.set(this.scale / 2, 0, this.scale / 2);
    this.controls.update();
  }
  
  /**
   * Generate a 3D voxel grid from the node graph
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
    
    // Use a lower resolution for higher scale values to avoid performance issues
    const actualResolution = this.scale > 1000 ? Math.min(this.resolution, 48) : this.resolution;
    
    // Scan through the 3D grid with step size
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
    return { terrainGrid, colorMap };
  }
  
  /**
   * Create a box-based voxel mesh
   * @param {Object} voxelData - Contains terrainGrid and colorMap
   * @returns {THREE.Group} - Group containing all voxel mesh instances
   */
  createBoxVoxelMesh(voxelData) {
    const { terrainGrid, colorMap } = voxelData;
    const step = this.scale / this.resolution;
    const voxelSize = step * 0.95; // Slightly smaller to see separation
    
    // Create color array
    const colors = [];
    for (const color in colorMap) {
      colors[colorMap[color]] = new THREE.Color(color);
    }
    
    // Create merged meshes for each color for performance
    const colorGroups = Array(colors.length).fill().map(() => []);
    
    // Collect boxes for each color
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
          colorGroups[colorIdx].push(new THREE.Vector3(worldX, worldY, worldZ));
        }
      }
    }
    
    // Create one merged mesh for each color
    const group = new THREE.Group();
    const boxGeometry = new THREE.BoxGeometry(voxelSize, voxelSize, voxelSize);
    
    colorGroups.forEach((positions, colorIdx) => {
      if (positions.length === 0) return;
      
      const material = new THREE.MeshLambertMaterial({
        color: colors[colorIdx],
        wireframe: this.wireframe
      });
      
      // For large numbers of instances, use instanced mesh
      if (positions.length > 1000) {
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
        group.add(instancedMesh);
      } else {
        // For smaller numbers, merge geometries for better performance
        const mergedGeometry = new THREE.BufferGeometry();
        
        // Create position arrays
        const vertices = [];
        
        positions.forEach(pos => {
          // Clone box geometry and move it to the position
          const tempGeo = boxGeometry.clone();
          tempGeo.translate(pos.x, pos.y, pos.z);
          
          // Extract positions and add to arrays
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
        group.add(mesh);
      }
    });
    
    return group;
  }
  
  /**
   * Create a surface mesh from voxel data
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
    
    // Generate surface faces
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
          lightDir: { value: new THREE.Vector3(1, 1, 1).normalize() }
        },
        vertexShader: voxelVertexShader,
        fragmentShader: voxelFragmentShader,
        vertexColors: true,
        side: THREE.DoubleSide
      });
    } else {
      // Use standard material
      material = new THREE.MeshLambertMaterial({
        vertexColors: true,
        wireframe: this.wireframe,
        side: THREE.DoubleSide
      });
    }
    
    // Create mesh
    const mesh = new THREE.Mesh(geometry, material);
    
    return mesh;
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
        showToast(`Terrain generated successfully using ${this.renderMode} mode`, 'success');
      } else {
        console.log("No terrain mesh generated");
        showToast(`No terrain mesh generated`, 'error');
      }
    } catch (error) {
      console.error("Error generating terrain:", error);
      showToast(`Error generating terrain: ${error.message}`, 'error');
    }
    
    // Update grid and axes helpers
    this.scene.children = this.scene.children.filter(obj => 
      !(obj instanceof THREE.GridHelper || obj instanceof THREE.AxesHelper));
    
    const gridHelper = new THREE.GridHelper(this.scale, 10);
    this.scene.add(gridHelper);
    
    const axesHelper = new THREE.AxesHelper(Math.min(100, this.scale / 4));
    this.scene.add(axesHelper);
  }
  
  /**
   * Animation loop
   */
  animate() {
    requestAnimationFrame(() => this.animate());
    
    if (this.controls) {
      this.controls.update();
    }
    
    this.renderer.render(this.scene, this.camera);
  }
}

export default TerrainViewer;