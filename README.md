# 拾光地图

一个适合部署到 GitHub Pages 的加密生活记录站点，支持时间线、年份/标签筛选、搜索和地图浏览。

## 本地预览

浏览器的 Web Crypto API 通常要求安全上下文，请通过本地服务器访问：

```powershell
node tools/serve.mjs 8080
```

打开 `http://localhost:8080`。仓库中的演示密码为 `demo-life-2026`，仅用于预览，正式使用前必须替换。

## 写入自己的内容

1. 将 `content.example.json` 复制为 `content.json`，按原有结构修改记录。
2. 原始图片放在 `photos/` 中，`src` 填写如 `photos/2026/hangzhou.jpg`。加密工具会把图片嵌入密文，`photos/` 已默认禁止提交。
3. 运行 `node tools/encrypt.mjs content.json vault.js`，设置一个强且独立的访问密码。
4. 本地确认可以解锁后提交 `vault.js`，不要提交 `content.json`。

每次更新内容时，重新执行第 3 步并提交新生成的 `vault.js`。

## 部署到 GitHub Pages

在 GitHub 新建公开仓库并推送这些文件，然后打开仓库的 `Settings > Pages`，选择 `Deploy from a branch`、`main` 和 `/ (root)`。数分钟后即可通过 Pages 地址访问。

## 安全边界

GitHub Pages 不能提供服务器端登录。本项目使用 PBKDF2 + AES-256-GCM 加密文字与本地图片，仓库中只保留密文；正确密码只在访客浏览器中用于解密。外链图片不受本项目加密保护，且站点访问流量等元数据仍可能公开。真正私密或敏感的信息应使用带服务端鉴权的托管方案。
