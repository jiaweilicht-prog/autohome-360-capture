/* ============================================================================
 * P0 可行性探测脚本 · v1.0
 * 目标：汽车之家 360° 看车 · 内饰全景页
 *
 * ── 用法（三步，不需要懂代码）────────────────────────────────────────────
 *   1. 用 Chrome 打开一个车型的「360° 看车 → 内饰」页面
 *   2. 等全景画面完全清晰（这一步很重要，加载中就跑会误判）
 *   3. 按 F12 打开开发者工具 → 切到 Console（控制台）→ 粘贴本文件全部内容
 *      → 回车
 *   4. 控制台会打印一份报告，最后会尝试自动复制到剪贴板。
 *      把报告粘贴回给 Tom 即可。
 *
 * ── 跑完之后，还有三个可选的手动验证（同样粘贴到控制台回车）─────────────
 *      __watch(6)        → 监听 6 秒。运行后请立刻用鼠标拖动画面，
 *                          看打印出来的数字会不会变。变了 = 视角可读。
 *      __testSet(90)     → 把水平视角设为 90 度，看画面会不会自己转过去。
 *                          会转 = 视角可写（这是最好的结果）。
 *      __scenes()        → 列出全景里所有「场景」。如果机位是以场景形式
 *                          存在的，那连拖拽都不需要，直接切场景即可。
 *
 * 脚本只读不写，不会修改页面、不会提交任何数据。唯一会改变页面的是
 * 你手动调用的 __testSet()。
 * ============================================================================ */

