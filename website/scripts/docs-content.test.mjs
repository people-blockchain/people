import { test } from 'node:test';
import assert from 'node:assert/strict';
import { docsContent, searchSections } from '../src/lib/docs-content.ts';
import { SITE_ROUTES } from '../src/lib/site.ts';

test('both languages offer matching complete navigation and valid destinations', () => {
  assert.deepEqual(docsContent.ru.sections.map(s => s.id), docsContent.en.sections.map(s => s.id));
  const routes = new Set(SITE_ROUTES.map(r => r.path));
  assert.ok(routes.has('/docs'));
  for (const guide of Object.values(docsContent)) {
    assert.ok(guide.nodeQuickStart?.title && guide.nodeQuickStart.copy);
    const ids = new Set(guide.sections.map(s => s.id));
    assert.equal(ids.size, guide.sections.length);
    for (const link of [...guide.cards, ...guide.sections.flatMap(s => s.links)]) {
      assert.ok(link.href.startsWith('#') ? ids.has(link.href.slice(1)) : routes.has(link.href), link.href);
    }
    for (const s of guide.sections) assert.ok(s.title && s.lead && s.items.length);
  }
});

test('search handles case, whitespace, multiple words and recovery from empty results', () => {
  assert.equal(searchSections(docsContent.ru.sections, '  КОШЕЛЁК  ').some(s => s.id === 'start'), true);
  assert.equal(searchSections(docsContent.en.sections, 'private bootstrap').some(s => s.id === 'node-manual'), true);
  assert.deepEqual(searchSections(docsContent.en.sections, 'nonexistent-query'), []);
  assert.deepEqual(searchSections(docsContent.en.sections, '   '), docsContent.en.sections);
});

test('public joining is Docker-first and manual startup is a separate advanced section', () => {
  for (const guide of Object.values(docsContent)) {
    const node = guide.sections.find(s => s.id === 'node');
    assert.equal(node.code, undefined);
    assert.match(node.lead, /Docker/);
    assert.ok(node.links.some(link => link.href === '#node-manual'));
    assert.match(guide.sections.find(s => s.id === 'node-manual').code, /node --env-file=\.env.node apps\/node\/dist\/index.js/);
    assert.match(guide.sections.find(s => s.id === 'verify').code, /\/chain\/head/);
  }
});
