// グループ限定 3D＆2Dクイズ＆性格診断クリスマスツリー — Cloudflare Pages Function API
// Database: Cloudflare KV (binding name: TREES). One key per tree: tree_<id> = JSON (tree + participants).
// Same logic as the Google Apps Script version: invite token + optional passcode (SHA-256),
// personality titles by score %, permanent No. numbering, messages sealed until 2026-12-25 00:00 JST.

const UNLOCK_MS = Date.UTC(2026, 11, 24, 15, 0, 0); // 2026-12-25 00:00 JST
const TOKEN_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const ID_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';

function rand(len, chars) {
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  let s = '';
  for (let i = 0; i < len; i++) s += chars[buf[i] % chars.length];
  return s;
}
async function hash(text) {
  if (!text) return '';
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text)));
  return btoa(String.fromCharCode(...new Uint8Array(digest)));
}
function personalityFor(percent) {
  if (percent >= 100) return '理解度MAXの聖夜パートナー';
  if (percent >= 80) return '雪見ココアの賢者';
  if (percent >= 60) return 'トナカイの名案内人';
  if (percent >= 40) return 'キャンドルライトの見守り人';
  if (percent >= 20) return '雪だるまの親友';
  return 'クリスマスの迷子サンタ見習い';
}
function personalityDesc(percent) {
  if (percent >= 100) return 'ホストのことを完璧に理解している、聖夜に欠かせない相棒タイプです。';
  if (percent >= 80) return '温かいココアのように深く相手を思いやる、賢くて優しいタイプです。';
  if (percent >= 60) return '雪道でもみんなを導ける、頼れるトナカイタイプです。';
  if (percent >= 40) return '静かに灯るキャンドルのように、そっと寄り添うタイプです。';
  if (percent >= 20) return '一緒に雪だるまを作りたくなる、ほのぼの癒しタイプです。';
  return 'まだまだ伸びしろたっぷり！これからもっと仲良くなれるタイプです。';
}

async function loadTree(env, id) {
  if (!id || !/^[a-z0-9]{6,12}$/i.test(id)) return null;
  const raw = await env.TREES.get('tree_' + id);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}
async function saveTree(env, tree) {
  await env.TREES.put('tree_' + tree.id, JSON.stringify(tree));
}
async function validate(env, id, token, passcode) {
  const tree = await loadTree(env, id);
  if (!tree) return { ok: false, error: 'ツリーが見つかりませんでした。リンクを確認してください。' };
  if (!token || token !== tree.inviteToken) return { ok: false, code: 'BAD_TOKEN', error: '招待トークンが正しくありません。このツリーはグループ限定です。' };
  if (tree.passcodeHash) {
    if (!passcode) return { ok: false, code: 'NEED_PASSCODE', needsPasscode: true, title: tree.title, ownerName: tree.ownerName, hasPasscode: true, error: '合言葉が必要です。' };
    if ((await hash(passcode)) !== tree.passcodeHash) return { ok: false, code: 'BAD_PASSCODE', needsPasscode: true, title: tree.title, ownerName: tree.ownerName, hasPasscode: true, error: '合言葉が違います。' };
  }
  return { ok: true, tree };
}

async function createTree(env, data) {
  data = data || {};
  const title = String(data.title || '').trim().slice(0, 60) || 'みんなのクリスマスツリー';
  const ownerName = String(data.ownerName || '').trim().slice(0, 30) || 'ホスト';
  const questions = (data.questions || []).map(q => ({
    q: String(q.q || '').trim().slice(0, 200),
    choices: (q.choices || []).map(c => String(c || '').trim().slice(0, 80)).slice(0, 4),
    answer: Math.max(0, Math.min(3, parseInt(q.answer, 10) || 0))
  })).filter(q => q.q && q.choices.length === 4 && q.choices.every(c => c));
  if (questions.length < 3 || questions.length > 15) return { ok: false, error: '質問は3〜15問で、すべて入力してください。' };

  let id = rand(8, ID_CHARS);
  while (await loadTree(env, id)) id = rand(8, ID_CHARS);
  const inviteToken = rand(24, TOKEN_CHARS);
  const hostKey = rand(20, TOKEN_CHARS);
  const passcode = String(data.passcode || '').trim();
  const tree = {
    id, inviteToken,
    hostKeyHash: await hash(hostKey),
    title, ownerName,
    passcodeHash: passcode ? await hash(passcode) : '',
    hasPasscode: !!passcode,
    questions,
    participants: [], // Strictly 0 participants at start — never dummy data
    createdAt: new Date().toISOString()
  };
  await saveTree(env, tree);
  return { ok: true, id, inviteToken, hostKey, url: '/?tree=' + id + '&invite=' + inviteToken };
}

