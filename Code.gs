/**
 * グループ限定 3D＆2Dクイズ＆性格診断クリスマスツリー
 * Google Apps Script Web App - 100% Free / PropertiesService DB
 * Deploy: Deploy > New deployment > Web app > Execute as: Me / Access: Anyone
 */

const UNLOCK_UTC_MS = Date.UTC(2026, 11, 24, 15, 0, 0); // 2026-12-25 00:00 JST
const TOKEN_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const ID_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';

function doGet(e) {
  const t = HtmlService.createTemplateFromFile('Index');
  t.treeId = (e && e.parameter && e.parameter.tree) ? String(e.parameter.tree) : '';
  t.invite = (e && e.parameter && e.parameter.invite) ? String(e.parameter.invite) : '';
  return t.evaluate()
    .setTitle('グループ限定 3D＆2Dクイズ＆性格診断クリスマスツリー')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no')
    // NOTE: HtmlService only allows the viewport meta tag here. The robots
    // noindex/nofollow tag lives in Index.html's <head> instead.
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function _props() { return PropertiesService.getScriptProperties(); }
function _rand(len, chars) {
  let s = '';
  const bytes = [];
  for (let i = 0; i < len; i++) bytes.push(Math.floor(Math.random() * 256));
  // Strengthen with UUID entropy
  const uuid = Utilities.getUuid().replace(/-/g, '');
  for (let i = 0; i < len; i++) {
    const n = (bytes[i] + uuid.charCodeAt(i % uuid.length) + Date.now() % 97) % chars.length;
    s += chars.charAt(Math.abs(n));
  }
  return s;
}
function _hash(text) {
  if (!text) return '';
  const raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(text), Utilities.Charset.UTF_8);
  return Utilities.base64Encode(raw);
}
function _treeKey(id) { return 'tree_' + id; }
function _partsKey(id) { return 'parts_' + id; }

function _loadTree(id) {
  if (!id || !/^[a-z0-9]{6,12}$/i.test(id)) return null;
  const raw = _props().getProperty(_treeKey(id));
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (err) { return null; }
}
function _saveTree(tree) { _props().setProperty(_treeKey(tree.id), JSON.stringify(tree)); }
function _loadParts(id) {
  const raw = _props().getProperty(_partsKey(id));
  if (!raw) return [];
  try { return JSON.parse(raw); } catch (err) { return []; }
}
function _saveParts(id, parts) {
  _props().setProperty(_partsKey(id), JSON.stringify(parts));
  try { CacheService.getScriptCache().remove('full_' + id); } catch (e) {}
}

