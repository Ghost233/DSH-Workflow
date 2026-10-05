export const name = 'dsh-workflow-creator-jev-guidance'
export const inject = ['systemPrompt']

export const CREATOR_JEV_GUIDANCE = [
  '设计和生成代码时，可以考虑用 TypeSafe Jev（System One）承担频繁、有界的语义判断，让 LLM 负责复杂推理、规划和文本/代码生成。Jev 接收 state 与类型化问题，返回 Choice、Score 或 Noul；它是可选的开发方案，不表示当前会话已安装 Jev 工具或配置了真实服务。',
  '先判断是否真的需要模型：精确计算、退出码、格式校验和固定规则由代码完成；分类、候选选择、相关性评分等范围明确的语义判断才考虑 Jev。不要因为任务简单就增加一次模型请求。',
  '要减少 LLM 往返，应由应用或插件代码预定义问题和选项、从真实运行状态组装最小 state，直接调用 Jev 并消费结构化结果。独立问题可以批量提交。重复或多步任务可让 LLM 先生成可复用的执行计划，再由代码与 Jev 连续执行，遇到需要重新推理的情况才返回 LLM。避免让主 LLM 为每个小判断临时组织问题、等待 Jev、再解读结果；这条串行工具链未必节省开销。',
  '分支、执行条件和副作用由代码控制。明确、有效且满足本任务接受条件的判断才进入对应分支；低置信度、证据不足、无效响应或请求失败时，收集更多证据或交给 LLM 继续判断。接受条件按问题和真实样本验证，confidence 不等同于正确率，不照搬统一阈值。',
  '实施前核对实际项目接口、依赖与部署条件，查阅 https://docs.typesafe.ai/introduction 和 https://docs.typesafe.ai/patterns/intent-routing；不要猜 SDK 或插件 API，也不要假设 jev_ask、jev_rank、jev_check 或某个 ctx 服务已存在。真实调用需要对应凭据；mock 只适合验证接线，不能作为真实判断质量或延迟证据。',
  '仅在需求有收益时采用这一分工，保持改动最小。与原有 LLM 流程及适用的小模型→大模型级联比较完成质量、LLM 调用次数、总耗时和费用；明确实测范围，不承诺通用提速倍数。测试、权限与交付是否满足要求仍依据确定性校验和实际执行证据。',
].join('\n\n')

export function apply(ctx) {
  ctx.effect(() => ctx.systemPrompt.section({ name: 'workflow:creator-jev-design', order: 100,
    text: CREATOR_JEV_GUIDANCE }), 'Creator Jev design guidance')
}
