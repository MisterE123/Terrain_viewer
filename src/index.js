/**
 * Luamap Terrain Prototyper
 * An interactive tool for prototyping Luanti/Minetest mapgens
 */

import * as THREE from 'three';
import NoiseGenerator from './noise';
import NodeGraph from './node-graph';
import TerrainViewer from './terrain-viewer';
import { showToast } from './utils';

// Constants for UI
const NOISE_FLAG_DEFAULTS = 0x01;
const NOISE_FLAG_EASED = 0x02;
const NOISE_FLAG_ABSVALUE = 0x04;

/**
 * Main application class for the Luamap Terrain Prototyper
 */
class LuamapPrototyper {
  constructor() {
    this.nodeGraph = new NodeGraph();
    this.nodeEditor = document.getElementById('node-editor');
    this.terrainViewer = null;
    
    this.activeTab = 'node-editor';
    this.selectedNode = null;
    this.selectedPort = null;
    this.tempConnection = null;
    this.draggingNode = false;
    this.dragOffsetX = 0;
    this.dragOffsetY = 0;
    
    // Editor pan and zoom state
    this.editorPanning = false;
    this.spacePanning = false;
    this.panStartX = 0;
    this.panStartY = 0;
    this.editorScale = 1;
    this.editorTranslateX = 0;
    this.editorTranslateY = 0;
    
    this.initUI();
    this.createExampleGraph();
  }
  
