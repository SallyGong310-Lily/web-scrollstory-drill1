# 内容驱动滚动叙事模板

这是一个保留原有视觉和 Scrollama 交互的 scrollytelling 模板。页面结构只提供挂载点，故事内容与媒体路径集中在 [`js/story-config.js`](js/story-config.js)。

如果希望让 AI 按照这套模板先进行需求访谈和页面规划，可使用项目内的 [`scrollstorytelling-template Skill`](.github/skills/scrollstorytelling-template/SKILL.md)。它会在 plan 模式下先询问故事目标、章节结构、素材、视觉风格、交互和发布约束，再输出实现方案。

## 替换故事

1. 修改 `title`、`subtitle`、`byline` 和 `chapters`。章节的 `id` 必须与对应步骤的 `id` 相同；章节数量不受限制。
2. 在 `scenes` 中替换图片或视频的 `src`、`alt`、`poster` 和 `caption`。`id` 是步骤引用的场景标识，可以使用字符串，不要求连续编号；`snow: true` 会启用飘雪效果。可选的 `coverScene` 用于指定首屏场景，默认使用第一个场景。
3. 按顺序编辑 `steps`。每步都需要 `scene`，并支持以下类型：
   - `prose`：`kicker`、`title`、`paragraphs`、可选 `dropCap` / `final`
   - `quote`：`text`
   - `split`：`media`（`src`、`alt`、`caption`）和 `paragraphs`
   - `gallery`：`title` 和 `images` 数组（每项为 `src`、`alt`、可选 `mobileSrc` / `caption`）
   - `timeline`：`title` 和 `events` 数组（`date`、`title`、`text`）
   - `data`：`title`、`headers` 和二维 `rows` 数组，适合小型数据表
   - `media`：只切换背景，不渲染文字卡片

文本字段会自动转义；媒体文件可直接放入 `assets/`，然后填写相对路径。场景或步骤媒体设置 `mobileSrc` 后，会通过 `<picture>/<source media>` 或 `<video><source media>` 在窄屏选择移动端资源。媒体加载失败会显示可访问的占位提示。

可选的 `theme` 使用 `accent`、`text`、`background`、`font`、`uiFont` 和 `overlayStrength`，会映射到 CSS 变量。章节导航会根据现有章节自动生成高亮和步骤进度。

### 外部 JSON / CMS

默认读取 `js/story-config.js` 的 `window.STORY_CONFIG`。发布时可把 JSON 地址写到 app 脚本的 `data-config-src`，或用 `?config=https://example.test/story.json` 覆盖：

```html
<script src="js/app.js" data-config-src="data/story.json" defer></script>
```

外部 JSON 会与静态配置合并；网络错误、非 2xx 响应或无效响应时自动保留静态 fallback，因此离线打开仍可阅读。跨域 CMS 需要允许 CORS。

### 迁移说明

旧配置无需修改：`scenes` 的 `src`、`steps` 的 `prose` / `quote` / `split` / `media` 字段保持兼容。逐步添加 `theme`、`mobileSrc` 或新步骤类型即可；未知步骤仍按 `prose` 的文本字段渲染。`id` 仍是章节锚点，章节 `id` 必须匹配步骤 `id`。

## 本地检查

使用浏览器打开 `index.html` 即可预览。若已安装 `html-validate`，运行：

```sh
html-validate index.html
```
