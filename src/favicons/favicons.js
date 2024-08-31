// https://medium.com/tech-angels-publications/bundle-your-favicons-with-webpack-b69d834b2f53
// npm i require-context --save

// FAILS with Angular-17, but it wasn't being used before that either:
// const faviconsContext = require.context(
//     '!!file-loader?name=src/favicons/[name].[ext]!.',
//     true,
//     /\.(svg|png|ico|xml|json)$/
//   );
//   console.log(`favicons.js:`,faviconsContext.keys())
//   faviconsContext.keys().forEach(faviconsContext);
