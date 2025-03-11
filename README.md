# Luamap Terrain Prototyper

An interactive web application for prototyping terrain generation algorithms for Luanti/Minetest mapgens using Luamap.

## Features

- **Node-based Visual Programming**: Create complex terrain generation logic using a node-based editor
- **Real-time 3D Preview**: View your terrain in real-time with adjustable resolution and scale
- **Luanti-compatible Noise**: Exact implementation of Luanti's noise functions
- **Export to Lua**: Generate valid Luamap mod code for use in Luanti/Minetest

## Getting Started

### Installation

```bash
# Clone the repository
git clone [repo-url]
cd luamap-app

# Install dependencies
npm install

# Start the development server
npm run dev
```

### Building for Production

```bash
npm run build
```

## Usage Guide

### Node Editor Basics

1. **Add Nodes**: Click on node types in the sidebar to add them to the editor
2. **Connect Nodes**: Click an output port (right side), then an input port (left side) to connect them
3. **Configure Nodes**: Adjust parameters in each node to control the terrain generation
4. **View Terrain**: Switch to the Terrain Viewer tab to see your terrain in 3D
5. **Export Code**: Click the "Export to Lua" button to generate Luamap code

### Common Node Patterns

- **Basic Heightmap**: Position Y → Compare → Terrain Output
- **Noise-based Terrain**: Noise 2D + Position Y → Compare → Terrain Output
- **Multiple Biomes**: Multiple Compare nodes with different terrain outputs

## Implementation Details

- The noise implementation exactly matches Luanti/Minetest's C++ implementation
- All core Luamap functions are supported: lerp, coserp, remap, etc.
- Shaders are used for efficient terrain rendering

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.