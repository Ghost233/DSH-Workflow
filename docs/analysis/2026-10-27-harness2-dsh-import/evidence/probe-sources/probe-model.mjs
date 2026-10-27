import { LlmAdapter } from '@deepseek-ai/dsh-llm';
import { writeFile, appendFile } from 'node:fs/promises';
import { join } from 'node:path';

export const name = 'harness2-import-probe';
export const inject = ['llm', 'agentPresets'];

export function apply(ctx, config) {
  const calls = new Map();
  const save = value => appendFile(config.trace, JSON.stringify(value) + '\n');
  class Adapter extends LlmAdapter {
    async resolveModel(provider, model) {
      return { provider, id: model, name: model, reasoning: { efforts: [{ id: 'off', name: 'Off' }] } };
    }
    async *stream(options) {
      const messages = JSON.stringify(options.messages);
      const scenario = messages.includes('CASE_COMPONENTS') ? 'components' : 'original';
      const call = (calls.get(scenario) ?? 0) + 1;
      calls.set(scenario, call);
      if (!messages.includes('Reconcile the ledger')) throw Error('Imported persona is absent from the model request');
      const names = options.tools?.map(tool => tool.name) ?? [];
      await save({ type: 'model-request', scenario, call, personaPresent: true, toolNames: names });
      let tool;
      if (scenario === 'components' && call === 1) {
        if (!messages.includes('ledger-reconciliation')) throw Error('Imported skill catalog is absent');
        tool = ['skill', { name: 'ledger-reconciliation' }];
      } else if (call === (scenario === 'components' ? 2 : 1)) {
        if (scenario === 'components' && !messages.includes('Sum every signed row')) throw Error('Imported Skill was not actually loaded');
        tool = ['bash', { description: 'Run the imported signed-ledger helper', command: config.commands[scenario], workdir: config.workspace, timeoutMs: 10000 }];
      } else {
        if (!messages.includes('Total: 85.15')) throw Error('Imported script did not return the expected signed total');
        const text = `IMPORT_VERIFIED_${scenario.toUpperCase()} Total: 85.15`;
        yield { type: 'block-start', index: 0, blockType: 'text' };
        yield { type: 'text-delta', index: 0, text };
        yield { type: 'block-end', index: 0, block: { type: 'text', text } };
      }
      if (tool) {
        const [name, args] = tool;
        yield { type: 'block-start', index: 0, blockType: 'tool-call' };
        const id = `import-${scenario}-${call}`;
        yield { type: 'tool-call-delta', index: 0, id, name, argumentsDelta: JSON.stringify(args) };
        yield { type: 'block-end', index: 0, block: { type: 'tool-call', id, name, arguments: JSON.stringify(args) } };
      }
      yield { type: 'usage', usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } };
      yield { type: 'finish', reason: { kind: tool ? 'tool-calls' : 'stop' } };
    }
  }
  ctx.llm.registerAdapter(['harness2-import-probe'], new Adapter());
  ctx.on('agent/created', async ({ agent }) => {
    const presetId = config.sessions[agent.id];
    if (!presetId) return;
    const before = await ctx.agentPresets.list();
    await writeFile(join(config.output, `${agent.id}-before.json`), JSON.stringify({ sessionId: agent.id, requested: presetId, roster: before }, null, 2) + '\n');
    await ctx.agentPresets.select(agent, presetId);
    const roster = await ctx.agentPresets.list();
    const skills = await agent.ctx.skills.list({ cwd: config.workspace, scope: agent });
    const record = { sessionId: agent.id, selected: ctx.agentPresets.composedPreset(agent.ctx), roster, skills };
    await writeFile(join(config.output, `${agent.id}.json`), JSON.stringify(record, null, 2) + '\n');
    if (roster.some(row => row.broken)) throw Error('A converted preset is broken: ' + JSON.stringify(roster));
    if (presetId === 'h2-components-import' && !skills.some(skill => skill.name === 'ledger-reconciliation')) throw Error('Converted skill was not discovered');
  });
}
