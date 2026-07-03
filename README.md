# Bilibili 字幕抽取器

一个轻量级的 Chrome 浏览器扩展，用于一键提取 B 站视频自带的 CC 字幕，并整理成可直接复制的结构化纯文本。

## 特性

- 一键提取当前播放视频的 CC 字幕（支持多语言轨道）
- 自动格式化时间轴和字幕文本，方便复制
- 极简 UI，纯本地解析 Bilibili 官方接口，无第三方服务器介入

## 安装说明

由于暂未上架扩展商店，请通过开发者模式手动加载：

1. 克隆或下载本项目到本地：
   `git clone https://github.com/FinnKyo/Bilibili-Subtitle-Extractor.git`
2. 打开 Chromium 内核浏览器（如 Chrome 或 Edge），访问扩展程序页面：`chrome://extensions/`
3. 开启页面上的“开发者模式”。
4. 点击“加载已解压的扩展程序”。
5. 选择本项目的文件夹，完成安装。

## 使用方法

1. 打开任意带有 CC 字幕的 Bilibili 视频页面。
2. 点击浏览器右上角的扩展程序图标。
3. 扩展会自动读取当前视频的信息并展示可用的字幕。
4. 复制所需的字幕内容即可。

## 技术栈

- Chrome Extension Manifest V3
- Vanilla JS, HTML5, CSS3

## License

MIT
