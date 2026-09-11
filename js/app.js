document.addEventListener("DOMContentLoaded", () => {
  
  // 1. 获取 DOM 元素
  const coverText = document.getElementById('coverText');
  const ghostNav = document.getElementById('ghostNav');
  const coverSection = document.getElementById('cover');
  const coverVideo = document.querySelector('.cover-media video');
  
  // 获取封面的实际高度
  let coverHeight = coverSection.offsetHeight;
  let hasPlaybackFallback = false;

  const tryPlayVideo = () => {
    if (!coverVideo) return;

    coverVideo.muted = true;
    coverVideo.playsInline = true;
    coverVideo.loop = true;
    coverVideo.setAttribute('loop', 'loop');

    const playPromise = coverVideo.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {
        if (hasPlaybackFallback) return;

        // 浏览器把自动播放视为“不允许”，等用户首次交互再恢复播放
        hasPlaybackFallback = true;
        const resumeVideo = () => {
          coverVideo.muted = true;
          coverVideo.play().catch(() => {});
        };

        document.addEventListener('pointerdown', resumeVideo, { once: true, passive: true });
        document.addEventListener('touchstart', resumeVideo, { once: true, passive: true });
      });
    }
  };

  if (coverVideo) {
    coverVideo.loop = true;
    coverVideo.addEventListener('ended', () => {
      coverVideo.currentTime = 0;
      coverVideo.play().catch(() => {});
    });
  }

  window.addEventListener('resize', () => {
    coverHeight = coverSection.offsetHeight;
  }, { passive: true });

  // 2. 滚动事件监听：用 rAF 将视觉更新同步到浏览器渲染帧
  let isTicking = false;

  window.addEventListener('scroll', () => {
    if (isTicking) return;

    isTicking = true;
    window.requestAnimationFrame(() => {
      const scrollY = window.scrollY || window.pageYOffset;

      if (scrollY < coverHeight) {
        const fadeOutOpacity = 1 - (scrollY / (coverHeight * 0.6));
        const parallaxY = scrollY * 0.4;

        coverText.style.opacity = Math.max(0, fadeOutOpacity).toFixed(3);
        coverText.style.transform = `translate(-50%, calc(-50% + ${parallaxY}px))`;
      }

      if (scrollY > coverHeight * 0.8) {
        ghostNav.classList.add('is-visible');
      } else {
        ghostNav.classList.remove('is-visible');
      }

      isTicking = false;
    });
  }, { passive: true });

  // 3. 性能优化：自动暂停不在视口内的视频
  // 当开场视频滚出屏幕外时暂停播放，节省 CPU 资源
  if (coverVideo) {
    if ('IntersectionObserver' in window) {
      const videoObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            tryPlayVideo();
          }
        });
      });

      videoObserver.observe(coverSection);
    } else {
      tryPlayVideo();
    }

    coverVideo.addEventListener('loadeddata', tryPlayVideo);
    coverVideo.addEventListener('canplay', tryPlayVideo);

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) tryPlayVideo();
    });

    window.addEventListener('pageshow', tryPlayVideo);
  }
});