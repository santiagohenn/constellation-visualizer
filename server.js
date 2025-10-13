const express = require('express');
const app = express();
const path = require('path');

require('dotenv').config({ path: './KEYS.env' });
require('dotenv').config({ path: './.env' });
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
  plugins: [
    new CopyWebpackPlugin({
      patterns: [
        {
          from: 'node_modules/cesium/Build/Cesium/Workers',
          to: 'Cesium/Workers',
        },
        {
          from: 'node_modules/cesium/Build/Cesium/ThirdParty',
          to: 'Cesium/ThirdParty',
        },
        {
          from: 'node_modules/cesium/Build/Cesium/Assets',
          to: 'Cesium/Assets',
        },
        {
          from: 'node_modules/cesium/Build/Cesium/Widgets',
          to: 'Cesium/Widgets',
        },
      ],
    }),
  ],
    entry: './public/javascripts/tle.js',
    output: {
        filename: 'tle.js'
    }
};

// Get Cesium API key from either environment variable name. Not needed for offline use.
const cesiumApiKey = process.env.CESIUM_ION_ACCESS_TOKEN || process.env.CESIUM_API_KEY;

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/get-cesium-config', (req, res) => {
  const cesiumConfig = {
    apiKey: cesiumApiKey,
  };
  res.json(cesiumConfig);
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

const { exec } = require('child_process');