  /**
   * Initialize the UI event handlers
   */
  initUI() {
    // Tab switching
    document.querySelectorAll('.tab-button').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        const tabId = btn.dataset.tab;
        this.activeTab = tabId;
        
        // Show/hide the appropriate content area
        document.getElementById('node-editor').style.display = 
          tabId === 'node-editor' ? 'flex' : 'none';
          
        document.getElementById('terrain-viewer').style.display = 
          tabId === 'terrain-viewer' ? 'flex' : 'none';
        
        // Initialize terrain viewer if needed
        if (tabId === 'terrain-viewer' && !this.terrainViewer) {
          this.initTerrainViewer();
        }
      });
    });
    
    // Node creation from sidebar
    document.querySelectorAll('.node-item').forEach(item => {
      item.addEventListener('click', () => {
        // Make sure we're in the node editor tab
        if (this.activeTab !== 'node-editor') {
          document.querySelector('.tab-button[data-tab="node-editor"]').click();
        }
        
        const type = item.dataset.type;
        
        // Calculate position based on current view transform
        const editorRect = this.nodeEditor.getBoundingClientRect();
        const centerX = editorRect.width / 2;
        const centerY = editorRect.height / 2;
        
        // Apply inverse transform to get world coordinates
        const x = (centerX - this.editorTranslateX) / this.editorScale;
        const y = (centerY - this.editorTranslateY) / this.editorScale;
        
        this.createNode(type, x, y);
      });
    });
    
    // Node editor event handlers
    this.nodeEditor.addEventListener('mousedown', this.handleNodeEditorMouseDown.bind(this));
    document.addEventListener('mousemove', this.handleMouseMove.bind(this));
    document.addEventListener('mouseup', this.handleMouseUp.bind(this));
    
    // Add mousewheel zoom
    this.nodeEditor.addEventListener('wheel', this.handleNodeEditorWheel.bind(this), { passive: false });
    
    // Add keyboard handlers for panning
    document.addEventListener('keydown', this.handleKeyDown.bind(this));
    document.addEventListener('keyup', this.handleKeyUp.bind(this));
    
    // Help button
    document.getElementById('btn-help').addEventListener('click', () => {
      document.getElementById('help-panel').style.display = 'flex';
    });
    
    document.querySelector('.help-close').addEventListener('click', () => {
      document.getElementById('help-panel').style.display = 'none';
    });
    
    // Export button
    document.getElementById('btn-export').addEventListener('click', () => {
      this.exportToLua();
    });
    
    // New button
    document.getElementById('btn-new').addEventListener('click', () => {
      if (confirm('Clear the current graph and start a new one?')) {
        this.clearGraph();
      }
    });
    
    // Modal close events
    document.querySelector('.modal-close').addEventListener('click', () => {
      document.getElementById('export-modal').style.display = 'none';
    });
    
    document.getElementById('btn-close-modal').addEventListener('click', () => {
      document.getElementById('export-modal').style.display = 'none';
    });
    
    // Copy to clipboard
    document.getElementById('btn-copy').addEventListener('click', () => {
      const textarea = document.getElementById('export-code');
      textarea.select();
      document.execCommand('copy');
      showToast('Code copied to clipboard!', 'success');
    });
  }
  
  handleKeyDown(e) {
    // Start panning when space is pressed
    if (e.code === 'Space' && !this.spacePanning && this.activeTab === 'node-editor') {
      this.nodeEditor.style.cursor = 'grab';
      this.spacePanning = true;
    }
  }
  
  handleKeyUp(e) {
    // Stop panning when space is released
    if (e.code === 'Space' && this.spacePanning) {
      this.nodeEditor.style.cursor = 'default';
      this.spacePanning = false;
    }
  }
  
  handleNodeEditorWheel(e) {
    e.preventDefault();
    
    const zoomAmount = e.deltaY > 0 ? 0.9 : 1.1;
    
    // Get mouse position relative to editor
    const rect = this.nodeEditor.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    // Calculate new scale
    const newScale = this.editorScale * zoomAmount;
    
    // Apply zoom centered on mouse position
    const scaleRatio = newScale / this.editorScale;
    const translateX = mouseX - (mouseX - this.editorTranslateX) * scaleRatio;
    const translateY = mouseY - (mouseY - this.editorTranslateY) * scaleRatio;
    
    // Update transform
    this.editorScale = newScale;
    this.editorTranslateX = translateX;
    this.editorTranslateY = translateY;
    
    this.updateEditorTransform();
  }
  
  updateEditorTransform() {
    const nodeContainer = this.nodeEditor.querySelector('.node-container');
    if (nodeContainer) {
      nodeContainer.style.transform = `translate(${this.editorTranslateX}px, ${this.editorTranslateY}px) scale(${this.editorScale})`;
    }
  }
  
  setEditorScale(scale) {
    // Clamp scale to reasonable values
    scale = Math.max(0.25, Math.min(scale, 2));
    
    // Get editor center
    const rect = this.nodeEditor.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    
    // Calculate new transform
    const scaleRatio = scale / this.editorScale;
    const translateX = centerX - (centerX - this.editorTranslateX) * scaleRatio;
    const translateY = centerY - (centerY - this.editorTranslateY) * scaleRatio;
    
    // Update transform
    this.editorScale = scale;
    this.editorTranslateX = translateX;
    this.editorTranslateY = translateY;
    
    this.updateEditorTransform();
  }
  
  initTerrainViewer() {
    const canvas = document.getElementById('terrain-canvas');
    this.terrainViewer = new TerrainViewer(this.nodeGraph, canvas);
  }
  
  createExampleGraph() {
    try {
      // Create a simple example terrain that works reliably
      
      // Position node for Y coordinate
      const position = this.createNode('position', 100, 200);
      
      // Terrain noise node (2D)
      const noise2d = this.createNode('noise2d', 300, 100);
      
      // Set noise parameters similar to example.lua but adjusted for better visualization
      noise2d.params.offset = 0;
      noise2d.params.scale = 50; // Already includes the scaling factor
      noise2d.params.spreadX = 384;
      noise2d.params.spreadY = 256;
      noise2d.params.seed = 5900033;
      noise2d.params.octaves = 5;
      noise2d.params.persist = 0.63;
      noise2d.params.lacunarity = 2.0;
      noise2d.params.flags = NOISE_FLAG_DEFAULTS;
      
      // Compare node for y < noise
      const compare = this.createNode('compare', 500, 200);
      compare.params.operator = '<';
      
      // Stone terrain
      const stone = this.createNode('terrain-type', 350, 300);
      stone.params.name = 'default:stone';
      stone.params.type = 'solid';
      stone.params.color = '#888888';
      
      // Water terrain
      const water = this.createNode('terrain-type', 650, 300);
      water.params.name = 'default:water_source';
      water.params.type = 'liquid';
      water.params.color = '#4444ff';
      
      // Water level compare (y < 0)
      const waterCompare = this.createNode('compare', 650, 200);
      waterCompare.params.operator = '<';
      waterCompare.params.useTrue = 0; // Not used - we connect water terrain directly
      waterCompare.params.useFalse = 0; // Not used - we connect air terrain directly
      
      // Water level node (constant 0)
      const waterLevel = this.createNode('noise2d', 500, 100);
      waterLevel.params.offset = 0;
      waterLevel.params.scale = 0;
      waterLevel.params.spreadX = 100;
      waterLevel.params.spreadY = 100;
      
      // Air terrain (implicit)
      const air = this.createNode('terrain-type', 500, 400);
      air.params.name = 'air';
      air.params.type = 'air';
      air.params.color = '#aaccff';
      
      // Output node
      const output = this.createNode('terrain-output', 800, 200);
      
      // Render the editor to create all the DOM elements
      this.renderNodeEditor();
      
      // Use setTimeout to ensure the DOM has been updated
      setTimeout(() => {
        // Connect position Y to both compare nodes
        this.connectPorts(`${position.id}_outY`, `${compare.id}_in1`);
        this.connectPorts(`${position.id}_outY`, `${waterCompare.id}_in1`);
        
        // Connect the water level to water compare B input
        this.connectPorts(`${waterLevel.id}_out`, `${waterCompare.id}_in2`);
        
        // Connect noise output directly to compare (already scaled by 50)
        this.connectPorts(`${noise2d.id}_out`, `${compare.id}_in2`);
        
        // Connect stone terrain to main compare true result
        this.connectPorts(`${stone.id}_out`, `${compare.id}_useTrue`);
        
        // Connect water compare to main compare false result
        this.connectPorts(`${waterCompare.id}_out`, `${compare.id}_useFalse`);
        
        // Connect water terrain to water compare true result
        this.connectPorts(`${water.id}_out`, `${waterCompare.id}_useTrue`);
        
        // Connect air terrain to water compare false result
        this.connectPorts(`${air.id}_out`, `${waterCompare.id}_useFalse`);
        
        // Connect main compare result to terrain output
        this.connectPorts(`${compare.id}_out`, `${output.id}_in`);
        
        console.log("Created example terrain based on example.lua");
        showToast('Created example terrain', 'success');
      }, 200);
    } catch (error) {
      console.error("Error creating example graph:", error);
      // Fallback to a simpler example if the advanced one fails
      this.createSimpleExample();
    }
  }
  
  createSimpleExample() {
    try {
      this.clearGraph();
      
      // Create a basic height-based terrain example
      const position = this.createNode('position', 100, 150);
      const noise2d = this.createNode('noise2d', 300, 100);
      noise2d.params.scale = 20;
      
      const compare = this.createNode('compare', 500, 150);
      compare.params.operator = '<';
      
      const stone = this.createNode('terrain-type', 300, 250);
      stone.params.name = 'default:stone';
      stone.params.type = 'solid';
      stone.params.color = '#888888';
      
      const air = this.createNode('terrain-type', 300, 350);
      air.params.name = 'air';
      air.params.type = 'air';
      air.params.color = '#aaccff';
      
      const output = this.createNode('terrain-output', 700, 150);
      
      // Render the nodes first so they exist in the DOM
      this.renderNodeEditor();
      
      // Wait a moment for the DOM to update
      setTimeout(() => {
        // Connect position Y to compare A
        this.connectPorts(`${position.id}_outY`, `${compare.id}_in1`);
        
        // Connect noise to compare B 
        this.connectPorts(`${noise2d.id}_out`, `${compare.id}_in2`);
        
        // Connect stone to compare if true
        this.connectPorts(`${stone.id}_out`, `${compare.id}_useTrue`);
        
        // Connect air to compare if false
        this.connectPorts(`${air.id}_out`, `${compare.id}_useFalse`);
        
        // Connect compare to output
        this.connectPorts(`${compare.id}_out`, `${output.id}_in`);
        
        // Render again
        this.renderNodeEditor();
        
        // Show a toast notification
        showToast('Created example terrain with height-based noise', 'success');
      }, 100);
    } catch (error) {
      console.error("Failed to create simple example:", error);
      showToast('Failed to create example', 'error');
    }
  }
  
  clearGraph() {
    this.nodeGraph.nodes = [];
    this.nodeGraph.connections = [];
    this.nodeGraph.nextNodeId = 1;
    this.selectedNode = null;
    this.renderNodeEditor();
    
    if (this.terrainViewer) {
      this.terrainViewer.updateTerrain();
    }
  }
  
  createNode(type, x, y) {
    const node = this.nodeGraph.addNode(type, x, y);
    this.renderNodeEditor();
    return node;
  }
  
  /**
   * Handler for node delete button clicks
   * 
   * @param {number} nodeId - ID of the node to delete
   * @param {Event} e - Click event
   */
  handleNodeDelete(nodeId, e) {
    // Stop event propagation to prevent node selection
    e.stopPropagation();
    
    // Confirm node deletion
    if (confirm(`Delete this node?`)) {
      // Find node to check if it's the output node
      const node = this.nodeGraph.nodes.find(n => n.id === nodeId);
      if (node && node.type === 'terrain-output') {
        alert('Cannot delete the Terrain Output node as it is required for terrain generation.');
        return;
      }
      
      // Remove the node from the graph
      this.nodeGraph.removeNode(nodeId);
      
      // Clear selection if this was the selected node
      if (this.selectedNode && this.selectedNode.id === nodeId) {
        this.selectedNode = null;
      }
      
      // Re-render the editor
      this.renderNodeEditor();
      
      // Update terrain viewer if it exists
      if (this.terrainViewer) {
        this.terrainViewer.updateTerrain();
      }
    }
  }
  
  renderNodeEditor() {
    // Get the container element
    let nodeContainer = this.nodeEditor.querySelector('.node-container');
    
    // Clear the container
    if (nodeContainer) {
      while (nodeContainer.firstChild) {
        nodeContainer.removeChild(nodeContainer.firstChild);
      }
    } else {
      // Create the container if it doesn't exist
      nodeContainer = document.createElement('div');
      nodeContainer.className = 'node-container';
      this.nodeEditor.appendChild(nodeContainer);
    }
    
    // Apply current transform
    this.updateEditorTransform();
    
    // Render connections
    this.renderConnections(nodeContainer);
    
    // Render nodes
    for (const node of this.nodeGraph.nodes) {
      this.renderNode(node, nodeContainer);
    }
    
    // Render temporary connection if one is being created
    if (this.tempConnection && this.selectedPort) {
      this.renderTempConnection(nodeContainer);
    }
  }
  
  renderNode(node, container) {
    const nodeElement = document.createElement('div');
    nodeElement.className = 'node';
    nodeElement.style.left = `${node.x}px`;
    nodeElement.style.top = `${node.y}px`;
    nodeElement.dataset.nodeId = node.id;
    
    if (this.selectedNode === node) {
      nodeElement.style.boxShadow = '0 0 0 2px var(--accent-color)';
    }
    
    // Node header
    const header = document.createElement('div');
    header.className = 'node-header';
    header.dataset.nodeId = node.id;
    
    // Title span
    const titleSpan = document.createElement('span');
    titleSpan.textContent = this.getNodeTitle(node);
    titleSpan.className = 'node-title';
    titleSpan.dataset.nodeId = node.id;
    header.appendChild(titleSpan);
    
    // Use a button element instead of a div for better clickability
    const deleteButton = document.createElement('button');
    deleteButton.className = 'node-delete';
    deleteButton.innerHTML = '×';
    deleteButton.title = 'Delete node';
    deleteButton.dataset.nodeId = node.id;
    deleteButton.type = 'button'; // Prevent form submission behavior
    
    // Add direct click handler that's completely separate from node header
    const deleteFunction = function(e) {
      // Stop any and all propagation
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      
      console.log('[DEBUG] Delete button clicked for node ID:', node.id);
      
      // Simple direct deletion for testing
      const doDelete = window.confirm(`Delete this node (ID: ${node.id})?`);
      if (doDelete) {
        console.log('[DEBUG] Confirmed deletion of node ID:', node.id);
        
        // Check if it's the output node
        if (node.type === 'terrain-output') {
          window.alert('Cannot delete the Terrain Output node as it is required for terrain generation.');
          return;
        }
        
        // Remove node and update
        console.log('[DEBUG] Removing node from graph...');
        this.nodeGraph.removeNode(node.id);
        console.log('[DEBUG] Node removed, updating display...');
        
        // Clear selection if needed
        if (this.selectedNode && this.selectedNode.id === node.id) {
          this.selectedNode = null;
        }
        
        // Re-render and update
        this.renderNodeEditor();
        if (this.terrainViewer) {
          this.terrainViewer.updateTerrain();
        }
        console.log('[DEBUG] Deletion complete.');
      }
    };
    
    // Bind function properly to this instance
    const boundDeleteFunction = deleteFunction.bind(this);
    
    // Add multiple events to ensure it captures the click
    deleteButton.addEventListener('click', boundDeleteFunction);
    deleteButton.addEventListener('mousedown', function(e) {
      e.stopPropagation();
    });
    
    header.appendChild(deleteButton);
    
    nodeElement.appendChild(header);
    
    // Node content
    const content = document.createElement('div');
    content.className = 'node-content';
    
    // Special handling for noise and terrain nodes that need different port placement
    if (node.type === 'noise2d' || node.type === 'noise3d' || node.type === 'mandelbrot' || node.type === 'terrain-type') {
      // For these nodes, we want the output port at the bottom
      
      // Node controls based on type
      const controls = this.createNodeControls(node);
      if (controls) {
        content.appendChild(controls);
      }
      
      // Input ports (if any)
      if (node.inputs.length > 0) {
        const portsContainer = document.createElement('div');
        portsContainer.className = 'ports-container';
        
        for (const input of node.inputs) {
          const portElement = this.createPortElement(input, node, 'input');
          portsContainer.appendChild(portElement);
        }
        
        content.appendChild(portsContainer);
      }
      
      // Output ports (if any)
      if (node.outputs.length > 0) {
        const portsContainer = document.createElement('div');
        portsContainer.className = 'ports-container outputs-container';
        
        for (const output of node.outputs) {
          const portElement = this.createPortElement(output, node, 'output');
          portsContainer.appendChild(portElement);
        }
        
        content.appendChild(portsContainer);
      }
    } else {
      // For standard nodes, input ports come first, then controls, then outputs
      
      // Input ports
      if (node.inputs.length > 0) {
        for (const input of node.inputs) {
          const portElement = this.createPortElement(input, node, 'input');
          content.appendChild(portElement);
        }
      }
      
      // Node controls based on type
      const controls = this.createNodeControls(node);
      if (controls) {
        content.appendChild(controls);
      }
      
      // Output ports
      if (node.outputs.length > 0) {
        for (const output of node.outputs) {
          const portElement = this.createPortElement(output, node, 'output');
          content.appendChild(portElement);
        }
      }
    }
    
    nodeElement.appendChild(content);
    container.appendChild(nodeElement);
  }
  
  getNodeTitle(node) {
    switch (node.type) {
      case 'noise2d': return 'Noise 2D';
      case 'noise3d': return 'Noise 3D';
      case 'mandelbrot': return 'Mandelbrot';
      case 'lerp': return 'Linear Interpolation';
      case 'coserp': return 'Cosine Interpolation';
      case 'add': return 'Add';
      case 'multiply': return 'Multiply';
      case 'subtract': return 'Subtract';
      case 'abs': return 'Absolute Value';
      case 'gaussian': return 'Gaussian';
      case 'remap': return 'Remap Range';
      case 'position': return 'Position (X,Y,Z)';
      case 'distance': return 'Distance to Point';
      case 'compare': return 'Comparison';
      case 'terrain-type': return `Terrain: ${node.params.name}`;
      case 'terrain-output': return 'Terrain Output';
      default: return 'Node';
    }
  }
  
  createPortElement(port, node, type) {
    const portElement = document.createElement('div');
    portElement.className = 'port';
    
    if (type === 'input') {
      // For input ports, connector on left, label on right
      const connector = document.createElement('div');
      connector.className = 'port-connector port-input';
      connector.dataset.portId = port.id;
      connector.dataset.portType = 'input';
      connector.title = `Input: ${port.name} (${port.type})`;
      
      const label = document.createElement('div');
      label.className = 'port-label';
      label.textContent = port.name;
      
      portElement.appendChild(connector);
      portElement.appendChild(label);
    } else {
      // For output ports, label on left, connector on right
      const label = document.createElement('div');
      label.className = 'port-label';
      label.textContent = port.name;
      
      const connector = document.createElement('div');
      connector.className = 'port-connector port-output';
      connector.dataset.portId = port.id;
      connector.dataset.portType = 'output';
      connector.title = `Output: ${port.name} (${port.type})`;
      
      portElement.appendChild(label);
      portElement.appendChild(connector);
    }
    
    // Add port type as a class
    portElement.classList.add(`port-type-${port.type}`);
    
    return portElement;
  }
  
  createNodeControls(node) {
    if (!node.params || Object.keys(node.params).length === 0) {
      return null;
    }
    
    const controlsElement = document.createElement('div');
    controlsElement.className = 'node-controls';
    controlsElement.dataset.nodeId = node.id;
    
    switch (node.type) {
      case 'noise2d':
      case 'noise3d':
        this.addControlGroup(controlsElement, node.id, 'Offset', 'number', 'offset', node.params.offset);
        this.addControlGroup(controlsElement, node.id, 'Scale', 'number', 'scale', node.params.scale);
        this.addControlGroup(controlsElement, node.id, 'Spread X', 'number', 'spreadX', node.params.spreadX);
        this.addControlGroup(controlsElement, node.id, 'Spread Y', 'number', 'spreadY', node.params.spreadY);
        
        if (node.type === 'noise3d') {
          this.addControlGroup(controlsElement, node.id, 'Spread Z', 'number', 'spreadZ', node.params.spreadZ);
        }
        
        this.addControlGroup(controlsElement, node.id, 'Seed', 'number', 'seed', node.params.seed);
        this.addControlGroup(controlsElement, node.id, 'Octaves', 'number', 'octaves', node.params.octaves);
        this.addControlGroup(controlsElement, node.id, 'Persistence', 'number', 'persist', node.params.persist, 0.01);
        this.addControlGroup(controlsElement, node.id, 'Lacunarity', 'number', 'lacunarity', node.params.lacunarity, 0.1);
        
        // Flags checkboxes
        const flagsGroup = document.createElement('div');
        flagsGroup.className = 'control-group';
        
        const flagsLabel = document.createElement('div');
        flagsLabel.className = 'control-label';
        flagsLabel.textContent = 'Flags';
        flagsGroup.appendChild(flagsLabel);
        
        const createFlagCheckbox = (name, flag, checked) => {
          const checkboxContainer = document.createElement('div');
          checkboxContainer.style.display = 'flex';
          checkboxContainer.style.alignItems = 'center';
          checkboxContainer.style.marginBottom = '4px';
          
          const checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.checked = checked;
          checkbox.dataset.nodeId = node.id;
          checkbox.dataset.paramFlag = flag;
          
          checkbox.addEventListener('change', (e) => {
            console.log('Checkbox change event triggered');
            const nodeId = parseInt(e.target.dataset.nodeId);
            const flag = parseInt(e.target.dataset.paramFlag);
            const node = this.nodeGraph.nodes.find(n => n.id === nodeId);
            
            if (e.target.checked) {
              node.params.flags |= flag;
              console.log(`Added flag ${flag} to node ${nodeId}`);
            } else {
              node.params.flags &= ~flag;
              console.log(`Removed flag ${flag} from node ${nodeId}`);
            }
            
            if (this.terrainViewer) {
              this.terrainViewer.updateTerrain();
            }
          });
          
          // Add mousedown handler to stop propagation
          checkbox.addEventListener('mousedown', (e) => {
            e.stopPropagation();
          });
          
          // Add click handler to stop propagation
          checkbox.addEventListener('click', (e) => {
            e.stopPropagation();
          });
          
          const checkboxLabel = document.createElement('label');
          checkboxLabel.textContent = name;
          checkboxLabel.style.marginLeft = '5px';
          checkboxLabel.style.fontSize = '12px';
          
          checkboxContainer.appendChild(checkbox);
          checkboxContainer.appendChild(checkboxLabel);
          
          return checkboxContainer;
        };
        
        flagsGroup.appendChild(createFlagCheckbox('Eased', NOISE_FLAG_EASED, 
          (node.params.flags & NOISE_FLAG_EASED) !== 0));
          
        flagsGroup.appendChild(createFlagCheckbox('Absolute Value', NOISE_FLAG_ABSVALUE, 
          (node.params.flags & NOISE_FLAG_ABSVALUE) !== 0));
          
        controlsElement.appendChild(flagsGroup);
        break;
        
      case 'mandelbrot':
        this.addControlGroup(controlsElement, node.id, 'Scale', 'number', 'scale', node.params.scale);
        this.addControlGroup(controlsElement, node.id, 'Offset X', 'number', 'offsetX', node.params.offsetX, 0.001);
        this.addControlGroup(controlsElement, node.id, 'Offset Z', 'number', 'offsetZ', node.params.offsetZ, 0.001);
        this.addControlGroup(controlsElement, node.id, 'Steps', 'number', 'steps', node.params.steps);
        
        // Remap checkbox
        const remapContainer = document.createElement('div');
        remapContainer.className = 'control-group';
        
        const remapCheck = document.createElement('input');
        remapCheck.type = 'checkbox';
        remapCheck.checked = node.params.remap;
        remapCheck.dataset.nodeId = node.id;
        remapCheck.dataset.param = 'remap';
        
        // Stop event propagation
        remapCheck.addEventListener('mousedown', (e) => e.stopPropagation());
        remapCheck.addEventListener('click', (e) => e.stopPropagation());
        
        // Handle changes
        remapCheck.addEventListener('change', (e) => {
          e.stopPropagation();
          console.log('Remap checkbox changed to', e.target.checked);
          
          const nodeId = parseInt(e.target.dataset.nodeId);
          const node = this.nodeGraph.nodes.find(n => n.id === nodeId);
          node.params.remap = e.target.checked;
          this.updateNodeUI(node);
          
          if (this.terrainViewer) {
            this.terrainViewer.updateTerrain();
          }
        });
        
        const remapLabel = document.createElement('label');
        remapLabel.textContent = 'Remap Output';
        remapLabel.style.marginLeft = '5px';
        remapLabel.style.fontSize = '12px';
        
        remapContainer.appendChild(remapCheck);
        remapContainer.appendChild(remapLabel);
        controlsElement.appendChild(remapContainer);
        
        if (node.params.remap) {
          this.addControlGroup(controlsElement, node.id, 'Map Min', 'number', 'remapMin', node.params.remapMin);
          this.addControlGroup(controlsElement, node.id, 'Map Max', 'number', 'remapMax', node.params.remapMax);
        }
        break;
        
      case 'lerp':
        this.addControlGroup(controlsElement, node.id, 'Power', 'number', 'power', node.params.power, 0.1);
        break;
        
      case 'gaussian':
        this.addControlGroup(controlsElement, node.id, 'Center X', 'number', 'centerX', node.params.centerX);
        this.addControlGroup(controlsElement, node.id, 'Center Y', 'number', 'centerY', node.params.centerY);
        this.addControlGroup(controlsElement, node.id, 'Center Z', 'number', 'centerZ', node.params.centerZ);
        this.addControlGroup(controlsElement, node.id, 'Spread', 'number', 'spread', node.params.spread);
        break;
        
      case 'remap':
        this.addControlGroup(controlsElement, node.id, 'Input Min', 'number', 'inMin', node.params.inMin);
        this.addControlGroup(controlsElement, node.id, 'Input Max', 'number', 'inMax', node.params.inMax);
        this.addControlGroup(controlsElement, node.id, 'Output Min', 'number', 'outMin', node.params.outMin);
        this.addControlGroup(controlsElement, node.id, 'Output Max', 'number', 'outMax', node.params.outMax);
        break;
        
      case 'distance':
        this.addControlGroup(controlsElement, node.id, 'Point X', 'number', 'pointX', node.params.pointX);
        this.addControlGroup(controlsElement, node.id, 'Point Y', 'number', 'pointY', node.params.pointY);
        this.addControlGroup(controlsElement, node.id, 'Point Z', 'number', 'pointZ', node.params.pointZ);
        break;
        
      case 'compare':
        const operatorGroup = document.createElement('div');
        operatorGroup.className = 'control-group';
        
        const operatorLabel = document.createElement('div');
        operatorLabel.className = 'control-label';
        operatorLabel.textContent = 'Operator';
        operatorGroup.appendChild(operatorLabel);
        
        const operatorWrapper = document.createElement('div');
        operatorWrapper.className = 'select-wrapper';
        
        const operatorSelect = document.createElement('select');
        operatorSelect.dataset.nodeId = node.id;
        operatorSelect.dataset.param = 'operator';
        
        const operators = ['<', '<=', '>', '>=', '==', '!='];
        operators.forEach(op => {
          const option = document.createElement('option');
          option.value = op;
          option.textContent = op;
          if (op === node.params.operator) {
            option.selected = true;
          }
          operatorSelect.appendChild(option);
        });
        
        // Add event handlers to stop propagation
        operatorSelect.addEventListener('mousedown', (e) => e.stopPropagation());
        operatorSelect.addEventListener('click', (e) => e.stopPropagation());
        operatorSelect.addEventListener('focus', (e) => e.stopPropagation());
        
        // Handle value changes
        operatorSelect.addEventListener('change', (e) => {
          e.stopPropagation();
          console.log('Operator select changed to', e.target.value);
          this.handleNodeParamChange(e);
        });
        
        operatorWrapper.appendChild(operatorSelect);
        operatorGroup.appendChild(operatorWrapper);
        controlsElement.appendChild(operatorGroup);
        
        this.addControlGroup(controlsElement, node.id, 'If True', 'number', 'useTrue', node.params.useTrue);
        this.addControlGroup(controlsElement, node.id, 'If False', 'number', 'useFalse', node.params.useFalse);
        break;
        
      case 'terrain-type':
        this.addControlGroup(controlsElement, node.id, 'Name', 'text', 'name', node.params.name);
        
        const typeGroup = document.createElement('div');
        typeGroup.className = 'control-group';
        
        const typeLabel = document.createElement('div');
        typeLabel.className = 'control-label';
        typeLabel.textContent = 'Type';
        typeGroup.appendChild(typeLabel);
        
        const typeWrapper = document.createElement('div');
        typeWrapper.className = 'select-wrapper';
        
        const typeSelect = document.createElement('select');
        typeSelect.dataset.nodeId = node.id;
        typeSelect.dataset.param = 'type';
        
        const types = ['solid', 'liquid', 'air'];
        types.forEach(type => {
          const option = document.createElement('option');
          option.value = type;
          option.textContent = type;
          if (type === node.params.type) {
            option.selected = true;
          }
          typeSelect.appendChild(option);
        });
        
        // Add event handlers to stop propagation
        typeSelect.addEventListener('mousedown', (e) => e.stopPropagation());
        typeSelect.addEventListener('click', (e) => e.stopPropagation());
        typeSelect.addEventListener('focus', (e) => e.stopPropagation());
        
        // Handle value changes
        typeSelect.addEventListener('change', (e) => {
          e.stopPropagation();
          console.log('Type select changed to', e.target.value);
          this.handleNodeParamChange(e);
        });
        
        typeWrapper.appendChild(typeSelect);
        typeGroup.appendChild(typeWrapper);
        controlsElement.appendChild(typeGroup);
        
        this.addControlGroup(controlsElement, node.id, 'Color', 'color', 'color', node.params.color);
        break;
    }
    
    return controlsElement;
  }
  
  addControlGroup(parentElement, nodeId, label, type, paramName, value, step = 1) {
    const group = document.createElement('div');
    group.className = 'control-group';
    
    const labelElement = document.createElement('div');
    labelElement.className = 'control-label';
    labelElement.textContent = label;
    group.appendChild(labelElement);
    
    let inputElement;
    if (type === 'select') {
      inputElement = document.createElement('select');
    } else {
      inputElement = document.createElement('input');
      inputElement.type = type;
      
      if (type === 'number') {
        inputElement.step = step;
        if (paramName.includes('spread')) {
          inputElement.min = 1;
        }
      }
    }
    
    inputElement.value = value;
    inputElement.dataset.nodeId = nodeId;
    inputElement.dataset.param = paramName;
    
    // Ensure events don't bubble up
    const stopPropagation = (e) => {
      e.stopPropagation();
    };
    
    // Add various event handlers to stop propagation
    inputElement.addEventListener('mousedown', stopPropagation);
    inputElement.addEventListener('click', stopPropagation);
    inputElement.addEventListener('focus', stopPropagation);
    
    // For inputs, ensure we register both change and input events
    // Change fires when focusing out, input fires as user types
    inputElement.addEventListener('change', (e) => {
      stopPropagation(e);
      this.handleNodeParamChange(e);
    });
    
    if (type === 'number' || type === 'text' || type === 'color') {
      inputElement.addEventListener('input', (e) => {
        stopPropagation(e);
        this.handleNodeParamChange(e);
      });
    }
    
    group.appendChild(inputElement);
    
    parentElement.appendChild(group);
  }
  
  handleNodeParamChange(e) {
    const nodeId = parseInt(e.target.dataset.nodeId);
    const param = e.target.dataset.param;
    const node = this.nodeGraph.nodes.find(n => n.id === nodeId);
    
    if (!node) return;
    
    let value = e.target.value;
    
    // Convert number inputs to actual numbers
    if (e.target.type === 'number') {
      value = parseFloat(value);
    }
    
    node.params[param] = value;
    
    // Update node UI if needed
    if (node.type === 'terrain-type' && param === 'name') {
      this.updateNodeUI(node);
    }
    
    // Update the terrain viewer if active
    if (this.terrainViewer) {
      this.terrainViewer.updateTerrain();
    }
  }
  
  updateNodeUI(node) {
    // Find the node element
    const nodeContainer = this.nodeEditor.querySelector('.node-container');
    if (!nodeContainer) return;
    
    const nodeElement = nodeContainer.querySelector(`[data-node-id="${node.id}"]`);
    if (!nodeElement) return;
    
    // Update header title
    const header = nodeElement.querySelector('.node-header');
    const titleSpan = header.querySelector('.node-title');
    if (titleSpan) {
      titleSpan.textContent = this.getNodeTitle(node);
    }
    
    // If it's a mandelbrot node with remap toggled, update controls
    if (node.type === 'mandelbrot') {
      const controls = nodeElement.querySelector('.node-controls');
      while (controls.firstChild) {
        controls.removeChild(controls.firstChild);
      }
      
      // Re-create controls
      const newControls = this.createNodeControls(node);
      if (newControls) {
        Array.from(newControls.childNodes).forEach(child => {
          controls.appendChild(child);
        });
      }
    }
  }
  
  renderConnections(container) {
    // Create an SVG element for all connections
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('connections-svg');
    svg.style.position = 'absolute';
    svg.style.left = '0';
    svg.style.top = '0';
    svg.style.width = '100%';
    svg.style.height = '100%';
    svg.style.pointerEvents = 'none';
    container.appendChild(svg);
    
    // Force a small delay to ensure DOM elements are fully rendered
    setTimeout(() => {
      // Render each connection
      for (let i = 0; i < this.nodeGraph.connections.length; i++) {
        this.renderConnectionToSvg(this.nodeGraph.connections[i], i, svg, container);
      }
    }, 10);
  }
  
  renderConnectionToSvg(connection, index, svg, container) {
    // Find port elements
    const fromPortSelector = `.port-connector[data-port-id="${connection.from}"]`;
    const toPortSelector = `.port-connector[data-port-id="${connection.to}"]`;
    
    const fromPort = container.querySelector(fromPortSelector);
    const toPort = container.querySelector(toPortSelector);
    
    if (!fromPort || !toPort) return;
    
    // Find parent node elements
    const fromNodeEl = fromPort.closest('.node');
    const toNodeEl = toPort.closest('.node');
    
    if (!fromNodeEl || !toNodeEl) return;
    
    // Get node positions from inline styles (unaffected by scaling)
    const fromNodeX = parseFloat(fromNodeEl.style.left);
    const fromNodeY = parseFloat(fromNodeEl.style.top);
    const toNodeX = parseFloat(toNodeEl.style.left);
    const toNodeY = parseFloat(toNodeEl.style.top);
    
    // Find port positions relative to their nodes using DOM structure
    // This avoids scaling issues with getBoundingClientRect
    
    // Helper function to measure a port's position relative to its node
    const getPortPosition = (portEl, nodeEl) => {
      // Find port group element
      const portGroup = portEl.closest('.port');
      
      // Calculate position of port connector
      let portX = 0;
      let portY = 0;
      
      // Check if this is an input or output port
      const isInput = portEl.classList.contains('port-input');
      
      // Get the port ID to identify which port this is
      const portId = portEl.dataset.portId;
      
      // Get node type to handle special cases
      const nodeIdStr = nodeEl.dataset.nodeId;
      const nodeId = parseInt(nodeIdStr);
      const node = this.nodeGraph.nodes.find(n => n.id === nodeId);
      const nodeType = node ? node.type : '';
      
      // Calculate X position (horizontal)
      if (isInput) {
        // Left side for input ports
        portX = 15; // 10px padding + 5px margin
      } else {
        // Right side for output ports
        portX = nodeEl.offsetWidth - 15; // Node width minus (padding + margin)
      }
      
      // Header height is fixed at 32px (8px padding top/bottom + text height)
      const headerHeight = 32;
      
      // Get all inputs and outputs
      const inputPorts = nodeEl.querySelectorAll('.port-connector.port-input');
      const outputPorts = nodeEl.querySelectorAll('.port-connector.port-output');
      
      // Determine input/output index
      let inputIndex = -1;
      let outputIndex = -1;
      
      // Find index of current port
      if (isInput) {
        for (let i = 0; i < inputPorts.length; i++) {
          if (inputPorts[i] === portEl) {
            inputIndex = i;
            break;
          }
        }
      } else {
        for (let i = 0; i < outputPorts.length; i++) {
          if (outputPorts[i] === portEl) {
            outputIndex = i;
            break;
          }
        }
      }
      
      // Handle special node types
      if (nodeType === 'noise2d' || nodeType === 'noise3d' || nodeType === 'mandelbrot') {
        // These nodes have just one output at the end of the controls
        if (!isInput) {
          // Find the node controls element
          const controls = nodeEl.querySelector('.node-controls');
          // Position after controls
          if (controls) {
            // Positioning at the end
            const controlsHeight = controls.offsetHeight;
            portY = headerHeight + 10 + controlsHeight + 15;
          } else {
            // Fallback position if can't find controls
            portY = headerHeight + 20;
          }
        }
      } else if (nodeType === 'terrain-type') {
        // Terrain type has output at the end
        if (!isInput) {
          const controls = nodeEl.querySelector('.node-controls');
          if (controls) {
            const controlsHeight = controls.offsetHeight;
            portY = headerHeight + 10 + controlsHeight + 15;
          } else {
            portY = headerHeight + 20;
          }
        }
      } else if (nodeType === 'position') {
        // Position has multiple outputs
        if (!isInput) {
          // Base height + offset for the port's position in the outputs array
          portY = headerHeight + 25 + (outputIndex * 30);
        }
      } else {
        // Standard positioning based on index
        const baseY = headerHeight + 25; // Header + initial offset
        
        if (isInput) {
          // Input ports go first in most nodes
          portY = baseY + (inputIndex * 30);
        } else {
          // Output ports follow inputs and controls
          // If there are inputs, add their height
          const inputsHeight = inputPorts.length * 30;
          // Check for controls
          const controls = nodeEl.querySelector('.node-controls');
          const controlsHeight = controls ? controls.offsetHeight + 10 : 0;
          
          portY = baseY + inputsHeight + controlsHeight + (outputIndex * 30);
        }
      }
      
      return { x: portX, y: portY };
    };
    
    // Get port positions
    const fromPortPos = getPortPosition(fromPort, fromNodeEl);
    const toPortPos = getPortPosition(toPort, toNodeEl);
    
    // Calculate absolute positions in the canvas
    const fromX = fromNodeX + fromPortPos.x;
    const fromY = fromNodeY + fromPortPos.y;
    const toX = toNodeX + toPortPos.x;
    const toY = toNodeY + toPortPos.y;
    
    // Calculate control points for the bezier curve
    const dx = Math.abs(toX - fromX);
    const controlPointOffset = Math.min(dx * 0.8, 150);
    
    // Create path
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', `M${fromX},${fromY} C${fromX + controlPointOffset},${fromY} ${toX - controlPointOffset},${toY} ${toX},${toY}`);
    path.setAttribute('stroke', 'var(--connector)');
    path.setAttribute('stroke-width', '2');
    path.setAttribute('fill', 'none');
    path.classList.add('connection-path');
    path.dataset.connectionIndex = index;
    
    path.addEventListener('click', (e) => {
      const connectionIndex = parseInt(e.target.dataset.connectionIndex);
      this.nodeGraph.removeConnection(connectionIndex);
      this.renderNodeEditor();
      
      if (this.terrainViewer) {
        this.terrainViewer.updateTerrain();
      }
    });
    
    svg.appendChild(path);
  }
  
  renderTempConnection(container) {
    if (!this.selectedPort) return;
    
    // Find selected port element
    const portSelector = `.port-connector[data-port-id="${this.selectedPort}"]`;
    const portElement = container.querySelector(portSelector);
    
    if (!portElement) return;
    
    // Create SVG if needed
    let svg = container.querySelector('.connections-svg');
    if (!svg) {
      svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.classList.add('connections-svg');
      svg.style.position = 'absolute';
      svg.style.left = '0';
      svg.style.top = '0';
      svg.style.width = '100%';
      svg.style.height = '100%';
      svg.style.pointerEvents = 'none';
      container.appendChild(svg);
    }
    
    // Determine if selected port is input or output
    const isInput = portElement.dataset.portType === 'input';
    
    // For input ports, we drag from the mouse to the port
    // For output ports, we drag from the port to the mouse
    let startX, startY, endX, endY;
    
    // Get node position
    const nodeEl = portElement.closest('.node');
    const nodeX = parseFloat(nodeEl.style.left);
    const nodeY = parseFloat(nodeEl.style.top);
    
    // Calculate port position using the same approach as renderConnectionToSvg
    // Setup function to calculate port positions
    const getPortPosition = (portEl, nodeEl) => {
      // Calculate position of port connector
      let portX = 0;
      let portY = 0;
      
      // Check if this is an input or output port
      const isInput = portEl.classList.contains('port-input');
      
      // Get the port ID to identify which port this is
      const portId = portEl.dataset.portId;
      
      // Get node type to handle special cases
      const nodeIdStr = nodeEl.dataset.nodeId;
      const nodeId = parseInt(nodeIdStr);
      const node = this.nodeGraph.nodes.find(n => n.id === nodeId);
      const nodeType = node ? node.type : '';
      
      // Calculate X position (horizontal)
      if (isInput) {
        // Left side
        portX = 15; // 10px padding + 5px margin
      } else {
        // Right side
        portX = nodeEl.offsetWidth - 15; // Node width minus (padding + margin)
      }
      
      // Header height is fixed at 32px (8px padding top/bottom + text height)
      const headerHeight = 32;
      
      // Get all inputs and outputs
      const inputPorts = nodeEl.querySelectorAll('.port-connector.port-input');
      const outputPorts = nodeEl.querySelectorAll('.port-connector.port-output');
      
      // Determine input/output index
      let inputIndex = -1;
      let outputIndex = -1;
      
      // Find index of current port
      if (isInput) {
        for (let i = 0; i < inputPorts.length; i++) {
          if (inputPorts[i] === portEl) {
            inputIndex = i;
            break;
          }
        }
      } else {
        for (let i = 0; i < outputPorts.length; i++) {
          if (outputPorts[i] === portEl) {
            outputIndex = i;
            break;
          }
        }
      }
      
      // Handle special node types
      if (nodeType === 'noise2d' || nodeType === 'noise3d' || nodeType === 'mandelbrot') {
        // These nodes have just one output at the end of the controls
        if (!isInput) {
          // Find the node controls element
          const controls = nodeEl.querySelector('.node-controls');
          // Position after controls
          if (controls) {
            // Positioning at the end
            const controlsHeight = controls.offsetHeight;
            portY = headerHeight + 10 + controlsHeight + 15;
          } else {
            // Fallback position if can't find controls
            portY = headerHeight + 20;
          }
        }
      } else if (nodeType === 'terrain-type') {
        // Terrain type has output at the end
        if (!isInput) {
          const controls = nodeEl.querySelector('.node-controls');
          if (controls) {
            const controlsHeight = controls.offsetHeight;
            portY = headerHeight + 10 + controlsHeight + 15;
          } else {
            portY = headerHeight + 20;
          }
        }
      } else if (nodeType === 'position') {
        // Position has multiple outputs
        if (!isInput) {
          // Base height + offset for the port's position in the outputs array
          portY = headerHeight + 25 + (outputIndex * 30);
        }
      } else {
        // Standard positioning based on index
        const baseY = headerHeight + 25; // Header + initial offset
        
        if (isInput) {
          // Input ports go first in most nodes
          portY = baseY + (inputIndex * 30);
        } else {
          // Output ports follow inputs and controls
          // If there are inputs, add their height
          const inputsHeight = inputPorts.length * 30;
          // Check for controls
          const controls = nodeEl.querySelector('.node-controls');
          const controlsHeight = controls ? controls.offsetHeight + 10 : 0;
          
          portY = baseY + inputsHeight + controlsHeight + (outputIndex * 30);
        }
      }
      
      return { x: portX, y: portY };
    };
    
    // Get port position
    const portPos = getPortPosition(portElement, nodeEl);
    
    // Calculate absolute position in the canvas
    const portX = nodeX + portPos.x;
    const portY = nodeY + portPos.y;
    
    if (isInput) {
      // Dragging to input port
      startX = this.tempConnection.mouseX;
      startY = this.tempConnection.mouseY;
      endX = portX;
      endY = portY;
    } else {
      // Dragging from output port
      startX = portX;
      startY = portY;
      endX = this.tempConnection.mouseX;
      endY = this.tempConnection.mouseY;
      
      // Update the port position for consistent rendering
      this.tempConnection.x = portX;
      this.tempConnection.y = portY;
    }
    
    // Calculate control points for the bezier curve
    const dx = Math.abs(endX - startX);
    const controlPointOffset = Math.min(dx * 0.8, 150);
    
    // Create path
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', `M${startX},${startY} C${startX + controlPointOffset},${startY} ${endX - controlPointOffset},${endY} ${endX},${endY}`);
    path.setAttribute('stroke', 'var(--connector)');
    path.setAttribute('stroke-width', '2');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke-dasharray', '5,5');
    path.classList.add('temp-connection');
    
    // Remove any existing temp connection
    const existingTemp = svg.querySelector('.temp-connection');
    if (existingTemp) {
      existingTemp.remove();
    }
    
    svg.appendChild(path);
  }
  
  handleNodeEditorMouseDown(e) {
    // Check if clicked on node header or header elements (for dragging)
    const isHeader = e.target.classList.contains('node-header') || 
                    e.target.classList.contains('node-title');
    
    if (isHeader) {
      const nodeId = parseInt(e.target.dataset.nodeId);
      const node = this.nodeGraph.nodes.find(n => n.id === nodeId);
      
      if (node) {
        this.selectedNode = node;
        this.draggingNode = true;
        
        // Find the node element (may be parent or grandparent)
        const nodeElement = e.target.closest('.node');
        const rect = nodeElement.getBoundingClientRect();
        
        this.dragOffsetX = e.clientX - rect.left;
        this.dragOffsetY = e.clientY - rect.top;
        
        this.renderNodeEditor();
      }
      return;
    }
    
    // Check if clicked on port connector
    if (e.target.classList.contains('port-connector')) {
      const portId = e.target.dataset.portId;
      const portType = e.target.dataset.portType;
      
      // If no port is currently selected, start connection
      if (!this.selectedPort) {
        this.selectedPort = portId;
        
        // Container position in node-space
        const containerRect = this.nodeEditor.querySelector('.node-container').getBoundingClientRect();
        const mouseX = (e.clientX - containerRect.left) / this.editorScale;
        const mouseY = (e.clientY - containerRect.top) / this.editorScale;
        
        this.tempConnection = {
          mouseX: mouseX,
          mouseY: mouseY,
          type: portType
        };
        
        this.renderNodeEditor();
      } else {
        // If a port is already selected, try to complete connection
        const selectedPortEl = this.nodeEditor.querySelector(`.port-connector[data-port-id="${this.selectedPort}"]`);
        if (!selectedPortEl) {
          this.selectedPort = null;
          this.tempConnection = null;
          this.renderNodeEditor();
          return;
        }
        
        const selectedPortType = selectedPortEl.dataset.portType;
        
        // Only connect if one is input and one is output
        if (selectedPortType !== portType) {
          const fromId = selectedPortType === 'output' ? this.selectedPort : portId;
          const toId = selectedPortType === 'input' ? this.selectedPort : portId;
          
          // Add connection to graph
          this.connectPorts(fromId, toId);
        }
        
        // Reset selection
        this.selectedPort = null;
        this.tempConnection = null;
        this.renderNodeEditor();
      }
      return;
    }
    
    // Check if clicked on connection
    if (e.target.classList.contains('connection-path')) {
      const connectionIndex = parseInt(e.target.dataset.connectionIndex);
      
      // Remove connection
      this.nodeGraph.removeConnection(connectionIndex);
      this.renderNodeEditor();
      
      // Update terrain if viewer is active
      if (this.terrainViewer) {
        this.terrainViewer.updateTerrain();
      }
      return;
    }
    
    // If clicked elsewhere, deselect everything or start panning
    if (this.spacePanning) {
      this.editorPanning = true;
      this.panStartX = e.clientX;
      this.panStartY = e.clientY;
    } else {
      this.selectedNode = null;
      this.selectedPort = null;
      this.tempConnection = null;
      this.renderNodeEditor();
    }
  }
  
  handleMouseMove(e) {
    if (this.draggingNode && this.selectedNode) {
      // Update node position
      const containerRect = this.nodeEditor.querySelector('.node-container').getBoundingClientRect();
      
      const x = (e.clientX - containerRect.left) / this.editorScale - this.dragOffsetX / this.editorScale;
      const y = (e.clientY - containerRect.top) / this.editorScale - this.dragOffsetY / this.editorScale;
      
      this.selectedNode.x = Math.max(0, x);
      this.selectedNode.y = Math.max(0, y);
      
      // Just update the node position directly without rerendering everything
      const nodeElement = this.nodeEditor.querySelector(`.node[data-node-id="${this.selectedNode.id}"]`);
      if (nodeElement) {
        nodeElement.style.left = `${this.selectedNode.x}px`;
        nodeElement.style.top = `${this.selectedNode.y}px`;
        
        // Update connections
        const container = this.nodeEditor.querySelector('.node-container');
        const svg = container.querySelector('.connections-svg');
        if (svg) {
          // Clear existing connections
          const connections = svg.querySelectorAll('.connection-path');
          connections.forEach(conn => conn.remove());
          
          // Redraw connections
          for (let i = 0; i < this.nodeGraph.connections.length; i++) {
            this.renderConnectionToSvg(this.nodeGraph.connections[i], i, svg, container);
          }
        }
      }
    }
    
    // Update temp connection if creating one
    if (this.selectedPort && this.tempConnection) {
      const containerRect = this.nodeEditor.querySelector('.node-container').getBoundingClientRect();
      const mouseX = (e.clientX - containerRect.left) / this.editorScale;
      const mouseY = (e.clientY - containerRect.top) / this.editorScale;
      
      // Update mouse position in the temp connection
      this.tempConnection.mouseX = mouseX;
      this.tempConnection.mouseY = mouseY;
      
      // Just update the temporary connection rather than rerendering everything
      const container = this.nodeEditor.querySelector('.node-container');
      const svg = container.querySelector('.connections-svg');
      if (svg) {
        // Remove existing temp connection
        const existingTemp = svg.querySelector('.temp-connection');
        if (existingTemp) {
          existingTemp.remove();
        }
        
        // Add new temp connection
        this.renderTempConnection(container);
      }
    }
    
    // Handle panning
    if (this.editorPanning) {
      const dx = e.clientX - this.panStartX;
      const dy = e.clientY - this.panStartY;
      
      this.editorTranslateX += dx;
      this.editorTranslateY += dy;
      
      this.panStartX = e.clientX;
      this.panStartY = e.clientY;
      
      this.updateEditorTransform();
    }
  }
  
  handleMouseUp(e) {
    this.draggingNode = false;
    this.editorPanning = false;
    
    // If creating a connection but not over a port, cancel it
    if (this.selectedPort && !e.target.classList.contains('port-connector')) {
      this.selectedPort = null;
      this.tempConnection = null;
      this.renderNodeEditor();
    }
  }
  
  connectPorts(fromId, toId) {
    try {
      // Find the node data
      const fromNodeId = parseInt(fromId.split('_')[0]);
      const toNodeId = parseInt(toId.split('_')[0]);
      const fromNode = this.nodeGraph.nodes.find(n => n.id === fromNodeId);
      const toNode = this.nodeGraph.nodes.find(n => n.id === toNodeId);
      
      if (!fromNode || !toNode) {
        console.error("Cannot connect: node not found", fromNodeId, toNodeId);
        return;
      }
      
      // Find port definitions
      const fromPortObj = fromNode.outputs.find(p => p.id === fromId);
      const toPortObj = toNode.inputs.find(p => p.id === toId);
      
      if (!fromPortObj || !toPortObj) {
        console.error("Cannot connect: port definition not found");
        return;
      }
      
      // Check compatibility
      if (!this.arePortsCompatible(fromPortObj, toPortObj)) {
        console.error(`Cannot connect ${fromPortObj.type} to ${toPortObj.type}`);
        showToast(`Cannot connect ${fromPortObj.type} to ${toPortObj.type}`, 'error');
        return;
      }
      
      // Add connection to graph
      this.nodeGraph.addConnection(fromId, toId);
      this.renderNodeEditor();
      
      // Update terrain if viewer is active
      if (this.terrainViewer) {
        this.terrainViewer.updateTerrain();
      }
    } catch (error) {
      console.error("Error connecting ports:", error);
    }
  }
  
  arePortsCompatible(fromPort, toPort) {
    // If types match directly, they're compatible
    if (fromPort.type === toPort.type) {
      return true;
    }
    
    // Special handling for terrain-type -> terrain
    if (fromPort.type === 'terrain' && toPort.name === 'Terrain') {
      return true;
    }
    
    // Special handling for numbers (float type) to comparison inputs
    if (fromPort.type === 'float' && 
      (toPort.name === 'A' || toPort.name === 'B' || 
        toPort.name === 'Factor' || toPort.name === 'Value')) {
      return true;
    }
    
    // Special handling for boolean results to float inputs
    if (fromPort.type === 'boolean' && toPort.type === 'float') {
      return true;
    }
    
    // Allow terrain types to connect to useTrue/useFalse ports
    if (fromPort.type === 'terrain' && 
      (toPort.name === 'If True' || toPort.name === 'If False')) {
      return true;
    }
    
    return false;
  }
  
  exportToLua() {
    try {
      const result = this.nodeGraph.exportToLua();
      
      if (!result.valid) {
        // Show validation errors
        let errorMessage = 'Failed to export Lua code:\n';
        result.errors.forEach(error => {
          errorMessage += `- ${error}\n`;
        });
        
        console.error("Export validation failed:", result.errors);
        showToast('Export failed. Check the graph for errors.', 'error');
        
        // Show error details in a modal
        document.getElementById('export-code').value = errorMessage;
        document.getElementById('export-modal').style.display = 'flex';
        return;
      }
      
      // Show warnings if there are any
      if (result.warnings && result.warnings.length > 0) {
        let warningMessage = 'Export succeeded with warnings:\n';
        result.warnings.forEach(warning => {
          warningMessage += `- ${warning}\n`;
        });
        console.warn("Export warnings:", result.warnings);
        showToast('Export succeeded with warnings', 'warning');
      }
      
      // Set the code in the export modal
      document.getElementById('export-code').value = result.code;
      document.getElementById('export-modal').style.display = 'flex';
      showToast('Lua code generated successfully', 'success');
    } catch (error) {
      console.error("Error exporting to Lua:", error);
      showToast('Failed to generate Lua code', 'error');
    }
  }
}

// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  try {
    const app = new LuamapPrototyper();
    console.log("Luamap Terrain Prototyper initialized successfully");
  } catch (error) {
    console.error("Error initializing application:", error);
    alert("There was an error initializing the application. Please check the console for details.");
  }
});