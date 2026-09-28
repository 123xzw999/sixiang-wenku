/* ============================================================
   store.js —— 数据层
   数据全部存在浏览器本机 localStorage，零后端依赖。
   结构：
   {
     review: "首页思想综述文本",
     books: [
       { id, title, cover, intro, createdAt, updatedAt,
         chapters: [
           { id, title, cover, createdAt, updatedAt,
             tabs: [ { id, title, content } ]
           }
         ]
       }
     ]
   }
   ============================================================ */
(function (global) {
  'use strict';

  var KEY = 'sixiang_wenku_v1';
  var listeners = [];

  function uid(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + '_' +
           Math.random().toString(36).slice(2, 8);
  }

  function blank() {
    return { review: '', books: [] };
  }

  var state = blank();

  // 结构补全，兼容手工改过的数据 / 旧版本数据
  function normalize(parsed) {
    var out = {
      review: parsed && typeof parsed.review === 'string' ? parsed.review : '',
      books: parsed && Array.isArray(parsed.books) ? parsed.books : []
    };
    out.books.forEach(function (b) {
      b.id = b.id || uid('bk');
      b.title = b.title || '';
      b.cover = b.cover || '';
      b.intro = b.intro || '';
      b.createdAt = b.createdAt || Date.now();
      b.updatedAt = b.updatedAt || b.createdAt;
      b.chapters = Array.isArray(b.chapters) ? b.chapters : [];
      b.chapters.forEach(function (c) {
        c.id = c.id || uid('ch');
        c.title = c.title || '';
        c.cover = c.cover || '';
        c.createdAt = c.createdAt || Date.now();
        c.updatedAt = c.updatedAt || c.createdAt;
        c.tabs = Array.isArray(c.tabs) && c.tabs.length
          ? c.tabs
          : [{ id: uid('tb'), title: '正文', content: '' }];
        c.tabs.forEach(function (t) {
          t.id = t.id || uid('tb');
          t.title = t.title || '未命名页签';
          t.content = typeof t.content === 'string' ? t.content : '';
        });
      });
    });
    return out;
  }

  function load() {
    try {
      var raw = global.localStorage.getItem(KEY);
      if (!raw) { state = blank(); return state; }
      state = normalize(JSON.parse(raw));
    } catch (e) {
      console.warn('[store] 读取失败，已重置', e);
      state = blank();
    }
    return state;
  }

  var quotaWarned = false;

  function persist() {
    try {
      global.localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      if (!quotaWarned) {
        quotaWarned = true;
        alert('本机存储空间已满，最新内容未能保存。\n建议先点「导出备份」把数据存成文件，再删除一些较大的封面图片。');
      }
      console.warn('[store] 写入失败', e);
      return false;
    }
  }

  function emit() {
    listeners.forEach(function (fn) { try { fn(state); } catch (e) { console.warn(e); } });
  }

  function commit() {
    var ok = persist();
    emit();
    return ok;
  }

  /* ---------------- 查询 ---------------- */
  function getBook(bookId) {
    for (var i = 0; i < state.books.length; i++) {
      if (state.books[i].id === bookId) return state.books[i];
    }
    return null;
  }

  function getChapter(bookId, chapterId) {
    var b = getBook(bookId);
    if (!b) return null;
    for (var i = 0; i < b.chapters.length; i++) {
      if (b.chapters[i].id === chapterId) return b.chapters[i];
    }
    return null;
  }

  function getTab(bookId, chapterId, tabId) {
    var c = getChapter(bookId, chapterId);
    if (!c) return null;
    for (var i = 0; i < c.tabs.length; i++) {
      if (c.tabs[i].id === tabId) return c.tabs[i];
    }
    return null;
  }

  /* ---------------- 统计 ---------------- */
  function countChars(text) {
    if (!text) return 0;
    return String(text).replace(/\s/g, '').length;
  }

  function chapterChars(c) {
    return (c.tabs || []).reduce(function (n, t) { return n + countChars(t.content); }, 0);
  }

  function bookChars(b) {
    return (b.chapters || []).reduce(function (n, c) { return n + chapterChars(c); }, 0);
  }

  function stats() {
    var books = state.books.length, chapters = 0, tabs = 0, chars = 0;
    state.books.forEach(function (b) {
      chapters += b.chapters.length;
      b.chapters.forEach(function (c) {
        tabs += c.tabs.length;
        chars += chapterChars(c);
      });
    });
    return { books: books, chapters: chapters, tabs: tabs, chars: chars };
  }

  /* ---------------- 变更 ---------------- */
  function setReview(text) {
    state.review = text;
    return commit();
  }

  function addBook() {
    var now = Date.now();
    var b = {
      id: uid('bk'), title: '', cover: '', intro: '',
      createdAt: now, updatedAt: now, chapters: []
    };
    state.books.push(b);
    commit();
    return b;
  }

  function updateBook(bookId, patch) {
    var b = getBook(bookId);
    if (!b) return false;
    Object.keys(patch).forEach(function (k) { b[k] = patch[k]; });
    b.updatedAt = Date.now();
    return commit();
  }

  function removeBook(bookId) {
    state.books = state.books.filter(function (b) { return b.id !== bookId; });
    return commit();
  }

  function addChapter(bookId) {
    var b = getBook(bookId);
    if (!b) return null;
    var now = Date.now();
    var c = {
      id: uid('ch'), title: '', cover: '',
      createdAt: now, updatedAt: now,
      tabs: [{ id: uid('tb'), title: '正文', content: '' }]
    };
    b.chapters.push(c);
    b.updatedAt = now;
    commit();
    return c;
  }

  function updateChapter(bookId, chapterId, patch) {
    var c = getChapter(bookId, chapterId);
    if (!c) return false;
    Object.keys(patch).forEach(function (k) { c[k] = patch[k]; });
    c.updatedAt = Date.now();
    var b = getBook(bookId); if (b) b.updatedAt = c.updatedAt;
    return commit();
  }

  function removeChapter(bookId, chapterId) {
    var b = getBook(bookId);
    if (!b) return false;
    b.chapters = b.chapters.filter(function (c) { return c.id !== chapterId; });
    b.updatedAt = Date.now();
    return commit();
  }

  function addTab(bookId, chapterId, title) {
    var c = getChapter(bookId, chapterId);
    if (!c) return null;
    var t = { id: uid('tb'), title: title || ('页签 ' + (c.tabs.length + 1)), content: '' };
    c.tabs.push(t);
    c.updatedAt = Date.now();
    commit();
    return t;
  }

  function updateTab(bookId, chapterId, tabId, patch) {
    var t = getTab(bookId, chapterId, tabId);
    if (!t) return false;
    Object.keys(patch).forEach(function (k) { t[k] = patch[k]; });
    var c = getChapter(bookId, chapterId);
    if (c) c.updatedAt = Date.now();
    return commit();
  }

  function removeTab(bookId, chapterId, tabId) {
    var c = getChapter(bookId, chapterId);
    if (!c) return false;
    if (c.tabs.length <= 1) return false; // 至少保留一个页签
    c.tabs = c.tabs.filter(function (t) { return t.id !== tabId; });
    c.updatedAt = Date.now();
    return commit();
  }

  /* ---------------- 备份 ---------------- */
  function exportJSON() {
    return JSON.stringify({
      app: 'sixiang-wenku', version: 1, exportedAt: new Date().toISOString(),
      data: state
    }, null, 2);
  }

  function importJSON(text) {
    var parsed = JSON.parse(text);
    var d = parsed && parsed.data ? parsed.data : parsed;
    if (!d || !Array.isArray(d.books)) throw new Error('文件格式不正确');
    state = normalize(d);
    commit();
    return true;
  }

  /* ---------------- 图片压缩 ---------------- */
  // 封面统一压到最大宽 720px 的 JPEG，避免撑爆 localStorage
  function compressImage(file, maxW, quality) {
    maxW = maxW || 720;
    quality = quality || 0.82;
    return new Promise(function (resolve, reject) {
      if (!file || !/^image\//.test(file.type)) { reject(new Error('不是图片文件')); return; }
      var fr = new FileReader();
      fr.onerror = function () { reject(new Error('读取文件失败')); };
      fr.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(new Error('图片解析失败')); };
        img.onload = function () {
          var w = img.naturalWidth || img.width;
          var h = img.naturalHeight || img.height;
          var scale = Math.min(1, maxW / w);
          var cw = Math.max(1, Math.round(w * scale));
          var ch = Math.max(1, Math.round(h * scale));
          var canvas = document.createElement('canvas');
          canvas.width = cw; canvas.height = ch;
          var ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, cw, ch);
          ctx.drawImage(img, 0, 0, cw, ch);
          try {
            resolve(canvas.toDataURL('image/jpeg', quality));
          } catch (e) { reject(e); }
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }

  global.Store = {
    KEY: KEY,
    state: function () { return state; },
    load: load,
    subscribe: function (fn) { listeners.push(fn); },
    getBook: getBook,
    getChapter: getChapter,
    getTab: getTab,
    setReview: setReview,
    addBook: addBook,
    updateBook: updateBook,
    removeBook: removeBook,
    addChapter: addChapter,
    updateChapter: updateChapter,
    removeChapter: removeChapter,
    addTab: addTab,
    updateTab: updateTab,
    removeTab: removeTab,
    stats: stats,
    countChars: countChars,
    chapterChars: chapterChars,
    bookChars: bookChars,
    exportJSON: exportJSON,
    importJSON: importJSON,
    compressImage: compressImage,
    uid: uid
  };
})(window);
