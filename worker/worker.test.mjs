import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './worker.mjs';

const env = {GITHUB_TOKEN: 'test-token-not-a-real-credential'};
const state = {'2026-10-22': 'closed', 'notice-jiuzhai-stay': 'removed', edits: {'2026-10-22/0/1': '上海 → 成都 ✈️\n已确认'}};
const post = body => new Request('https://example.test/state', {
  method: 'POST', body: JSON.stringify(body), headers: {'Content-Type': 'application/json'}
});

test('public save updates only the fixed GitHub file using its current SHA', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({url, options});
    return calls.length === 1 ? Response.json({sha: 'current-sha'}) : Response.json({});
  });
  const response = await worker.fetch(post(state), env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
  assert.deepEqual(await response.json(), {saved: true});
  assert.equal(calls.length, 2);
  assert.equal(calls[1].url, 'https://api.github.com/repos/estella2012/travel-plan/contents/state.json');
  assert.equal(calls[1].options.method, 'PUT');
  assert.equal(calls[1].options.headers.Authorization, `Bearer ${env.GITHUB_TOKEN}`);
  const body = JSON.parse(calls[1].options.body);
  assert.equal(body.sha, 'current-sha');
  assert.equal(body.branch, 'main');
  assert.deepEqual(JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(body.content), char => char.charCodeAt(0)))), state);
});

test('CORS preflight makes no GitHub call', async t => {
  const fetch = t.mock.method(globalThis, 'fetch');
  const response = await worker.fetch(new Request('https://example.test/state', {method: 'OPTIONS'}), env);
  assert.equal(response.status, 204);
  assert.equal(fetch.mock.callCount(), 0);
});

test('invalid state and arbitrary write targets are rejected before any GitHub call', async t => {
  const fetch = t.mock.method(globalThis, 'fetch');
  for (const body of [null, [], {repo: 'other/repo'}, {'2026-10-22': 'removed'}, {'2026-10-22': 'unexpected'}, {edits: []}, {edits: {title: 123}}]) {
    const response = await worker.fetch(post(body), env);
    assert.equal(response.status, 400);
  }
  assert.equal(fetch.mock.callCount(), 0);
});

test('GitHub read failure does not attempt a write or expose the token', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => Response.json({message: 'Forbidden'}, {status: 403}));
  const response = await worker.fetch(post(state), env);
  assert.equal(response.status, 502);
  assert.equal(fetch.mock.callCount(), 1);
  assert.ok(!(await response.text()).includes(env.GITHUB_TOKEN));
});

test('GitHub conflict is reported without retrying', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => ++calls === 1
    ? Response.json({sha: 'current-sha'})
    : Response.json({message: 'Conflict'}, {status: 409}));
  const response = await worker.fetch(post(state), env);
  assert.equal(response.status, 409);
  assert.equal(calls, 2);
});
