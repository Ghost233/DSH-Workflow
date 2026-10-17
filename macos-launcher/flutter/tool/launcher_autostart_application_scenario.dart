import 'independent_service_application_scenario.dart';

/// Opens the real Launcher without requesting service start through UI or SDK.
Future<void> runLauncherAutostartApplicationProbe(List<String> arguments) =>
    runIndependentServiceApplicationProbe(
      arguments,
      requireAutomaticStart: true,
    );

Future<void> runLauncherDeepLinkApplicationProbe(List<String> arguments) =>
    runIndependentServiceApplicationProbe(
      arguments,
      requireAutomaticStart: true,
      verifyDeepLink: true,
    );