(function () {
  'use strict';

  var REPORT = [];
  var VERDICT = [];

  function sec(t) { console.log('\n%c▌ ' + t, 'color:#5aa9f8;font-weight:bold;font-size:13px'); }
  function ok(m)  { console.log('  %c✔ ' + m, 'color:#4fc3a1'); REPORT.push('[OK] ' + m); }
  function no(m)  { console.log('  %c✘ ' + m, 'color:#e8757a'); REPORT.push(['[NO] ' + m]); }
  function wr(m)  { console.log('  %c! ' + m, 'color:#f0b45e'); REPORT.push('[注意] ' + m); }
  function kv(k, v) { console.log('      ' + k + ': %c' + v, 'color:#f0b45e'); REPORT.push('    ' + k + ': ' + v); }

  console.log('%c\n╔══════════════════════════════════════════════════════╗', 'color:#5aa9f8');
  console.log('%c║   P0 可行性探测 · 汽车之家 360° 看车内饰              ║', 'color:#5aa9f8;font-weight:bold');
  console.log('%c╚══════════════════════════════════════════════════════╝', 'color:#5aa9f8');

  /* ── 0. 环境信息 ─────────────────────────────────────────────────────── */
  sec('0. 环境信息');
  kv('页面 URL', location.href);
  kv('视口 / 设备像素比', window.innerWidth + 'x' + window.innerHeight + ' / DPR=' + window.devicePixelRatio);
  kv('浏览器', (navigator.userAgent.match(/Chrome\/[\d.]+/) || ['unknown'])[0]);
  if (window.devicePixelRatio !== 1 && window.devicePixelRatio !== 2) {
    wr('设备像素比不是 1 或 2（当前 ' + window.devicePixelRatio + '）。批量采集时必须锁死 DPR，否则同一机位在不同机器上截出来的图尺寸会不一致。');
  }

  /* ── 1. 找全景引擎的 camera 接口 ─────────────────────────────────────── */
  sec('1. 全景引擎识别（最关键的一项）');

  function gatherCandidates() {
    var out = [];
    function push(src, o) {
      if (!o || typeof o !== 'object') return;
      for (var i = 0; i < out.length; i++) if (out[i].o === o) return;
      out.push({ src: src, o: o });
    }

    // 官方默认 ID（krpano 文档里的标准挂载点）
    try { push("document.getElementById('krpanoSWFObject')", document.getElementById('krpanoSWFObject')); } catch (e) {}
    try { push('window.krpano', window.krpano); } catch (e) {}
    try { push('window.krpanoJS', window.krpanoJS); } catch (e) {}

    // 扫描 DOM：id / class 里带全景关键词的容器
    try {
      var els = document.querySelectorAll('div[id],div[class],object[id],embed[id]');
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        var sig = (el.id || '') + ' ' + (typeof el.className === 'string' ? el.className : '');
        if (/krpano|pano|panorama|vrscene|viewer|360/i.test(sig)) {
          push('DOM #' + (el.id || ('' + el.className).slice(0, 30)), el);
        }
      }
    } catch (e) {}

    // 扫描 window 全局变量名
    try {
      Object.getOwnPropertyNames(window).forEach(function (n) {
        if (/krpano|pano|viewer|camera|scene|spritespin|threesixty|photosphere/i.test(n)) {
          try {
            var v = window[n];
            if (v && typeof v === 'object') push('window.' + n, v);
          } catch (e) {}
        }
      });
    } catch (e) {}

    return out;
  }

  // 测试一个对象能不能用 krpano 风格读出视角
  function probeKrpano(o) {
    if (!o || typeof o.get !== 'function') return null;
    try {
      var h = o.get('view.hlookat');
      if (h === null || h === undefined || h === '' || isNaN(parseFloat(h))) return null;
      return {
        hlookat: parseFloat(h),
        vlookat: parseFloat(o.get('view.vlookat')),
        fov: parseFloat(o.get('view.fov'))
      };
    } catch (e) { return null; }
  }

  // 测试一个对象是不是 three.js 风格的 camera
  function probeThree(o) {
    var cam = null;
    try { if (o.isCamera) cam = o; } catch (e) {}
    try { if (!cam && o.camera && o.camera.isCamera) cam = o.camera; } catch (e) {}
    try { if (!cam && typeof o.getCamera === 'function') { var c = o.getCamera(); if (c && c.isCamera) cam = c; } } catch (e) {}
    if (!cam) return null;
    return {
      yaw: cam.rotation ? +(cam.rotation.y * 180 / Math.PI).toFixed(2) : null,
      pitch: cam.rotation ? +(cam.rotation.x * 180 / Math.PI).toFixed(2) : null,
      fov: cam.fov || null
    };
  }

  var cands = gatherCandidates();
  console.log('      共找到 ' + cands.length + ' 个候选对象，逐个测试能否读出视角…');

  var foundKrpano = null, foundKrpanoSrc = null;
  var foundThree = null, foundThreeSrc = null;

  cands.forEach(function (c) {
    var r = probeKrpano(c.o);
    if (r && !foundKrpano) { foundKrpano = r; foundKrpanoSrc = c.src; }
    var t = probeThree(c.o);
    if (t && !foundThree) { foundThree = t; foundThreeSrc = c.src; }
  });

  var CAM = null, CAM_TYPE = null, CAM_SRC = null;

  if (foundKrpano) {
    CAM = foundKrpano; CAM_TYPE = 'krpano'; CAM_SRC = foundKrpanoSrc;
    ok('找到 krpano 视角接口 —— 这是最好的结果');
    kv('来源', foundKrpanoSrc);
    kv('水平角 hlookat', foundKrpano.hlookat);
    kv('垂直角 vlookat', foundKrpano.vlookat);
    kv('视场角 fov', foundKrpano.fov);
    VERDICT.push('视角通道：L0 krpano 数值通道可用');
  } else if (foundThree) {
    CAM = foundThree; CAM_TYPE = 'three'; CAM_SRC = foundThreeSrc;
    ok('找到 three.js camera 对象');
    kv('来源', foundThreeSrc);
    kv('yaw / pitch / fov', foundThree.yaw + ' / ' + foundThree.pitch + ' / ' + foundThree.fov);
    VERDICT.push('视角通道：L1 three.js camera 可用');
  } else {
    no('未找到任何可读的视角接口');
    console.log('      （已测试 ' + cands.length + ' 个候选：' + cands.slice(0, 6).map(function (c) { return c.src; }).join(', ') + (cands.length > 6 ? ' …' : '') + '）');
    wr('这意味着只能靠像素比对来确认机位 —— 方案复杂度会明显上升，视觉伺服对齐成为必需。');
    VERDICT.push('视角通道：仅 L2 像素比对可用（最差情况）');
  }

  /* ── 2. krpano 场景（scene）检测 ─────────────────────────────────────── */
  var K = null;
  if (CAM_TYPE === 'krpano') {
    sec('2. 场景（scene）检测 —— 机位是否以场景形式存在');
    // 找回那个可用的接口对象
    cands.forEach(function (c) { if (!K && probeKrpano(c.o)) K = c.o; });

    var sceneCount = null, curScene = null, names = [];
    try { sceneCount = parseInt(K.get('scene.count'), 10); } catch (e) {}
    try { curScene = K.get('xml.scene'); } catch (e) {}
    if (sceneCount && sceneCount > 0) {
      for (var s = 0; s < sceneCount; s++) {
        try {
          var n = K.get('scene[' + s + '].name');
          var t = K.get('scene[' + s + '].title');
          if (n) names.push(n + (t ? '(' + t + ')' : ''));
        } catch (e) {}
      }
    }
    kv('当前场景', curScene === null ? '读不到' : curScene);
    kv('场景数量', sceneCount === null ? '读不到' : sceneCount);
    if (names.length) {
      ok('场景列表：' + names.join(' | '));
      VERDICT.push('机位形态：krpano 多场景，可直接 loadscene 切换，无需拖拽');
    } else {
      wr('读不到场景列表。机位可能是单场景内的视角切换，需要靠 hlookat/vlookat 定位。');
    }
  }

  /* ── 3. 页面上的机位按钮 / UI 元素 ───────────────────────────────────── */
  sec('3. 机位按钮扫描 —— 是否存在预设机位');

  var KEY = /主驾|副驾|中控|后排|前排|门板|顶棚|全景|内饰|外观|座椅|仪表|方向盘|后备箱|视角|机位|前视|后视/;
  var hits = [];
  try {
    var nodes = document.querySelectorAll('button,a,li,span,div[onclick],[role="button"],[class*=tab],[class*=btn]');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!el.offsetParent && el.tagName !== 'BODY') continue;      // 只统计可见的
      var txt = (el.innerText || el.textContent || '').trim();
      if (!txt || txt.length > 12) continue;                        // 太长的多半是正文
      if (!KEY.test(txt)) continue;
      hits.push({
        文本: txt,
        标签: el.tagName.toLowerCase(),
        id: el.id || '',
        class: ('' + (el.className || '')).slice(0, 40)
      });
    }
  } catch (e) {}

  if (hits.length) {
    ok('找到 ' + hits.length + ' 个疑似机位 / 视角切换元素');
    console.table(hits.slice(0, 25));
    REPORT.push('机位元素：' + hits.slice(0, 25).map(function (h) { return h.文本; }).join(' | '));
    VERDICT.push('机位形态：存在预设按钮，优先点击切换');
  } else {
    no('没有找到任何机位切换按钮 —— 机位只能靠拖拽到达');
    VERDICT.push('机位形态：无预设按钮，必须拖拽 + 视觉伺服');
  }

  /* ── 4. Canvas 与 WebGL 上下文 ───────────────────────────────────────── */
  sec('4. Canvas / WebGL 检查（含一个经典陷阱）');

  var cs = [];
  try {
    var list = document.querySelectorAll('canvas');
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      var gl = null, attr = null, ctxType = null;
      try { gl = c.getContext('webgl2'); if (gl) ctxType = 'webgl2'; } catch (e) {}
      try { if (!gl) { gl = c.getContext('webgl'); if (gl) ctxType = 'webgl'; } } catch (e) {}
      try { if (gl) attr = gl.getContextAttributes(); } catch (e) {}
      cs.push({
        id: c.id || '(无)',
        CSS尺寸: c.clientWidth + 'x' + c.clientHeight,
        缓冲尺寸: c.width + 'x' + c.height,
        上下文: ctxType || '2d/无',
        preserveDrawingBuffer: attr ? String(attr.preserveDrawingBuffer) : '未知'
      });
    }
  } catch (e) {}

  if (!cs.length) {
    no('页面上没有 canvas —— 全景可能不是 WebGL 渲染，需要重新确认技术路线');
  } else {
    console.table(cs);
    REPORT.push('Canvas：' + JSON.stringify(cs));
    var noPreserve = cs.filter(function (x) { return x.preserveDrawingBuffer === 'false'; });
    if (noPreserve.length) {
      wr('preserveDrawingBuffer = false —— 这是个已知陷阱：在浏览器控制台里直接调 canvas.toDataURL() 截出来的会是黑图。');
      console.log('      → 对自动化的影响：Playwright 的 page.screenshot() 走浏览器合成器，不受此限制，所以批量采集阶段没问题。');
      console.log('      → 仅影响你现在在控制台里手动取帧，不必担心。');
    }
  }

  /* ── 5. 干扰元素 / 登录态 / 加载状态 ─────────────────────────────────── */
  sec('5. 干扰元素与访问状态');

  function hasText(re) {
    try {
      var all = document.body.querySelectorAll('div,span,a,button,p');
      for (var i = 0; i < all.length; i++) {
        var t = (all[i].innerText || '').trim();
        if (t && t.length < 60 && re.test(t)) return t.slice(0, 30);
      }
    } catch (e) {}
    return null;
  }

  var login = hasText(/登录|注册|请先登录|登录后查看/);
  var captcha = hasText(/验证码|滑动验证|请完成安全验证/);
  var loading = null;
  try { loading = document.querySelector('.loading,.pano-loading,.progress,.spinner,[class*=load]'); } catch (e) {}

  if (login) { wr('页面上出现登录相关文案："' + login + '" —— 需确认全景是否要求登录'); VERDICT.push('登录态：可能需要登录'); }
  else ok('未发现登录遮罩');

  if (captcha) { no('检测到验证码 —— 立即停止，不要继续尝试'); VERDICT.push('反爬：出现验证码'); }
  else ok('未发现验证码');

  if (loading) { wr('存在加载中元素：' + ('' + loading.className).slice(0, 40) + ' —— 说明画面可能还没加载完，建议等更久再截'); }
  else ok('未发现加载中元素（画面大概率已就绪）');

  // 统计浮层数量，判断弹窗干扰程度
  var overlays = 0;
  try {
    overlays = document.querySelectorAll('[class*=modal],[class*=popup],[class*=dialog],[class*=mask],[class*=float],[class*=guide],[class*=download]').length;
  } catch (e) {}
  kv('疑似浮层 / 弹窗元素数量', overlays + (overlays > 5 ? '（偏多，需要在自动化里专门处理）' : ''));

  /* ── 6. 输出报告 ─────────────────────────────────────────────────────── */
  sec('探测报告（请复制这段发回）');

  var TEXT = [
    '===== P0 探测报告 =====',
    '时间：' + new Date().toLocaleString('zh-CN'),
    'URL ：' + location.href,
    '视口：' + window.innerWidth + 'x' + window.innerHeight + '  DPR=' + window.devicePixelRatio,
    '',
    '-- 判定 --'
  ].concat(VERDICT).concat([
    '',
    '-- 明细 --'
  ]).concat(REPORT).concat([
    '',
    '-- 手动验证（如有）--',
    '__watch()  结果：',
    '__testSet() 结果：',
    '__scenes()  结果：',
    '',
    '-- 画面上的标识位置（肉眼观察，比如右下角）--',
    '水印/角标位置：',
    '======================'
  ]).join('\n');

  console.log(TEXT);
  try { copy(TEXT); console.log('%c\n✔ 报告已尝试自动复制到剪贴板，直接粘贴即可。', 'color:#4fc3a1'); }
  catch (e) { console.log('\n（自动复制失败，请手动选中上面的报告复制）'); }

  /* ── 7. 挂载后续手动验证函数 ─────────────────────────────────────────── */
  window.__watch = function (sec) {
    sec = sec || 6;
    if (!K && !CAM) { console.log('未找到视角接口，无法监听'); return; }
    var src = K || (CAM_TYPE === 'three' ? cands.filter(function (c) { return probeThree(c.o); })[0].o : null);
    if (!src) { console.log('未找到视角接口对象'); return; }
    var samples = [];
    var t0 = performance.now();
    console.log('▶ 开始监听 ' + sec + ' 秒，请【现在用鼠标拖动画面】…');
    var id = setInterval(function () {
      samples.push({
        '时间(ms)': Math.round(performance.now() - t0),
        hlookat: CAM_TYPE === 'krpano' ? parseFloat(src.get('view.hlookat')) : +(src.rotation.y * 180 / Math.PI).toFixed(2),
        vlookat: CAM_TYPE === 'krpano' ? parseFloat(src.get('view.vlookat')) : +(src.rotation.x * 180 / Math.PI).toFixed(2),
        fov: CAM_TYPE === 'krpano' ? parseFloat(src.get('view.fov')) : (src.fov || 0)
      });
      if (performance.now() - t0 > sec * 1000) {
        clearInterval(id);
        console.table(samples);
        var hs = samples.map(function (s) { return s.hlookat; });
        var changed = Math.max.apply(null, hs) - Math.min.apply(null, hs);
        if (changed > 0.5) {
          console.log('%c✔ 数值随拖拽变化（幅度 ' + changed.toFixed(2) + ' 度）—— 视角可读，且是实时反映的。', 'color:#4fc3a1;font-weight:bold');
        } else {
          console.log('%c✘ 数值没有变化 —— 这个接口可能只是个副本，不反映真实视角。需要换个探测思路。', 'color:#e8757a;font-weight:bold');
        }
      }
    }, 200);
  };

  window.__testSet = function (h, v, f) {
    if (CAM_TYPE !== 'krpano' || !K) { console.log('只有 krpano 通道支持直接设置视角。当前通道：' + (CAM_TYPE || '无')); return; }
    h = (h === undefined || h === null) ? 90 : h;
    var before = parseFloat(K.get('view.hlookat'));
    try {
      K.set('view.hlookat', h);
      if (v !== undefined && v !== null) K.set('view.vlookat', v);
      if (f !== undefined && f !== null) K.set('view.fov', f);
    } catch (e) { console.log('设置失败：' + e.message); return; }
    setTimeout(function () {
      var after = parseFloat(K.get('view.hlookat'));
      console.log('设置前 hlookat=' + before + ' → 设置后 hlookat=' + after);
      console.log('%c请看画面：如果视角自己转过去了，说明「视角可写」—— 这是最优结果，机位可以直接用数值定义，视觉伺服基本不需要了。', 'color:#f0b45e;font-weight:bold');
    }, 800);
  };

  window.__scenes = function () {
    if (!K) { console.log('未找到 krpano 接口'); return; }
    var out = [];
    var n = parseInt(K.get('scene.count'), 10) || 0;
    for (var i = 0; i < n; i++) {
      out.push({ 序号: i, name: K.get('scene[' + i + '].name'), title: K.get('scene[' + i + '].title') });
    }
    if (!out.length) { console.log('无场景列表'); return; }
    console.table(out);
    console.log('若上面列出了「主驾 / 中控 / 后排」这类场景名，说明机位是场景切换，直接 loadscene 即可，完全不需要拖拽。');
  };

  window.__report = function () { console.log(TEXT); };

  sec('接下来请依次手动运行（复制粘贴回车）');
  console.log('   ① %c__watch(6)', 'color:#f0b45e');
  console.log('      → 回车后立刻用鼠标拖动画面，看数字变不变\n');
  console.log('   ② %c__testSet(90)', 'color:#f0b45e');
  console.log('      → 看画面会不会自动转到水平 90 度\n');
  console.log('   ③ %c__scenes()', 'color:#f0b45e');
  console.log('      → 看机位是不是以「场景」形式存在\n');
  console.log('   结果贴回给 Tom 即可。');
})();
