import {test} from 'node:test';
import assert from 'node:assert/strict';
import {classifyStationCard} from './station-dot-card-types.mjs';

test('distinguishes tool approval, ordinary questions, plan review and access consent', () => {
  assert.deepEqual(classifyStationCard('approval/request', {}), {kind: 'tool_approval', blocking: true});
  assert.deepEqual(classifyStationCard('user-questions/request', {questions: [{question:'Allow once?', options:[{label:'yes'}]}]}), {kind:'question',blocking:true});
  assert.deepEqual(classifyStationCard('user-questions/request', {questions: [{intent:{kind:'plan-review'}, detail:'not emitted'}]}), {kind:'plan_review',blocking:true});
  assert.deepEqual(classifyStationCard('user-questions/request', {questions: [{intent:{kind:'approval'}, id:'cua-system-input'}]}), {kind:'access_approval',blocking:true});
});

test('keeps recommendation cards non-blocking and rejects unknown or mixed intents', () => {
  for (const [action, kind] of [['enable_official_plugin','plugin_recommendation'],['create_personalized_page','page_recommendation']]) {
    assert.deepEqual(classifyStationCard('station/card-proposal', {action}), {kind, blocking:false});
  }
  for (const questions of [[], [null], [{intent:{kind:'future'}}], [{}, {intent:{kind:'approval'}}]]) {
    assert.deepEqual(classifyStationCard('user-questions/request', {questions}), {kind:'unknown',blocking:false});
  }
  assert.deepEqual(classifyStationCard('untrusted-display-card', {title:'Approve'}), {kind:'unknown',blocking:false});
});
