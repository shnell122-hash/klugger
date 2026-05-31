// v60 - nueva funcionalidad
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/api_client.dart';
import '../../core/theme.dart';
import 'cases_provider.dart';

class CasesScreen extends ConsumerStatefulWidget {
  const CasesScreen({super.key});

  @override
  ConsumerState<CasesScreen> createState() => _CasesScreenState();
}

class _CasesScreenState extends ConsumerState<CasesScreen> {
  final _searchCtrl = TextEditingController();
  String _query = '';

  @override
  void initState() {
    super.initState();
    _searchCtrl.addListener(() => setState(() => _query = _searchCtrl.text));
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final casesAsync = ref.watch(casesProvider);

    return Scaffold(
      backgroundColor: VilarColors.bg,
      body: Column(children: [
        // Header
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 20, 20, 12),
          child: Row(children: [
            Text('Expedientes', style: Theme.of(context).textTheme.displayMedium),
            const Spacer(),
            _NewCaseButton(),
          ]),
        ),

        // Search
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: TextField(
            controller: _searchCtrl,
            decoration: const InputDecoration(
              hintText: 'Buscar expediente…',
              prefixIcon: Icon(Icons.search, size: 18, color: VilarColors.textFaint),
            ),
          ),
        ),
        const SizedBox(height: 12),

        // List
        Expanded(
          child: casesAsync.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error:   (e, _) => Center(child: Text('Error: $e', style: const TextStyle(color: VilarColors.accentRed))),
            data: (cases) {
              final filtered = _query.isEmpty
                  ? cases
                  : cases.where((c) {
                      final name = (c['case_name'] ?? '').toString().toLowerCase();
                      return name.contains(_query.toLowerCase());
                    }).toList();

              if (filtered.isEmpty) {
                return Center(
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                    const Icon(Icons.folder_open, size: 48, color: VilarColors.textFaint),
                    const SizedBox(height: 12),
                    Text('Sin expedientes', style: Theme.of(context).textTheme.bodyMedium),
                  ]),
                );
              }

              return ListView.separated(
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 4),
                itemCount: filtered.length,
                separatorBuilder: (_, __) => const SizedBox(height: 4),
                itemBuilder: (context, i) {
                  final c = filtered[i] as Map<String, dynamic>;
                  return _CaseTile(cas: c);
                },
              );
            },
          ),
        ),
      ]),
    );
  }
}

// ── Tile de expediente ────────────────────────────────────────────────────────

class _CaseTile extends StatelessWidget {
  final Map<String, dynamic> cas;
  const _CaseTile({required this.cas});

  @override
  Widget build(BuildContext context) {
    final caseId = cas['case_id'] as String? ?? '';
    final name   = cas['case_name'] as String? ?? 'Sin nombre';
    final type   = cas['matter_type'] as String? ?? '';
    final client = cas['client_name'] as String? ?? '';

    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(8),
        onTap: () => context.go('/cases/$caseId/chat'),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Row(children: [
            Container(
              width: 36, height: 36,
              decoration: BoxDecoration(
                color: VilarColors.accent.withOpacity(0.1),
                borderRadius: BorderRadius.circular(6),
              ),
              child: const Icon(Icons.folder, color: VilarColors.accent, size: 18),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(name, style: Theme.of(context).textTheme.titleLarge,
                      maxLines: 1, overflow: TextOverflow.ellipsis),
                  if (client.isNotEmpty || type.isNotEmpty)
                    Text('$client${client.isNotEmpty && type.isNotEmpty ? ' · ' : ''}$type',
                        style: Theme.of(context).textTheme.bodyMedium,
                        maxLines: 1, overflow: TextOverflow.ellipsis),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                _NavIcon(icon: Icons.chat_bubble_outline, tooltip: 'Chat',
                    onTap: () => context.go('/cases/$caseId/chat')),
                _NavIcon(icon: Icons.description_outlined, tooltip: 'Artefactos',
                    onTap: () => context.go('/cases/$caseId/artifacts')),
                _NavIcon(icon: Icons.account_tree_outlined, tooltip: 'Grafo',
                    onTap: () => context.go('/cases/$caseId/graph')),
              ],
            ),
          ]),
        ),
      ),
    );
  }
}

class _NavIcon extends StatelessWidget {
  final IconData icon;
  final String tooltip;
  final VoidCallback onTap;
  const _NavIcon({required this.icon, required this.tooltip, required this.onTap});

  @override
  Widget build(BuildContext context) => Tooltip(
    message: tooltip,
    child: InkWell(
      borderRadius: BorderRadius.circular(4),
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.all(6),
        child: Icon(icon, size: 16, color: VilarColors.textFaint),
      ),
    ),
  );
}

// ── Botón nuevo expediente ────────────────────────────────────────────────────

class _NewCaseButton extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return ElevatedButton.icon(
      icon: const Icon(Icons.add, size: 16),
      label: const Text('Nuevo expediente'),
      onPressed: () => _showNewCaseDialog(context, ref),
    );
  }

  void _showNewCaseDialog(BuildContext context, WidgetRef ref) {
    final nameCtrl   = TextEditingController();
    final clientCtrl = TextEditingController();
    String matterType = 'civil';

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: VilarColors.surface,
        title: const Text('Nuevo expediente'),
        content: StatefulBuilder(
          builder: (ctx, setState) => Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(controller: nameCtrl,   decoration: const InputDecoration(hintText: 'Nombre del caso')),
              const SizedBox(height: 12),
              TextField(controller: clientCtrl, decoration: const InputDecoration(hintText: 'Nombre del cliente')),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                value: matterType,
                decoration: const InputDecoration(hintText: 'Área del derecho'),
                dropdownColor: VilarColors.surfaceHigh,
                items: ['civil','laboral','mercantil','fiscal','familiar','penal',
                        'administrativo','corporativo','inmobiliario','general']
                    .map((t) => DropdownMenuItem(value: t, child: Text(t)))
                    .toList(),
                onChanged: (v) => setState(() => matterType = v!),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancelar')),
          ElevatedButton(
            onPressed: () async {
              await ApiClient().createCase({
                'case_name':   nameCtrl.text.trim(),
                'client_name': clientCtrl.text.trim(),
                'matter_type': matterType,
              });
              if (ctx.mounted) Navigator.pop(ctx);
              ref.invalidate(casesProvider);
            },
            child: const Text('Crear'),
          ),
        ],
      ),
    );
  }
}
