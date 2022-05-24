// for @angular-builders/custom-webpack
import * as webpack from 'webpack';
import { CustomWebpackBrowserSchema, TargetOptions } from '@angular-builders/custom-webpack';

export default (
    config: webpack.Configuration,
    options: CustomWebpackBrowserSchema,
    targetOptions: TargetOptions
) => {
  // do your config modifications here
  //config.mode = 'dev'
  //config.optimization.minimize = false
  //config.output.filename = '[name].[contenthash].bundle.js'
  //config.output.chunkFilename = `[id].chunk${Math.floor(Math.random()*100)}.js`
  config.output.chunkFilename = `[id].js`
  return config;
}

/* or: try using: ng eject  to make a pure webpack-app without further ng interaction
 * https://medium.com/hackernoon/webpack-for-angular-developers-c8584a60e627 
 */
