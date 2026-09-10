document.addEventListener("DOMContentLoaded", () => {
  
  // 1. 获取 DOM 元素
  const heroText = document.getElementById('heroText');
  const ghostNav = document.getElementById('ghostNav');
  const heroSection = document.getElementById('hero');
  const heroVideo = document.querySelector('.hero-media video');
  
  // 获取封面的实际高度
  const heroHeight = heroSection.offsetHeight;

  const tryPlayVideo = () => {
    if (!heroVideo) return;

    heroVideo.muted = true;
    heroVideo.playsInline = true;

    const playPromise = heroVideo.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {
        // 浏览器把自动播放视为“不允许”，等用户首次交互再恢复播放
        document.addEventListener('pointerdown', () => {
          heroVideo.muted = true;
          heroVideo.play().catch(() => {});
        }, { once: true });
      });
    }
  };

  // 2. 滚动事件监听：控制视差淡出与导航栏显示
  window.addEventListener('scroll', () => {
    const scrollY = window.scrollY || window.pageYOffset;

    // A. 封面文字的缓动视差与淡出效果
    // 当向下滚动时，文字上移的速度比页面滚动慢（产生滞后漂浮感），同时透明度降低
    if (scrollY < heroHeight) {
      const fadeOutOpacity = 1 - (scrollY / (heroHeight * 0.6)); // 滚到 60% 处彻底透明
      const parallaxY = scrollY * 0.4; // 视差位移量
      
      heroText.style.opacity = Math.max(0, fadeOutOpacity);
      heroText.style.transform = `translate(-50%, calc(-50% + ${parallaxY}px))`;
    }

    // B. 幽灵导航栏的显隐
    // 当滚动超过封面高度的 80% 时，顶部导航栏滑入
    if (scrollY > heroHeight * 0.8) {
      ghostNav.classList.add('is-visible');
    } else {
      ghostNav.classList.remove('is-visible');
    }
  });

  // 3. 性能优化：自动暂停不在视口内的视频
  // 当开场视频滚出屏幕外时暂停播放，节省 CPU 资源
  if (heroVideo) {
    if ('IntersectionObserver' in window) {
      const videoObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            tryPlayVideo();
          } else {
            heroVideo.pause();
          }
        });
      });

      videoObserver.observe(heroSection);
    } else {
      tryPlayVideo();
    }

    heroVideo.addEventListener('loadeddata', tryPlayVideo);
  }
});