# 🎲 Party Games

Browser-based multiplayer party games over MQTT. No downloads, no accounts, no self-hosted backend.

[中文文档](#中文文档)

## Features

- **Pure client-side** — static SPA, deployable to Vercel / Netlify / any file host
- **MQTT networking** — mqtt.js over WebSocket via a public broker, zero self-managed infrastructure
- **Room-based** — 6-character room codes, host-authoritative state
- **i18n** — English (`/en/`) and Chinese (`/zh/`) with path-based routing
- **SEO** — per-language meta tags, Open Graph, hreflang alternates, JSON-LD, per-game info pages
- **Player profiles** — nickname + avatar stored in localStorage, forced setup for new players

## Games

### 🐺 Word Werewolf

A social deduction game with a twist of words.

1. The host creates a room from the game page and shares the room code.
2. The host sets the number of Town and Mafia players, then starts the game.
3. Each player secretly submits a word. All of the mafia's words are revealed.
4. **Day** — all players discuss and vote to eliminate a suspected mafia member.
5. **Night** — mafia members secretly vote to eliminate a town player.
6. Town wins if all mafia are eliminated. Mafia wins if they equal or outnumber town.

**Tie-break rules:**

| Situation | Result |
|-----------|--------|
| Day vote tie | No elimination that round |
| Mafia night vote tie | Random target among top-voted |

## Tech Stack

| Layer | Choice |
|-------|--------|
| Build | Vite 8 + React 19 + TypeScript |
| Routing | react-router-dom (SPA, query-param rooms) |
| i18n | i18next + react-i18next |
| SEO | react-helmet-async |
| Networking | mqtt.js (MQTT over WebSocket, public broker) |
| Lint | oxlint |

## URL Structure

| Page | URL |
|------|-----|
| Home | `/en/` or `/zh/` |
| Game info (SEO) | `/en/games/werewolf` |
| Create room | `/en/?room=ABC123&host=1` |
| Join room | `/en/?room=ABC123` |

## Development

```bash
npm install
npm run dev       # dev server
npm run build     # production build (tsc + vite)
npm run lint      # oxlint
npm run preview   # preview production build
```

## Deployment

The build output in `dist/` is a static SPA (~213 KB gzip). Deploy to Vercel, Netlify, or any static file host — no server-side routing or fallback rules required (game messages flow through a public MQTT broker).

## Project Structure

```
src/
├── i18n/                  # en.json, zh.json, i18next config
├── lib/
│   ├── protocol.ts        # message types, room code generation
│   └── room.ts            # Room class (MQTT pub/sub, host authority, join/leave)
├── store/
│   └── player.ts          # localStorage profile (nickname, avatar compression)
├── components/            # Avatar, Seo (helmet), LanguageSwitcher
├── pages/
│   ├── HomePage.tsx       # profile + join room + game list
│   ├── GameInfoPage.tsx   # per-game SEO info page
│   ├── RoomPage.tsx       # room connection + game routing
│   └── ProfileSetup.tsx   # forced profile setup modal
├── games/werewolf/
│   ├── types.ts           # game state types
│   ├── logic.ts           # rules engine (roles, voting, win conditions)
│   ├── WerewolfGame.tsx   # host-authoritative state machine
│   └── phases/            # Lobby, Word, Vote, Result, GameOver
└── styles/global.css      # dark theme
```

## Known Limitations

- **Public broker dependency** — messaging relies on a public MQTT broker (default `broker.emqx.io`); if it's unreachable, players can't connect. Override via the `?mqtt=` URL param or localStorage `party-games:mqtt`
- **Roles are not private** — role assignments are broadcast through the public broker (filtered client-side), not end-to-end encrypted
- **Host is single point of failure** — if the host disconnects, the game ends

---

<a id="中文文档"></a>

# 🎲 派对游戏

基于 MQTT 的浏览器多人派对游戏。无需下载、无需注册、无需自建后端。

## 特性

- **纯客户端** — 静态 SPA，可部署到 Vercel / Netlify / 任何文件托管
- **MQTT 通信** — mqtt.js over WebSocket，接入公共 broker，零自建基础设施
- **房间制** — 6 位房间号，房主权威状态模型
- **国际化** — 英文（`/en/`）和中文（`/zh/`），路径前缀路由
- **SEO 优化** — 多语言 meta 标签、Open Graph、hreflang、JSON-LD、游戏专属简介页
- **玩家档案** — 昵称 + 头像存于 localStorage，新玩家强制设置

## 游戏

### 🐺 自定义词狼人杀

带有词语元素的社交推理游戏。

1. 房主从游戏页面创建房间，将房间号分享给朋友。
2. 房主设置村民和狼人的人数，然后开始游戏。
3. 每位玩家秘密提交一个词，系统公布所有狼人的词。
4. **白天** — 所有玩家讨论并投票淘汰疑似狼人的玩家。
5. **夜晚** — 狼人秘密投票淘汰一名村民。
6. 狼人全部被淘汰则村民胜利；狼人数等于或多于村民则狼人胜利。

**平票规则：**

| 情况 | 结果 |
|------|------|
| 白天投票平票 | 本轮无人被淘汰 |
| 狼人夜晚投票平票 | 从最高票中随机选择一个目标 |

## 技术栈

| 层面 | 选型 |
|------|------|
| 构建 | Vite 8 + React 19 + TypeScript |
| 路由 | react-router-dom（SPA，query 参数房间） |
| 国际化 | i18next + react-i18next |
| SEO | react-helmet-async |
| 网络 | mqtt.js（MQTT over WebSocket，公共 broker） |
| 检查 | oxlint |

## URL 结构

| 页面 | URL |
|------|-----|
| 主页 | `/en/` 或 `/zh/` |
| 游戏简介（SEO） | `/zh/games/werewolf` |
| 创建房间 | `/zh/?room=ABC123&host=1` |
| 加入房间 | `/zh/?room=ABC123` |

## 开发

```bash
npm install
npm run dev       # 开发服务器
npm run build     # 生产构建（tsc + vite）
npm run lint      # oxlint 检查
npm run preview   # 预览生产构建
```

## 部署

`dist/` 目录是纯静态 SPA（gzip 约 213 KB），可直接部署到 Vercel、Netlify 或任何静态文件托管。无需服务端路由或 fallback 规则（游戏消息经公共 MQTT broker 中转）。

## 已知限制

- **依赖公共 broker** — 消息经公共 MQTT broker（默认 `broker.emqx.io`）中转，若不可达则无法连接。可用 `?mqtt=` URL 参数或 localStorage `party-games:mqtt` 覆盖
- **角色非私密** — 角色分配经公共 broker 广播（客户端过滤），非端到端加密
- **房主为单点** — 房主断开连接则游戏结束
