/**
 * NodeGraph class for the Luamap Terrain Prototyper
 * Manages the graph of nodes and connections, as well as evaluation and export
 */

import NoiseGenerator from './noise';

// Constants
const NOISE_FLAG_DEFAULTS = 0x01;
const NOISE_FLAG_EASED = 0x02;
const NOISE_FLAG_ABSVALUE = 0x04;

class NodeGraph {
  constructor() {
    this.nodes = [];
    this.connections = [];
    this.nextNodeId = 1;
    this.noiseGenerator = new NoiseGenerator();
  }
  
  /**
   * Add a node to the graph
   * 
   * @param {string} type - The type of node to add
   * @param {number} x - X position in the editor
   * @param {number} y - Y position in the editor
   * @returns {Object} - The created node
   */
  addNode(type, x, y) {
    const id = this.nextNodeId++;
    const node = {
      id,
      type,
      x,
      y,
      inputs: [],
      outputs: [],
      params: {}
    };
    
    // Configure node based on type
    switch (type) {
      case 'noise2d':
        node.outputs.push({ id: `${id}_out`, name: 'Value', type: 'float' });
        node.params = {
          offset: 0,
          scale: 1,
          spreadX: 250,
          spreadY: 250,
          seed: Math.floor(Math.random() * 100000),
          octaves: 3,
          persist: 0.6,
          lacunarity: 2.0,
          flags: NOISE_FLAG_DEFAULTS
        };
        break;
        
      case 'noise3d':
        node.outputs.push({ id: `${id}_out`, name: 'Value', type: 'float' });
        node.params = {
          offset: 0,
          scale: 1,
          spreadX: 250,
          spreadY: 250,
          spreadZ: 250,
          seed: Math.floor(Math.random() * 100000),
          octaves: 3,
          persist: 0.6,
          lacunarity: 2.0,
          flags: NOISE_FLAG_DEFAULTS
        };
        break;
        
      case 'mandelbrot':
        node.outputs.push({ id: `${id}_out`, name: 'Value', type: 'float' });
        node.params = {
          scale: 10000000,
          offsetX: -1415/2000,
          offsetZ: -706/2000,
          steps: 150,
          remap: true,
          remapMin: 0,
          remapMax: 1
        };
        break;
        
      case 'lerp':
        node.inputs.push(
          { id: `${id}_in1`, name: 'A', type: 'float' },
          { id: `${id}_in2`, name: 'B', type: 'float' },
          { id: `${id}_factor`, name: 'Factor', type: 'float' }
        );
        node.outputs.push({ id: `${id}_out`, name: 'Result', type: 'float' });
        node.params = {
          power: 1
        };
        break;
        
      case 'coserp':
        node.inputs.push(
          { id: `${id}_in1`, name: 'A', type: 'float' },
          { id: `${id}_in2`, name: 'B', type: 'float' },
          { id: `${id}_factor`, name: 'Factor', type: 'float' }
        );
        node.outputs.push({ id: `${id}_out`, name: 'Result', type: 'float' });
        break;
        
      case 'add':
        node.inputs.push(
          { id: `${id}_in1`, name: 'A', type: 'float' },
          { id: `${id}_in2`, name: 'B', type: 'float' }
        );
        node.outputs.push({ id: `${id}_out`, name: 'Result', type: 'float' });
        break;
        
      case 'multiply':
        node.inputs.push(
          { id: `${id}_in1`, name: 'A', type: 'float' },
          { id: `${id}_in2`, name: 'B', type: 'float' }
        );
        node.outputs.push({ id: `${id}_out`, name: 'Result', type: 'float' });
        break;
        
      case 'subtract':
        node.inputs.push(
          { id: `${id}_in1`, name: 'A', type: 'float' },
          { id: `${id}_in2`, name: 'B', type: 'float' }
        );
        node.outputs.push({ id: `${id}_out`, name: 'Result', type: 'float' });
        break;
        
      case 'abs':
        node.inputs.push({ id: `${id}_in`, name: 'Value', type: 'float' });
        node.outputs.push({ id: `${id}_out`, name: 'Result', type: 'float' });
        break;
        
      case 'gaussian':
        node.inputs.push(
          { id: `${id}_x`, name: 'X', type: 'float' },
          { id: `${id}_y`, name: 'Y', type: 'float' },
          { id: `${id}_z`, name: 'Z', type: 'float' }
        );
        node.outputs.push({ id: `${id}_out`, name: 'Result', type: 'float' });
        node.params = {
          centerX: 0,
          centerY: 0,
          centerZ: 0,
          spread: 100
        };
        break;
        
      case 'remap':
        node.inputs.push({ id: `${id}_in`, name: 'Value', type: 'float' });
        node.outputs.push({ id: `${id}_out`, name: 'Result', type: 'float' });
        node.params = {
          inMin: 0,
          inMax: 1,
          outMin: 0,
          outMax: 1
        };
        break;
        
      case 'position':
        node.outputs.push(
          { id: `${id}_outX`, name: 'X', type: 'float' },
          { id: `${id}_outY`, name: 'Y', type: 'float' },
          { id: `${id}_outZ`, name: 'Z', type: 'float' }
        );
        break;
        
      case 'distance':
        node.inputs.push(
          { id: `${id}_x`, name: 'X', type: 'float' },
          { id: `${id}_y`, name: 'Y', type: 'float' },
          { id: `${id}_z`, name: 'Z', type: 'float' }
        );
        node.outputs.push({ id: `${id}_out`, name: 'Distance', type: 'float' });
        node.params = {
          pointX: 0,
          pointY: 0,
          pointZ: 0
        };
        break;
        
      case 'compare':
        node.inputs.push(
          { id: `${id}_in1`, name: 'A', type: 'float' },
          { id: `${id}_in2`, name: 'B', type: 'float' }
        );
        node.outputs.push({ id: `${id}_out`, name: 'Result', type: 'terrain' });
        node.params = {
          operator: '<',
          useTrue: 1,
          useFalse: 0
        };
        // Add special inputs for terrain connections
        node.inputs.push(
          { id: `${id}_useTrue`, name: 'If True', type: 'terrain' },
          { id: `${id}_useFalse`, name: 'If False', type: 'terrain' }
        );
        break;
        
      case 'terrain-type':
        node.outputs.push({ id: `${id}_out`, name: 'Terrain', type: 'terrain' });
        node.params = {
          name: 'Stone',
          type: 'solid',
          color: '#888888'
        };
        break;
        
      case 'terrain-output':
        node.inputs.push({ id: `${id}_in`, name: 'Terrain', type: 'terrain' });
        break;
    }
    
    this.nodes.push(node);
    return node;
  }
  
