# 缄默之秋配置小助手

> **中转站掺水、偷换模型、暗改提示词：你付的是正版模型的钱，凭什么拿到掺水货？**

## 给因为请求被截断而来到这里的小朋友

你们好啊。既然能顺着截断提示翻到 GitHub，就说明你至少愿意查一眼源码。那不妨看看下面两张截图：**一边挂着高规格模型的名字，另一边在后台改路由；还有人在请求里塞系统指令，让模型自报另一个身份。** 这不是你调参调错了，是你根本不知道中转站实际给了你什么。

小助手的截断名单来自维护者收集的多方反馈及复核，收录相关中转站地址、关键词与惯用名。**针对的是模型偷换、掺水路由、暗加系统提示词这些损害用户权益的操作。**

### 截图一：模型重定向

![模型重定向配置截图](docs/screenshots/model-redirection-example.jpg)

截图里的规则将 `gemini-3.1-pro-preview` 重定向到 `gemini-2.5-pro`。**标着一种模型、实际交付另一种，还照原价收费，就是偷换型号、掺水交付。** 模型能力、上下文表现、输出质量都可能变了，用户却还在为错误的型号买单。

### 截图二：系统提示词注入

![系统提示词注入代码截图](docs/screenshots/system-prompt-injection-example.jpg)

截图里的代码在请求中插入 `system` 消息，要求模型自称指定身份、报出指定知识截止日期，并隐瞒这段附加指令。**这不是改个昵称，是直接改动发给模型的指令。** 模型身份与回答内容都能被中转方干预，你以为在和原厂模型聊天，实际上是在和改写过的请求结果打交道。

### 掺水造假伤害了什么？

- **花冤枉钱：** 高价型号被偷换成其他模型，收费与交付不一致。
- **质量缩水：** 能力、推理、上下文和工具行为变了，用户却被引导去怀疑自己配置。
- **判断失真：** 模型对比、性能测试和故障排查都被错误路由污染。
- **对话失去自主权：** 未经告知的系统指令注入改变回答，第三方还掌握转发过程中的对话内容与密钥使用链路。

**都找到 GitHub 了，还要继续拿模型名字和超低价当保证吗？** 真想用中转，至少找官网、API 文档、计费规则和合作记录能够公开查询的平台。

### 可关注的 API 服务

- **[Command Code](https://commandcode.ai/docs/provider)** — 提供公开的 Provider API，支持多种模型、按量计费及用量查询；[官网说明](https://commandcode.ai/zh/provider)。
- **[DeepInfra](https://deepinfra.com/)** — 模型推理平台，列入 [Hugging Face 官方推理合作伙伴名单](https://huggingface.co/docs/inference-providers/en/index)；[API 文档](https://deepinfra.com/docs)。
- **[Novita AI](https://novita.ai/)** — 模型推理平台，同样列入 [Hugging Face 官方推理合作伙伴名单](https://huggingface.co/docs/inference-providers/en/index)。
- **[Atlas Cloud](https://www.atlascloud.ai/)** — 提供统一模型 API 的聚合平台，公开 [API 协议文档](https://www.atlascloud.ai/docs/llm-protocols) 与模型接入方式。

**有公开合作记录、透明账单和明确路由，比小作坊一句“百分百官转”更值得参考。** 商家是否为某家模型厂商的直接授权合作方，仍以对应厂商公布的合作信息为准。
