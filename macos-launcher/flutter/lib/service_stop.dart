class ServiceStopInspection {
  ServiceStopInspection(Map<String, Object?> value)
    : operationId = value['operationId'] as String?,
      action = value['action'] as String? ?? 'stop',
      stopped = value['stopped'] == true,
      unknown = value['unknown'] != false,
      hasWork = value['hasWork'] != false;

  final String? operationId;
  final String action;
  final bool stopped, unknown, hasWork;
  bool get needsConfirmation => unknown || hasWork;
}
