# 商业化房卡系统后端算法与权威事务引擎重构方案

本方案将房卡约局系统的核心账务、局数生命周期与战报核验从前端轻量状态升级为**服务端权威（Server-Authoritative）商业化算法体系**，实现两阶段预冻结托管账务（Freeze-Capture-Release）、并列大赢家顺位裁决、五游零和积分守恒校验、断线保位重连及 HMAC-SHA256 防伪签名战报。

## User Review & Critical Decisions

> [!IMPORTANT]
> 以下核心架构与商业化算法规则已根据您的确认锁定，确认执行后将立即推进服务端与客户端全链路接入：

- **两阶段账务事务模型（Pre-Auth Escrow）**：采用**服务端预冻结托管 → 首局开牌正式划扣（Capture）→ 未开局解散/超时自动解冻退回（Release）**的商业账务状态机，杜绝逃单、重复扣卡与异常掉线吞卡。
- **大赢家扣卡与中途结算裁决算法**：
  - **并列最高分裁决**：当多名玩家在终局并列最高正分时，按**单局最高爆发分 → 胜局数 → 入座顺位（Seat Order）**确定唯一扣卡大赢家。
  - **中途提前解散结算**：只要已完成至少 1 局（`completedRounds >= 1`），中途解散立即进入大结算，按当前已完成局数的累计积分裁决大赢家并执行扣卡；若首局尚未结束（`completedRounds === 0`），则全额解冻退回所有预冻结房卡。
- **全链路服务端权威与防作弊核验**：每局结算强制执行**零和积分守恒算法（$\sum \Delta_i = 0$）**，支持玩家断线期间保留包间座位与累计战绩，并在终局由服务端签发 **HMAC-SHA256 防伪战报核验码**。

---

## 1. Overview & Core Concept

- **What It Does**：构建一套工业级棋牌包间后端算法引擎，统一接管斗地主、普洱麻将、抢庄牛牛、经典金花、云南捞腌菜五款游戏的房卡冻结、正式划扣、局数推进、零和校验、断线保位与防伪战报签发。
- **Target Audience / Persona**：对账务准确性、断线重连稳定性与战报公信力有严苛要求的商业化熟人约局玩家与俱乐部房主。
- **Key Value**：消除纯客户端记账带来的数据篡改与刷新丢失风险，确保每一张房卡的冻结、划扣、退还均有服务端原子流水与密码学核验支撑。

---

## 2. User Experience & Visual Design

- **Key User Flows**：
  1. **建房与入座预检**：房主创建包间或玩家通过 6 位房号加入时，服务端实时校验可用房卡余额（`可用余额 = 总房卡 - 冻结房卡`），通过后执行预冻结并下发权威包间快照。
  2. **首局开牌正式划扣**：当第 1 局发牌/结算触发时，服务端自动将预冻结房卡转为正式划扣（大赢家模式除外，锁定大赢家待扣额度）；若首局未开即解散，服务端立即解冻并原路退回房卡。
  3. **局内权威进度与断线恢复**：牌桌顶部极简状态条实时展示服务端同步的房号、计费状态（如 `已托管冻结` / `已正式扣卡` / `终局大赢家待扣`）与局数进度；玩家刷新或断线重连后自动恢复原座位与累计积分。
  4. **防伪签名战报海报**：终局结算面板与导出海报底部展示服务端生成的 HMAC-SHA256 防伪核验签名、精确扣费流水号与零和校验状态标识。
- **Visual Identity & Theme**：
  - *Aesthetic Direction*：延续极简、高对比度浅色商业设计语言（Light High-Contrast Commercial UI），零装饰噪音、零 Emoji、零胶囊堆砌。
  - *Color Palette & Mood*：60% 纯白与浅灰结构画布（`#FFFFFF` / `#F8FAFC`），30% 深岩灰高对比度正文与边框（`#0F172A` / `#E2E8F0`），10% 琥珀金焦点强调色（`#F59E0B`）。
  - *Typography & Hierarchy*：标题与正文采用清晰的无衬线字重层级，所有房号、房卡余额、局数、积分矩阵与防伪签名统一采用等宽对齐数字（`font-mono tabular-nums`）。
  - *Component Styling & Layout*：保持扁平自适应网格布局与单层卡片海拔，顶部牌桌状态栏严格控制在单行以内，所有弹窗仅通过右上角关闭按钮关闭。
