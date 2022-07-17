// for @angular-builders/custom-webpack
// https://www.digitalocean.com/community/tutorials/angular-custom-webpack-config
// https://www.npmjs.com/package/@angular-builders/custom-webpack : merge config
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
  //config.output.chunkFilename = `[id].js` // `src_app_plan_worker_ts`
  //console.log(JSON.stringify(config))
  return config;
}

/* or: try using: ng eject  to make a pure webpack-app without further ng interaction
 * https://medium.com/hackernoon/webpack-for-angular-developers-c8584a60e627 
 */
