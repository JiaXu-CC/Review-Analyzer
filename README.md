## Review-Analyzer（阶段一）

一个本地运行的评论分析 pipeline 骨架（TypeScript），当前阶段包含：

- **CSV ingest**：从 `data/raw/*.csv` 读取评论，生成 `review_id`
- **情感与主题分析**：支持 mock LLM 或真实 LLM（如 OpenAI），进行情感分析、片段切分、主题生成与 representative examples
- **feedback / rerun**：基于 JSON feedback 对主题集和片段归类做局部 rerun
- **session 持久化**：将一次分析的完整中间结果保存到 `data/sessions/<session_id>/`

### 1. 安装依赖

```bash
npm install
```

### 2. 选择 LLM（mock / real）

- **环境变量**
  - `LLM_PROVIDER`：
    - `"mock"`：使用内置 mock 逻辑（默认）
    - `"openai"`：使用 OpenAI 真实 LLM
  - `OPENAI_API_KEY`：当 `LLM_PROVIDER=openai` 时必填
  - `OPENAI_MODEL`（可选）：默认 `gpt-4.1-mini`

- **切换方式示例**

```bash
# 使用 mock（默认）
set LLM_PROVIDER=mock

# 使用 OpenAI（PowerShell 示例）
setx LLM_PROVIDER openai
setx OPENAI_API_KEY your_api_key_here
```

- 如果设置了 `LLM_PROVIDER=openai` 但缺少 `OPENAI_API_KEY` 或创建 client 失败：
  - 会自动回退到 mock LLM，并在控制台打印 warning。

### 3. 运行 pipeline

使用示例 CSV（`data/raw/sample_reviews.csv`）：

```bash
npm run run:pipeline
```

或指定 CSV 路径（相对或绝对路径均可）：

```bash
npm run run:pipeline -- data/raw/sample_reviews.csv
```

运行完成后，会在：

- `data/sessions/<session_id>/session.json`
- `data/sessions/<session_id>/reviews.json`
- `data/sessions/<session_id>/units.json`
- `data/sessions/<session_id>/themes.json`

中看到一次完整的 session 结果。

### 4. 应用 feedback 并触发局部 rerun

示例 feedback 位于：

- `data/feedback/sample_feedback.json`：简单 rename 示例
- `data/feedback/sample_feedback_merge_delete.json`：包含 rename + merge + delete + unit theme reassignment 的综合示例

（注意：其中的 `review_id` 是占位符，仅用于结构示例，实际使用时请替换成真实 ID）

首先记下上一阶段 pipeline 输出的 `session_id`，然后执行：

```bash
npm run apply:feedback -- <session_id> data/feedback/your_feedback.json
```

脚本会：

- 读取 `data/sessions/<session_id>/session.json`
- 解析 feedback JSON
- 根据规则进行 **theme rename / merge / delete / unit 重新归类** 等局部更新：
  - **rename**：只更新主题名称及对应 units 的 label，并对受影响主题做 summary rerun
  - **merge**：先将 `from[]` 映射到 `to`，再对受影响 units 做一次局部 reclassification（可调用 LLM），最后只对相关主题做 summary rerun
  - **delete**：对被删除主题下的 units 做局部 reclassification，优先归入已有主题，必要时才归到 `"other"`，然后对相关主题做 summary rerun
  - **unit theme reassignment**：按用户指定的 target_theme 更新 unit，再对相关主题做 summary rerun
- 对受影响主题做 **Level 1 summary rerun**（代表例更新），不会全量重跑主题
- 将更新后的结果覆盖写回同一目录下的 `session.json` / `reviews.json` / `units.json` / `themes.json`

### 4. 注意

- 所有模型调用都通过统一接口 `src/llm/client.ts`：
  - `src/llm/mock_llm.ts`：mock 实现
  - `src/llm/openai_client.ts`：OpenAI 实现
  - `src/llm/index.ts`：根据环境变量选择具体实现
- segmentation 现在支持一条评论拆出多个 units，并在代码层做 post-processing：
  - 只保留 positive / negative
  - 同一条评论里，同一主题的多个片段会在后处理阶段合并为一个 unit
  - mixed 评论可以包含正向和负向的多个 units（跨不同主题）
- merge / delete feedback 会触发局部 reclassification，而不是简单改名或全部丢进 `"other"`。
- 项目为纯本地文件读写，没有数据库、没有 Web UI，也没有部署逻辑。


