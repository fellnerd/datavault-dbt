// esbuild configuration for Webviews (React)
// Supports multiple entry points: Entity Designer, Mart Designer
import * as esbuild from 'esbuild';
import * as fs from 'fs';

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

// Webview entry points with explicit output names
const webviewEntries = [
  { in: 'src/webviews/entityDesigner/app/index.tsx', out: 'entityDesigner' },
  { in: 'src/webviews/martDesigner/app/index.tsx', out: 'martDesigner' },
];

// Filter to only existing entry points and build entryPoints object
const existingEntryPoints = {};
webviewEntries.forEach(entry => {
  try {
    fs.accessSync(entry.in);
    existingEntryPoints[entry.out] = entry.in;
  } catch {
    console.log(`[esbuild] Skipping non-existent entry: ${entry.in}`);
  }
});

/**
 * @type {import('esbuild').BuildOptions}
 */
const buildOptions = {
  entryPoints: existingEntryPoints,
  bundle: true,
  outdir: 'out/webviews', // Output directory for multiple entries
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
