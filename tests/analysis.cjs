const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname, '../js/analysis.js'), 'utf8'), context);
const analysis = context.window.Analysis;
for (const text of ['', 'asdaf', 'asdf qwer zxcv. '.repeat(50), 'banana apple orange pear. '.repeat(30), 'the and of to is. '.repeat(30), '这是一个测试。'.repeat(100)]) {
  assert.equal(analysis.detectAI(text).score, null, 'Unsupported sample must have no score');
}
const prose = 'I walked to the shop this morning because we had run out of bread and milk at home. The rain started before I reached the bridge, so I stopped under a tree and waited for a few minutes. A woman with a blue umbrella asked if I needed help, but the shop was only a short walk away. When I got back, my brother had already made tea and put two cups on the table. We sat by the kitchen window and talked about our plans for the weekend while the dog slept beside the door.';
assert.equal(analysis.assessAIInput(prose).eligible, true);
const result = analysis.detectAI(prose);
assert.ok(Number.isFinite(result.score));
assert.match(result.label, /authorship uncertain/);
assert.equal(result.confidence, 'limited');
console.log('PASS: short, random, repetitive, unsupported samples abstain; connected prose gets a limited style index.');
