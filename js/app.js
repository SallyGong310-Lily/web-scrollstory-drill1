// 标记 JS 可用：滚动步骤的三态动画仅在此时启用
// （无 JS 时所有文字保持静态、完整可读）
document.documentElement.classList.add("js-enabled");

document.addEventListener("DOMContentLoaded", () => {
  /* ==========================================================
     1. 首屏：封面标题雪花式消散 + 幽灵导航 + 视频自动播放兜底
     ========================================================== */
  const scrollyBg = document.getElementById("scrollyBg");
  const coverText = document.getElementById("coverText");
  const coverTitle = document.getElementById("coverTitle");
  const ghostNav = document.getElementById("ghostNav");
  const coverScene = document.querySelector('.bg-scene[data-scene="0"]');
  const coverVideo = document.querySelector(".scrolly__bg video");
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
  // 仅接管退出阶段；进入阶段不干预，交给卡片三态。
  // 每个元素按自身位置独立触发，先后自然错开（图片先散、图注随后）。
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
  const scenes = Array.from(document.querySelectorAll(".bg-scene"));
  const steps = Array.from(document.querySelectorAll(".step"));
  const bgCaption = document.getElementById("bgCaption");

  if (!scenes.length || !steps.length) return;

  let activeScene = -1;
  let captionTimer = null;

  // 场景切换：交叉淡化 + 离场场景向上消散
  const activateScene = (sceneIndex) => {
    if (sceneIndex === activeScene) return;
    activeScene = sceneIndex;

    scenes.forEach((scene, i) => {
      const isActive = i === sceneIndex;
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
      const isMedia = scenes[sceneIndex]
        ? scenes[sceneIndex].classList.contains("bg-scene--media")
        : false;
      scrollySection.classList.toggle("is-on-media", isMedia);
    }

    // 记录当前场景的媒体元素，供连续视差使用
    const activeSceneEl = scenes[sceneIndex];
    activeMedia = activeSceneEl
      ? activeSceneEl.querySelector("img, video")
      : null;

    // 离开视频场景时彻底隐藏封面标题（防止锚点跳转后残留）
    if (coverText && sceneIndex !== 0) {
      coverText.style.opacity = "0";
      if (!prefersReducedMotion) coverText.style.filter = "blur(10px)";
    }

    // 底部图注：淡出 → 换字 → 淡入
    if (!bgCaption) return;
    const caption = scenes[sceneIndex]
      ? scenes[sceneIndex].dataset.caption || ""
      : "";

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
  const chapter2Index = steps.findIndex((s) => s.id === "chapter-2");
  const navChapterLinks = Array.from(
    document.querySelectorAll(".nav-chapters a"),
  );

  const markCurrentStep = (index) => {
    steps.forEach((step, i) => {
      step.classList.toggle("is-current", i === index);
      step.classList.toggle("is-passed", i < index);
    });

    const chapter = chapter2Index >= 0 && index >= chapter2Index ? 1 : 0;
    navChapterLinks.forEach((link, i) => {
      link.classList.toggle("is-active", i === chapter);
    });
  };

  // 初始化第一个场景与图注
  activateScene(0);

  // scrollama 初始化（本地 js/scrollama.min.js）
  if (typeof scrollama !== "undefined") {
    const scroller = scrollama();

    scroller
      .setup({
        step: ".step",
        offset: 0.55, // 步骤顶边越过视口 55% 高度处触发，文字更早进入焦点
        order: true, // 保证滚动方向变化时仍按文档顺序触发
        debug: false,
      })
      .onStepEnter(({ element, index }) => {
        // 步骤上标记的 data-scene 决定它对应哪张背景
        const sceneIndex = Number(element.dataset.scene || index);
        activateScene(sceneIndex);
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
