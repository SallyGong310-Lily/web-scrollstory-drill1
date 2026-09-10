document.addEventListener("DOMContentLoaded", () => {
  
  // 1. 获取 DOM 元素
  const coverText = document.getElementById('coverText');
  const ghostNav = document.getElementById('ghostNav');
  const coverSection = document.getElementById('cover');
  const coverVideo = document.querySelector('.cover-media video');
  
  // 获取封面的实际高度
  const coverHeight = coverSection.offsetHeight;

  const tryPlayVideo = () => {
    if (!coverVideo) return;

    coverVideo.muted = true;
    coverVideo.playsInline = true;
    coverVideo.loop = true;
    coverVideo.setAttribute('loop', 'loop');

    const playPromise = coverVideo.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {
        // 浏览器把自动播放视为“不允许”，等用户首次交互再恢复播放
        document.addEventListener('pointerdown', () => {
          coverVideo.muted = true;
          coverVideo.play().catch(() => {});
        }, { once: true });
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

  // 2. 滚动事件监听：控制视差淡出与导航栏显示
  window.addEventListener('scroll', () => {
    const scrollY = window.scrollY || window.pageYOffset;

    // A. 封面文字的缓动视差与淡出效果
    // 当向下滚动时，文字上移的速度比页面滚动慢（产生滞后漂浮感），同时透明度降低
    if (scrollY < coverHeight) {
      const fadeOutOpacity = 1 - (scrollY / (coverHeight * 0.6)); // 滚到 60% 处彻底透明
      const parallaxY = scrollY * 0.4; // 视差位移量
      
      coverText.style.opacity = Math.max(0, fadeOutOpacity);
      coverText.style.transform = `translate(-50%, calc(-50% + ${parallaxY}px))`;
    }

    // B. 幽灵导航栏的显隐
    // 当滚动超过封面高度的 80% 时，顶部导航栏滑入
    if (scrollY > coverHeight * 0.8) {
      ghostNav.classList.add('is-visible');
    } else {
      ghostNav.classList.remove('is-visible');
    }
  });

  // 3. 性能优化：自动暂停不在视口内的视频
  // 当开场视频滚出屏幕外时暂停播放，节省 CPU 资源
  if (coverVideo) {
    if ('IntersectionObserver' in window) {
      const videoObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            tryPlayVideo();
          } else {
            coverVideo.pause();
          }
        });
      });

      videoObserver.observe(coverSection);
    } else {
      tryPlayVideo();
    }

    coverVideo.addEventListener('loadeddata', tryPlayVideo);
  }
});