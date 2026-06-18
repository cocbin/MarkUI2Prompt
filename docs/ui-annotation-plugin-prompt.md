# 🧠 UI 标注 + LLM 分析 Chrome 插件（增强版开发总提示词）
项目名称： UI2Prompt
---

# 一、项目目标

开发一个 Chrome 插件，用于在任意网页中进行 UI 标注、问题记录、修复后验证，并将所有数据结构化，用于 LLM（Cursor / Claude Code）进行 UI 问题分析与开发协作。

插件不仅用于“发现问题”，还必须支持：

- 标注 UI 问题
- 记录问题状态（未修复 / 已修复待确认 / 已确认）
- 支持修复后回归验证
- 支持 DOM 变化后的降级定位
- 支持重新生成分析提示词

---

# 二、核心功能模块

---

## 1. UI 标注模式（Annotation Mode）

用户进入标注模式后：

- hover 元素高亮 DOM
- click 创建标注点
- 输入问题描述
- 页面显示 marker（标注点）

---

## 2. 标注数据结构（必须统一）

每个标注必须包含：

```json
{
  "id": "uuid",
  "url": "页面 URL",

  "selector": "CSS selector（优先稳定）",
  "xpath": "备用定位方式",

  "dom": {
    "outerHTML": "",
    "innerText": ""
  },

  "bbox": {
    "x": 0,
    "y": 0,
    "width": 0,
    "height": 0
  },

  "fallbackPosition": {
    "x": 0,
    "y": 0
  },

  "userNote": "用户描述的问题",

  "framework": {
    "type": "vue | react | unknown",
    "component": "Vue组件名（如可识别）",
    "vuePath": "组件层级路径"
  },

  "status": "open | fixed_pending | confirmed | rejected",

  "timestamp": 123456789
}
```

---

## 3. 可视化标注层（Overlay Layer）

必须支持：

- marker 固定在元素位置
- hover 显示 tooltip（用户描述）
- click 编辑标注
- 支持删除标注
- 不影响页面原有交互

---

## 4. 标注记忆系统（Persistence）

必须支持：

- 页面级存储（按 URL）
- 项目级管理
- 跨 session 恢复
- 多页面持续标注

建议结构：

- project
  - page(url)
    - annotations[]

存储方式：

- chrome.storage.local（基础）
- IndexedDB（推荐）

---

## 5. 标注状态系统（新增核心）

每个标注必须支持状态流转：

### 状态定义：

- `open`：未处理
- `fixed_pending`：已修复待确认
- `confirmed`：用户确认修复完成
- `rejected`：用户拒绝修复结果

---

## 6. 修复后验证模式（新增核心功能）

当页面 DOM 发生变化后：

### 6.1 定位策略（优先级）

重新定位 marker：

1. 优先使用 selector 重新查找
2. 如果失败：
   - 使用 XPath fallback
3. 如果仍失败：
   - 使用 fallbackPosition（x,y 坐标）
   - 显示为“降级定位 marker”

---

### 6.2 降级显示规则

如果元素无法定位：

- marker 显示在 fallbackPosition 坐标
- tooltip 显示：
  > “原始元素已无法定位（DOM 可能发生变化）”
- marker 标记为 degraded state

---

## 7. 确认模式（新增核心交互）

当标注处于 `fixed_pending` 状态时：

UI 必须提供两个按钮：

### ✔ 确认（Confirm）

行为：

- 标注状态 → `confirmed`
- 从“待处理列表”移除
- 保留历史记录

---

### ✖ 拒绝（Reject）

行为：

- 标注状态 → `rejected`
- 允许用户重新输入问题描述（可选）
- 可触发“重新生成分析提示词”流程
- 状态回到 `open`

---

## 8. 标注管理界面（Popup UI）

必须支持：

- 当前页面标注列表
- 状态筛选：
  - open
  - fixed_pending
  - confirmed
  - rejected
- 点击 marker 定位页面位置
- 编辑 / 删除标注
- 查看历史状态

---

## 9. Prompt 导出系统（用于 LLM）

必须支持导出：

- 页面 URL
- 所有标注数据
- DOM snapshot
- selector / XPath
- Vue 组件信息
- 状态信息（非常重要）

---

# 三、DOM / 定位系统要求

---

## 1. 稳定定位策略

必须支持：

- CSS selector（优先）
- XPath（备用）
- bbox fallback（最后手段）

---

## 2. DOM 变化兼容

当 DOM 变化时：

- 自动尝试重新绑定 marker
- 失败则降级为坐标定位
- 保留原始 annotation 数据不丢失

---

# 四、Vue / 框架增强能力

---

## 1. Vue 识别方式

优先级：

1. __VUE_DEVTOOLS_GLOBAL_HOOK__
2. __vueParentComponent
3. data-v-* attributes
4. heuristic fallback

---

## 2. 输出信息：

- component name
- component path
- vnode path（如果可得）

---

# 五、Overlay 系统要求

---

必须支持：

- 高性能渲染（requestAnimationFrame）
- scroll 同步更新
- resize 自适应
- marker 不阻塞页面
- 支持大量标注（>100）

---

# 六、非功能性要求

---

- 不能影响页面性能
- SPA 页面兼容（Vue / React）
- 标注状态必须持久化
- UI 必须可恢复（刷新不丢失）

---

# 七、系统最终目标

该插件最终应成为：

> 一个“浏览器 UI 标注 + 修复验证 + LLM 输入层”的完整闭环系统

具备能力：

- 标注问题
- 跟踪修复
- 验证结果
- 管理状态流转
- 提供 LLM 可用结构化数据

---

# END
