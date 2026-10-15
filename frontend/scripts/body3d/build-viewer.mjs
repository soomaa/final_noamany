import {build} from 'esbuild';import {copyFile,mkdir,readFile,writeFile} from 'node:fs/promises';import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
await build({entryPoints:[`${root}src/components/training/body3d/viewer.mjs`],outfile:`${root}public/body3d/viewer.js`,bundle:true,minify:true,format:'iife',target:'es2020',legalComments:'eof'});
await writeFile(`${root}public/body3d/THREE-LICENSE.txt`,await readFile(`${root}node_modules/three/LICENSE`));
await copyFile(`${root}node_modules/@fontsource/tajawal/files/tajawal-arabic-400-normal.woff2`, `${root}public/body3d/tajawal.woff2`);
await copyFile(`${root}node_modules/@fontsource/tajawal/LICENSE`, `${root}public/body3d/FONT-LICENSE.txt`);
const flutter = process.argv[2];
if (flutter) {
 await mkdir(flutter,{recursive:true});
 for(const name of ['index.html','viewer.js','mesh.json','mesh.bin','ATTRIBUTION.txt','LICENSE.ASSETS.md','THREE-LICENSE.txt','tajawal.woff2','FONT-LICENSE.txt'])await copyFile(`${root}public/body3d/${name}`,`${flutter}/${name}`);
}
