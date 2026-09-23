const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const pluginDir = path.resolve(__dirname, '../plugin');
const outputDir = path.resolve(__dirname, '..');
const ccxPath = path.join(outputDir, 'psd-mobile-preview.ccx');

console.log('Packaging Photoshop UXP Plugin...');

if (!fs.existsSync(path.join(pluginDir, 'manifest.json'))) {
  console.error('Error: manifest.json not found in plugin directory!');
  process.exit(1);
}

if (fs.existsSync(ccxPath)) {
  fs.unlinkSync(ccxPath);
}

// Package directory using zip command
try {
  // Zip inside plugin directory so paths in archive are relative to root
  execSync(`cd "${pluginDir}" && zip -r "${ccxPath}" manifest.json index.html index.js styles.css qrcode.min.js icons`, {
    stdio: 'inherit'
  });

  const stats = fs.statSync(ccxPath);
  console.log(`\nSuccessfully created: psd-mobile-preview.ccx (${(stats.size / 1024).toFixed(1)} KB)`);
  console.log(`\nTo install into Photoshop 2026:`);
  console.log(`  1. Double click psd-mobile-preview.ccx`);
  console.log(`  OR run: open "${ccxPath}"`);
  console.log(`  OR load into Adobe UXP Developer Tools -> Add Plugin.`);
} catch (err) {
  console.error('Packaging failed:', err.message);
  process.exit(1);
}
