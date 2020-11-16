const path = require('path')
const TeserWebpackPlugin = require('terser-webpack-plugin')

module.exports = {
  mode: 'none',
  entry: {
    index: './src/index.js'
  },
  output: {
    path: path.resolve('lib'),
    filename: '[name].js',
    library: 'Promise',
    libraryExport: 'default',
    libraryTarget: 'umd'
  },
  optimization: {
    minimize: true,
    minimizer: [
      new TeserWebpackPlugin({ // uglify 默认不会转 es6 语法
        include: /\.min\.js$/
      })
    ]
  }
}