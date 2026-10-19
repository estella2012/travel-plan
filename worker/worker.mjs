const fileUrl = 'https://api.github.com/repos/estella2012/travel-plan/contents/state.json';
const dayIds = new Set([
  '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25',
  '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29',
  '2026-11-07', '2026-11-08'
]);
const noticeIds = new Set(['notice-jiuzhai-stay', 'notice-chengdu-airport']);
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json; charset=utf-8'
};

function reply(body, status = 200) {
  return new Response(JSON.stringify(body), {status, headers: cors});
}

export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname !== '/state') return reply({error: 'Not found'}, 404);
    if (request.method === 'OPTIONS') return new Response(null, {status: 204, headers: cors});
    if (request.method !== 'POST') return reply({error: 'Use POST'}, 405);

    let state;
    try {
      state = await request.json();
    } catch {
      return reply({error: '请求必须是 JSON'}, 400);
    }
    if (!state || typeof state !== 'object' || Array.isArray(state) ||
        !Object.entries(state).every(([id, value]) =>
          ((dayIds.has(id) || noticeIds.has(id)) && (value === 'open' || value === 'closed')) ||
          (noticeIds.has(id) && value === 'removed'))) {
      return reply({error: '只接受当前行程的展开、收起和提醒隐藏状态'}, 400);
    }
    if (!env.GITHUB_TOKEN) return reply({error: '请在 Worker 中配置 GITHUB_TOKEN Secret'}, 503);

    const headers = {
      'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'travel-plan-state'
    };
    try {
      const current = await fetch(`${fileUrl}?ref=main`, {headers});
      if (!current.ok) return reply({error: `读取 GitHub 状态失败（${current.status}）`}, 502);
      const file = await current.json();
      const saved = await fetch(fileUrl, {
        method: 'PUT',
        headers: {...headers, 'Content-Type': 'application/json'},
        body: JSON.stringify({
          message: 'Update shared itinerary view state',
          content: btoa(JSON.stringify(state, null, 2) + '\n'),
          sha: file.sha,
          branch: 'main'
        })
      });
      if (saved.status === 409) return reply({error: '保存期间状态已被修改，请刷新后重新调整'}, 409);
      if (!saved.ok) return reply({error: `写入 GitHub 状态失败（${saved.status}）`}, 502);
      return reply({saved: true});
    } catch {
      return reply({error: '连接 GitHub 失败，请稍后重试'}, 502);
    }
  }
};
