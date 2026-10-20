import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './worker.mjs';

const env = {GITHUB_TOKEN: 'test-token-not-a-real-credential'};
const state = {'2026-10-22': 'closed', 'notice-jiuzhai-stay': 'removed', events: [{
  id: '2026-10-22/0', date: '2026-10-22', fields: [
    {id: '2026-10-22/0/0', kind: 'time', text: '13:10'},
    {id: '2026-10-22/0/1', kind: 'title', text: '上海 → 成都 ✈️\n已确认'}
  ]
}]};
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

test('deletion stores no record or deletion marker for the removed card', async t => {
  let written;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (options.method !== 'PUT') return Response.json({sha: 'current-sha'});
    written = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(JSON.parse(options.body).content), char => char.charCodeAt(0))));
    return Response.json({});
  });
  const response = await worker.fetch(post({...state, events: []}), env);
  assert.equal(response.status, 200);
  assert.deepEqual(written.events, []);
  assert.ok(!JSON.stringify(written).includes('上海'));
  assert.ok(!JSON.stringify(written).includes('2026-10-22/0'));
});


test('image upload stores a separate file in the fixed repository and returns its raw URL', async t => {
  const calls=[];
  t.mock.method(globalThis,'fetch', async (url, options) => {
    calls.push({url,options});
    return Response.json({commit:{sha:'uploaded'}});
  });
  const response=await worker.fetch(new Request('https://example.test/images',{
    method:'POST', body:JSON.stringify({content:'UklGRg=='})
  }),env);
  assert.equal(response.status,200);
  assert.equal(calls.length,1);
  assert.match(calls[0].url,/^https:\/\/api\.github\.com\/repos\/estella2012\/travel-plan\/contents\/images\/[\da-f-]+\.webp$/);
  assert.deepEqual(JSON.parse(calls[0].options.body),{message:'Upload itinerary image',content:'UklGRg==',branch:'main'});
  const result=await response.json();
  assert.equal(result.url,calls[0].url.replace('https://api.github.com/repos/','https://raw.githubusercontent.com/').replace('/contents/','/main/'));
});

test('invalid images do not write to GitHub and failed uploads report errors', async t => {
  const mocked=t.mock.method(globalThis,'fetch',async()=>Response.json({message:'No access'},{status:403}));
  for(const body of [{}, {content:''}, {content:'not base64!'}]) {
    const response=await worker.fetch(new Request('https://example.test/images',{method:'POST',body:JSON.stringify(body)}),env);
    assert.equal(response.status,400);
  }
  assert.equal(mocked.mock.callCount(),0);
  const failed=await worker.fetch(new Request('https://example.test/images',{method:'POST',body:JSON.stringify({content:'UklGRg=='})}),env);
  assert.equal(failed.status,502);
  assert.match((await failed.json()).error,/403/);
});

test('saved cards retain image links without embedding image bytes in itinerary data', async t => {
  const withImage=structuredClone(state);
  withImage.events[0].fields.push({id:'2026-10-22/0/image',kind:'image',text:'https://raw.githubusercontent.com/estella2012/travel-plan/main/images/example.webp'});
  let saved;
  t.mock.method(globalThis,'fetch',async (url,options)=>{
    if(options.method==='PUT') { saved=JSON.parse(options.body); return Response.json({}); }
    return Response.json({sha:'current-sha'});
  });
  const response=await worker.fetch(post(withImage),env);
  assert.equal(response.status,200);
  assert.deepEqual(JSON.parse(Buffer.from(saved.content,'base64').toString('utf8')),withImage);
});


test('newly added dates support disclosure state and newly created itinerary cards',async t=>{
  const dates=['2026-10-30','2026-10-31','2026-11-01','2026-11-02','2026-11-03','2026-11-04','2026-11-05','2026-11-06'];
  t.mock.method(globalThis,'fetch',async(url,options)=>Response.json(options.method==='PUT'?{}:{sha:'current-sha'}));
  for(const date of dates){
    const next=structuredClone(state);
    next[date]='closed';
    next.events.push({id:date+'/task',date,fields:[{id:date+'/time',kind:'time',text:''},{id:date+'/title',kind:'title',text:'新安排'}]});
    assert.equal((await worker.fetch(post(next),env)).status,200,date);
  }
});
