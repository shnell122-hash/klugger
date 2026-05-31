// v60 - nueva funcionalidad
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'core/theme.dart';
import 'core/router.dart';

void main() {
  runApp(const ProviderScope(child: VilarApp()));
}

class VilarApp extends ConsumerWidget {
  const VilarApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);
    return MaterialApp.router(
      title: 'VILAR Legal OS v60',
      theme: buildVilarTheme(),
      routerConfig: router,
      debugShowCheckedModeBanner: false,
    );
  }
}
