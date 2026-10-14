const { test } = require('node:test');
const assert = require('node:assert/strict');
const manifest = require('../addon/manifest.json');

test('Zotero 10 required installation fields are present, including update_url', () => {
  const app = manifest.applications.zotero;
  assert.equal(manifest.manifest_version, 2);
  for (const field of ['id', 'update_url', 'strict_min_version', 'strict_max_version']) {
    assert.ok(typeof app[field] === 'string' && app[field].length, `Missing ${field}`);
  }
  assert.equal(app.strict_min_version, '10.0');
  assert.equal(app.strict_max_version, '10.0.*');
  assert.equal(new URL(app.update_url).protocol, 'https:');
});

test('manual-update distribution uses a reserved update host and consistent package version', () => {
  const app = manifest.applications.zotero;
  assert.equal(new URL(app.update_url).hostname, 'quicklex.invalid');
  assert.equal(manifest.version, require('../package.json').version);
});
