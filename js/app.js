// ═══════════════════════════════════════════════════════════
// 模块分工
//   1. 首屏：封面标题雪花消散（逐帧）+ 幽灵导航 + 视频自动播放兜底
//   2. 连续运动：背景视差（整段叙事进度 0→1）+ 视频镜头呼吸
//   3. Scrollama：步骤触发、场景切换、卡片三态、导航章节高亮
//   4. 雪花粒子引擎（独立 rAF，仅雪场景激活时运行）
//   5. 分栏页消散工厂：文案 / 肖像 / 图注各自以焦点线触发
// 关键教训
//   · 连续运动必须由连续的滚动值驱动——scrollama 的 progress 对
//     每个步骤从 0 重新计数，跨步骤会产生「上移后突然回落」的锯齿
//   · 文字「散开」用 scaleX（不参与排版）；letter-spacing 会让
//     两端对齐段落重新断行、排版跳动
//   · 视频镜头缩放交给浏览器 GPU（亚像素插值），ffmpeg zoompan 的
//     整数取整会颤抖；按 currentTime 计算，暂停 / 恢复永不失步
//   · 所有逐帧更新的元素都不写 CSS transition（互相拖累）
// ═══════════════════════════════════════════════════════════

// 标记 JS 可用：滚动步骤的三态动画仅在此时启用
// （无 JS 时所有文字保持静态、完整可读）
document.documentElement.classList.add("js-enabled");

