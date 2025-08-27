const path = require('path');
const nodeExternals = require('webpack-node-externals');

module.exports = {
  target: 'node',
  entry: './dist/http/server.js',
  output: {
    path: path.resolve(__dirname, 'build'),
    filename: 'server-bundled.js',
  },
  externals: [
    // Exclude Node.js built-in modules
    nodeExternals({
      allowlist: [
        // Include all dependencies in the bundle
        /^(?!node:)/
      ]
    })
  ],
  mode: 'production',
  optimization: {
    minimize: false // Keep readable for debugging
  },
  resolve: {
    extensions: ['.js', '.json']
  }
};