- **Interactive Feedback & Motion**：建房、入房、退卡、结算通知均由服务端事件驱动，配合 `<= 200ms` 的轻量过渡反馈。

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1：两阶段预冻结托管（Freeze-Capture-Release）替代直接扣减**
  - *Chosen Approach*：为用户账户引入 `frozenRoomCards`（冻结中房卡）字段，建房/入座时仅冻结额度，第 1 局产生有效牌局或结算时再执行 `Capture` 正式扣减，未开局解散或房间闲置超时回收时自动执行 `Release` 解冻。
  - *Why*：在 AA 平摊与房主支付模式下，若玩家入座后其他人未齐或临时解散，预冻结机制可保证资金 100% 原子退回，且防止同一玩家利用并发请求创建多个房间透支房卡。
  - *Alternatives Considered*：入座即实扣再走退款补偿容易在服务重启或超时清理时遗漏退卡。
- **Decision 2：大赢家模式（Winner Pay）准入校验与顺位裁决算法**
  - *Chosen Approach*：大赢家模式下，建房与入座均需校验玩家可用房卡 $\ge$ 本场应收房卡数（锁定准入资格），终局时按 `总净胜分 -> 单局最高分 -> 胜局数 -> 座位号顺位` 唯一锁定大赢家执行扣卡；若全场均为 0 分平局，则回退由房主承担。
  - *Why*：既避免了无卡玩家恶意蹭局导致终局无法扣卡（防止“白嫖逃单”），又解决了多人并列最高分时的扣费争议。
- **Decision 3：五游零和积分守恒正规化算法（Zero-Sum Normalization）**
  - *Chosen Approach*：服务端在记录每一局战果时，强制校验所有座位得分之和 $\sum_{i=1}^{N} \Delta_i = 0$；若客户端或单局快照仅上报主角分差或存在舍入误差，服务端按对手座位权重与最大余数法（Largest Remainder Method）自动配平零和矩阵。
  - *Why*：保证终局战报榜所有玩家总分相加严格等于 0，符合商业级约局记账铁律。

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