  /**
   * Remove a node from the graph
   * 
   * @param {number} nodeId - ID of the node to remove
   */
  removeNode(nodeId) {
    // Remove connections for the node
    this.connections = this.connections.filter(
      conn => !conn.from.startsWith(nodeId + '_') && !conn.to.startsWith(nodeId + '_')
    );
    
    // Remove the node
    this.nodes = this.nodes.filter(node => node.id !== nodeId);
  }
  
  /**
   * Add a connection between ports
   * 
   * @param {string} fromPortId - ID of the output port
   * @param {string} toPortId - ID of the input port
   */
  addConnection(fromPortId, toPortId) {
    // Check if connection already exists
    const exists = this.connections.some(conn => conn.to === toPortId);
    if (exists) {
      // Remove existing connection
      this.connections = this.connections.filter(conn => conn.to !== toPortId);
    }
    
    // Add new connection
    this.connections.push({ from: fromPortId, to: toPortId });
  }
  
  /**
   * Remove a connection
   * 
   * @param {number} connectionId - Index of the connection to remove
   */
  removeConnection(connectionId) {
    this.connections = this.connections.filter((_, index) => index !== connectionId);
  }
  
  /**
   * Update parameters for a node
   * 
   * @param {number} nodeId - ID of the node to update
   * @param {Object} params - New parameters
   */
  updateNodeParams(nodeId, params) {
    const node = this.nodes.find(n => n.id === nodeId);
    if (node) {
      node.params = { ...node.params, ...params };
    }
  }
  
