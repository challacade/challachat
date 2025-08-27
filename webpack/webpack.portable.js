const path = require('path');

module.exports = {
  mode: 'production',
  target: 'node',
  entry: './dist/http/server.js',
  output: {
    path: path.resolve(__dirname, 'build/challachat-portable/app'),
    filename: 'app.js',
    library: { type: 'commonjs2' }
  },
  externals: {
    'puppeteer': 'commonjs2 puppeteer'
  },
  resolve: {
    extensions: ['.js', '.json']
  },
  optimization: {
    minimize: true
  }
};
