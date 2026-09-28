/* ============================================================
   app.js —— 界面与交互
   登录 → 首页(思想综述 + 书籍) → 书籍(章节) → 章节(页签 + 正文)
   ============================================================ */
(function () {
  'use strict';

  var CRED = { user: '123456', pass: 'xiaoxiong666' };
  var SESSION_KEY = 'sixiang_wenku_session';

  var route = { view: 'home', bookId: null, chapterId: null, tabId: null };
  var saveTimer = null;
  var rendered = false;   // 首次渲染前不允许 flush，否则会用空表单覆盖已存数据

  // 标题类输入防抖落盘（避免每敲一个字就把含封面的整份数据序列化一次）
  var saveBookTitle = null;
  var saveChapterTitle = null;

  /* ---------------- 小工具 ---------------- */
  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function fmtDate(ts) {
    var d = new Date(ts || Date.now());
    var p = function (n) { return n < 10 ? '0' + n : '' + n; };
    return (d.getMonth() + 1) + '-' + p(d.getDate());
  }

  function fmtNum(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  var toastTimer = null;
  function toast(msg) {
    var el = $('toast');
    el.textContent = msg;
    el.classList.add('is-show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('is-show'); }, 2200);
  }

  function debounce(fn, ms) {
    var t = null;
    return function () {
      var args = arguments, self = this;
      if (t) clearTimeout(t);
      t = setTimeout(function () { t = null; fn.apply(self, args); }, ms);
    };
  }

  /* ---------------- 路由 ---------------- */
  function flushCurrent() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    if (route.view === 'home') {
      var rv = $('review-text');
      if (rv) Store.setReview(rv.value);
    } else if (route.view === 'book') {
      var ti = $('book-title-input'), bi = $('book-intro');
      if (ti && route.bookId) Store.updateBook(route.bookId, { title: ti.value, intro: bi ? bi.value : '' });
    } else if (route.view === 'chapter') {
      var tc = $('tab-content'), ct = $('chapter-title-input');
      if (route.chapterId) {
        Store.updateChapter(route.bookId, route.chapterId, { title: ct ? ct.value : '' });
        if (tc && route.tabId) Store.updateTab(route.bookId, route.chapterId, route.tabId, { content: tc.value });
      }
    }
  }

  function go(view, opts) {
    if (rendered) flushCurrent();
    route = {
      view: view,
      bookId: (opts && opts.bookId) || null,
      chapterId: (opts && opts.chapterId) || null,
      tabId: (opts && opts.tabId) || null
    };
    var views = document.querySelectorAll('.view');
    for (var i = 0; i < views.length; i++) views[i].classList.remove('is-active');
    var el = $('view-' + view);
    if (el) el.classList.add('is-active');
    window.scrollTo(0, 0);
    if (view === 'home') renderHome();
    else if (view === 'book') renderBook();
    else if (view === 'chapter') renderChapter();
    rendered = true;
  }

  /* ---------------- 登录 ---------------- */
  function isLoggedIn() {
    try { return sessionStorage.getItem(SESSION_KEY) === '1'; } catch (e) { return false; }
  }
  function setLoggedIn(v) {
    try {
      if (v) sessionStorage.setItem(SESSION_KEY, '1');
      else sessionStorage.removeItem(SESSION_KEY);
    } catch (e) { /* ignore */ }
  }

  function initLogin() {
    var form = $('login-form'), err = $('login-err');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var u = $('login-user').value.trim();
      var p = $('login-pass').value;
      if (u === CRED.user && p === CRED.pass) {
        setLoggedIn(true);
        err.textContent = '';
        $('login-pass').value = '';
        go('home');
      } else {
        err.textContent = '账号或密码不正确，请重新输入。';
        $('login-pass').select();
      }
    });
  }

  /* ---------------- 首页 ---------------- */
  function renderHome() {
    var st = Store.state();
    var rv = $('review-text');
    if (document.activeElement !== rv) rv.value = st.review || '';
    $('home-stats').innerHTML = statsHtml(Store.stats());
    renderBooksGrid();
  }

  function statsHtml(s) {
    return '' +
      '<div class="stat"><b>' + fmtNum(s.books) + '</b><span>书籍</span></div>' +
      '<div class="stat"><b>' + fmtNum(s.chapters) + '</b><span>章节</span></div>' +
      '<div class="stat"><b>' + fmtNum(s.tabs) + '</b><span>页签</span></div>' +
      '<div class="stat"><b>' + fmtNum(s.chars) + '</b><span>累计字数</span></div>';
  }

  function renderBooksGrid() {
    var grid = $('books-grid');
    var books = Store.state().books;
    var html = '';
    books.forEach(function (b) {
      var meta = b.chapters.length + ' 章 · ' + fmtNum(Store.bookChars(b)) + ' 字 · 更新 ' + fmtDate(b.updatedAt);
      html += '' +
        '<article class="card" data-book="' + b.id + '">' +
          '<label class="card-cover" data-cover="' + b.id + '">' +
            '<input type="file" accept="image/*" hidden>' +
            (b.cover ? '<img src="' + b.cover + '" alt="封面">' : '<span class="cover-ph">点击加封面</span>') +
          '</label>' +
          '<div class="card-body">' +
            '<input class="card-title" type="text" data-title="' + b.id + '" value="' + esc(b.title) + '" placeholder="点击命名本书">' +
            '<div class="card-meta">' + esc(meta) + '</div>' +
            '<div class="card-actions">' +
              '<button class="btn btn-primary" type="button" data-open="' + b.id + '">开始创作</button>' +
              '<button class="btn btn-ghost" type="button" data-delbook="' + b.id + '">删除</button>' +
            '</div>' +
          '</div>' +
        '</article>';
    });
    html += '<div class="card-add" id="card-add-book"><span class="plus">＋</span><span>添加书籍</span></div>';
    grid.innerHTML = html;

    // 封面选择
    grid.querySelectorAll('label[data-cover]').forEach(function (label) {
      var id = label.getAttribute('data-cover');
      bindCover(label, function (dataUrl) {
        Store.updateBook(id, { cover: dataUrl });
        toast('封面已更新');
        renderBooksGrid();
        $('home-stats').innerHTML = statsHtml(Store.stats());
      });
    });
  }

  function bindCover(labelEl, onPicked) {
    var input = labelEl.querySelector('input[type=file]');
    if (!input) return;
    input.addEventListener('change', function () {
      var f = input.files && input.files[0];
      input.value = '';
      if (!f) return;
      toast('正在处理图片…');
      Store.compressImage(f).then(function (d) { onPicked(d); })
        .catch(function (e) { toast('图片处理失败：' + e.message); });
    });
  }

  /* ---------------- 书籍页 ---------------- */
  function renderBook() {
    var b = Store.getBook(route.bookId);
    if (!b) { go('home'); return; }

    $('book-crumb').innerHTML = '文库 / <b>' + esc(b.title || '未命名书籍') + '</b>';

    var slot = $('book-cover-slot');
    slot.innerHTML = '<input type="file" accept="image/*" hidden>' +
      (b.cover ? '<img src="' + b.cover + '" alt="封面">' : '<span class="cover-ph">点击加封面</span>');
    bindCover(slot, function (d) {
      Store.updateBook(b.id, { cover: d });
      toast('封面已更新');
      renderBook();
    });

    var ti = $('book-title-input');
    if (document.activeElement !== ti) ti.value = b.title || '';
    var bi = $('book-intro');
    if (document.activeElement !== bi) bi.value = b.intro || '';

    var chars = Store.bookChars(b);
    $('book-stats').innerHTML =
      '<div class="stat"><b>' + fmtNum(b.chapters.length) + '</b><span>章节</span></div>' +
      '<div class="stat"><b>' + fmtNum(chars) + '</b><span>本书字数</span></div>' +
      '<div class="stat"><b>' + fmtDate(b.createdAt) + '</b><span>创建于</span></div>' +
      '<div class="stat"><b>' + fmtDate(b.updatedAt) + '</b><span>最近更新</span></div>';

    renderChaptersGrid();
  }

  function renderChaptersGrid() {
    var b = Store.getBook(route.bookId);
    var grid = $('chapters-grid');
    if (!b) return;
    var html = '';
    b.chapters.forEach(function (c, i) {
      var meta = '第 ' + (i + 1) + ' 章 · ' + c.tabs.length + ' 页签 · ' + fmtNum(Store.chapterChars(c)) + ' 字';
      html += '' +
        '<article class="card" data-chapter="' + c.id + '">' +
          '<label class="card-cover" data-chcover="' + c.id + '">' +
            '<input type="file" accept="image/*" hidden>' +
            (c.cover ? '<img src="' + c.cover + '" alt="封面">' : '<span class="cover-ph">点击加封面</span>') +
          '</label>' +
          '<div class="card-body">' +
            '<input class="card-title" type="text" data-chtitle="' + c.id + '" value="' + esc(c.title) + '" placeholder="点击命名本章">' +
            '<div class="card-meta">' + esc(meta) + '</div>' +
            '<div class="card-actions">' +
              '<button class="btn btn-primary" type="button" data-opench="' + c.id + '">开始创作</button>' +
              '<button class="btn btn-ghost" type="button" data-delch="' + c.id + '">删除</button>' +
            '</div>' +
          '</div>' +
        '</article>';
    });
    html += '<div class="card-add" id="card-add-chapter"><span class="plus">＋</span><span>添加章节</span></div>';
    grid.innerHTML = html;

    grid.querySelectorAll('label[data-chcover]').forEach(function (label) {
      var id = label.getAttribute('data-chcover');
      bindCover(label, function (d) {
        Store.updateChapter(route.bookId, id, { cover: d });
        toast('封面已更新');
        renderChaptersGrid();
      });
    });
  }

  /* ---------------- 章节写作页 ---------------- */
  function renderChapter() {
    var b = Store.getBook(route.bookId);
    var c = b ? Store.getChapter(route.bookId, route.chapterId) : null;
    if (!b || !c) { go('home'); return; }

    // 保证有一个合法 tab
    if (!c.tabs.length) { Store.addTab(route.bookId, c.id, '正文'); c = Store.getChapter(route.bookId, c.id); }
    if (!route.tabId || !Store.getTab(route.bookId, c.id, route.tabId)) route.tabId = c.tabs[0].id;

    $('chapter-crumb').innerHTML =
      esc(b.title || '未命名书籍') + ' / <b>' + esc(c.title || '未命名章节') + '</b>';

    var slot = $('chapter-cover-slot');
    slot.innerHTML = '<input type="file" accept="image/*" hidden>' +
      (c.cover ? '<img src="' + c.cover + '" alt="封面">' : '<span class="cover-ph">点击加封面</span>');
    bindCover(slot, function (d) {
      Store.updateChapter(route.bookId, c.id, { cover: d });
      toast('封面已更新');
      renderChapter();
    });

    var ti = $('chapter-title-input');
    if (document.activeElement !== ti) ti.value = c.title || '';

    renderTabs();
    loadTabContent();
    updateWordCount();
    setSaveState('已保存');
  }

  function renderTabs() {
    var c = Store.getChapter(route.bookId, route.chapterId);
    var bar = $('tabs-bar');
    if (!c) return;
    var html = '';
    c.tabs.forEach(function (t) {
      var active = t.id === route.tabId ? ' is-active' : '';
      html += '<span class="tab' + active + '" data-tab="' + t.id + '">' +
        '<span class="tab-name">' + esc(t.title) + '</span>' +
        (c.tabs.length > 1 ? '<span class="tab-x" data-tabdel="' + t.id + '" title="删除页签">×</span>' : '') +
        '</span>';
    });
    bar.innerHTML = html;
  }

  function loadTabContent() {
    var t = Store.getTab(route.bookId, route.chapterId, route.tabId);
    var ta = $('tab-content');
    ta.value = t ? t.content : '';
  }

  function updateWordCount() {
    var c = Store.getChapter(route.bookId, route.chapterId);
    var ta = $('tab-content');
    if (!c || !ta) return;
    var cur = Store.countChars(ta.value);
    // 全章字数用「当前编辑框的实时内容」替换掉尚未落盘的旧内容，避免统计滞后
    var total = 0;
    c.tabs.forEach(function (t) {
      total += Store.countChars(t.id === route.tabId ? ta.value : t.content);
    });
    $('chapter-wordcount').textContent = '本页 ' + fmtNum(cur) + ' 字 · 全章 ' + fmtNum(total) + ' 字';
  }

  function setSaveState(txt) {
    var el = $('chapter-save-state');
    if (el) el.textContent = txt;
  }

  function flushTab() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    if (!route.tabId) return;
    var ta = $('tab-content');
    if (!ta) return;
    Store.updateTab(route.bookId, route.chapterId, route.tabId, { content: ta.value });
    setSaveState('已保存');
  }

  function startRenameTab(tabId) {
    var chip = document.querySelector('.tab[data-tab="' + tabId + '"]');
    if (!chip) return;
    var nameEl = chip.querySelector('.tab-name');
    var t = Store.getTab(route.bookId, route.chapterId, tabId);
    if (!t || !nameEl) return;

    var input = document.createElement('input');
    input.type = 'text';
    input.value = t.title;
    nameEl.replaceWith(input);
    input.focus();
    input.select();

    var done = false;
    function commit() {
      if (done) return;
      done = true;
      var v = input.value.trim() || '未命名页签';
      Store.updateTab(route.bookId, route.chapterId, tabId, { title: v });
      renderTabs();
      toast('页签已重命名');
    }
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      if (e.key === 'Escape') { done = true; renderTabs(); }
    });
  }

  /* ---------------- 事件绑定 ---------------- */
  function initHome() {
    var rv = $('review-text');
    var saveReview = debounce(function () {
      Store.setReview(rv.value);
      var el = $('review-status');
      el.textContent = '已保存 ' + new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
      $('home-stats').innerHTML = statsHtml(Store.stats());
    }, 600);
    rv.addEventListener('input', function () {
      $('review-status').textContent = '正在输入…';
      saveReview();
    });

    $('books-grid').addEventListener('click', function (e) {
      var t = e.target;
      var open = t.getAttribute && t.getAttribute('data-open');
      var del = t.getAttribute && t.getAttribute('data-delbook');
      if (open) {
        var b = Store.getBook(open);
        go('book', { bookId: open });
        toast('进入《' + ((b && b.title) || '未命名书籍') + '》');
        return;
      }
      if (del) {
        var bk = Store.getBook(del);
        if (confirm('确定删除《' + ((bk && bk.title) || '未命名书籍') + '》及其全部章节？此操作不可撤销。')) {
          Store.removeBook(del);
          renderHome();
          toast('已删除');
        }
        return;
      }
      if (t.closest && t.closest('#card-add-book')) {
        var nb = Store.addBook();
        renderHome();
        var input = document.querySelector('.card-title[data-title="' + nb.id + '"]');
        if (input) input.focus();
        toast('已添加书籍，点击命名');
      }
    });

    $('books-grid').addEventListener('input', function (e) {
      var t = e.target;
      var id = t.getAttribute && t.getAttribute('data-title');
      if (!id) return;
      Store.updateBook(id, { title: t.value });
    });

    $('btn-add-book').addEventListener('click', function () {
      var nb = Store.addBook();
      renderHome();
      var input = document.querySelector('.card-title[data-title="' + nb.id + '"]');
      if (input) { input.focus(); input.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
      toast('已添加书籍，点击命名');
    });

    $('btn-logout').addEventListener('click', function () {
      setLoggedIn(false);
      flushCurrent();
      go('home');
      document.querySelectorAll('.view').forEach(function (v) { v.classList.remove('is-active'); });
      $('view-login').classList.add('is-active');
      toast('已退出登录');
    });

    $('btn-export').addEventListener('click', function () {
      flushCurrent();
      var blob = new Blob([Store.exportJSON()], { type: 'application/json;charset=utf-8' });
      var a = document.createElement('a');
      var d = new Date();
      var p = function (n) { return n < 10 ? '0' + n : '' + n; };
      a.href = URL.createObjectURL(blob);
      a.download = '思想文库备份_' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '.json';
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      toast('备份已导出');
    });

    $('btn-import').addEventListener('click', function () { $('file-import').click(); });
    $('file-import').addEventListener('change', function () {
      var f = this.files && this.files[0];
      this.value = '';
      if (!f) return;
      var fr = new FileReader();
      fr.onload = function () {
        try {
          Store.importJSON(fr.result);
          renderHome();
          toast('备份已导入');
        } catch (err) { toast('导入失败：' + err.message); }
      };
      fr.readAsText(f);
    });
  }

  function initBook() {
    $('book-title-input').addEventListener('input', function () {
      if (route.bookId) saveBookTitle(route.bookId, this.value);
      $('book-crumb').innerHTML = '文库 / <b>' + esc(this.value || '未命名书籍') + '</b>';
    });

    var saveIntro = debounce(function (v) {
      if (route.bookId) Store.updateBook(route.bookId, { intro: v });
    }, 600);
    $('book-intro').addEventListener('input', function () { saveIntro(this.value); });

    $('btn-book-cover').addEventListener('click', function () {
      var i = $('book-cover-slot').querySelector('input[type=file]'); if (i) i.click();
    });
    $('btn-book-cover-clear').addEventListener('click', function () {
      if (route.bookId) { Store.updateBook(route.bookId, { cover: '' }); renderBook(); toast('封面已移除'); }
    });

    $('btn-del-book').addEventListener('click', function () {
      var b = Store.getBook(route.bookId);
      if (!b) return;
      if (confirm('确定删除《' + (b.title || '未命名书籍') + '》及其全部章节？此操作不可撤销。')) {
        Store.removeBook(route.bookId);
        go('home');
        toast('已删除');
      }
    });

    $('btn-add-chapter').addEventListener('click', function () {
      var c = Store.addChapter(route.bookId);
      renderChaptersGrid();
      if (c) {
        var input = document.querySelector('.card-title[data-chtitle="' + c.id + '"]');
        if (input) { input.focus(); input.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
      }
      toast('已添加章节，点击命名');
    });

    $('chapters-grid').addEventListener('click', function (e) {
      var t = e.target;
      var open = t.getAttribute && t.getAttribute('data-opench');
      var del = t.getAttribute && t.getAttribute('data-delch');
      if (open) {
        var c = Store.getChapter(route.bookId, open);
        if (!c) return;
        var tabId = c.tabs.length ? c.tabs[0].id : null;
        go('chapter', { bookId: route.bookId, chapterId: open, tabId: tabId });
        return;
      }
      if (del) {
        var ch = Store.getChapter(route.bookId, del);
        if (confirm('确定删除「' + ((ch && ch.title) || '未命名章节') + '」及其全部页签？')) {
          Store.removeChapter(route.bookId, del);
          renderChaptersGrid();
          toast('已删除');
        }
        return;
      }
      if (t.closest && t.closest('#card-add-chapter')) {
        var nc = Store.addChapter(route.bookId);
        renderChaptersGrid();
        if (nc) {
          var inp = document.querySelector('.card-title[data-chtitle="' + nc.id + '"]');
          if (inp) { inp.focus(); inp.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
        }
        toast('已添加章节，点击命名');
      }
    });

    $('chapters-grid').addEventListener('input', function (e) {
      var id = e.target.getAttribute && e.target.getAttribute('data-chtitle');
      if (!id) return;
      saveChapterTitle(route.bookId, id, e.target.value);
    });
  }

  function initChapter() {
    $('chapter-title-input').addEventListener('input', function () {
      if (route.chapterId) saveChapterTitle(route.bookId, route.chapterId, this.value);
      var b = Store.getBook(route.bookId);
      $('chapter-crumb').innerHTML =
        esc((b && b.title) || '未命名书籍') + ' / <b>' + esc(this.value || '未命名章节') + '</b>';
    });

    $('btn-chapter-cover').addEventListener('click', function () {
      var i = $('chapter-cover-slot').querySelector('input[type=file]'); if (i) i.click();
    });
    $('btn-chapter-cover-clear').addEventListener('click', function () {
      Store.updateChapter(route.bookId, route.chapterId, { cover: '' });
      renderChapter();
      toast('封面已移除');
    });

    $('btn-del-chapter').addEventListener('click', function () {
      var c = Store.getChapter(route.bookId, route.chapterId);
      if (!c) return;
      if (confirm('确定删除「' + (c.title || '未命名章节') + '」及其全部页签？')) {
        Store.removeChapter(route.bookId, route.chapterId);
        go('book', { bookId: route.bookId });
        toast('已删除');
      }
    });

    // 页签栏
    $('tabs-bar').addEventListener('click', function (e) {
      var del = e.target.getAttribute && e.target.getAttribute('data-tabdel');
      if (del) {
        e.stopPropagation();
        if (!confirm('确定删除该页签及其内容？')) return;
        if (!Store.removeTab(route.bookId, route.chapterId, del)) {
          toast('至少保留一个页签');
          return;
        }
        if (route.tabId === del) {
          var c = Store.getChapter(route.bookId, route.chapterId);
          route.tabId = c.tabs[0].id;
        }
        renderTabs(); loadTabContent(); updateWordCount();
        toast('页签已删除');
        return;
      }
      var chip = e.target.closest && e.target.closest('.tab');
      if (!chip) return;
      var id = chip.getAttribute('data-tab');
      if (id === route.tabId) return;
      flushTab();
      route.tabId = id;
      renderTabs(); loadTabContent(); updateWordCount();
    });

    $('tabs-bar').addEventListener('dblclick', function (e) {
      var chip = e.target.closest && e.target.closest('.tab');
      if (!chip) return;
      startRenameTab(chip.getAttribute('data-tab'));
    });

    $('btn-add-tab').addEventListener('click', function () {
      flushTab();
      var c = Store.getChapter(route.bookId, route.chapterId);
      var t = Store.addTab(route.bookId, route.chapterId, '页签 ' + (c.tabs.length + 1));
      route.tabId = t.id;
      renderTabs(); loadTabContent(); updateWordCount();
      $('tab-content').focus();
      toast('已添加页签');
    });

    $('btn-tab-rename').addEventListener('click', function () { startRenameTab(route.tabId); });

    $('btn-tab-del').addEventListener('click', function () {
      var c = Store.getChapter(route.bookId, route.chapterId);
      if (!c) return;
      if (c.tabs.length <= 1) { toast('至少保留一个页签'); return; }
      if (!confirm('确定删除当前页签及其内容？')) return;
      var cur = route.tabId;
      Store.removeTab(route.bookId, route.chapterId, cur);
      var c2 = Store.getChapter(route.bookId, route.chapterId);
      route.tabId = c2.tabs[0].id;
      renderTabs(); loadTabContent(); updateWordCount();
      toast('页签已删除');
    });

    // 正文输入
    var ta = $('tab-content');
    ta.addEventListener('input', function () {
      setSaveState('正在输入…');
      updateWordCount();
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(function () {
        saveTimer = null;
        Store.updateTab(route.bookId, route.chapterId, route.tabId, { content: ta.value });
        setSaveState('已保存');
      }, 600);
    });
    ta.addEventListener('blur', function () { flushTab(); });

    // Tab 键插入两个全角空格（更像稿纸）
    ta.addEventListener('keydown', function (e) {
      if (e.key === 'Tab') {
        e.preventDefault();
        var s = ta.selectionStart, en = ta.selectionEnd;
        ta.value = ta.value.slice(0, s) + '　　' + ta.value.slice(en);
        ta.selectionStart = ta.selectionEnd = s + 2;
        ta.dispatchEvent(new Event('input'));
      }
    });

    $('btn-indent').addEventListener('click', function () {
      var lines = ta.value.split('\n').map(function (ln) {
        if (!ln.trim()) return ln;
        return /^[\s　]/.test(ln) ? ln : '　　' + ln;
      });
      ta.value = lines.join('\n');
      ta.dispatchEvent(new Event('input'));
      flushTab();
      toast('已首行缩进');
    });
  }

  function initBackButtons() {
    document.querySelectorAll('[data-back]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var target = btn.getAttribute('data-back');
        if (target === 'home') go('home');
        else if (target === 'book') go('book', { bookId: route.bookId });
      });
    });
  }

  /* ---------------- 启动 ---------------- */
  function boot() {
    Store.load();
    saveBookTitle = debounce(function (id, v) { Store.updateBook(id, { title: v }); }, 400);
    saveChapterTitle = debounce(function (bid, cid, v) { Store.updateChapter(bid, cid, { title: v }); }, 400);
    initLogin();
    initHome();
    initBook();
    initChapter();
    initBackButtons();

    // 关页面前把未落盘的改动写掉
    window.addEventListener('beforeunload', function () { if (rendered) flushCurrent(); });

    if (isLoggedIn()) {
      document.querySelectorAll('.view').forEach(function (v) { v.classList.remove('is-active'); });
      go('home');
    } else {
      document.querySelectorAll('.view').forEach(function (v) { v.classList.remove('is-active'); });
      $('view-login').classList.add('is-active');
      setTimeout(function () { var u = $('login-user'); if (u) u.focus(); }, 120);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