  /**
   * Get the output value of a port
   * 
   * @param {string} portId - ID of the port to evaluate
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @param {number} z - Z coordinate
   * @returns {any} - Output value of the port
   */
  evaluatePort(portId, x, y, z) {
    // Find the node and port
    for (const node of this.nodes) {
      // Check if this is an output port of the node
      const output = node.outputs.find(out => out.id === portId);
      if (output) {
        return this.evaluateNode(node, x, y, z, output);
      }
    }
    
    // If not found directly, check if it's connected to another port
    const conn = this.connections.find(c => c.to === portId);
    if (conn) {
      return this.evaluatePort(conn.from, x, y, z);
    }
    
    // Default values if not connected
    return 0;
  }
  
  /**
   * Evaluate a node
   * 
   * @param {Object} node - Node to evaluate
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @param {number} z - Z coordinate
   * @param {Object} specificOutput - Specific output port to evaluate
   * @returns {any} - Output value
   */
  evaluateNode(node, x, y, z, specificOutput = null) {
    switch (node.type) {
      case 'position':
        if (specificOutput) {
          if (specificOutput.id === `${node.id}_outX`) return x;
          if (specificOutput.id === `${node.id}_outY`) return y;
          if (specificOutput.id === `${node.id}_outZ`) return z;
        }
        return { x, y, z };
        
      case 'noise2d': {
        const np = {
          offset: node.params.offset,
          scale: node.params.scale,
          spread: { x: node.params.spreadX, y: node.params.spreadY },
          seed: node.params.seed,
          octaves: node.params.octaves,
          persist: node.params.persist,
          lacunarity: node.params.lacunarity,
          flags: node.params.flags
        };
        return this.noiseGenerator.NoisePerlin2D(np, x, z, 0);
      }
      
      case 'noise3d': {
        const np = {
          offset: node.params.offset,
          scale: node.params.scale,
          spread: { 
            x: node.params.spreadX, 
            y: node.params.spreadY, 
            z: node.params.spreadZ 
          },
          seed: node.params.seed,
          octaves: node.params.octaves,
          persist: node.params.persist,
          lacunarity: node.params.lacunarity,
          flags: node.params.flags
        };
        return this.noiseGenerator.NoisePerlin3D(np, x, y, z, 0);
      }
      
      case 'mandelbrot': {
        const value = this.noiseGenerator.mandelbrot(
          (x / node.params.scale) + node.params.offsetX,
          (z / node.params.scale) + node.params.offsetZ,
          node.params.steps
        );
        
        if (node.params.remap) {
          return this.remap(value, 0, node.params.steps, 
            node.params.remapMin, node.params.remapMax);
        }
        return value;
      }
      
      case 'lerp': {
        const a = this.evaluatePort(node.inputs[0].id, x, y, z);
        const b = this.evaluatePort(node.inputs[1].id, x, y, z);
        const factor = this.evaluatePort(node.inputs[2].id, x, y, z);
        return this.lerp(a, b, factor, node.params.power);
      }
      
      case 'coserp': {
        const a = this.evaluatePort(node.inputs[0].id, x, y, z);
        const b = this.evaluatePort(node.inputs[1].id, x, y, z);
        const factor = this.evaluatePort(node.inputs[2].id, x, y, z);
        return this.coserp(a, b, factor);
      }
      
      case 'add': {
        const a = this.evaluatePort(node.inputs[0].id, x, y, z);
        const b = this.evaluatePort(node.inputs[1].id, x, y, z);
        return a + b;
      }
      
      case 'multiply': {
        const a = this.evaluatePort(node.inputs[0].id, x, y, z);
        const b = this.evaluatePort(node.inputs[1].id, x, y, z);
        return a * b;
      }
      
      case 'subtract': {
        const a = this.evaluatePort(node.inputs[0].id, x, y, z);
        const b = this.evaluatePort(node.inputs[1].id, x, y, z);
        return a - b;
      }
      
      case 'abs': {
        const value = this.evaluatePort(node.inputs[0].id, x, y, z);
        return Math.abs(value);
      }
      
      case 'gaussian': {
        const px = this.evaluatePort(node.inputs[0].id, x, y, z);
        const py = this.evaluatePort(node.inputs[1].id, x, y, z);
        const pz = this.evaluatePort(node.inputs[2].id, x, y, z);
        
        const dx = px - node.params.centerX;
        const dy = py - node.params.centerY;
        const dz = pz - node.params.centerZ;
        
        const distSq = dx * dx + dy * dy + dz * dz;
        const spreadSq = node.params.spread * node.params.spread;
        
        return Math.exp(-distSq / (2 * spreadSq));
      }
      
      case 'remap': {
        const value = this.evaluatePort(node.inputs[0].id, x, y, z);
        return this.remap(
          value, 
          node.params.inMin, 
          node.params.inMax, 
          node.params.outMin, 
          node.params.outMax
        );
      }
      
      case 'distance': {
        const px = this.evaluatePort(node.inputs[0].id, x, y, z);
        const py = this.evaluatePort(node.inputs[1].id, x, y, z);
        const pz = this.evaluatePort(node.inputs[2].id, x, y, z);
        
        const dx = px - node.params.pointX;
        const dy = py - node.params.pointY;
        const dz = pz - node.params.pointZ;
        
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
      }
      
      case 'compare': {
        const a = this.evaluatePort(node.inputs[0].id, x, y, z);
        const b = this.evaluatePort(node.inputs[1].id, x, y, z);
        
        let result = false;
        switch (node.params.operator) {
          case '<': result = a < b; break;
          case '<=': result = a <= b; break;
          case '>': result = a > b; break;
          case '>=': result = a >= b; break;
          case '==': result = a === b; break;
          case '!=': result = a !== b; break;
        }
        
        // If we have terrain type connections, use those
        if (node.inputs.length > 2) {
          if (result) {
            // Check if there's a connection to the "If True" port
            const trueConn = this.connections.find(c => c.to === node.inputs[2].id);
            if (trueConn) {
              return this.evaluatePort(trueConn.from, x, y, z);
            }
            return node.params.useTrue;
          } else {
            // Check if there's a connection to the "If False" port
            const falseConn = this.connections.find(c => c.to === node.inputs[3].id);
            if (falseConn) {
              return this.evaluatePort(falseConn.from, x, y, z);
            }
            return node.params.useFalse;
          }
        }
        
        // Simple numeric result
        return result ? node.params.useTrue : node.params.useFalse;
      }
      
      case 'terrain-type': {
        return {
          name: node.params.name,
          type: node.params.type,
          color: node.params.color
        };
      }
    }
    
    return 0;
  }
  
