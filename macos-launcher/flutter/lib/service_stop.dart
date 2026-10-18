class ServiceStopInspection {
  ServiceStopInspection(Map<String, Object?> value)
    : operationId = value['operationId'] as String?,
      instanceId = value['instanceId'] as String?,
      action = value['action'] as String? ?? 'stop',
      stopped = value['stopped'] == true,
      unknown = value['unknown'] != false,
      changed = value['changed'] == true,
      message = value['message'] as String?,
      work = (value['work'] as List? ?? []).cast<Map>();

  final String? operationId, instanceId, message;
  final String action;
  final bool stopped, unknown, changed;
  final List<Map> work;
  bool get needsConfirmation => unknown || changed || work.isNotEmpty;
}
