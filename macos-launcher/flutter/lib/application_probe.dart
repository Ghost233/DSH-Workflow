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
  var semanticsReleased = false;
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
          'tooltip': data.tooltip,
          'value': data.flagsCollection.isObscured ? '<obscured>' : data.value,
          'toggled': data.flagsCollection.isToggled.toBoolOrNull(),
          'scrollPosition': data.scrollPosition,
          'scrollExtentMin': data.scrollExtentMin,
          'scrollExtentMax': data.scrollExtentMax,
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
      if (action == 'tap' ||
          action == 'scrollDown' ||
          action == 'scrollUp' ||
          action == 'scrollLeft' ||
          action == 'scrollRight' ||
          action == 'setText') {
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
            type: switch (action) {
              'tap' => SemanticsAction.tap,
              'scrollUp' => SemanticsAction.scrollUp,
              'scrollLeft' => SemanticsAction.scrollLeft,
              'scrollRight' => SemanticsAction.scrollRight,
              'setText' => SemanticsAction.setText,
              _ => SemanticsAction.scrollDown,
            },
            arguments: action == 'setText' ? params['text'] : null,
          ),
        );
        // The external driver waits for actual UI/HTTP/SDK outcomes.
        // Holding this VM RPC until endOfFrame can stall accessibility actions.
      } else if (action == 'close' ||
          action == 'quitDesktop' ||
          action == 'ownEntry' ||
          action == 'minimum' ||
          action == 'quit') {
        if (action == 'quit' && !semanticsReleased) {
          semantics.dispose();
          semanticsReleased = true;
        }
        await native.channel.invokeMethod<void>('debugWindow', action);
      } else if (action != null) {
        throw ArgumentError('Unknown application probe action: $action');
      }
      final flutterView = view?.flutterView;
      return developer.ServiceExtensionResponse.result(
        jsonEncode({
          'nodes': nodes,
          'errors': errors,
          'framesEnabled': WidgetsBinding.instance.framesEnabled,
          'lifecycleState': WidgetsBinding.instance.lifecycleState?.name,
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
      var message = error.toString();
      if (error is JsonUnsupportedObjectError) {
        const semanticKeys = [
          'id',
          'label',
          'tooltip',
          'value',
          'toggled',
          'scrollPosition',
          'scrollExtentMin',
          'scrollExtentMax',
          'actions',
        ];
        const scrollKeys = [
          'scrollPosition',
          'scrollExtentMin',
          'scrollExtentMax',
        ];
        final unsupported = error.unsupportedObject;
        final fields = unsupported is Map ? unsupported : null;
        final metadata = {
          'unsupportedType': unsupported.runtimeType.toString(),
          'unsupportedKeyCount': fields?.length,
          'keyTypeNames': fields?.keys
              .map((key) => key.runtimeType.toString())
              .toSet()
              .toList(),
          'semanticFieldTypes': {
            for (final key in semanticKeys)
              if (fields?.containsKey(key) == true)
                key: fields![key].runtimeType.toString(),
          },
          'nonFiniteFieldNames': [
            for (final key in scrollKeys)
              if (fields?[key] is num && !(fields![key] as num).isFinite) key,
          ],
          'causeType': error.cause.runtimeType.toString(),
        };
        message += ' JSON_ENCODER_METADATA=${jsonEncode(metadata)}';
      }
      return developer.ServiceExtensionResponse.error(
        developer.ServiceExtensionResponse.extensionError,
        message,
      );
    }
  });
}