  /**
   * Find the output node
   * 
   * @returns {Object|null} - Output node or null if not found
   */
  getOutputNode() {
    return this.nodes.find(node => node.type === 'terrain-output');
  }
  
  /**
   * Evaluate the terrain at a position
   * 
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @param {number} z - Z coordinate
   * @returns {Object|null} - Terrain at the position or null if not found
   */
  evaluateTerrain(x, y, z) {
    try {
      const outputNode = this.getOutputNode();
      if (!outputNode || outputNode.inputs.length === 0) {
        return null;
      }
      
      // Check if there's a connection to the input port
      const connection = this.connections.find(conn => conn.to === outputNode.inputs[0].id);
      if (!connection) {
        return null;
      }
      
      // Evaluate the connected node
      return this.evaluatePort(outputNode.inputs[0].id, x, y, z);
    } catch (error) {
      console.error("Error evaluating terrain at", x, y, z, error);
      return null;
    }
  }
  
  /**
   * Convert the graph to Lua code
   * 
   * @returns {string} - Lua code for the terrain generation
   */
  exportToLua() {
    let luaCode = `-- Luamap generated terrain\n`;
    luaCode += `luamap.set_singlenode()\n\n`;
    
    // Generate noise registrations
    const noiseNodes = this.nodes.filter(node => 
      node.type === 'noise2d' || node.type === 'noise3d');
    
    for (const node of noiseNodes) {
      const noiseName = `noise_${node.id}`;
      
      luaCode += `luamap.register_noise("${noiseName}", {\n`;
      luaCode += `    type = "${node.type === 'noise2d' ? '2d' : '3d'}",\n`;
      luaCode += `    np_vals = {\n`;
      luaCode += `        offset = ${node.params.offset},\n`;
      luaCode += `        scale = ${node.params.scale},\n`;
      luaCode += `        spread = {x=${node.params.spreadX}, y=${node.params.spreadY}${
        node.type === 'noise3d' ? `, z=${node.params.spreadZ}` : ''
      }},\n`;
      luaCode += `        seed = ${node.params.seed},\n`;
      luaCode += `        octaves = ${node.params.octaves},\n`;
      luaCode += `        persist = ${node.params.persist},\n`;
      luaCode += `        lacunarity = ${node.params.lacunarity},\n`;
      
      let flags = [];
      if (node.params.flags & NOISE_FLAG_DEFAULTS) flags.push("defaults");
      if (node.params.flags & NOISE_FLAG_EASED) flags.push("eased");
      if (node.params.flags & NOISE_FLAG_ABSVALUE) flags.push("absvalue");
      
      luaCode += `        flags = "${flags.join(' ')}"\n`;
      luaCode += `    },\n`;
      luaCode += `})\n\n`;
    }
    
    // Define terrain types
    const terrainNodes = this.nodes.filter(node => node.type === 'terrain-type');
    
    luaCode += `-- Define content IDs\n`;
    luaCode += `local c_air = minetest.get_content_id("air")\n`;
    luaCode += `local c_water = minetest.get_content_id("default:water_source")\n`;
    
    for (const node of terrainNodes) {
      const varName = `c_${node.params.name.toLowerCase().replace(/[^a-z0-9_]/g, '_')}`;
      luaCode += `local ${varName} = minetest.get_content_id("${node.params.name}")\n`;
    }
    
    luaCode += `\nlocal water_level = 0\n\n`;
    luaCode += `local old_logic = luamap.logic\n\n`;
    
    // Generate the terrain function
    luaCode += `function luamap.logic(noise_vals, x, y, z, seed, original_content)\n`;
    luaCode += `    -- Get any terrain defined in another mod\n`;
    luaCode += `    local content = old_logic(noise_vals, x, y, z, seed, original_content)\n\n`;
    
    // Helper functions needed for lua implementation
    let requiredHelpers = [];
    
    // Check for mandelbrot nodes
    if (this.nodes.some(node => node.type === 'mandelbrot')) {
      requiredHelpers.push('mandelbrot');
      luaCode += `    -- Mandelbrot function\n`;
      luaCode += `    local function mandelbrot(x, z, steps)\n`;
      luaCode += `        local a = 0\n`;
      luaCode += `        local b = 0\n`;
      luaCode += `        for i = 0, steps do\n`;
      luaCode += `            local old_a = a\n`;
      luaCode += `            a = (a^2 - b^2) + x\n`;
      luaCode += `            b = 2 * old_a * b + z\n`;
      luaCode += `            if a^2 + b^2 > 20 then return i end\n`;
      luaCode += `        end\n`;
      luaCode += `        return steps\n`;
      luaCode += `    end\n\n`;
    }
    
    // Check for Gaussian nodes
    if (this.nodes.some(node => node.type === 'gaussian')) {
      requiredHelpers.push('gaussian');
      luaCode += `    -- Gaussian function\n`;
      luaCode += `    local function gaussian(x, y, z, cx, cy, cz, spread)\n`;
      luaCode += `        local dx = x - cx\n`;
      luaCode += `        local dy = y - cy\n`;
      luaCode += `        local dz = z - cz\n`;
      luaCode += `        local distSq = dx * dx + dy * dy + dz * dz\n`;
      luaCode += `        local spreadSq = spread * spread\n`;
      luaCode += `        return math.exp(-distSq / (2 * spreadSq))\n`;
      luaCode += `    end\n\n`;
    }
    
    // Generate terrain evaluation
    const outputNode = this.getOutputNode();
    if (outputNode && outputNode.inputs.length > 0) {
      // Start with if conditions for terrain types
      luaCode += `    -- Terrain evaluation\n`;
      
      // Find all compare nodes
      const compareNodes = this.nodes.filter(node => node.type === 'compare');
      
      if (compareNodes.length > 0) {
        for (const node of compareNodes) {
          luaCode += `    -- Comparison ${node.id}\n`;
          luaCode += `    if ${this.generateLuaForPort(node.inputs[0].id)} ${node.params.operator} ${this.generateLuaForPort(node.inputs[1].id)} then\n`;
          
          // Check if there's a connection to the "If True" port
          const trueConn = this.connections.find(c => c.to === node.inputs[2].id);
          if (trueConn) {
            const fromNode = this.nodes.find(n => n.outputs.some(o => o.id === trueConn.from));
            if (fromNode && fromNode.type === 'terrain-type') {
              const varName = `c_${fromNode.params.name.toLowerCase().replace(/[^a-z0-9_]/g, '_')}`;
              luaCode += `        content = ${varName}\n`;
            } else {
              luaCode += `        content = ${node.params.useTrue}\n`;
            }
          } else {
            luaCode += `        content = ${node.params.useTrue}\n`;
          }
          
          luaCode += `    else\n`;
          
          // Check if there's a connection to the "If False" port
          const falseConn = this.connections.find(c => c.to === node.inputs[3].id);
          if (falseConn) {
            const fromNode = this.nodes.find(n => n.outputs.some(o => o.id === falseConn.from));
            if (fromNode && fromNode.type === 'terrain-type') {
              const varName = `c_${fromNode.params.name.toLowerCase().replace(/[^a-z0-9_]/g, '_')}`;
              luaCode += `        content = ${varName}\n`;
            } else {
              luaCode += `        content = ${node.params.useFalse}\n`;
            }
          } else {
            luaCode += `        content = ${node.params.useFalse}\n`;
          }
          
          luaCode += `    end\n\n`;
        }
      } else {
        // Basic height-based terrain
        luaCode += `    local height = ${this.generateLuaForPort(outputNode.inputs[0].id)}\n\n`;
        luaCode += `    if y < 0 then\n`;
        luaCode += `        content = c_water\n`;
        luaCode += `    end\n`;
        luaCode += `    if y < height then\n`;
        luaCode += `        content = c_stone\n`;
        luaCode += `    end\n`;
      }
    }
    
    luaCode += `    return content\n`;
    luaCode += `end\n`;
    
    return luaCode;
  }
  
