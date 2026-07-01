/* =========================================================================
 * store.js — 保存アダプタ（2層モデル）
 *   - 第1層: localStorage（即時・高速キャッシュ）
 *   - 第2層: 同期フォルダ上の schedule.json（正本／File System Access API）
 *
 * データは AES-256-GCM + PBKDF2 で暗号化して保存。
 * パスワードはセッション中のみ JS メモリに保持（永続保存しない）。
 * ========================================================================= */
const Store = (() => {
  const LS_KEY  = 'schedTimeline.v2';
  const OLD_KEY = 'schedTimeline.v1';
  const IDB_DB  = 'schedStore';
  const IDB_OS  = 'handles';
  const HKEY    = 'scheduleJson';

  let fileHandle = null;
  const supportsFS = (typeof window !== 'undefined') && ('showOpenFilePicker' in window);
  const nowISO = () => new Date().toISOString();

  // ---- Base64 ユーティリティ ----
  const b64enc = buf => {
    const bytes = new Uint8Array(buf); let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  };
  const b64dec = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

  // ---- 暗号化 AES-256-GCM + PBKDF2（10万回ストレッチ）----
  async function deriveKey(password, salt) {
    const km = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
      km, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
    );
  }

  async function encrypt(stateObj, password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv   = crypto.getRandomValues(new Uint8Array(12));
    const key  = await deriveKey(password, salt);
    const enc  = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv }, key,
      new TextEncoder().encode(JSON.stringify(stateObj))
    );
    return { encrypted: true, salt: b64enc(salt), iv: b64enc(iv), data: b64enc(new Uint8Array(enc)) };
  }

  async function decrypt(blob, password) {
    const key = await deriveKey(password, b64dec(blob.salt));
    const dec = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: b64dec(blob.iv) }, key, b64dec(blob.data)
    );
    return migrate(JSON.parse(new TextDecoder().decode(dec)));
  }

  function isEncrypted(raw) {
    return !!(raw && raw.encrypted === true);
  }

  // ---- データモデル / スキーマ移行 ----
  function emptyState() {
    return {
      schemaVersion:1, meta:{updatedAt:nowISO(),owner:''},
      tasks:[], holidays:[], routineRows:[],
      dayNotes:{}, dayNotes2:{}, dayNotes3:{}, dayNotes4:{}, dayNotes5:{},
      holidayMaster: {
        '2025-01-01':{name:'元日',type:'public'},
        '2025-01-13':{name:'成人の日',type:'public'},
        '2025-02-11':{name:'建国記念の日',type:'public'},
        '2025-02-23':{name:'天皇誕生日',type:'public'},
        '2025-02-24':{name:'振替休日',type:'public'},
        '2025-03-20':{name:'春分の日',type:'public'},
        '2025-04-29':{name:'昭和の日',type:'public'},
        '2025-05-03':{name:'憲法記念日',type:'public'},
        '2025-05-04':{name:'みどりの日',type:'public'},
        '2025-05-05':{name:'こどもの日',type:'public'},
        '2025-05-06':{name:'振替休日',type:'public'},
        '2025-07-21':{name:'海の日',type:'public'},
        '2025-08-11':{name:'山の日',type:'public'},
        '2025-09-15':{name:'敬老の日',type:'public'},
        '2025-09-23':{name:'秋分の日',type:'public'},
        '2025-10-13':{name:'スポーツの日',type:'public'},
        '2025-11-03':{name:'文化の日',type:'public'},
        '2025-11-23':{name:'勤労感謝の日',type:'public'},
        '2025-11-24':{name:'振替休日',type:'public'},
        '2026-01-01':{name:'元日',type:'public'},
        '2026-01-12':{name:'成人の日',type:'public'},
        '2026-02-11':{name:'建国記念の日',type:'public'},
        '2026-02-23':{name:'天皇誕生日',type:'public'},
        '2026-03-20':{name:'春分の日',type:'public'},
        '2026-04-29':{name:'昭和の日',type:'public'},
        '2026-05-03':{name:'憲法記念日',type:'public'},
        '2026-05-04':{name:'みどりの日',type:'public'},
        '2026-05-05':{name:'こどもの日',type:'public'},
        '2026-05-06':{name:'振替休日',type:'public'},
        '2026-07-20':{name:'海の日',type:'public'},
        '2026-08-11':{name:'山の日',type:'public'},
        '2026-09-21':{name:'敬老の日',type:'public'},
        '2026-09-23':{name:'秋分の日',type:'public'},
        '2026-10-12':{name:'スポーツの日',type:'public'},
        '2026-11-03':{name:'文化の日',type:'public'},
        '2026-11-23':{name:'勤労感謝の日',type:'public'},
        '2027-01-01':{name:'元日',type:'public'},
        '2027-01-11':{name:'成人の日',type:'public'},
        '2027-02-11':{name:'建国記念の日',type:'public'},
        '2027-02-23':{name:'天皇誕生日',type:'public'},
        '2027-03-21':{name:'春分の日',type:'public'},
        '2027-04-29':{name:'昭和の日',type:'public'},
        '2027-05-03':{name:'憲法記念日',type:'public'},
        '2027-05-04':{name:'みどりの日',type:'public'},
        '2027-05-05':{name:'こどもの日',type:'public'},
        '2027-07-19':{name:'海の日',type:'public'},
        '2027-08-11':{name:'山の日',type:'public'},
        '2027-09-20':{name:'敬老の日',type:'public'},
        '2027-09-23':{name:'秋分の日',type:'public'},
        '2027-10-11':{name:'スポーツの日',type:'public'},
        '2027-11-03':{name:'文化の日',type:'public'},
        '2027-11-23':{name:'勤労感謝の日',type:'public'}
      }
    };
  }

  function migrate(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const s = emptyState();
    s.tasks = (raw.tasks || []).map(t => ({
      id:        t.id,
      type:      t.type || 'plan',
      title:     t.title || '',
      start:     t.start || '',
      end:       t.end || '',
      lane:      t.lane || 0,
      time:      t.time || '',
      place:     t.place || '',
      who:       t.who || '',
      updatedAt: t.updatedAt || nowISO(),
      deleted:   t.deleted   || false,
      deletedAt: t.deletedAt || ''
    }));
    s.holidays      = Array.isArray(raw.holidays) ? raw.holidays.slice() : [];
    s.routineRows   = Array.isArray(raw.routineRows) ? raw.routineRows.map(r => ({
      id:      r.id || ('rr'+Math.random().toString(36).slice(2,9)),
      label:   r.label  || '',
      color:   r.color  || '#f0f0f0',
      markers: Array.isArray(r.markers) ? r.markers : (r.markers ? String(r.markers).split(',').map(x=>x.trim()).filter(Boolean) : []),
      cells:   (r.cells && typeof r.cells === 'object') ? r.cells : {}
    })) : [];
    s.dayNotes      = (raw.dayNotes  && typeof raw.dayNotes  === 'object') ? raw.dayNotes  : {};
    s.dayNotes2     = (raw.dayNotes2 && typeof raw.dayNotes2 === 'object') ? raw.dayNotes2 : {};
    s.dayNotes3     = (raw.dayNotes3 && typeof raw.dayNotes3 === 'object') ? raw.dayNotes3 : {};
    s.dayNotes4     = (raw.dayNotes4 && typeof raw.dayNotes4 === 'object') ? raw.dayNotes4 : {};
    s.dayNotes5     = (raw.dayNotes5 && typeof raw.dayNotes5 === 'object') ? raw.dayNotes5 : {};
    s.holidayMaster = (raw.holidayMaster && typeof raw.holidayMaster === 'object')
      ? raw.holidayMaster
      : emptyState().holidayMaster;
    s.schemaVersion = 1;
    s.meta = {
      updatedAt: (raw.meta && raw.meta.updatedAt) || nowISO(),
      owner:     (raw.meta && raw.meta.owner) || ''
    };
    return s;
  }

  // ---- localStorage 層 ----
  function loadLocalRaw() {
    try { const j = JSON.parse(localStorage.getItem(LS_KEY)); if (j) return j; } catch(e) {}
    try { const o = JSON.parse(localStorage.getItem(OLD_KEY)); if (o) return o; } catch(e) {}
    return null;
  }

  async function saveLocalEnc(state, password) {
    try {
      const blob = await encrypt(state, password);
      localStorage.setItem(LS_KEY, JSON.stringify(blob));
    } catch(e) {}
  }

  // ---- IndexedDB（ファイルハンドルを再読込後も保持するため）----
  function idb() {
    return new Promise((res, rej) => {
      const r = indexedDB.open(IDB_DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(IDB_OS);
      r.onsuccess = () => res(r.result);
      r.onerror   = () => rej(r.error);
    });
  }
  async function idbGet(k) {
    const db = await idb();
    return new Promise((res, rej) => {
      const q = db.transaction(IDB_OS,'readonly').objectStore(IDB_OS).get(k);
      q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
    });
  }
  async function idbSet(k, v) {
    const db = await idb();
    return new Promise((res, rej) => {
      const tx = db.transaction(IDB_OS,'readwrite');
      tx.objectStore(IDB_OS).put(v, k);
      tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error);
    });
  }

  // ---- ファイルハンドル / 権限 ----
  // 許可確認のみ（ダイアログなし）- 起動時の自動同期用
  async function checkPermission(handle, mode) {
    if (!handle || !handle.queryPermission) return true;
    return (await handle.queryPermission({ mode })) === 'granted';
  }
  // 許可を明示的にリクエスト（ダイアログあり）- ユーザー操作時のみ呼ぶ
  async function ensurePermission(handle, mode) {
    if (!handle || !handle.queryPermission) return true;
    const opts = { mode };
    if (await handle.queryPermission(opts) === 'granted') return true;
    if (await handle.requestPermission(opts) === 'granted') return true;
    return false;
  }
  async function restoreHandle() {
    if (!supportsFS) return null;
    try { const h = await idbGet(HKEY); if (h) { fileHandle = h; return h; } } catch(e) {}
    return null;
  }
  async function bindFile() {
    if (!supportsFS) throw new Error('unsupported');
    const [h] = await window.showOpenFilePicker({
      multiple: false,
      types: [{ description: 'Schedule JSON', accept: { 'application/json': ['.json'] } }]
    });
    fileHandle = h; await idbSet(HKEY, h); return h;
  }
  async function createFile() {
    if (!supportsFS) throw new Error('unsupported');
    const h = await window.showSaveFilePicker({
      suggestedName: 'schedule.json',
      types: [{ description: 'Schedule JSON', accept: { 'application/json': ['.json'] } }]
    });
    fileHandle = h; await idbSet(HKEY, h); return h;
  }

  async function _doReadFile(password) {
    const f    = await fileHandle.getFile();
    const text = await f.text();
    if (!text.trim()) return null;
    const raw = JSON.parse(text);
    if (isEncrypted(raw)) {
      if (!password) return null;
      return await decrypt(raw, password);
    }
    return migrate(raw);
  }
  // ユーザー操作時（🔗ボタン等）：許可ダイアログを出してもOK
  async function readFile(password) {
    if (!fileHandle) return null;
    if (!await ensurePermission(fileHandle, 'read')) return null;
    try { return await _doReadFile(password); } catch(e) { return null; }
  }
  // 起動時の自動同期：許可済みの場合のみ実行（ダイアログなし）
  async function readFileIfPermitted(password) {
    if (!fileHandle) return null;
    if (!await checkPermission(fileHandle, 'read')) return null;
    try { return await _doReadFile(password); } catch(e) { return null; }
  }

  async function _doWriteFile(state, password) {
    const blob = await encrypt(state, password);
    const w = await fileHandle.createWritable();
    await w.write(JSON.stringify(blob, null, 2));
    await w.close();
    return true;
  }
  // ユーザー操作時：許可ダイアログを出してもOK
  async function writeFile(state, password) {
    if (!fileHandle) return false;
    if (!await ensurePermission(fileHandle, 'readwrite')) return false;
    return _doWriteFile(state, password);
  }
  // 自動保存時：許可済みの場合のみ実行（ダイアログなし）
  async function writeFileIfPermitted(state, password) {
    if (!fileHandle) return false;
    if (!await checkPermission(fileHandle, 'readwrite')) return false;
    return _doWriteFile(state, password);
  }

  // ---- 競合解決：タスクはID単位マージ（tombstone対応）、他フィールドは新しい方を採用 ----
  function mergeStates(local, cloud) {
    if (!local) return cloud; if (!cloud) return local;
    const lMap = Object.fromEntries(local.tasks.map(t=>[t.id,t]));
    const cMap = Object.fromEntries(cloud.tasks.map(t=>[t.id,t]));
    const allIds = [...new Set([...Object.keys(lMap),...Object.keys(cMap)])];
    const mergedTasks = allIds.map(id => {
      const l = lMap[id], c = cMap[id];
      if (!c) return l; if (!l) return c;
      return new Date(l.updatedAt||0) >= new Date(c.updatedAt||0) ? l : c;
    });
    const lt = new Date((local.meta && local.meta.updatedAt) || 0).getTime();
    const ct = new Date((cloud.meta && cloud.meta.updatedAt) || 0).getTime();
    const win = ct > lt ? cloud : local;
    const los = ct > lt ? local : cloud;
    return {
      schemaVersion: 1,
      meta: { updatedAt: nowISO(), owner: win.meta.owner || '' },
      tasks: mergedTasks,
      holidays: win.holidays || los.holidays || [],
      routineRows: (win.routineRows && win.routineRows.length) ? win.routineRows : (los.routineRows || []),
      dayNotes:  Object.keys(win.dayNotes  || {}).length ? win.dayNotes  : (los.dayNotes  || {}),
      dayNotes2: Object.keys(win.dayNotes2 || {}).length ? win.dayNotes2 : (los.dayNotes2 || {}),
      dayNotes3: Object.keys(win.dayNotes3 || {}).length ? win.dayNotes3 : (los.dayNotes3 || {}),
      dayNotes4: Object.keys(win.dayNotes4 || {}).length ? win.dayNotes4 : (los.dayNotes4 || {}),
      dayNotes5: Object.keys(win.dayNotes5 || {}).length ? win.dayNotes5 : (los.dayNotes5 || {}),
      holidayMaster: (Object.keys(win.holidayMaster||{}).length >= Object.keys(los.holidayMaster||{}).length) ? (win.holidayMaster||{}) : (los.holidayMaster||{})
    };
  }

  function newer(a, b) {
    if (!a) return b; if (!b) return a;
    return mergeStates(a, b);
  }

  return {
    supportsFS, nowISO, emptyState, migrate,
    isEncrypted, encrypt, decrypt,
    loadLocalRaw, saveLocalEnc,
    restoreHandle, bindFile, createFile,
    readFile, readFileIfPermitted,
    writeFile, writeFileIfPermitted,
    mergeStates, newer,
    get hasFile() { return !!fileHandle; },
    get fileName() { return fileHandle ? fileHandle.name : ''; }
  };
})();