### Architecture & Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Client Layer (React SPA)                         │
│                                                                         │
│  ┌──────────────────────┐  ┌──────────────────────┐  ┌───────────────┐  │
│  │   FriendRoomModal    │  │ SharedTableHudOverlay│  │ GrandSettle   │  │
│  │ (Create / 6-Digit KP)│  │ (Live Round & Escrow)│  │ Poster Canvas │  │
│  └──────────┬───────────┘  └──────────┬───────────┘  └───────▲───────┘  │
│             │                         │                      │          │
│             ▼                         ▼                      │          │
│  ┌───────────────────────────────────────────────────────────┴───────┐  │
│  │          RoomCardSessionHub (Client Sync & Optimistic Cache)       │  │
│  └────────────────────────────────────┬──────────────────────────────┘  │
└───────────────────────────────────────┼─────────────────────────────────┘
                                        │ Socket.IO & REST (/api/room-card/*)
┌───────────────────────────────────────▼─────────────────────────────────┐
│                   Server Layer (Express + Socket.IO)                    │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │             RoomCardEngine (Commercial Algorithm Core)            │  │
│  │  • Two-Phase Escrow (Freeze / Capture / Release)                  │  │
│  │  • Winner-Pay Tie-Breaker (NetScore > MaxSingle > Wins > Seat)    │  │
│  │  • Zero-Sum Score Matrix Normalizer (Largest Remainder Method)    │  │
│  │  • HMAC-SHA256 Scorecard Signer & Verification Digest             │  │
│  └──────────────┬─────────────────────────────────────┬──────────────┘  │
│                 │                                     │                 │
│                 ▼                                     ▼                 │
│  ┌──────────────────────────────┐      ┌─────────────────────────────┐  │
│  │         RoomManager          │      │       StorageService        │  │
│  │  • Seat Preservation on Drop │      │  • Atomic Balance & Escrow  │  │
│  │  • Stale Room Escrow Release │      │  • Double-Entry Card Ledger │  │
│  └──────────────────────────────┘      └─────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

### Data Model & State

1. **账户房卡托管模型（`UserProfile` 扩展）**：
   - `roomCards`: 账户可用房卡余额。
   - `frozenRoomCards`: 当前处于包间预冻结托管状态的房卡数量。
   - 账务流水分数类型扩展：`ROOM_ESCROW_FREEZE`（预冻结）、`ROOM_ESCROW_RELEASE`（未开局解冻退回）、`ROOM_ESCROW_CAPTURE`（开局正式划扣）、`ROOM_WINNER_SETTLE`（终局大赢家扣卡）。
2. **服务端权威房卡会话模型（`ServerRoomCardSession`）**：
   - **包间配置**：6 位唯一房号 `roomId`、游戏类型 `gameType`、子玩法 `subMode`、底分 `baseScore`、总局数 `totalRounds`（4/8/16）、计费模式 `payMode`（`host` / `aa` / `winner`）。
   - **托管账本映射（`escrowMap`）**：记录每位入座玩家的预冻结房卡数、托管状态（`FROZEN` | `CAPTURED` | `RELEASED`）与准入校验标记。
   - **对局状态机**：`WAITING_FIRST_ROUND`（等待首局，允许无损解冻退卡） $\rightarrow$ `LOCKED_IN_PROGRESS`（首局已开，房卡锁定/划扣，断线保留座位） $\rightarrow$ `GRAND_SETTLED`（终局或中途提前结算完成，生成防伪签名战报） | `DISBANDED_REFUNDED`（未开局解散并全额解冻）。
   - **防伪核验数据（`verification`）**：包含服务端签发时间戳 `issuedAt`、零和校验结果 `zeroSumVerified: true` 以及 16 位大写 HMAC-SHA256 战报防伪码 `signature`。

### Interactive Component & State Mapping

- **创建包间（`c2s_create_room` / `c2s_rc_create`）**：
  - 服务端计算应收房卡 `cost = calculateRoomCardCost(totalRounds, payMode)`。
  - 若为 `host` 或 `aa`，原子冻结房主对应房卡（`roomCards -= cost`, `frozenRoomCards += cost`）；若为 `winner`，校验房主 `roomCards >= cost` 后登记准入锁。
  - 下发 `s2c_rc_session_sync` 权威包间状态与更新后的个人资料。
- **6位密码入房（`c2s_join_room` / `c2s_rc_join`）**：
  - 若包间处于 `LOCKED_IN_PROGRESS` 且该玩家已在包间名单中，触发**断线保位重连**，直接恢复其座位与历史积分。
  - 若包间处于 `WAITING_FIRST_ROUND` 且为新玩家加入：`aa` 模式下自动预冻结该玩家应付份额；`winner` 模式下校验其房卡余额是否充足。
- **单局结算与零和配平（`c2s_rc_record_round` & 服务端房间结算钩子）**：
  - 首局结算触发时，自动将所有 `FROZEN` 托管记录转为 `CAPTURED` 正式划扣。
  - 执行**最大余数零和配平算法**，确保本局各座位分差总和严格为 `0`，累加每位玩家的胜负场次、最高单局分与累计净分。
  - 若到达 `totalRounds` 封顶局数，自动执行终局裁决与 HMAC-SHA256 战报签名，广播 `s2c_rc_session_sync`。
- **提前解散与超时回收（`c2s_rc_disband_or_settle` & `RoomManager.cleanupStaleRooms`）**：
  - 若 `roundHistory.length === 0`，服务端调用 `releaseAllEscrow(roomId)`，将冻结房卡全额退回可用余额，并广播退卡通知。
  - 若 `roundHistory.length > 0`，服务端立即按已完成局数锁定大赢家（`winner` 模式下按 `totalDelta DESC -> bestSingleRound DESC -> winCount DESC -> seatIndex ASC` 裁决扣卡），生成带防伪签名的终局战报。