function _validate(id, token, passcode) {
  const tree = _loadTree(id);
  if (!tree) return { ok: false, error: 'ツリーが見つかりませんでした。リンクを確認してください。' };
  if (!token || token !== tree.inviteToken) return { ok: false, error: '招待トークンが正しくありません。このツリーはグループ限定です。', code: 'BAD_TOKEN' };
  if (tree.passcodeHash) {
    if (!passcode) return { ok: false, error: '合言葉が必要です。', code: 'NEED_PASSCODE', needsPasscode: true, title: tree.title };
    if (_hash(passcode) !== tree.passcodeHash) return { ok: false, error: '合言葉が違います。', code: 'BAD_PASSCODE', needsPasscode: true, title: tree.title };
  }
  return { ok: true, tree: tree };
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

/** Create a new tree. data: {title, ownerName, passcode, questions:[{q, choices:[4], answer:0-3}]} */
function createTree(data) {
  try {
    data = data || {};
    const title = String(data.title || '').trim().slice(0, 60) || 'みんなのクリスマスツリー';
    const ownerName = String(data.ownerName || '').trim().slice(0, 30) || 'ホスト';
    const questions = (data.questions || []).map(function(q) {
      return {
        q: String(q.q || '').trim().slice(0, 200),
        choices: (q.choices || []).map(function(c){ return String(c||'').trim().slice(0,80); }).slice(0,4),
        answer: Math.max(0, Math.min(3, parseInt(q.answer, 10) || 0))
      };
    }).filter(function(q){ return q.q && q.choices.length === 4 && q.choices.every(function(c){return c;}); });

    if (questions.length < 3 || questions.length > 15) return { ok: false, error: '質問は3〜15問で、すべて入力してください。' };

    let id = _rand(8, ID_CHARS);
    while (_loadTree(id)) id = _rand(8, ID_CHARS);
    const inviteToken = _rand(24, TOKEN_CHARS);
    const hostKey = _rand(20, TOKEN_CHARS);

    const tree = {
      id: id,
      inviteToken: inviteToken,
      hostKeyHash: _hash(hostKey),
      title: title,
      ownerName: ownerName,
      passcodeHash: data.passcode ? _hash(String(data.passcode).trim()) : '',
      hasPasscode: !!String(data.passcode || '').trim(),
      questions: questions,
      createdAt: new Date().toISOString()
    };
    _saveTree(tree);
    _saveParts(id, []); // Strictly 0 participants at start - never dummy data

    const base = ScriptApp.getService().getUrl();
    return { ok: true, id: id, inviteToken: inviteToken, hostKey: hostKey, url: base + '?tree=' + id + '&invite=' + inviteToken };
  } catch (err) { return { ok: false, error: String(err) }; }
}

/** Light check before passcode entry */
function getTreeMeta(treeId, inviteToken) {
  const tree = _loadTree(treeId);
  if (!tree) return { ok: false, error: 'ツリーが見つかりませんでした。' };
  if (!inviteToken || inviteToken !== tree.inviteToken) return { ok: false, code: 'BAD_TOKEN', error: '招待トークンが正しくありません。このツリーはグループ限定です。' };
  return { ok: true, title: tree.title, ownerName: tree.ownerName, hasPasscode: tree.hasPasscode, questionCount: tree.questions.length, unlockMs: UNLOCK_UTC_MS, serverNowMs: Date.now() };
}

/** Full data (questions without answers, participants without sealed messages) */
function getTreeData(treeId, inviteToken, passcode, hostKey) {
  const v = _validate(treeId, inviteToken, passcode || '');
  if (!v.ok) return v;
  const tree = v.tree;
  const parts = _loadParts(treeId);
  const unlocked = Date.now() >= UNLOCK_UTC_MS;
  const isHost = hostKey && _hash(hostKey) === tree.hostKeyHash;
  const showMessages = unlocked; // preview handled client-side only for host after this flag + isHost check in getPreviewMessages
  const publicParts = parts.map(function(p) {
    return {
      no: p.no, nickname: p.nickname, score: p.score, total: p.total, percent: p.percent,
      personality: p.personality, personalityDesc: p.personalityDesc,
      shape: p.shape, color: p.color, createdAt: p.createdAt,
      message: showMessages ? p.message : null, sealed: !showMessages
    };
  });
  return {
    ok: true, title: tree.title, ownerName: tree.ownerName, hasPasscode: tree.hasPasscode,
    questions: tree.questions.map(function(q){ return { q: q.q, choices: q.choices }; }),
    participants: publicParts, unlocked: unlocked, isHost: !!isHost, unlockMs: UNLOCK_UTC_MS, serverNowMs: Date.now()
  };
}

/** Host-only preview of sealed messages */
function getPreviewMessages(treeId, inviteToken, passcode, hostKey) {
  const v = _validate(treeId, inviteToken, passcode || '');
  if (!v.ok) return v;
  if (!hostKey || _hash(hostKey) !== v.tree.hostKeyHash) return { ok: false, error: 'プレビューはホストのみ利用できます。この端末でツリーを作成した場合に有効です。' };
  const parts = _loadParts(treeId);
  return { ok: true, participants: parts.map(function(p){ return { no: p.no, nickname: p.nickname, message: p.message, personality: p.personality, score: p.score, total: p.total }; }) };
}

/** Join: payload {nickname, answers:[index...], shape, color, message} */
function joinTree(treeId, inviteToken, passcode, payload) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const v = _validate(treeId, inviteToken, passcode || '');
    if (!v.ok) return v;
    const tree = v.tree;
    payload = payload || {};
    const nickname = String(payload.nickname || '').trim().slice(0, 20);
    if (!nickname) return { ok: false, error: 'ニックネームを入力してください。' };
    const answers = payload.answers || [];
    if (answers.length !== tree.questions.length) return { ok: false, error: 'すべての質問に答えてください。' };

    let score = 0;
    tree.questions.forEach(function(q, i){ if (parseInt(answers[i], 10) === q.answer) score++; });
    const total = tree.questions.length;
    const percent = total ? Math.round(score / total * 100) : 0;

    const allowedShapes = ['ball','star','heart','bell','snow','gift'];
    const shape = allowedShapes.indexOf(payload.shape) >= 0 ? payload.shape : 'ball';
    const colorRaw = String(payload.color || '#e63946');
    const color = /^#[0-9a-fA-F]{6}$/.test(colorRaw) ? colorRaw : '#e63946';

    const parts = _loadParts(treeId);
    const participant = {
      no: parts.length + 1,
      nickname: nickname, score: score, total: total, percent: percent,
      personality: personalityFor(percent), personalityDesc: personalityDesc(percent),
      shape: shape, color: color,
      message: String(payload.message || '').trim().slice(0, 300),
      createdAt: new Date().toISOString()
    };
    parts.push(participant);
    _saveParts(treeId, parts);
    return { ok: true, participant: { no: participant.no, nickname: participant.nickname, score: score, total: total, percent: percent, personality: participant.personality, personalityDesc: participant.personalityDesc, shape: shape, color: color }, unlocked: Date.now() >= UNLOCK_UTC_MS };
  } catch (err) { return { ok: false, error: String(err) }; }
  finally { try { lock.releaseLock(); } catch (e) {} }
}

