import 'dart:convert';
import 'dart:developer' as developer;

import 'package:flutter/semantics.dart';
import 'package:flutter/widgets.dart';

import 'native_bridge.dart';

/// Debug-only accessibility driver for the real application boundary.
/// Callers use the same semantic actions as assistive technology, never
/// controller methods or replacement business/native implementations.
void registerApplicationProbe(NativeBridge native) {
  final semantics = WidgetsBinding.instance.ensureSemantics();
  final errors = <String>[];
  final previousErrorHandler = FlutterError.onError;
  FlutterError.onError = (details) {
    errors.add(details.exceptionAsString());
    previousErrorHandler?.call(details);
  };
  developer.registerExtension('ext.dshlauncher.application', (_, params) async {
    try {
      final views = WidgetsBinding.instance.renderViews;
      final view = views.isEmpty ? null : views.single;
      final owner = view?.owner?.semanticsOwner;
      final nodes = <Map<String, Object?>>[];
      void visit(SemanticsNode node) {
        final data = node.getSemanticsData();
        nodes.add({
          'id': node.id,
          'label': data.label,
          'value': data.value,
          'actions': [
            for (final action in SemanticsAction.values)
              if (data.hasAction(action)) action.name,
          ],
        });
        node.visitChildren((child) {
          visit(child);
          return true;
        });
      }

      final root = owner?.rootSemanticsNode;
      if (root != null) visit(root);
      final action = params['action'];
      if (action == 'tap' || action == 'scrollDown') {
        final node = nodes.singleWhere(
          (node) => node['id'].toString() == params['id'],
        );
        if (!(node['actions']! as List).contains(action)) {
          throw StateError('Semantic action unavailable: $action on $node');
        }
        WidgetsBinding.instance.performSemanticsAction(
          SemanticsActionEvent(
            viewId: view!.flutterView.viewId,
            nodeId: node['id']! as int,
            type: action == 'tap'
                ? SemanticsAction.tap
                : SemanticsAction.scrollDown,
          ),
        );
        await WidgetsBinding.instance.endOfFrame.timeout(
          const Duration(seconds: 5),
        );
      } else if (action == 'close' ||
          action == 'ownEntry' ||
          action == 'minimum' ||
          action == 'quit') {
        if (action == 'quit') semantics.dispose();
        await native.channel.invokeMethod<void>('debugWindow', action);
      } else if (action != null) {
        throw ArgumentError('Unknown application probe action: $action');
      }
      final flutterView = view?.flutterView;
      return developer.ServiceExtensionResponse.result(
        jsonEncode({
          'nodes': nodes,
          'errors': errors,
          'contentWidth': flutterView == null
              ? null
              : flutterView.physicalSize.width / flutterView.devicePixelRatio,
          'contentHeight': flutterView == null
              ? null
              : flutterView.physicalSize.height / flutterView.devicePixelRatio,
          'native': await native.channel.invokeMapMethod<String, Object?>(
            'debugState',
          ),
        }),
      );
    } catch (error) {
      return developer.ServiceExtensionResponse.error(
        developer.ServiceExtensionResponse.extensionError,
        error.toString(),
      );
    }
  });
}