document.addEventListener("DOMContentLoaded", async () => {
  const fallbackConfig = window.STORY_CONFIG || {};
  const queryConfig = new URLSearchParams(window.location.search).get("config");
  const appScript = document.querySelector('script[src*="js/app.js"]');
  const configSrc =
    queryConfig ||
    document.body.dataset.configSrc ||
    appScript?.dataset.configSrc ||
    "";
  const normalizeConfig = (payload) => {
    if (!payload || typeof payload !== "object") return null;
    // Accept plain JSON as well as common headless CMS envelopes.
    return payload.config || payload.story || payload.data?.attributes || payload.data || payload;
  };
  let config = normalizeConfig(fallbackConfig) || {};
  if (configSrc) {
    try {
      const response = await fetch(configSrc, { credentials: "same-origin" });
      if (!response.ok) throw new Error(`Config request failed: ${response.status}`);
      const remoteConfig = normalizeConfig(await response.json());
      if (!remoteConfig || !Array.isArray(remoteConfig.steps)) {
        throw new Error("Config response does not contain a steps array");
      }
      config = { ...config, ...remoteConfig };
    } catch (error) {
      console.warn("Unable to load external story config; using story-config.js.", error);
    }
  }
  if (!Array.isArray(config.steps)) {
    console.warn("No valid story configuration found.");
    return;
  }

  const escapeHtml = (value = "") =>
    String(value).replace(
      /[&<>"']/g,
      (character) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
          character
        ],
    );
  const paragraphs = (items = []) =>
    items.map((text) => `<p>${escapeHtml(text)}</p>`).join("");

  // The HTML is intentionally only a mount point. Story-specific content lives in story-config.js.
  const theme = config.theme || {};
  const rootStyle = document.documentElement.style;
  const themeVars = {
    "--story-accent": theme.accent,
    "--story-text": theme.text,
    "--story-bg": theme.background,
    "--story-font": theme.font,
    "--story-ui-font": theme.uiFont,
    "--story-overlay": theme.overlayStrength,
  };
  Object.entries(themeVars).forEach(([name, value]) => {
    if (value !== undefined && value !== null && value !== "") rootStyle.setProperty(name, value);
  });
  document.title = config.title || document.title;
  document.getElementById("coverTitle").textContent = config.title || "";
  document.querySelector('[data-story="subtitle"]').textContent =
    config.subtitle || "";
  document.querySelector('[data-story="byline"]').textContent =
    config.byline || "";
  document.querySelector('[data-story="nav-title"]').textContent =
    config.navTitle || config.title || "";
  const chapterList = document.querySelector('[data-story="chapters"]');
  chapterList.innerHTML = (
    config.chapters || []
  )
    .map(
      ({ id, label }) =>
        `<li><a href="#${escapeHtml(id)}">${escapeHtml(label)}</a></li>`,
    )
    .join("");

  const mediaSources = (media, tag) => {
    const mobile = typeof media.mobileSrc === "string" ? media.mobileSrc.trim() : "";
    if (!mobile) return "";
    const type = tag === "video" ? ' type="video/mp4"' : "";
    const breakpoint = Number.isFinite(Number(media.mobileBreakpoint))
      ? Number(media.mobileBreakpoint)
      : 768;
    return `<source media="(max-width: ${breakpoint}px)" src="${escapeHtml(mobile)}"${type} />`;
  };
  const mediaError = (element) => {
    element.addEventListener("error", function onError() {
      const parent = this.parentElement;
      if (!parent || parent.querySelector(":scope > .media-placeholder")) return;
      this.classList.add("media-error");
      const fallback = document.createElement("span");
      fallback.className = "media-placeholder is-visible";
      fallback.setAttribute("role", "img");
      fallback.setAttribute("aria-label", this.getAttribute("alt") || "媒体");
      fallback.textContent = "媒体暂时无法加载";
      this.replaceWith(fallback);
    }, { once: true });
  };
  const renderMedia = (media = {}, { background = false } = {}) => {
    const tag = media.type === "video" ? "video" : "img";
    const dimensions = background ? 'width="1600" height="900"' : 'width="900" height="600"';
    if (tag === "video") {
      const poster = media.poster ? ` poster="${escapeHtml(media.poster)}"` : "";
      return `<video muted loop playsinline preload="metadata" ${dimensions}${poster} aria-label="${escapeHtml(media.alt || "")}">${mediaSources(media, tag)}<source src="${escapeHtml(media.src || "")}" type="video/mp4" /><span class="media-placeholder">媒体暂时无法加载</span></video>`;
    }
    return `<picture>${mediaSources(media, tag)}<img src="${escapeHtml(media.src || "")}" alt="${escapeHtml(media.alt || "")}" ${dimensions} loading="lazy" /><span class="media-placeholder">媒体暂时无法加载</span></picture>`;
  };
  document.querySelector('[data-story="scenes"]').outerHTML = (config.scenes || [])
    .map((scene) => {
      const media =
        renderMedia({ ...scene, type: scene.type }, { background: true });
      return `<div class="bg-scene bg-scene--media${scene.snow ? " bg-scene--snow" : ""}" data-scene="${scene.id}" data-caption="${escapeHtml(scene.caption || "")}">${media}</div>`;
    })
    .join("");

  let splitElementRendered = false;
  const renderStep = (step) => {
    const attributes = `class="step${step.type === "media" ? " step--media" : ""}" data-scene="${step.scene}"${step.id ? ` id="${escapeHtml(step.id)}"` : ""}`;
    if (step.type === "media") return `<div ${attributes}></div>`;
    if (step.type === "quote")
      return `<div ${attributes}><blockquote class="step__card step__card--quote"><p>${escapeHtml(step.text)}</p></blockquote></div>`;
    if (step.type === "gallery") {
      const items = (step.images || []).map((image) => `<figure class="gallery__item">${renderMedia(image)}<figcaption>${escapeHtml(image.caption || "")}</figcaption></figure>`).join("");
      return `<div ${attributes}><section class="step__card step__card--gallery" aria-label="${escapeHtml(step.title || "图片集")}">${step.title ? `<h2>${escapeHtml(step.title)}</h2>` : ""}<div class="gallery">${items}</div></section></div>`;
    }
    if (step.type === "timeline") {
      const items = (step.events || []).map((event) => `<li class="timeline__event"><time>${escapeHtml(event.date || "")}</time><div><h3>${escapeHtml(event.title || "")}</h3><p>${escapeHtml(event.text || "")}</p></div></li>`).join("");
      return `<div ${attributes}><section class="step__card step__card--timeline" aria-label="${escapeHtml(step.title || "时间线")}">${step.title ? `<h2>${escapeHtml(step.title)}</h2>` : ""}<ol class="timeline">${items}</ol></section></div>`;
    }
    if (step.type === "data") {
      const rows = (step.rows || []).map((row) => `<tr>${(Array.isArray(row) ? row : Object.values(row)).map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("");
      const headers = (step.headers || []).map((header) => `<th scope="col">${escapeHtml(header)}</th>`).join("");
      return `<div ${attributes}><section class="step__card step__card--data" aria-label="${escapeHtml(step.title || "数据")}">${step.title ? `<h2>${escapeHtml(step.title)}</h2>` : ""}<div class="data-table-wrap"><table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table></div></section></div>`;
    }
    if (step.type === "split") {
      const media = step.media || {};
      const dissolveIds = splitElementRendered
        ? { image: "", caption: "", text: "" }
        : {
            image: ' id="portraitImg"',
            caption: ' id="portraitCaption"',
            text: ' id="splitText"',
          };
      splitElementRendered = true;
      return `<div ${attributes}><div class="step__card step__card--split"><figure class="split-media"${dissolveIds.image}>${renderMedia(media)}<figcaption${dissolveIds.caption}>${escapeHtml(media.caption)}</figcaption></figure><div class="split-text"${dissolveIds.text}>${paragraphs(step.paragraphs)}</div></div></div>`;
    }
    const title = step.title ? `<h2>${escapeHtml(step.title)}</h2>` : "";
    const kicker = step.kicker
      ? `<span class="step__kicker">${escapeHtml(step.kicker)}</span>`
      : "";
    const dropCap = step.dropCap
      ? `<p class="drop-cap">${escapeHtml(step.dropCap)}</p>`
      : "";
    const final = step.final
      ? `<p class="step__final">${escapeHtml(step.final)}</p>`
      : "";
    return `<div ${attributes}><article class="step__card">${kicker}${title}${dropCap}${paragraphs(step.paragraphs)}${final}</article></div>`;
  };
  document.querySelector('[data-story="steps"]').innerHTML = (config.steps || [])
    .map(renderStep)
    .join("");
  document
    .querySelector('[data-story="steps"]')
    .insertAdjacentHTML(
      "beforeend",
      '<div class="scrolly__tail" aria-hidden="true"></div>',
    );
  document.querySelectorAll("img, video").forEach(mediaError);
  document.querySelectorAll("video").forEach((video) => {
    video.preload = video.closest("[data-scene]")?.dataset.scene === String(config.coverScene ?? config.scenes?.[0]?.id) ? "auto" : "metadata";
  });
  const progressBar = document.querySelector('[data-story="progress-bar"]');
  const progressLabel = document.querySelector('[data-story="progress-label"]');
  const progressTrack = document.querySelector('[data-story="progress-steps"]');
  const progressContainer = document.querySelector('[data-story="progress"]');
  const chapterData = Array.isArray(config.chapters) ? config.chapters : [];
  if (progressTrack) {
    progressTrack.innerHTML = chapterData
      .map((chapter) => `<span class="chapter-progress__step" title="${escapeHtml(chapter.label || "")}"></span>`)
      .join("");
  }
  const setProgress = (index) => {
    const total = steps.length || 1;
    const percent = ((index + 1) / total) * 100;
    if (progressBar) {
      if (progressBar.tagName === "PROGRESS") progressBar.value = percent;
      else progressBar.style.width = `${percent}%`;
      progressBar.setAttribute("aria-valuenow", String(Math.round(percent)));
    }
    const chapterIndex = chapterData.reduce(
      (current, chapter, i) => (steps.findIndex((step) => step.id === chapter.id) <= index ? i : current),
      0,
    );
    if (progressLabel) {
      progressLabel.textContent = chapterData.length
        ? `${Math.min(chapterIndex + 1, chapterData.length)} / ${chapterData.length}`
        : `${index + 1} / ${total}`;
    }
    progressTrack?.querySelectorAll(".chapter-progress__step").forEach((step, i) => {
      step.classList.toggle("is-active", i <= chapterIndex);
    });
    progressContainer?.setAttribute("aria-label", `阅读进度 ${Math.round(percent)}%`);
  };

  /* ==========================================================
     1. 首屏：封面标题雪花式消散 + 幽灵导航 + 视频自动播放兜底
     职责：唯一的滚动 rAF 总控循环在这里注册——封面消散、
           分栏消散、背景视差、导航显隐都挂在同一条循环上
     ========================================================== */
  const scrollyBg = document.getElementById("scrollyBg");
  const coverText = document.getElementById("coverText");
  const coverTitle = document.getElementById("coverTitle");
  const ghostNav = document.getElementById("ghostNav");
  const sceneElements = Array.from(document.querySelectorAll(".bg-scene"));
  const sceneById = new Map(
    sceneElements.map((scene) => [scene.dataset.scene, scene]),
  );
  const coverSceneId = String(config.coverScene ?? config.scenes?.[0]?.id ?? "");
  const coverScene = sceneById.get(coverSceneId);
  const coverVideo = coverScene?.querySelector("video");
  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  // 首屏高度 = sticky 背景层高度（约一个动态视口）
  let coverHeight = scrollyBg ? scrollyBg.offsetHeight : window.innerHeight;
  let hasPlaybackFallback = false;

  // 背景视差：随整段叙事进度连续上移（非逐步骤重置，避免跳变）
  const scrollySection = document.getElementById("scrolly");
  let activeMedia = null; // 当前激活场景的图片/视频元素
  let parallaxTravel = 1; // 可滚动总行程 = 叙事区高度 - 视口高度

  const updateParallaxMetrics = () => {
    parallaxTravel = scrollySection
      ? Math.max(1, scrollySection.offsetHeight - window.innerHeight)
      : 1;
  };
  updateParallaxMetrics();

  // 视频镜头呼吸：正放段缓缓推近、倒放段缓缓拉回
  // （与 ping-pong 循环文件严格同步：按 currentTime 计算，缩放交给 GPU 亚像素插值，无抖动）
  // 复盘：曾把缩放烧进视频（ffmpeg zoompan）——整数取整导致颤抖；
  //       按 currentTime 而非墙钟时间计算，视频暂停（场景切走）后恢复也不失步
  const VIDEO_HALF = 8.09; // 正放 / 倒放各占的时长（秒），与视频文件一致

  const zoomOfVideo = (t) => {
    const cycle = VIDEO_HALF * 2;
    const phase = ((t % cycle) + cycle) % cycle; // 0 → cycle
    const p = phase < VIDEO_HALF ? phase / VIDEO_HALF : 2 - phase / VIDEO_HALF;
    return 1 + 0.12 * p; // 1.0 → 1.12 → 1.0
  };

  const tryPlayVideo = () => {
    if (!coverVideo) return;

    coverVideo.muted = true;
    coverVideo.playsInline = true;
    coverVideo.loop = true;
    coverVideo.setAttribute("loop", "loop");

    const playPromise = coverVideo.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {
        if (hasPlaybackFallback) return;

        // 浏览器把自动播放视为“不允许”，等用户首次交互再恢复播放
        hasPlaybackFallback = true;
        const resumeVideo = () => {
          coverVideo.muted = true;
          coverVideo.play().catch(() => {});
        };

        document.addEventListener("pointerdown", resumeVideo, {
          once: true,
          passive: true,
        });
        document.addEventListener("touchstart", resumeVideo, {
          once: true,
          passive: true,
        });
      });
    }
  };

  if (coverVideo) {
    coverVideo.loop = true;
    coverVideo.addEventListener("ended", () => {
      coverVideo.currentTime = 0;
      coverVideo.play().catch(() => {});
    });
    coverVideo.addEventListener("loadeddata", tryPlayVideo);
    coverVideo.addEventListener("canplay", tryPlayVideo);
    tryPlayVideo();

    // 回到前台时恢复播放（仅当视频场景仍处于激活状态）
    document.addEventListener("visibilitychange", () => {
      const sceneActive =
        !coverScene || coverScene.classList.contains("is-active");
      if (!document.hidden && sceneActive) tryPlayVideo();
    });

    window.addEventListener("pageshow", tryPlayVideo);
  }

  window.addEventListener(
    "resize",
    () => {
      coverHeight = scrollyBg ? scrollyBg.offsetHeight : window.innerHeight;
      updateParallaxMetrics();
    },
    { passive: true },
  );

  // 滚动驱动：标题「雪崩」如雪花般消散
  // （向上飘移 + 模糊 + 字距散开 + 淡出，随滚动进度 0→1）
  const updateCoverText = (scrollY) => {
    if (!coverText) return;
    const p = Math.min(1, Math.max(0, scrollY / (coverHeight * 0.75)));

    if (prefersReducedMotion) {
      coverText.style.opacity = (1 - p).toFixed(3);
      return;
    }

    coverText.style.opacity = (1 - p).toFixed(3);
    coverText.style.filter = `blur(${(p * 10).toFixed(2)}px)`;
    coverText.style.transform = `translate(-50%, calc(-50% + ${(scrollY * 0.55).toFixed(1)}px)) scale(${(1 + p * 0.06).toFixed(3)})`;
    if (coverTitle)
      coverTitle.style.letterSpacing = `${(p * 0.18).toFixed(3)}em`;
  };

  // 「雪花消散」工厂：元素中心越过焦点线后，连续上飘 + 模糊 + 淡出
  // 分工：进入阶段归 CSS 三态（升起、变清晰），退出阶段归本工厂（逐帧消散）
  // 每个元素按自身位置独立触发，先后自然错开（图片先散、图注随后）。
  // 复盘：曾用 letter-spacing 做「字距散开」，导致两端对齐段落重新断行，
  //       改用 scaleX——纯视觉横向拉伸，不参与排版计算
  const makeSnowDissolve = (
    el,
    { blur = 8, rise = 60, shrink = 0, spread = 0 } = {},
  ) => {
    return () => {
      if (!el || prefersReducedMotion) return;

      const reset = () => {
        el.style.opacity = "";
        el.style.filter = "";
        el.style.transform = "";
        el.style.letterSpacing = "";
      };

      const rect = el.getBoundingClientRect();
      // 远离视口时复位，避免无谓的样式计算
      if (
        rect.top > window.innerHeight * 1.5 ||
        rect.bottom < -window.innerHeight
      ) {
        reset();
        return;
      }

      // 以视口 45% 高度处为焦点线
      const delta = rect.top + rect.height / 2 - window.innerHeight * 0.45;
      const range = window.innerHeight * 0.5;

      if (delta > 0) {
        // 未到焦点：不干预，进入效果完全交给卡片三态
        reset();
        return;
      }

      // 越过焦点：如雪花向上消散
      const p = Math.min(1, -delta / range); // 0=刚到焦点 1=完全越过
      el.style.opacity = (1 - p).toFixed(3);
      el.style.filter = `blur(${(p * blur).toFixed(2)}px)`;
      // 文字「散开」用 scaleX（纯视觉横向拉伸，不参与排版、不引发换行重排）；
      // 不能用 letter-spacing——它会改变字符宽度，导致两端对齐段落重新断行
      el.style.transform = `translateY(${(-p * rise).toFixed(
        1,
      )}px) scaleX(${(1 + p * spread).toFixed(3)}) scale(${(1 - p * shrink).toFixed(3)})`;
    };
  };

  // 分栏页三个元素各自独立消散：文案 / 肖像 / 图注
  const updateSplitTextDissolve = makeSnowDissolve(
    document.getElementById("splitText"),
    { blur: 8, rise: 60, spread: 0.05 },
  );
  const updatePortraitImgDissolve = makeSnowDissolve(
    document.getElementById("portraitImg"),
    { blur: 10, rise: 70, shrink: 0.05 },
  );
  const updatePortraitCaptionDissolve = makeSnowDissolve(
    document.getElementById("portraitCaption"),
    { blur: 8, rise: 50, spread: 0.04 },
  );

  // 滚动事件监听：用 rAF 将视觉更新同步到浏览器渲染帧
  let isTicking = false;

  window.addEventListener(
    "scroll",
    () => {
      if (isTicking) return;

      isTicking = true;
      window.requestAnimationFrame(() => {
        const scrollY = window.scrollY || window.pageYOffset;

        updateCoverText(scrollY);
        updateSplitTextDissolve();
        updatePortraitImgDissolve();
        updatePortraitCaptionDissolve();

        // 背景内容视差 + 视频镜头呼吸
        // （缩放由浏览器 GPU 亚像素插值，替代 ffmpeg zoompan 的整数抖动）
        if (activeMedia && !prefersReducedMotion) {
          const p = Math.min(1, Math.max(0, scrollY / parallaxTravel));
          const drift = (0.5 - p) * 5;
          let scale = 1.06; // 视差漂移的过扫余量
          if (activeMedia === coverVideo) {
            scale *= zoomOfVideo(coverVideo.currentTime || 0);
          }
          activeMedia.style.transform = `translateY(${drift.toFixed(
            2,
          )}%) scale(${scale.toFixed(4)})`;
        }

        if (ghostNav) {
          ghostNav.classList.toggle("is-visible", scrollY > coverHeight * 0.6);
        }

        isTicking = false;
      });
    },
    { passive: true },
  );

  /* ==========================================================
     2. Scrollama：sticky 背景 + 步骤卡片的滚动叙事
     ========================================================== */
  const scenes = sceneElements;
  const steps = Array.from(document.querySelectorAll(".step"));
  const bgCaption = document.getElementById("bgCaption");

  if (!scenes.length || !steps.length) return;

  let activeScene = null;
  let captionTimer = null;

  /* ==========================================================
     雪花粒子层：带 bg-scene--snow 的场景激活时飘雪
     独立 rAF 循环（雪花需要持续动画，不依赖滚动事件）
     职责边界：本引擎只负责「飘雪」本身；可见性（淡入淡出）由
     activateScene 按场景标记切换；雪量按面积自适应、retina 适配
     ========================================================== */
  const snowCanvas = document.getElementById("snowCanvas");
  let snowCtx = null;
  let snowFlakes = [];
  let snowRunning = false;
  let snowRafId = 0;
  let snowLast = 0;

  const spawnFlake = (w, h, anywhere) => ({
    x: Math.random() * w,
    y: anywhere ? Math.random() * h : -10, // 初始化时铺满全屏，之后从顶部出生
    r: 0.6 + Math.random() * 1.8, // 半径 0.6~2.4px
    speed: 18 + Math.random() * 52, // 落速 18~70px/s
    swayAmp: 8 + Math.random() * 22, // 左右摆动幅度
    swayFreq: 0.3 + Math.random() * 0.9, // 摆动频率
    phase: Math.random() * Math.PI * 2,
    opacity: 0.25 + Math.random() * 0.65,
  });

  const resizeSnow = () => {
    if (!snowCanvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = snowCanvas.clientWidth;
    const h = snowCanvas.clientHeight;
    snowCanvas.width = Math.round(w * dpr);
    snowCanvas.height = Math.round(h * dpr);
    snowCtx = snowCanvas.getContext("2d");
    snowCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 雪量按面积自适应，桌面约 120 片封顶
    const count = Math.min(120, Math.round((w * h) / 12000));
    snowFlakes = Array.from({ length: count }, () => spawnFlake(w, h, true));
  };

  const stepSnow = (now) => {
    if (!snowRunning) return;
    const dt = Math.min(0.05, (now - snowLast) / 1000); // 防止切后台后跳帧
    snowLast = now;

    const w = snowCanvas.clientWidth;
    const h = snowCanvas.clientHeight;
    const t = now / 1000;

    snowCtx.clearRect(0, 0, w, h);
    for (const f of snowFlakes) {
      f.y += f.speed * dt;
      const x = f.x + Math.sin(t * f.swayFreq + f.phase) * f.swayAmp;
      if (f.y > h + 8) {
        Object.assign(f, spawnFlake(w, h, false)); // 落底后从顶部重生
        continue;
      }
      snowCtx.beginPath();
      snowCtx.arc(x, f.y, f.r, 0, Math.PI * 2);
      snowCtx.fillStyle = `rgba(255, 255, 255, ${f.opacity})`;
      snowCtx.fill();
    }

    snowRafId = requestAnimationFrame(stepSnow);
  };

  const startSnow = () => {
    if (snowRunning || !snowCtx || prefersReducedMotion) return;
    snowRunning = true;
    snowLast = performance.now();
    snowRafId = requestAnimationFrame(stepSnow);
  };

  const stopSnow = () => {
    snowRunning = false;
    if (snowRafId) cancelAnimationFrame(snowRafId);
  };

  resizeSnow();
  window.addEventListener("resize", resizeSnow, { passive: true });

  // 场景切换：交叉淡化 + 离场场景向上消散
  const activateScene = (sceneId) => {
    const sceneKey = String(sceneId);
    if (sceneKey === activeScene) return;
    activeScene = sceneKey;

    scenes.forEach((scene, i) => {
      const isActive = scene.dataset.scene === sceneKey;
      scene.classList.toggle("is-active", isActive);
      // 新场景提到最上层：交叉切换时「新画面盖旧画面」，避免双半透明灰雾
      scene.style.zIndex = isActive ? "2" : "";

      // 首屏视频只在场景激活时播放，离开即暂停，节省电量
      const video = scene.querySelector("video");
      if (video) {
        if (isActive) {
          video.muted = true;
          video.play().catch(() => {});
        } else {
          video.pause();
        }
      }
    });

    // 文字是否直接压在媒体场景（视频/图片）上：切换白字投影样式
    if (scrollySection) {
      const activeSceneEl = sceneById.get(sceneKey);
      const isMedia = activeSceneEl?.classList.contains("bg-scene--media") ?? false;
      scrollySection.classList.toggle("is-on-media", isMedia);
    }

    // 记录当前场景的媒体元素，供连续视差使用
    const activeSceneEl = sceneById.get(sceneKey);
    activeMedia = activeSceneEl
      ? activeSceneEl.querySelector("img, video")
      : null;

    // 雪花粒子层：仅当激活场景标记了 bg-scene--snow 时飘雪
    if (snowCanvas) {
      const snowOn =
        activeSceneEl &&
        activeSceneEl.classList.contains("bg-scene--snow") &&
        !prefersReducedMotion;
      snowCanvas.classList.toggle("is-active", Boolean(snowOn));
      if (snowOn) {
        startSnow();
      } else {
        stopSnow();
      }
    }

    // 离开视频场景时彻底隐藏封面标题（防止锚点跳转后残留）
    if (coverText && sceneKey !== coverSceneId) {
      coverText.style.opacity = "0";
      if (!prefersReducedMotion) coverText.style.filter = "blur(10px)";
    }

    // 底部图注：淡出 → 换字 → 淡入
    if (!bgCaption) return;
    const caption = sceneById.get(sceneKey)?.dataset.caption || "";

    if (bgCaption.textContent === caption) {
      bgCaption.classList.toggle("is-hidden", caption === "");
      return;
    }

    bgCaption.classList.add("is-hidden");
    clearTimeout(captionTimer);
    captionTimer = setTimeout(() => {
      bgCaption.textContent = caption;
      bgCaption.classList.toggle("is-hidden", caption === "");
    }, 200);
  };

  // 高亮当前步骤；已越过的步骤标记为 is-passed（雪花式向上消散）
  // 同时联动幽灵导航：高亮当前章节链接
  const navChapterLinks = Array.from(
    document.querySelectorAll(".nav-chapters a"),
  );
  const chapterStepIndexes = new Map(
    (config.chapters || [])
      .map((chapter) => [
        chapter.id,
        steps.findIndex((step) => step.id === chapter.id),
      ])
      .filter(([, index]) => index >= 0),
  );

  const markCurrentStep = (index) => {
    setProgress(index);
    steps.forEach((step, i) => {
      step.classList.toggle("is-current", i === index);
      step.classList.toggle("is-passed", i < index);
    });

    let chapter = 0;
    chapterStepIndexes.forEach((chapterIndex, chapterId) => {
      if (index >= chapterIndex) {
        chapter = (config.chapters || []).findIndex(
          (item) => item.id === chapterId,
        );
      }
    });
    navChapterLinks.forEach((link, i) => {
      link.classList.toggle("is-active", i === chapter);
    });
  };

  // 初始化第一个场景与图注
  activateScene(coverSceneId);
  markCurrentStep(0);

  // scrollama 初始化（本地 js/scrollama.min.js）
  if (typeof scrollama !== "undefined") {
    const scroller = scrollama();

    scroller
      .setup({
        step: ".step",
        // 触发线在视口 55% 高度处：文字进入下半区即触发，
        // 配合 55vh 的步骤高度，约滚半屏文字就到焦点
        offset: 0.55,
        order: true, // 滚动方向变化时仍按文档顺序触发
        debug: false,
      })
      .onStepEnter(({ element, index }) => {
        // 步骤上标记的 data-scene 决定它对应哪张背景
        activateScene(element.dataset.scene || coverSceneId);
        markCurrentStep(index);
      });

    // 移动端地址栏伸缩会改变视口高度，防抖后重新计算触发位置
    let resizeTimer = null;
    window.addEventListener(
      "resize",
      () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => scroller.resize(), 150);
      },
      { passive: true },
    );
  }
});