/**
 * FAST LOAD (v2): one google.script.run call instead of two.
 * Returns meta + full data in a single round-trip, with a 30s script cache
 * so repeat opens don't re-read PropertiesService.
 * Cache is invalidated in _saveParts() whenever someone joins.
 */
function getTreeFull(treeId, inviteToken, passcode, hostKey) {
  var tree = _loadTree(treeId);
  if (!tree) return { ok: false, error: 'ツリーが見つかりませんでした。' };
  if (!inviteToken || inviteToken !== tree.inviteToken) return { ok: false, code: 'BAD_TOKEN', error: '招待トークンが正しくありません。このツリーはグループ限定です。' };
  if (tree.passcodeHash) {
    if (!passcode) return { ok: false, code: 'NEED_PASSCODE', needsPasscode: true, title: tree.title, ownerName: tree.ownerName, hasPasscode: true, error: '合言葉が必要です。' };
    if (_hash(passcode) !== tree.passcodeHash) return { ok: false, code: 'BAD_PASSCODE', needsPasscode: true, title: tree.title, ownerName: tree.ownerName, hasPasscode: true, error: '合言葉が違います。' };
  }
  var cache = CacheService.getScriptCache();
  var cacheKey = 'full_' + treeId;
  var parts = null;
  var cached = cache.get(cacheKey);
  if (cached) { try { parts = JSON.parse(cached); } catch (e) { parts = null; } }
  if (!parts) {
    parts = _loadParts(treeId);
    try { cache.put(cacheKey, JSON.stringify(parts), 30); } catch (e) {}
  }
  var unlocked = Date.now() >= UNLOCK_UTC_MS;
  var isHost = hostKey && _hash(hostKey) === tree.hostKeyHash;
  return {
    ok: true, title: tree.title, ownerName: tree.ownerName, hasPasscode: tree.hasPasscode,
    questionCount: tree.questions.length,
    questions: tree.questions.map(function(q){ return { q: q.q, choices: q.choices }; }),
    participants: parts.map(function(p) {
      return { no: p.no, nickname: p.nickname, score: p.score, total: p.total, percent: p.percent,
        personality: p.personality, personalityDesc: p.personalityDesc, shape: p.shape, color: p.color,
        createdAt: p.createdAt, message: unlocked ? p.message : null, sealed: !unlocked };
    }),
    unlocked: unlocked, isHost: !!isHost, unlockMs: UNLOCK_UTC_MS, serverNowMs: Date.now()
  };
}
