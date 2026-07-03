# Bilibili 字幕抽取器 📺✨

> 🎵 一个个人 vibe 驱动的浏览器小插件，帮你一键提取 B 站视频的 CC 字幕，并整理成干净、可复制的文本。

## 🌟 特性 (Features)

- **一键提取**：在任意 Bilibili 视频播放页，点击插件图标即可拉取视频自带的 CC 字幕（闭路字幕）。
- **极简纯粹**：没有繁琐的设置，点击即刻解析，支持多语言字幕轨道。
- **方便复制**：自动整理成结构化文本，方便直接粘贴到笔记软件、翻译工具或者做二创使用。
- **隐私友好**：纯本地获取 B 站公开 API，没有第三方服务器中转。

## 🚀 安装指南 (Installation)

由于是个人小工具，可以十分简单地通过**开发者模式**手动加载：

1. `git clone https://github.com/FinnKyo/Bilibili-Subtitle-Extractor.git` （或者直接下载 ZIP 包并解压）。
2. 打开 Chrome / Edge 等 Chromium 内核浏览器，地址栏输入并访问扩展程序页面（例如：`chrome://extensions/`）。
3. 开启右上角的 **“开发者模式” (Developer mode)**。
4. 点击左上角的 **“加载已解压的扩展程序” (Load unpacked)**。
5. 选择你刚刚克隆或解压的 `Bilibili-Subtitle-Extractor` 文件夹。
6. 🎉 大功告成！你可以把它固定在浏览器的工具栏上，方便随时调用。

## 💡 随手一用 (Usage)

1. 打开一个带有 CC 字幕的 B 站视频（如果视频本身没有外挂/CC字幕是提取不到的哦）。
2. 点开右上角的插件图标。
3. 稍等片刻，它会自动拉取当前的视频信息和字幕轨道。
4. 愉快地复制你想要的字幕！

## 🛠 随性的技术栈 (Tech Stack)

- Chrome Extension Manifest V3
- Vanilla JS (没加框架，原生更轻量)
- HTML5 / CSS3

## 📝 License

MIT License. Just for fun!
