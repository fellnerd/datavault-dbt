// esbuild configuration for Entity Designer Webview (React)
import * as esbuild from 'esbuild';

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * @type {import('esbuild').BuildOptions}
 */
const buildOptions = {
  entryPoints: ['src/webviews/entityDesigner/app/index.tsx'],
  bundle: true,
  outfile: 'out/webviews/entityDesigner.js',
  external: [], // Bundle everything for webview
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  sourcemap: !production,
  minify: production,
  loader: {
    '.tsx': 'tsx',
    '.ts': 'ts',
    '.css': 'css',
  },
  define: {
    'process.env.NODE_ENV': production ? '"production"' : '"development"',
  },
  // Required for React to work correctly
  jsx: 'automatic',
  jsxImportSource: 'react',
  // Ensure React is bundled correctly
  mainFields: ['module', 'main'],
  // Handle CSS imports
  plugins: [
    {
      name: 'css-modules',
      setup(build) {
        // Import CSS as side effect
        build.onResolve({ filter: /\.css$/ }, args => {
          return { path: args.path, namespace: 'css', external: false };
        });
      },
    },
  ],
};

async function main() {
  if (watch) {
    const ctx = await esbuild.context(buildOptions);
    await ctx.watch();
    console.log('[esbuild] Watching for changes...');
  } else {
    await esbuild.build(buildOptions);
    console.log('[esbuild] Build complete');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
