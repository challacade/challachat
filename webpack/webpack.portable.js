const path = require('path');

module.exports = {
  mode: 'production',
  target: 'node',
  entry: './dist/http/server.js',
  output: {
    path: path.resolve(__dirname, 'build'),
    filename: 'app-bundled.js',
    library: { type: 'commonjs2' }
  },
  externals: {
    // Externalize ALL dependencies to keep the executable smaller
    'puppeteer': 'commonjs2 puppeteer',
    'puppeteer-core': 'commonjs2 puppeteer-core',
    'ws': 'commonjs2 ws',
    'chrome-launcher': 'commonjs2 chrome-launcher',
    'express': 'commonjs2 express',
    'socket.io': 'commonjs2 socket.io',
    'iconv-lite': 'commonjs2 iconv-lite'
  },
  resolve: {
    extensions: ['.js', '.json']
  },
  optimization: {
    minimize: true
  },
  node: {
    __dirname: false,
    __filename: false
  }
};
