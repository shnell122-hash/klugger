// v60 - nueva funcionalidad
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../features/auth/auth_screen.dart';
import '../features/auth/auth_provider.dart';
import '../features/cases/cases_screen.dart';
import '../features/chat/chat_screen.dart';
import '../features/artifacts/artifacts_screen.dart';
import '../features/dashboard/dashboard_screen.dart';
import '../features/graph/graph_screen.dart';
import '../widgets/sidebar.dart';

final routerProvider = Provider<GoRouter>((ref) {
  final auth = ref.watch(authStateProvider);

  return GoRouter(
    initialLocation: '/cases',
    redirect: (context, state) {
      final loggedIn = auth.valueOrNull?.isNotEmpty == true;
      final onAuth   = state.matchedLocation.startsWith('/auth');
      if (!loggedIn && !onAuth) return '/auth';
      if (loggedIn && onAuth)  return '/cases';
      return null;
    },
    routes: [
      GoRoute(
        path: '/auth',
        builder: (_, __) => const AuthScreen(),
      ),
      ShellRoute(
        builder: (context, state, child) => AppShell(child: child),
        routes: [
          GoRoute(
            path: '/cases',
            builder: (_, __) => const CasesScreen(),
          ),
          GoRoute(
            path: '/cases/:caseId/chat',
            builder: (_, s) => ChatScreen(caseId: s.pathParameters['caseId']!),
          ),
          GoRoute(
            path: '/cases/:caseId/artifacts',
            builder: (_, s) => ArtifactsScreen(caseId: s.pathParameters['caseId']!),
          ),
          GoRoute(
            path: '/cases/:caseId/graph',
            builder: (_, s) => GraphScreen(caseId: s.pathParameters['caseId']!),
          ),
          GoRoute(
            path: '/dashboard',
            builder: (_, __) => const DashboardScreen(),
          ),
        ],
      ),
    ],
  );
});
