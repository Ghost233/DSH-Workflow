// Classify trusted DSH runtime events or Station-normalized card proposals. This projection never returns the
// original request, submits an answer or grants permissions.
export function classifyStationCard(event, request) {
  const notification = (kind) => ({kind, blocking: true});
  const passive = (kind) => ({kind, blocking: false});
  if (event === 'approval/request') return notification('tool_approval');
  if (event === 'user-questions/request') {
    if (!Array.isArray(request?.questions) || request.questions.length === 0) return passive('unknown');
    const {questions} = request;
    if (questions.every((item) => item && typeof item === 'object' && item.intent == null)) {
      return notification('question');
    }
    if (questions.length !== 1) return passive('unknown');
    if (questions[0]?.intent?.kind === 'plan-review') return notification('plan_review');
    if (questions[0]?.intent?.kind === 'approval') return notification('access_approval');
    return passive('unknown');
  }
  if (event === 'station/card-proposal') {
    if (request?.action === 'enable_official_plugin') return passive('plugin_recommendation');
    if (request?.action === 'create_personalized_page') return passive('page_recommendation');
  }
  return passive('unknown');
}
