# 🛰️ Constellation Visualizer

A web-based 3D satellite constellation plotter and visualizer built with **Cesium.js** and **Node.js**. This tool specializes in generating and visualizing **Walker Delta constellations** and **symmetric satellite constellations** in real-time 3D space.

![Constellation Visualizer](https://img.shields.io/badge/Status-Active-brightgreen) ![License](https://img.shields.io/badge/License-ISC-blue) ![Node.js](https://img.shields.io/badge/Node.js-18+-green) ![Cesium](https://img.shields.io/badge/Cesium.js-1.108+-blue)

## Features

### 🌍 3D Visualization
- **Real-time 3D rendering** using Cesium.js with WebGL acceleration
- **ICRF (International Celestial Reference Frame)** support for accurate orbital mechanics in the most STK like style.
- **Adaptive zoom controls** with smooth camera transitions for enhanced terrain visualization
- **Day/night lighting** with realistic Earth shadows

### 🛰️ Constellation Generation
- **Walker Delta constellation** generation with height, inclination: T/P/F parameters
- **SGP4 propagation** for accurate satellite motion prediction (not really needed for plotting but nice-to-have)

## Quick Start

### Prerequisites
- **Node.js** 18+ 
- **npm** or **yarn**
- **Cesium Ion account** (optional, for enhanced terrain)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/santiagohenn/constellation-visualizer.git
   cd constellation-visualizer
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables** (optional)
   ```bash
   cp .env.example .env
   # Edit .env and add your Cesium Ion access token
   ```

4. **Start the server**
   ```bash
   npm start
   ```

5. **Open your browser**
   ```
   http://localhost:[PORT]
   ```

## Usage

### Creating a Walker Delta Constellation

1. **Set Reference Elements**
   - **Constellation Height**: Altitude above Earth (100-120,000 km)
   - **Inclination**: Orbital inclination angle (0-180°)

2. **Configure Walker Delta Parameters**
   - **T**: Total number of satellites (1-10,000)
   - **P**: Number of orbital planes (1-100)
   - **F**: Phase factor for inter-plane spacing (-360° to 360°)

3. **Generate Constellation**
   - Click **"Populate Walker-Delta"**
   - Watch as satellites are propagated and rendered in 3D space

Note: you can generate the constellation from a certain point in time by using the datetime selector, but propagation is limited to one orbital period (+5%) for now, to avoid performance issues.

### Walker Delta Formula
The constellation uses the standard Walker Delta notation **T/P/F**:
- **T**: Total satellites
- **P**: Number of planes
- **F**: Relative spacing parameter

**Phase offset calculation**: `Δθ = F × 360° / T`

### Controls
- **Mouse**: Rotate, zoom, and pan the 3D view
- **Labels**: Toggle satellite name labels on/off
- **Sunlight**: Enable/disable realistic Earth lighting
- **Color Picker**: Customize satellite and path colors
- **Clear**: Remove all satellites from the scene
- **Snapshot**: Capture high-resolution screenshots

### Core Components

**`dynamics.js`** - Main Engine
- Cesium.js initialization and configuration
- SGP4 satellite propagation
- Walker Delta constellation generation
- Real-time rendering and animation

**`tle.js`** - TLE Generation
- Two-Line Element format generation
- Orbital element validation and formatting
- Checksum calculation and verification

**`propagatorUtils.js`** - Utilities
- Orbital period calculations
- Date/time manipulation
- Random name generation

**`server.js`** - Backend
- Express.js web server
- Static file serving
- Cesium Ion API key management

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the **ISC License** - see the [LICENSE](LICENSE) file for details.

---

⭐ If this project helps you, please give it a star on GitHub!

