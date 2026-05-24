// v60 - nueva funcionalidad
// Sidebar collapsible estilo Obsidian — shell wrapper para todas las rutas autenticadas
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../core/theme.dart';
import '../features/auth/auth_provider.dart';

final sidebarExpandedProvider = StateProvider<bool>((_) => true);

class AppShell extends ConsumerWidget {
  final Widget child;
  const AppShell({super.key, required this.child});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final expanded = ref.watch(sidebarExpandedProvider);
    final location = GoRouterState.of(context).matchedLocation;
    final user     = ref.watch(currentUserProvider);
    final narrow   = MediaQuery.of(context).size.width < 700;

    return Scaffold(
      backgroundColor: VilarColors.bg,
      body: Row(children: [
        // Sidebar
        AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeInOut,
          width: narrow ? 0 : (expanded ? 220 : 52),
          child: narrow ? null : _Sidebar(expanded: expanded, location: location, user: user),
        ),

        // Vertical divider
        if (!narrow)
          Container(width: 1, color: VilarColors.border),

        // Main content
        Expanded(child: child),
      ]),

      // On mobile: drawer instead of sidebar
      drawer: narrow ? Drawer(
        backgroundColor: VilarColors.surface,
        child: _Sidebar(expanded: true, location: location, user: user),
      ) : null,

      // Mobile app bar
      appBar: narrow ? AppBar(
        backgroundColor: VilarColors.surface,
        title: const Text('VILAR Legal OS v60'),
      ) : null,
    );
  }
}

class _Sidebar extends ConsumerWidget {
  final bool expanded;
  final String location;
  final Map<String, dynamic> user;
  const _Sidebar({required this.expanded, required this.location, required this.user});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final name = user['name'] as String? ?? user['email'] as String? ?? 'Usuario';
    final role = user['role'] as String? ?? '';

    return Container(
      color: VilarColors.surface,
      child: Column(children: [
        // Header
        SizedBox(
          height: 56,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: Row(children: [
              Container(
                width: 28, height: 28,
                decoration: BoxDecoration(
                  color: VilarColors.accent.withOpacity(0.15),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: const Icon(Icons.balance, color: VilarColors.accent, size: 16),
              ),
              if (expanded) ...[
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('VILAR Legal OS',
                          style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600,
                              color: VilarColors.textPrimary)),
                      Text('v60 · Artifact Factory',
                          style: const TextStyle(fontSize: 10, color: VilarColors.textFaint)),
                    ],
                  ),
                ),
              ],
              // Toggle button
              InkWell(
                borderRadius: BorderRadius.circular(4),
                onTap: () => ref.read(sidebarExpandedProvider.notifier).state = !expanded,
                child: Padding(
                  padding: const EdgeInsets.all(4),
                  child: Icon(
                    expanded ? Icons.chevron_left : Icons.chevron_right,
                    size: 16, color: VilarColors.textFaint,
                  ),
                ),
              ),
            ]),
          ),
        ),
        const Divider(height: 1),
        const SizedBox(height: 8),

        // Nav items
        _NavItem(icon: Icons.folder_outlined,    label: 'Expedientes', path: '/cases',     location: location, expanded: expanded),
        _NavItem(icon: Icons.bar_chart_outlined, label: 'Dashboard',   path: '/dashboard', location: location, expanded: expanded),

        const Spacer(),
        const Divider(height: 1),

        // User info
        Padding(
          padding: const EdgeInsets.all(12),
          child: Row(children: [
            CircleAvatar(
              radius: 14,
              backgroundColor: VilarColors.accent.withOpacity(0.15),
              child: Text(name[0].toUpperCase(),
                  style: const TextStyle(fontSize: 11, color: VilarColors.accent)),
            ),
            if (expanded) ...[
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(name, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600,
                        color: VilarColors.textPrimary), maxLines: 1, overflow: TextOverflow.ellipsis),
                    if (role.isNotEmpty)
                      Text(role, style: const TextStyle(fontSize: 10, color: VilarColors.textFaint)),
                  ],
                ),
              ),
              IconButton(
                icon: const Icon(Icons.logout, size: 14, color: VilarColors.textFaint),
                tooltip: 'Cerrar sesión',
                onPressed: () {
                  ref.read(authNotifierProvider.notifier).logout();
                  context.go('/auth');
                },
              ),
            ],
          ]),
        ),
      ]),
    );
  }
}

class _NavItem extends StatelessWidget {
  final IconData icon;
  final String label, path, location;
  final bool expanded;
  const _NavItem({required this.icon, required this.label, required this.path,
                  required this.location, required this.expanded});

  @override
  Widget build(BuildContext context) {
    final active = location.startsWith(path);
    return Tooltip(
      message: expanded ? '' : label,
      child: InkWell(
        onTap: () => context.go(path),
        child: Container(
          height: 36,
          margin: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
          padding: const EdgeInsets.symmetric(horizontal: 8),
          decoration: BoxDecoration(
            color: active ? VilarColors.accent.withOpacity(0.12) : Colors.transparent,
            borderRadius: BorderRadius.circular(6),
          ),
          child: Row(children: [
            Icon(icon, size: 16,
                color: active ? VilarColors.accent : VilarColors.textMuted),
            if (expanded) ...[
              const SizedBox(width: 10),
              Text(label, style: TextStyle(
                fontSize: 13,
                color: active ? VilarColors.accent : VilarColors.textMuted,
                fontWeight: active ? FontWeight.w600 : FontWeight.normal,
              )),
            ],
          ]),
        ),
      ),
    );
  }
}
