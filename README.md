# hxwl-09 洁净室异常归并台

把同一房间、同一设备、同一缺陷代码的重复上报归并为一个异常事件，待整改按事件计数，不再被重复单撑大。

## 技术栈

React + Vite + TypeScript + CSS（无额外依赖）

## 本地运行

```bash
npm install
npm run dev
```

开发端口：5109

## 归并规则

- 录入五项：房间、设备、缺陷代码、发生时刻、原始现象。
- 整改单关闭前，相同三项（房间 + 设备 + 缺陷代码）的上报归入同一事件，每次上报逐条保留，可展开查看。
- 事件关闭后再报同一代码 → 另开新事件；旧事件的关闭时间与整改期限冻结不动。
- 整改期限只在事件开立时生成：首例发生时刻 + 缺陷代码 SLA（见 `src/rules/catalog.ts`），续报不顺延。
- 待整改按事件计数，不按上报条数。

## 分层结构

```
src/
  rules/      资料规则层：纯逻辑，不碰 DOM 与存储
    types.ts      事件 / 上报 / 看板状态模型
    catalog.ts    缺陷代码字典与整改期限（SLA）
    normalize.ts  三项归并口径（去空白、统一大小写）
    engine.ts     归并引擎：续报归并、关单冻结、关后另开、计数口径
    seed.ts       首次打开的示例资料（经引擎生成）
  storage/    本机存储层
    local.ts      localStorage 读写，重开浏览器数据仍在
  ui/         页面层
    EntryForm.tsx   录入区（含归并预判提示）
    EventCard.tsx   事件卡（展开上报时间线、关单）
    format.ts       时间格式化
  App.tsx     编排：状态、落盘时机、筛选与统计
```

数据存于浏览器 localStorage（键 `hxwl09.mergeBoard.v1`），重开仍在；看板右上角可一键清空本机数据。