function publicData(tree, hostKeyOk) {
  const unlocked = Date.now() >= UNLOCK_MS;
  return {
    ok: true, title: tree.title, ownerName: tree.ownerName, hasPasscode: tree.hasPasscode,
    questionCount: tree.questions.length,
    questions: tree.questions.map(q => ({ q: q.q, choices: q.choices })),
    participants: (tree.participants || []).map(p => ({
      no: p.no, nickname: p.nickname, score: p.score, total: p.total, percent: p.percent,
      personality: p.personality, personalityDesc: p.personalityDesc, shape: p.shape, color: p.color,
      createdAt: p.createdAt, message: unlocked ? p.message : null, sealed: !unlocked
    })),
    unlocked, isHost: !!hostKeyOk, unlockMs: UNLOCK_MS, serverNowMs: Date.now()
  };
}

async function getTreeFull(env, treeId, inviteToken, passcode, hostKey) {
  const v = await validate(env, treeId, inviteToken, passcode || '');
  if (!v.ok) return v;
  const hostKeyOk = hostKey && (await hash(hostKey)) === v.tree.hostKeyHash;
  return publicData(v.tree, hostKeyOk);
}

async function getPreviewMessages(env, treeId, inviteToken, passcode, hostKey) {
  const v = await validate(env, treeId, inviteToken, passcode || '');
  if (!v.ok) return v;
  if (!hostKey || (await hash(hostKey)) !== v.tree.hostKeyHash) return { ok: false, error: 'プレビューはホストのみ利用できます。この端末でツリーを作成した場合に有効です。' };
  return { ok: true, participants: (v.tree.participants || []).map(p => ({ no: p.no, nickname: p.nickname, message: p.message, personality: p.personality, score: p.score, total: p.total })) };
}

async function joinTree(env, treeId, inviteToken, passcode, payload) {
  const v = await validate(env, treeId, inviteToken, passcode || '');
  if (!v.ok) return v;
  const tree = v.tree;
  payload = payload || {};
  const nickname = String(payload.nickname || '').trim().slice(0, 20);
  if (!nickname) return { ok: false, error: 'ニックネームを入力してください。' };
  const answers = payload.answers || [];
  if (answers.length !== tree.questions.length) return { ok: false, error: 'すべての質問に答えてください。' };
  let score = 0;
  tree.questions.forEach((q, i) => { if (parseInt(answers[i], 10) === q.answer) score++; });
  const total = tree.questions.length;
  const percent = total ? Math.round(score / total * 100) : 0;
  const allowedShapes = ['ball', 'star', 'heart', 'bell', 'snow', 'gift'];
  const shape = allowedShapes.includes(payload.shape) ? payload.shape : 'ball';
  const colorRaw = String(payload.color || '#e63946');
  const color = /^#[0-9a-fA-F]{6}$/.test(colorRaw) ? colorRaw : '#e63946';
  tree.participants = tree.participants || [];
  const participant = {
    no: tree.participants.length + 1,
    nickname, score, total, percent,
    personality: personalityFor(percent), personalityDesc: personalityDesc(percent),
    shape, color,
    message: String(payload.message || '').trim().slice(0, 300),
    createdAt: new Date().toISOString()
  };
  tree.participants.push(participant);
  await saveTree(env, tree);
  return { ok: true, participant: { no: participant.no, nickname, score, total, percent, personality: participant.personality, personalityDesc: participant.personalityDesc, shape, color }, unlocked: Date.now() >= UNLOCK_MS };
}

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    if (!env.TREES) return Response.json({ ok: false, error: 'データベース（KV）がまだ接続されていません。' }, { status: 500 });
    const body = await request.json();
    const fn = body.fn; const args = body.args || [];
    let result;
    if (fn === 'createTree') result = await createTree(env, args[0]);
    else if (fn === 'getTreeFull') result = await getTreeFull(env, args[0], args[1], args[2], args[3]);
    else if (fn === 'getPreviewMessages') result = await getPreviewMessages(env, args[0], args[1], args[2], args[3]);
    else if (fn === 'joinTree') result = await joinTree(env, args[0], args[1], args[2], args[3]);
    else result = { ok: false, error: '不明な操作です。' };
    return Response.json(result);
  } catch (err) {
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
