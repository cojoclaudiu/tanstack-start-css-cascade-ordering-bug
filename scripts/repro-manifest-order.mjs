import { rootRouteId } from '@tanstack/react-router'
import { buildStartManifest } from '../node_modules/.pnpm/node_modules/@tanstack/start-plugin-core/dist/esm/start-manifest-plugin/manifestBuilder.js'

const routeFilePath = '/virtual/src/routes/css-order-bug.tsx'

const entryChunk = {
  fileName: 'entry.js',
  routeFilePaths: [],
  css: [],
  imports: [],
}

const routeChunk = {
  fileName: 'css-order-bug.js',
  routeFilePaths: [routeFilePath],
  css: ['field-detail-panel.css'],
  imports: ['tabs.js'],
}

const designSystemChunk = {
  fileName: 'tabs.js',
  routeFilePaths: [],
  css: ['tabs.css'],
  imports: [],
}

const manifest = buildStartManifest({
  basePath: '/assets',
  additionalRouteAssets: undefined,
  routeTreeRoutes: {
    [rootRouteId]: {
      filePath: '/virtual/src/routes/__root.tsx',
      children: ['/css-order-bug'],
    },
    '/css-order-bug': {
      filePath: routeFilePath,
      children: undefined,
    },
  },
  clientBuild: {
    entryChunkFileName: entryChunk.fileName,
    chunksByFileName: new Map([
      [entryChunk.fileName, entryChunk],
      [routeChunk.fileName, routeChunk],
      [designSystemChunk.fileName, designSystemChunk],
    ]),
  },
})

const assets = manifest.routes['/css-order-bug']?.assets ?? []
const hrefs = assets
  .map((asset) => asset.attrs?.href)
  .filter((href) => typeof href === 'string')

const expectedFixedOrder = ['/assets/tabs.css', '/assets/field-detail-panel.css']
const buggyOrder = ['/assets/field-detail-panel.css', '/assets/tabs.css']

console.log('Route CSS asset order:', hrefs.join(' -> '))

if (hrefs.length !== 2) {
  console.error('Unexpected manifest output:', JSON.stringify(assets, null, 2))
  process.exit(1)
}

if (hrefs[0] === buggyOrder[0] && hrefs[1] === buggyOrder[1]) {
  console.log('Bug reproduced: consumer CSS is emitted before dependency CSS.')
  console.log('Expected fixed order:', expectedFixedOrder.join(' -> '))
  process.exit(0)
}

if (hrefs[0] === expectedFixedOrder[0] && hrefs[1] === expectedFixedOrder[1]) {
  console.log('Upstream appears fixed: dependency CSS is emitted before consumer CSS.')
  process.exit(0)
}

console.error('Unexpected CSS order.')
console.error('Expected buggy order:', buggyOrder.join(' -> '))
console.error('Expected fixed order:', expectedFixedOrder.join(' -> '))
process.exit(1)