  /**
   * Generate Lua code for evaluating a port value
   * 
   * @param {string} portId - ID of the port
   * @returns {string} - Lua code for evaluating the port
   */
  generateLuaForPort(portId) {
    // Find the node and port
    for (const node of this.nodes) {
      // Check if this is an output port of the node
      const output = node.outputs.find(out => out.id === portId);
      if (output) {
        return this.generateLuaForNode(node, output);
      }
    }
    
    // If not found directly, check if it's connected to another port
    const conn = this.connections.find(c => c.to === portId);
    if (conn) {
      return this.generateLuaForPort(conn.from);
    }
    
    // Default values if not connected
    return "0";
  }
  
  /**
   * Generate Lua code for evaluating a node
   * 
   * @param {Object} node - Node to generate code for
   * @param {Object} specificOutput - Specific output port
   * @returns {string} - Lua code for evaluating the node
   */
  generateLuaForNode(node, specificOutput = null) {
    switch (node.type) {
      case 'position':
        if (specificOutput) {
          if (specificOutput.id === `${node.id}_outX`) return "x";
          if (specificOutput.id === `${node.id}_outY`) return "y";
          if (specificOutput.id === `${node.id}_outZ`) return "z";
        }
        return "{ x = x, y = y, z = z }";
        
      case 'noise2d':
      case 'noise3d': {
        const noiseName = `noise_${node.id}`;
        return `noise_vals.${noiseName}`;
      }
      
      case 'mandelbrot': {
        let code = `mandelbrot((x / ${node.params.scale}) + ${node.params.offsetX}, (z / ${node.params.scale}) + ${node.params.offsetZ}, ${node.params.steps})`;
        
        if (node.params.remap) {
          code = `luamap.remap(${code}, 0, ${node.params.steps}, ${node.params.remapMin}, ${node.params.remapMax})`;
        }
        return code;
      }
      
      case 'lerp': {
        const a = this.generateLuaForPort(node.inputs[0].id);
        const b = this.generateLuaForPort(node.inputs[1].id);
        const factor = this.generateLuaForPort(node.inputs[2].id);
        
        if (node.params.power === 1) {
          return `luamap.lerp(${a}, ${b}, ${factor})`;
        } else {
          return `luamap.lerp(${a}, ${b}, ${factor}, ${node.params.power})`;
        }
      }
      
      case 'coserp': {
        const a = this.generateLuaForPort(node.inputs[0].id);
        const b = this.generateLuaForPort(node.inputs[1].id);
        const factor = this.generateLuaForPort(node.inputs[2].id);
        return `luamap.coserp(${a}, ${b}, ${factor})`;
      }
      
      case 'add': {
        const a = this.generateLuaForPort(node.inputs[0].id);
        const b = this.generateLuaForPort(node.inputs[1].id);
        return `(${a} + ${b})`;
      }
      
      case 'multiply': {
        const a = this.generateLuaForPort(node.inputs[0].id);
        const b = this.generateLuaForPort(node.inputs[1].id);
        return `(${a} * ${b})`;
      }
      
      case 'subtract': {
        const a = this.generateLuaForPort(node.inputs[0].id);
        const b = this.generateLuaForPort(node.inputs[1].id);
        return `(${a} - ${b})`;
      }
      
      case 'abs': {
        const value = this.generateLuaForPort(node.inputs[0].id);
        return `math.abs(${value})`;
      }
      
      case 'gaussian': {
        const px = this.generateLuaForPort(node.inputs[0].id);
        const py = this.generateLuaForPort(node.inputs[1].id);
        const pz = this.generateLuaForPort(node.inputs[2].id);
        
        return `gaussian(${px}, ${py}, ${pz}, ${node.params.centerX}, ${node.params.centerY}, ${node.params.centerZ}, ${node.params.spread})`;
      }
      
      case 'remap': {
        const value = this.generateLuaForPort(node.inputs[0].id);
        return `luamap.remap(${value}, ${node.params.inMin}, ${node.params.inMax}, ${node.params.outMin}, ${node.params.outMax})`;
      }
      
      case 'distance': {
        const px = this.generateLuaForPort(node.inputs[0].id);
        const py = this.generateLuaForPort(node.inputs[1].id);
        const pz = this.generateLuaForPort(node.inputs[2].id);
        
        return `math.sqrt(
          (${px} - ${node.params.pointX})^2 + 
          (${py} - ${node.params.pointY})^2 + 
          (${pz} - ${node.params.pointZ})^2
        )`;
      }
      
      case 'terrain-type': {
        const varName = `c_${node.params.name.toLowerCase().replace(/[^a-z0-9_]/g, '_')}`;
        return varName;
      }
    }
    
    return "0";
  }
  
  // Utility functions
  lerp(a, b, t, power = 1) {
    if (t > 1) t = 1;
    if (t < 0) t = 0;
    return (1 - t) * Math.pow(a, power) + (t * Math.pow(b, power));
  }
  
  coserp(a, b, t) {
    if (t > 1) t = 1;
    if (t < 0) t = 0;
    const f = (1 - Math.cos(t * Math.PI)) / 2;
    return a * (1 - f) + b * f;
  }
  
  remap(val, minVal, maxVal, minMap, maxMap) {
    if (minVal === maxVal) return minMap; // Avoid division by zero
    return (val - minVal) / (maxVal - minVal) * (maxMap - minMap) + minMap;
  }
}

export default NodeGraph;