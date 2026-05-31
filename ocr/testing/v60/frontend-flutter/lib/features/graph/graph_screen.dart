// v60 - nueva funcionalidad
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import '../../core/api_client.dart';
import '../../core/theme.dart';

final _graphProvider = FutureProvider.family<Map<String, dynamic>, String>(
    (ref, caseId) async {
  final r = await ApiClient()._dio.post('/api/v1/tools/generate_graph',
      data: {'case_id': caseId});
  return r.data as Map<String, dynamic>;
});

class GraphScreen extends ConsumerWidget {
  final String caseId;
  const GraphScreen({super.key, required this.caseId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final graphAsync = ref.watch(_graphProvider(caseId));

    return Scaffold(
      backgroundColor: VilarColors.bg,
      body: Column(children: [
        // Header
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 20, 20, 12),
          child: Row(children: [
            const Icon(Icons.account_tree, size: 20, color: VilarColors.accentPurple),
            const SizedBox(width: 10),
            Text('Grafo del expediente', style: Theme.of(context).textTheme.displayMedium),
            const Spacer(),
            IconButton(
              icon: const Icon(Icons.refresh, color: VilarColors.textMuted),
              onPressed: () => ref.invalidate(_graphProvider(caseId)),
            ),
          ]),
        ),

        Expanded(
          child: graphAsync.when(
            loading: () => const Center(child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                CircularProgressIndicator(),
                SizedBox(height: 16),
                Text('Generando grafo de relaciones…',
                    style: TextStyle(color: VilarColors.textMuted, fontSize: 13)),
              ],
            )),
            error: (e, _) => Center(child: Text('$e',
                style: const TextStyle(color: VilarColors.accentRed))),
            data: (data) => _GraphContent(data: data),
          ),
        ),
      ]),
    );
  }
}

class _GraphContent extends StatelessWidget {
  final Map<String, dynamic> data;
  const _GraphContent({required this.data});

  @override
  Widget build(BuildContext context) {
    final mermaid  = data['mermaid']    as String? ?? '';
    final summary  = data['summary']   as String? ?? '';
    final nodes    = data['node_count'] as int?   ?? 0;
    final edges    = data['edge_count'] as int?   ?? 0;
    final cyto     = data['cytoscape']  as Map?;

    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Stats
          Wrap(spacing: 12, children: [
            _StatBadge(label: 'Nodos', value: '$nodes', color: VilarColors.accentPurple),
            _StatBadge(label: 'Relaciones', value: '$edges', color: VilarColors.accent),
          ]),
          const SizedBox(height: 16),

          // Summary
          if (summary.isNotEmpty) ...[
            Text('Resumen', style: Theme.of(context).textTheme.headlineMedium),
            const SizedBox(height: 8),
            Text(summary, style: Theme.of(context).textTheme.bodyLarge),
            const SizedBox(height: 20),
          ],

          // Mermaid code (para copiar y renderizar externamente)
          Text('Diagrama Mermaid', style: Theme.of(context).textTheme.headlineMedium),
          const SizedBox(height: 8),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: VilarColors.surface,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: VilarColors.border),
            ),
            child: SelectableText(
              mermaid,
              style: const TextStyle(
                fontFamily: 'monospace', fontSize: 12,
                color: VilarColors.accentGreen,
              ),
            ),
          ),
          const SizedBox(height: 20),

          // Cytoscape nodes list
          if (cyto != null) ...[
            Text('Entidades detectadas', style: Theme.of(context).textTheme.headlineMedium),
            const SizedBox(height: 8),
            _NodeList(elements: (cyto['elements'] as List? ?? [])),
          ],
        ],
      ),
    );
  }
}

class _StatBadge extends StatelessWidget {
  final String label, value;
  final Color color;
  const _StatBadge({required this.label, required this.value, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(4),
        border: Border.all(color: color.withOpacity(0.3)),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Text(value, style: TextStyle(
            fontSize: 14, fontWeight: FontWeight.w700, color: color)),
        const SizedBox(width: 6),
        Text(label, style: const TextStyle(fontSize: 11, color: VilarColors.textMuted)),
      ]),
    );
  }
}

class _NodeList extends StatelessWidget {
  final List elements;
  const _NodeList({required this.elements});

  static const _typeColors = {
    'persona':   VilarColors.accent,
    'empresa':   VilarColors.accentGreen,
    'contrato':  VilarColors.accentAmber,
    'operacion': VilarColors.accentPurple,
    'fecha':     VilarColors.textMuted,
    'documento': VilarColors.accentGreen,
  };

  @override
  Widget build(BuildContext context) {
    final nodes = elements
        .where((e) => (e as Map).containsKey('data') &&
            !(e['data'] as Map).containsKey('source'))
        .toList();

    return Wrap(
      spacing: 8, runSpacing: 8,
      children: nodes.map((e) {
        final d     = (e as Map)['data'] as Map;
        final label = d['label'] as String? ?? '?';
        final type  = d['type']  as String? ?? 'default';
        final color = _typeColors[type] ?? VilarColors.textFaint;
        return Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
          decoration: BoxDecoration(
            color: color.withOpacity(0.08),
            borderRadius: BorderRadius.circular(4),
            border: Border.all(color: color.withOpacity(0.3)),
          ),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Container(width: 6, height: 6,
                decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(3))),
            const SizedBox(width: 6),
            Text(label, style: TextStyle(fontSize: 11, color: color)),
          ]),
        );
      }).toList(),
    );
  }
}
